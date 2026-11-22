# Déploiement

Comment le site est déployé sur Vercel, comment le vérifier sans toucher aux données, et
ce qui a été constaté. Le choix de l'hébergement est dans
l'[architecture](architecture.md#hébergement-et-déploiement).

## Adresses

| Déploiement | Adresse | Accès |
|---|---|---|
| Production, la branche `main` | L'alias `*.vercel.app` du projet (Vercel → projet `secret-santa` → Domains) ; pour les agents, `SECRET_SANTA_URL` dans `~/.config/secret-santa/site.env`, hors du dépôt | Public : c'est le lien à envoyer aux participants |
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

Ces commandes ne font que des lectures sans donnée. Ne jamais appeler `participant`,
`choose-password`, `open-gift` ni `reserved` sur la production, ni rien y envoyer en
`POST` : un mot de passe choisi par un agent ferait le vrai tirage.

L'adresse se charge d'abord, depuis le fichier hors du dépôt :

```sh
set -a; . ~/.config/secret-santa/site.env; set +a
```

1. La santé du déploiement, qui ne lit pas la base : `store` doit valoir `redis`, et
   `reservedPage` `true` (`ADMIN_PASSWORD` est posée).

   ```sh
   curl -s "$SECRET_SANTA_URL/api/health"
   ```

2. Les en-têtes de `vercel.json` sur l'accueil (`content-security-policy`,
   `x-content-type-options`, `referrer-policy`, `x-robots-tag`, `cache-control: no-store`) :

   ```sh
   curl -s -D - -o /dev/null "$SECRET_SANTA_URL/"
   ```

3. La page réservée est servie : la commande affiche `<title>Page réservée</title>`.

   ```sh
   curl -s "$SECRET_SANTA_URL/reservee" | grep '<title>'
   ```

4. Les sources ne sont pas servies : chacune de ces deux commandes affiche `404`.

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' "$SECRET_SANTA_URL/package.json"
   curl -s -o /dev/null -w '%{http_code}\n' "$SECRET_SANTA_URL/lib/http.js"
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

La CLI demande la valeur. Commande non essayée par un agent : elle écrit en production.
Une variable ne s'applique qu'aux déploiements faits après elle : il faut redéployer la
production, ou attendre la fusion suivante sur `main`, pour que `/api/health` réponde
`"reservedPage": true`.

## Constats

Le 22 novembre 2026, sur le déploiement de production du commit `002b16d` (tâche 12, la
dernière fusionnée), fait par l'intégration Git, lu par les commandes ci-dessus, sans
appel à une fonction qui lit ou écrit la base :

| Point | Constaté |
|---|---|
| Déploiement | `target: production`, prêt, fonctions en `sfo1` ; seul alias public, celui de `SECRET_SANTA_URL` ; les deux autres alias répondent 302 |
| Pages | `GET /` sert « Secret santa de Noël » et `GET /reservee` « Page réservée », octet pour octet comme `public/` de `main`, ainsi que les scripts et `style.css` |
| Signature Web des fonctions | `api/health.js`, qui n'exporte que `GET`, répond à `GET /api/health` ; `HEAD` y répond 405 |
| Dossier servi | `outputDirectory` de `vercel.json` s'applique : `/package.json`, `/lib/http.js`, `/vercel.json`, `/README.md` et `/.env` répondent 404 |
| `cleanUrls` | `/index.html` redirige (308) vers `/`, `/reservee.html` vers `/reservee`, et `/api/health.js` vers `/api/health` |
| En-têtes | Ceux de `vercel.json` sur `/`, `/reservee` et `/api/health`, dont `cache-control: no-store`, plus `strict-transport-security` posé par Vercel. Vercel ajoute `access-control-allow-origin: *` aux fichiers de `public/`, pas aux fonctions |
| Stockage | `GET /api/health` répond `"store": "redis"`, sans lire la base |
| Page réservée | `"reservedPage": true` : `ADMIN_PASSWORD` est posée, de type sensible, en production seulement |
| Variables | `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` et `ADMIN_PASSWORD`, toutes en production seulement (noms lus, jamais les valeurs) |
| Région de la base | `sfo1` (San Francisco), comme les fonctions |
| Node.js | `26.x` dans les réglages du projet comme dans `engines.node` de `package.json` |
| `VERCEL_ENV` à l'exécution | Non constaté dans une réponse : aucune fonction ne la renvoie. L'exposition automatique des variables système est active dans les réglages du projet (`autoExposeSystemEnvs`) |

Les contrôles passent sur `main` à ce commit : `npm run check` et `npm run test:e2e` en
local (Node 24, sur orca-server), et la CI de GitHub (Node 26).

### Pas encore constaté

Aucun agent n'a lu ni écrit la base : ces points ne se voient qu'avec le vrai tirage.

| Point | Se constate |
|---|---|
| Redis lu derrière les fonctions | Au constat humain : la page réservée, ouverte avec le mot de passe d'administration, lit les sept `password:<id>` (« Pas encore de mot de passe » partout). L'entrée compte aussi l'essai (`fails:admin`, effacé quand le mot de passe est bon) |
| Redis écrit, et le tirage fait | Au constat humain : le premier mot de passe validé écrit le tirage (`draw`, une seule fois) et l'empreinte du mot de passe (`password:<id>`) ; la page réservée affiche ensuite « Mot de passe choisi » pour ce participant |
| Le reste des usages | Au premier usage par les participants : leur retour avec « Voir mon tirage », un mot de passe effacé depuis la page réservée, les 5 essais ratés |
| Quotas gratuits de Vercel et d'Upstash | À l'usage ; non vérifié |
