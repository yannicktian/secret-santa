# Déploiement

Comment le site est déployé sur Vercel, comment le vérifier sans toucher aux données, et
ce qui a été constaté. Le choix de l'hébergement est dans
l'[architecture](architecture.md#hébergement-et-déploiement).

## Adresses

| Déploiement | Adresse | Accès |
|---|---|---|
| Production, la branche `main` | <https://secret-santa-one-lemon.vercel.app> | Public |
| Revue, chaque branche poussée | `https://secret-santa-<id>-yannicktians-projects.vercel.app` | Protégé par l'authentification de Vercel : sans être connecté au compte, la page répond 302 |

Les autres alias de la production (`secret-santa-yannicktians-projects.vercel.app`,
`secret-santa-git-main-yannicktians-projects.vercel.app`) sont protégés comme les
déploiements de revue : seule la première adresse est à donner.

## Mettre en production

Il n'y a rien à lancer : chaque fusion sur `main` est déployée en production par
l'intégration Git de Vercel, et chaque branche poussée a son déploiement de revue. Vercel
sert `public/` sans commande de build et fait une fonction de chaque fichier de `api/`,
dans la région de `vercel.json`.

## Vérifier la production

Ces commandes ne font que des lectures sans donnée. Ne jamais appeler `choose-password`,
`open-gift` ni `reserved` sur la production : un mot de passe choisi par un agent ferait
le vrai tirage.

1. La santé du déploiement : `store` doit valoir `redis` ; `reservedPage` vaut `true` une
   fois `ADMIN_PASSWORD` posée.

   ```sh
   curl -s https://secret-santa-one-lemon.vercel.app/api/health
   ```

2. Les en-têtes de `vercel.json` sur l'accueil (`content-security-policy`,
   `x-content-type-options`, `referrer-policy`, `x-robots-tag`, `cache-control: no-store`) :

   ```sh
   curl -s -D - -o /dev/null https://secret-santa-one-lemon.vercel.app/
   ```

3. Les sources ne sont pas servies : chacune de ces deux commandes affiche `404`.

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://secret-santa-one-lemon.vercel.app/package.json
   curl -s -o /dev/null -w '%{http_code}\n' https://secret-santa-one-lemon.vercel.app/lib/http.js
   ```

Essayé sur orca-server (bash) ; non essayé sur le Mac (zsh).

## La CLI Vercel

La version est fixée : `vercel@65.12.1`, lancée par `npx -y vercel@65.12.1`. Les agents
chargent le jeton sans l'afficher, avant chaque commande :

```sh
set -a; . ~/.config/secret-santa/vercel.env; set +a
```

Le dossier n'est pas relié au projet : `vercel link --yes` télécharge les variables de
développement dans un `.env.local`, sans option pour l'éviter. Chaque commande nomme donc
l'équipe (`--scope`) et le projet. Si un dossier a été relié quand même, supprimer son
`.env.local` sans le lire : `rm -f -- .env.local`. Ne jamais lancer `vercel env pull`,
ni `vercel env ls --json`, qui affiche les valeurs.

Les commandes qui suivent ne font que lire ; essayées sur orca-server (bash), non essayées
sur le Mac (zsh). Celles qui passent par `jq` n'affichent que des noms.

- Les déploiements du projet :

  ```sh
  npx -y vercel@65.12.1 ls secret-santa --scope yannicktians-projects --token "$VERCEL_TOKEN"
  ```

- Un déploiement : cible, alias, et la région de ses fonctions sous « Builds »
  (`λ api/health […] [sfo1]`) ; `--logs` ajoute le journal du build.

  ```sh
  npx -y vercel@65.12.1 inspect <adresse du déploiement> --scope yannicktians-projects --token "$VERCEL_TOKEN"
  ```

- Les noms des variables, avec leurs environnements :

  ```sh
  npx -y vercel@65.12.1 api /v9/projects/secret-santa --scope yannicktians-projects --token "$VERCEL_TOKEN" | jq -r '.env[] | "\(.key) \(.target | join(","))"'
  ```

- La région de la base :

  ```sh
  npx -y vercel@65.12.1 api /v1/storage/stores --scope yannicktians-projects --token "$VERCEL_TOKEN" | jq -r '.stores[] | "\(.name) \(.metadata.primaryRegion)"'
  ```

## Variables

Toutes en production seulement ; les déploiements de revue n'en ont aucune.

| Variable | Posée par | Lue par le site |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | L'intégration Upstash (base `secret-santa-kv`) | Oui, par `@upstash/redis` |
| `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` | L'intégration Upstash | Non |
| `ADMIN_PASSWORD` | Yannick, de type sensible | Oui, par la page réservée |

### Poser le mot de passe d'administration

À faire par Yannick, sans le donner à personne : depuis les réglages du projet sur le site
de Vercel, ou dans un terminal où la CLI est connectée à son compte, sans relier de
dossier :

```sh
npx -y vercel@65.12.1 env add ADMIN_PASSWORD --environment production --sensitive --project secret-santa --scope yannicktians-projects
```

La CLI demande la valeur. Commande non essayée : elle écrit en production. Selon la
documentation de Vercel, une variable ne s'applique qu'aux déploiements faits après
elle : le déploiement de la fusion suivante sur `main` la lit (non constaté ici).

## Constats

Le 22 novembre 2026, sur le déploiement de production du commit `70e2a63` (tâche 1),
fait par l'intégration Git, lu par les commandes ci-dessus :

| Point | Constaté |
|---|---|
| Signature Web des fonctions | `api/health.js`, qui n'exporte que `GET`, répond à `GET /api/health` ; `HEAD` et `POST` y répondent 405 |
| Dossier servi | `outputDirectory` de `vercel.json` s'applique (les réglages du projet n'en fixent aucun) : `/` sert `public/index.html` ; `/package.json`, `/lib/http.js`, `/vercel.json` et `/README.md` répondent 404 |
| `cleanUrls` | `/index.html` redirige (308) vers `/`, et `/api/health.js` vers `/api/health`. `/reservee` répond 404 tant que `public/reservee.html` n'existe pas |
| En-têtes | Ceux de `vercel.json` sur `/` et `/api/health`, plus `strict-transport-security` posé par Vercel. `/` est en `cache-control: no-store` mais servi par le cache de Vercel (`x-vercel-cache: HIT`), qui est vidé à chaque déploiement |
| `VERCEL_ENV` à l'exécution | Non constaté dans une réponse : aucune fonction ne la renvoie. L'exposition automatique des variables système est active dans les réglages du projet (`autoExposeSystemEnvs`) |
| Stockage | `GET /api/health` répond `"store": "redis"`, sans lire la base |
| Région de la base | `sfo1` (San Francisco), la région par défaut de l'intégration. Les fonctions de ce déploiement tournaient en `fra1` ; `vercel.json` passe à `sfo1` pour les mettre à côté de la base |
| Node.js | 24, par `engines.node` de `package.json`, au lieu du 26 des réglages du projet (avertissement du build) |
| Page réservée | `"reservedPage": false` : `ADMIN_PASSWORD` n'est pas encore posée |
