# Architecture

Le site du secret santa tel qu'il est construit par l'epic
[#1](https://github.com/yannicktian/secret-santa/issues/1), selon la
[spec du tirage](specs/tirage.md), qui fait foi pour le comportement et les mots affichés.
Le découpage en tâches est dans [plans/tirage.md](plans/tirage.md) ; l'avancement vit dans
l'issue de l'epic. Les mots du domaine suivent le [glossaire](glossaire.md).

## Vue d'ensemble

```
Téléphone (navigateur)            Vercel (une adresse racine)              Upstash Redis
┌────────────────────┐   GET    ┌──────────────────────────┐
│ public/ : HTML,    │ ───────► │ fichiers statiques       │
│ CSS, JS sans build │          │ (public/)                │
│                    │   POST   ├──────────────────────────┤  REST   ┌──────────────────┐
│ écrans de la spec  │ ───────► │ fonctions api/*.js       │ ──────► │ draw             │
│ rien n'est retenu  │ ◄─────── │ lib/ : règles du domaine │ ◄────── │ password:<id>    │
└────────────────────┘   JSON   └──────────────────────────┘         │ fails:<id>       │
                                                                      │ lock:<id>        │
                                                                      └──────────────────┘
```

- **Pages statiques** dans `public/`, servies telles quelles : pas de framework, pas de
  bundler, pas d'étape de build. Le JavaScript du navigateur est en modules ES natifs.
- **Quatre fonctions Vercel** dans `api/` (et `api/health.js`), en JavaScript, qui
  appellent les règles du domaine de `lib/`. Elles seules lisent et écrivent la base.
- **Une base Redis Upstash**, installée sur le projet Vercel par la Vercel Marketplace,
  qui garde le tirage, les empreintes des mots de passe et les compteurs d'essais.
- **Aucune session** : le navigateur ne garde rien entre deux visites (S5). Chaque appel
  qui donne un tirage ou ouvre la page réservée porte le mot de passe, vérifié à chaque
  fois.

## Pièces et emplacements

| Emplacement | Rôle |
|---|---|
| `public/index.html` | L'accueil et le conteneur des écrans du participant ; liens vers les polices, `style.css`, `app.js` |
| `public/style.css` | Le style de tous les écrans, repris de la maquette (`docs/site/epics/1-tirage-maquette.html`), sans les réglages de la maquette |
| `public/app.js` | L'état en mémoire des écrans du participant, l'accueil (S1), le passage d'un écran à l'autre sans entrée d'historique (S5), les appels par `call.js` |
| `public/call.js` | L'appel aux fonctions (`call`) et le bandeau « Oups, le site ne répond pas… » avec « Réessayer », repris par `app.js` et `reserved.js` |
| `public/countdown.js` | Le compte à rebours de S1, fonction pure de la date du jour à Paris |
| `public/screens/password.js` | Les écrans du mot de passe : le choisir (S2), le redonner (S3) |
| `public/screens/gift.js` | L'écran du paquet (S4), paquet en pixels et ouverture |
| `public/reservee.html`, `public/reserved.js` | La page réservée (S6), servie à `/reservee` |
| `api/participant.js` | `POST /api/participant` : le participant a-t-il un mot de passe ? |
| `api/choose-password.js` | `POST /api/choose-password` : choisir son mot de passe, faire le tirage s'il n'existe pas, donner le prénom tiré (S2, S7) |
| `api/open-gift.js` | `POST /api/open-gift` : redonner son mot de passe et recevoir le prénom tiré (S3) |
| `api/reserved.js` | `POST /api/reserved` : la page réservée, liste des états et effacement (S6) |
| `api/health.js` | `GET /api/health` : la santé du déploiement, sans lire aucune donnée |
| `lib/participants.js` | Les sept participants, dans l'ordre du périmètre : identifiant et prénom |
| `lib/draw.js` | Le tirage : une permutation sans point fixe, tirée au hasard uniforme (S7) |
| `lib/password.js` | Mot de passe : normalisation, règle des 4 caractères, empreinte scrypt et vérification |
| `lib/attempts.js` | La règle des 5 essais ratés (S3, S6, D9) |
| `lib/gift.js` | Les actions du participant : état, choix du mot de passe, ouverture du paquet, tirage fait une seule fois |
| `lib/reserved.js` | Les actions de la page réservée : vérification du mot de passe d'administration, liste, effacement |
| `lib/store.js` | Le stockage : l'interface, sa version Redis (Upstash) et le choix de la version selon l'environnement |
| `lib/memory-store.js` | Le double en mémoire du stockage, pour les tests et le serveur local |
| `lib/http.js` | Lecture du corps JSON (taille bornée), réponses JSON en `no-store`, erreurs |
| `scripts/dev-server.js` | Le serveur local des tests et des captures : sert `public/` et appelle les fonctions de `api/` sur le double en mémoire |
| `tests/unit/` | Tests `node:test` des modules de `lib/` et de `public/countdown.js` |
| `tests/e2e/` | Tests Playwright des écrans, avec captures |
| `tests/securite/` | Le test de fuite : rien de secret n'est envoyé au navigateur |
| `vercel.json` | Dossier servi, adresses propres, en-têtes de sécurité, région |
| `.github/workflows/check.yml` | L'intégration continue |
| `docs/deploiement.md` | La procédure de déploiement et ce qui a été constaté sur Vercel, écrite par la tâche 6 du découpage |

### Noms du code

Le code est en anglais ; ses noms suivent le glossaire :

| Glossaire | Code |
|---|---|
| Participant | `participant` (identifiant : `yannick`, `lea`, `christine`, `guigui`, `mamet`, `anne`, `loulou`) |
| Tirage | `draw` ; la personne à qui on offre : `receiver` |
| Mot de passe | `password` ; son empreinte : `passwordHash` |
| Paquet | `gift` |
| Page réservée | `reserved` (adresse `/reservee`) |
| Mot de passe d'administration | `adminPassword` (variable `ADMIN_PASSWORD`) |
| Effacer le mot de passe | `erasePassword` |

## Les fonctions

Toutes répondent en JSON avec `Cache-Control: no-store`. Chaque fichier de `api/` exporte
une fonction par méthode HTTP, à la signature Web de Vercel :
`export async function POST(request) { … return Response.json(…) }`. Les appels `POST`
exigent `Content-Type: application/json` (sinon 415) et un corps de 2 Ko au plus (sinon
413). Un identifiant de participant inconnu donne 400 `unknown_participant`.

| Appel | Corps | Réponses |
|---|---|---|
| `POST /api/participant` | `{ participant }` | 200 `{ hasPassword }` |
| `POST /api/choose-password` | `{ participant, password }` | 200 `{ receiver }` (le prénom tiré) · 422 `too_short` · 409 `already_chosen` · 429 `locked` |
| `POST /api/open-gift` | `{ participant, password }` | 200 `{ receiver }` · 401 `wrong_password` · 429 `locked` · 409 `no_password` |
| `POST /api/reserved` | `{ password, action: "list" }` ou `{ password, action: "erase", participant }` | 200 `{ participants: [{ id, name, hasPassword }] }`, dans l'ordre du périmètre · 400 `unknown_action` · 401 `wrong_password` · 429 `locked` · 503 `admin_password_missing` |
| `GET /api/health` | — | 200 `{ ok: true, store: "redis" \| "memory" \| "missing", reservedPage: true \| false }` |

Les erreurs ont la forme `{ error: "<code>" }`. Toute autre réponse, une erreur 5xx ou un
réseau coupé, fait afficher le bandeau « Oups, le site ne répond pas… » sur l'écran en
cours.

### Choisir son mot de passe (S2, S7)

1. Le mot de passe, espaces du début et de la fin retirés, a moins de 4 caractères : 422
   `too_short`.
2. Le tirage est lu ; s'il n'existe pas, il est fait et écrit une seule fois (voir
   [Le tirage](#le-tirage)). Il est fait avant l'enregistrement du mot de passe, pour qu'une
   coupure entre les deux ne laisse pas un mot de passe sans paquet.
3. L'empreinte est écrite seulement si le participant n'en a pas (`SET … NX`).
4. Si le participant avait déjà un mot de passe (choisi entre-temps sur un autre appareil,
   ou réponse perdue avant un « Réessayer »), l'appel suit la règle de
   [Redonner son mot de passe](#redonner-son-mot-de-passe-s3) : même mot de passe, 200 avec
   le prénom tiré ; autre mot de passe, essai raté compté et 409 `already_chosen` (l'écran
   passe à « Redonner son mot de passe », champ vide) ; blocage en cours, 429 `locked`.
   Ainsi un mot de passe existant n'est jamais remplacé et ne se devine pas par cet appel.
5. 200 `{ receiver }`.

### Redonner son mot de passe (S3)

1. Le participant est bloqué (`lock:<id>` existe) : 429 `locked`, sans vérifier le mot de
   passe, même juste.
2. Il n'a pas de mot de passe (effacé entre-temps par Yannick) : 409 `no_password`, et
   l'écran passe à « Choisir son mot de passe ».
3. Le mot de passe est juste : le compteur d'essais est remis à zéro, 200 `{ receiver }`.
4. Il est faux : l'essai est compté ; au cinquième de suite, le participant est bloqué une
   minute et la réponse est 429 `locked` (c'est le cinquième essai qui affiche « Beaucoup
   d'essais ratés… », comme dans la maquette) ; sinon 401 `wrong_password`.

### La page réservée (S6)

Chaque appel porte le mot de passe d'administration, comparé à `ADMIN_PASSWORD` tel quel,
sans normalisation, en temps constant (empreintes SHA-256 des deux, comparées par
`timingSafeEqual`). La règle des 5 essais s'applique avec l'identifiant `admin`. Si
`ADMIN_PASSWORD` est absente ou vide, tout appel répond 503 et la page affiche le bandeau
« Oups… » : la page ne s'ouvre jamais sans mot de passe posé. L'effacement supprime `password:<id>`, `fails:<id>` et `lock:<id>`, et rien d'autre : le tirage ne change pas, et le nouveau mot de passe a ses 5 essais. La réponse ne contient jamais
de tirage, d'empreinte ni de mot de passe.

## Données

Une seule base Redis Upstash pour la production. Toutes les valeurs sont des chaînes ;
le client est créé avec `automaticDeserialization: false`, pour que rien ne soit transformé à la lecture, et `enableAutoPipelining: false`, pour que chaque commande parte en une requête (sinon la version 1.41.0 les regroupe vers `/pipeline`).

| Clé | Valeur | Durée | Écrite par |
|---|---|---|---|
| `draw` | Le tirage, JSON des identifiants : `{"yannick":"christine","lea":"mamet",…}` | Sans fin | `SET draw … NX`, une seule fois |
| `password:<id>` | L'empreinte : `scrypt$16384$8$1$<sel en base64>$<empreinte en base64>` | Sans fin | `SET … NX` au choix ; `DEL` à l'effacement |
| `fails:<id>` | Le nombre d'essais ratés de suite (`<id>` d'un participant, ou `admin`) | Sans fin | `INCR` à un essai raté ; `DEL` à un bon essai, au blocage ou à l'effacement |
| `lock:<id>` | `1` | 60 secondes | `SET … EX 60` au cinquième essai raté ; `DEL` à l'effacement |

Seule la production a une base : `secret-santa-kv`, reliée au seul environnement
Production. Les déploiements de revue (Preview) n'en ont pas (décision V7).

### Le tirage

- `makeDraw(ids, randomInt)` mélange les identifiants par Fisher-Yates avec
  `randomInt` (par défaut `crypto.randomInt`), et recommence tant qu'un participant se
  tire lui-même. Chaque permutation sans point fixe a donc la même chance de sortir : pour
  sept participants, 1 854 tirages possibles, dont ceux où deux personnes s'offrent l'une
  à l'autre (S7, D8). Il faut 2,7 mélanges en moyenne.
- `getOrCreateDraw(store)` lit `draw` ; s'il manque, fait un tirage et l'écrit par
  `SET draw … NX`. Si deux participants valident au même moment, chacun propose un
  tirage, Redis n'en garde qu'un, et chacun relit celui qui est gardé : il n'y a qu'un
  tirage (S7). Rien ne le supprime ni ne le réécrit : aucune fonction ne fait `DEL draw`
  ni `SET draw` sans `NX`.

### Les mots de passe

- **Normalisation** (S3, D4) : espaces du début et de la fin retirés, décomposition NFD,
  marques diacritiques retirées (`\p{M}`), minuscules. « Noël », « noel » et « NOEL »
  donnent `noel`.
- **Longueur** (S2) : au moins 4 caractères, comptés en points de code sur le mot de passe
  sans ses espaces du début et de la fin, mis en NFC. Aucune autre règle.
- **Empreinte** : `scrypt` de `node:crypto`, sur le mot de passe normalisé, sel aléatoire
  de 16 octets, coût N = 16384, r = 8, p = 1, 32 octets ; 74 ms constatés sur le serveur
  de développement. Vérification par `timingSafeEqual`. Le mot de passe n'est jamais
  stocké en clair, ni écrit dans un journal.

### Le stockage

`lib/store.js` expose une interface de six opérations, que les règles du domaine reçoivent
en paramètre : `get(key)`, `mget(keys)`, `setIfAbsent(key, value)` (vrai si écrit),
`setWithExpiry(key, value, seconds)`, `incr(key)`, `del(key)`. `getStore()` choisit :

| Environnement | Stockage |
|---|---|
| `SECRET_SANTA_STORE=memory` et hors de Vercel (`VERCEL_ENV` absente) | Le double en mémoire, unique dans le processus |
| Sur Vercel, ou sans `SECRET_SANTA_STORE` | Redis, par `Redis.fromEnv()` de `@upstash/redis`, qui lit `KV_REST_API_URL` et `KV_REST_API_TOKEN` quand `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` manquent (lu dans le code de la version 1.41.0). L'intégration pose, en production seulement, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL` et `REDIS_URL` (constaté le 22 novembre 2026) ; le site n'utilise que les deux premières |
| Ni l'un ni l'autre, comme sur un déploiement de revue | Erreur : la fonction répond 500, jamais un repli sur la mémoire ; les pages statiques et `api/health.js` marchent quand même |

Le double en mémoire a la même sémantique, durées comprises, avec une horloge qu'un test
peut avancer.

## Les écrans

- **Un seul document** pour le participant (`/`), dont `app.js` remplace le contenu à
  chaque écran, sans `history.pushState` : le bouton retour du navigateur quitte le site
  au lieu de réafficher un paquet (S5). Au retour sur la page depuis le cache du
  navigateur (`pageshow` avec `persisted`), l'accueil est réaffiché et l'état oublié.
- **Rien n'est retenu** : ni cookie, ni `localStorage`, ni `sessionStorage`, ni IndexedDB.
  Le mot de passe tapé et le prénom tiré ne vivent que dans des variables, effacées au
  retour à l'accueil.
- **La page réservée** (`/reservee`) garde le mot de passe d'administration dans une
  variable de la page, le temps de la visite, pour l'envoyer avec chaque liste et chaque
  effacement ; le recharger redemande le mot de passe.
- **Les mots affichés** sont dans le code de chaque écran, exactement ceux de la spec.
- **Le style** est celui de la maquette : polices Pixelify Sans et Atkinson Hyperlegible
  chargées depuis Google Fonts, couleurs et boutons de la maquette, un seul thème. Aucun
  attribut `style` ni script en ligne : la politique de sécurité du contenu les refuse.
- **Le compte à rebours** prend la date du jour à Paris sur l'horloge de l'appareil
  (`Intl.DateTimeFormat` avec `timeZone: "Europe/Paris"`).
- **Le réseau** : `call(path, body)` de `call.js` fait l'appel ; sur une erreur réseau ou
  une réponse 5xx, l'écran reste affiché avec le bandeau et « Réessayer », qui refait le
  même appel ; ce qui était tapé reste dans le champ.

## Sécurité

| Ce qui est protégé | Comment |
|---|---|
| Le tirage | Il ne sort de la base que par `choose-password` et `open-gift`, une fois le mot de passe vérifié, et seulement le prénom tiré par ce participant. Aucun appel ne donne le tirage en entier, ni qui offre à qui que ce soit. La page réservée n'y a pas accès |
| Les mots de passe des participants | Empreinte scrypt salée, jamais renvoyée ; 5 essais ratés de suite bloquent le participant une minute |
| Le mot de passe d'administration | Variable d'environnement Vercel posée par Yannick, de type sensible ; aucun agent ne la connaît ; comparée en temps constant ; même règle des 5 essais |
| Les jetons de la base | Variables posées par l'intégration Upstash, lues seulement par les fonctions ; aucun fichier de `public/` ne les cite |
| L'appareil prêté | Rien n'est retenu (S5) |
| Le cache | `Cache-Control: no-store` sur chaque réponse des fonctions et sur les deux pages HTML |

En-têtes posés par `vercel.json` sur tout le site : `Content-Security-Policy`
(`default-src 'self'`, polices de `fonts.googleapis.com` et `fonts.gstatic.com`,
`frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex`.

Limites acceptées (« rien n'est très sensible », décision de Yannick) : un mot de passe de
quatre lettres se devine à raison de 5 essais par minute pour qui s'acharne des jours ;
n'importe qui peut bloquer un participant ou la page réservée une minute en se trompant
cinq fois ; qui choisit le prénom d'un autre à sa première visite voit son tirage
(« États vides et cassés » de la spec).

## Hébergement et déploiement

- **Vercel**, offre gratuite, un projet `secret-santa` relié au repo GitHub, une seule
  adresse racine, sur le compte `yannicktians-projects` (offre Hobby). Fonctions en
  Node.js 24 (`engines.node` de `package.json`), dans la région que `vercel.json` fixe :
  celle de la base, relevée par la tâche 6 (la base a été créée dans la région par défaut
  de l'intégration, non choisie). `vercel.json` sert `public/` (`outputDirectory`),
  sans commande de build, avec `cleanUrls` pour que `/reservee` serve `reservee.html`.
- **Production** : chaque fusion sur `main` est déployée par l'intégration Git de Vercel,
  une fois le projet relié au repo. Variables : celles de l'intégration Upstash (base
  `secret-santa-kv`), `ADMIN_PASSWORD`.
- **Revue (Preview)** : chaque branche poussée, sans base ni `ADMIN_PASSWORD` : seules les
  pages statiques et `api/health.js` y marchent ; les fonctions qui lisent la base y
  répondent 500. Les écrans et les fonctions se prouvent par les tests, sur le double en
  mémoire, en local et dans l'intégration continue.
- **Ce que les agents font sur la production** : seulement des lectures sans donnée,
  `GET /`, `GET /reservee`, `GET /api/health`. Ils n'appellent jamais `choose-password`,
  `open-gift` ni `reserved` sur la production : un mot de passe choisi par un agent ferait
  le vrai tirage.
- **Jeton** : les agents utilisent la CLI Vercel (`npx vercel@<version>`, la version étant fixée
  dans `docs/deploiement.md`) avec `VERCEL_TOKEN`, chargé depuis
  `~/.config/secret-santa/vercel.env` par `set -a; . ~/.config/secret-santa/vercel.env; set +a`,
  sans jamais l'afficher. `.vercel/` est ignoré par git.
- Le détail et les constats sont dans `docs/deploiement.md`, écrit par la tâche 6.

Constaté le 22 novembre 2026 : le projet `secret-santa` existe (créé par la CLI), la base
`secret-santa-kv` est reliée à la seule production avec les variables ci-dessus, et
l'offre gratuite d'Upstash n'accepte qu'une base par compte (une seconde a été refusée).

Non vérifié, parce que propre à Vercel ou Upstash : la signature Web des fonctions sans
framework, `outputDirectory` et `cleanUrls` sur un projet sans framework, la disponibilité
de `VERCEL_ENV` à l'exécution et la région de la base, que la tâche 6 constate ; le
comportement réel de Redis derrière les fonctions, que seule la production montre
(lecture par la page réservée au constat humain de la tâche 13, première écriture au
premier mot de passe choisi) ; les quotas gratuits des deux services et la conservation
d'une base gratuite peu utilisée.

## Contrôles

- `npm run check` : `biome check .` (lint et format), `tsc` (JavaScript vérifié par
  `checkJs`, JSDoc, mode strict, sans émission), `node --test tests/unit tests/securite`.
- `npm run test:e2e` : Playwright (Chromium) contre `scripts/dev-server.js` sur le double
  en mémoire, aux largeurs 360 et 1280 pixels. Avec `CAPTURES=1`, chaque test d'écran
  enregistre ses captures dans `captures/`, ignoré par git, qui se régénère.
- **Pas de build** : `public/` est servi tel quel ; `npm run check` est la preuve que le
  code tient.
- **Intégration continue** : `.github/workflows/check.yml` (GitHub Actions, job `check`),
  à chaque pull request et chaque poussée sur `main` : `npm ci`,
  `npx playwright install --with-deps chromium`, `npm run check`, `npm run test:e2e`.
- **Dépendances**, toutes de développement sauf la première, versions exactes :
  `@upstash/redis` 1.41.0 (une sous-dépendance, `uncrypto`), `@biomejs/biome` 2.6.8,
  `typescript` 7.0.2, `@types/node` 24.19.2, `@playwright/test` 1.65.1. Installées et essayées sur
  le serveur de développement le 22 novembre 2026 : `tsc` signale une erreur de type en
  JSDoc, Biome lint des modules ES (`"type": "module"`), Playwright lance Chromium après
  `npx playwright install chromium`, et le client Upstash envoie bien
  `["set","draw",…,"nx"]`, `["set",…,"ex",60]`, `["incr",…]`, `["mget",…]`.

## Tests

| Ce qui est prouvé | Où | Comment |
|---|---|---|
| Le tirage est uniforme (S7) | `tests/unit/draw.test.js` | 185 400 tirages simulés avec un générateur à graine fixe (100 attendus par tirage possible) : les 1 854 tirages possibles sortent tous, aucun point fixe, et le khi-deux à 1 853 degrés de liberté reste sous 2 142 (probabilité d'un faux échec inférieure à un sur un million). Le même test échoue sur un algorithme biaisé (Sattolo, qui ne fait que des cycles). 1859,8 obtenu sur un prototype, en 0,7 seconde |
| Un seul tirage (S7) | `tests/unit/gift.test.js` | Deux choix simultanés de deux participants, sur un double dont `get` rend la main avant `setIfAbsent` : un seul `draw` écrit, et les deux reçoivent un prénom de ce tirage |
| Les essais ratés (S3, S6) | `tests/unit/attempts.test.js` | Horloge avancée : 4 ratés puis 1 bon, compte à zéro ; 5 ratés, blocage, bon mot de passe refusé, débloqué après 60 secondes |
| Rien de secret n'est envoyé (sûreté) | `tests/securite/fuite.test.js` | Un parcours complet sur le double en mémoire, avec un tirage fictif et des mots de passe témoins ; chaque réponse (pages, scripts, JSON) est cherchée : ni empreinte, ni sel, ni mot de passe, ni `ADMIN_PASSWORD`, ni le tirage d'un autre, ni le tirage entier ; `public/` ne cite aucun nom de variable d'environnement |
| Les écrans | `tests/e2e/*.spec.js` | Les mots exacts, les états, les tailles (48 et 56 pixels, texte de 20 pixels), 360 pixels sans défilement horizontal, appels interceptés par `page.route` selon le tableau des fonctions ; le parcours complet sans interception |

Les tests n'utilisent que le double en mémoire, en local et dans l'intégration continue,
jamais la base de production. Les tirages et les mots de passe des tests
sont fictifs.

## Règles pour les tâches

- **Taille** : 400 lignes modifiées au plus par tâche, hors tests, `package-lock.json` et
  captures.
- **Chemins sensibles** : `api/**`, `lib/**`, `scripts/dev-server.js`, `tests/securite/**`,
  `vercel.json`, `package.json`, `package-lock.json`, `.gitignore`, `.github/**`,
  `docs/architecture.md`, `docs/specs/**`, `AGENTS.md`, `CLAUDE.md`. Les restrictions du
  projet fusionnent leurs tâches après relecture, sans validation humaine ; le relecteur y
  relit la sécurité en plus et donne sa proposition « si autonome ». `public/**` n'est pas
  sensible : le test de fuite garde ce que les pages reçoivent.
- **Données** : aucun mot de passe ni tirage réel, ni dans le code, ni dans les tests, ni
  dans une capture ; les agents ne lisent ni `.env`, ni la base de production, ni
  `ADMIN_PASSWORD`.
- **Captures** : une tâche qui change un écran produit ses captures à 360 et 1280 pixels,
  dans les états de la spec, par ses propres tests (`CAPTURES=1 npm run test:e2e`), et les
  compare à la maquette de la page de l'epic.
- **Fichiers partagés** : `docs/architecture.md` décrit l'état après l'epic ; une tâche ne
  le modifie que pour corriger un écart, qu'elle signale dans sa PR. Pas d'entrée de
  CHANGELOG dans une tâche : l'orchestrateur écrit celle de l'epic au bilan.
- **Dossiers ignorés** où une tâche range du travail : `captures/` seulement (se
  régénère).
- **Cycle** : chaque tâche suit le
  [cycle d'une tâche de factory](https://github.com/yannicktian/factory/blob/main/docs/cycle-tache.md).

## Décisions

### Validées par Yannick le 22 novembre 2026


| N° | Point | Décision |
|---|---|---|
| V1 | Hébergement | Vercel, une seule adresse racine |
| V2 | Stockage | Redis Upstash installé par la Vercel Marketplace sur le projet, variables posées par l'intégration ; une seule base pour le tirage, les empreintes et les compteurs d'essais |
| V3 | Mots de passe | Empreinte scrypt de `node:crypto`, salée, sur le mot de passe normalisé (S3) ; jamais en clair |
| V4 | Mot de passe d'administration | Variable d'environnement Vercel posée par Yannick ; aucun agent ne le connaît |
| V5 | Simplicité | Le plus simple possible : pas de comptes, pas de session durable (S5) |
| V6 | Restrictions | Spec, architecture et découpage validés par Yannick ; tâches fusionnées après relecture, chemins sensibles compris ; mise en production par les agents à la fusion ; mots de passe et tirage réels, base de production et `.env` interdits aux agents ; tests sur un double en mémoire |
| V7 | Tester sans la base de production | Pas de base sur les déploiements de revue : l'offre gratuite d'Upstash n'accepte qu'une base. Tests sur le double en mémoire, en local et dans l'intégration continue ; seule la production a Redis ; en production, les agents ne font que des lectures. Écartées : une base partagée avec des clés préfixées par déploiement, l'offre payante |
| V8 | JavaScript et navigateurs visés | JavaScript exigé, navigateurs qui lisent les modules ES (téléphones depuis 2019 environ, navigateurs intégrés de WhatsApp et des messageries compris), sans version de secours ni message `<noscript>`. Écartée : une version sans JavaScript |

### Proposées par l'architecte, à valider avec cette architecture

| N° | Question | Options | Recommandation |
|---|---|---|---|
| A1 | Quel cadre ? | Pages statiques et fonctions Vercel, sans framework · Next.js · Vite et fonctions | **Pages statiques et fonctions** : quatre écrans et quatre appels n'ont besoin ni de rendu serveur, ni de routeur, ni de build ; la maquette donne déjà le style et la forme des écrans en JavaScript sans dépendance. Next.js apporterait des centaines de paquets et des sessions dont la spec ne veut pas |
| A2 | Quel langage et quels contrôles ? | JavaScript vérifié par `tsc` (JSDoc) · TypeScript compilé · JavaScript sans vérification ; Biome · ESLint ; `node:test` · Vitest | **JavaScript vérifié par `tsc`, Biome, `node:test`** : le navigateur lit les fichiers sans build, les types sont vérifiés quand même, Biome remplace ESLint en un paquet, `node:test` est fourni par Node |
| A3 | Quel client Redis ? | `@upstash/redis` (REST) · appels `fetch` écrits à la main · `redis` en TCP | **`@upstash/redis`** : fait pour les fonctions sans serveur, lit les variables de l'intégration, deux paquets en tout ; un client maison serait du code à tester, et le TCP ouvrirait une connexion par appel |
| A4 | Comment faire le tirage une seule fois ? | `SET draw … NX` · transaction `WATCH`/`MULTI` · verrou puis écriture | **`SET … NX`** : une seule commande atomique, rien à débloquer si une fonction s'arrête au milieu |
| A5 | Comment compter les essais ratés ? | Compteur et clé de blocage de 60 secondes · une seule clé dont la durée démarre au cinquième essai · `@upstash/ratelimit` | **Compteur et clé de blocage** : chaque écriture est atomique ; une fonction arrêtée entre deux commandes ne bloque jamais un participant pour toujours (au pire, le blocage suivant vient un essai plus tôt). Une seule clé pourrait rester bloquée sans durée ; `@upstash/ratelimit` compte des essais par fenêtre, pas « 5 de suite, remis à zéro par un bon » |
| A6 | Comment protéger la page réservée sans session ? | Le mot de passe d'administration envoyé à chaque appel, gardé en mémoire par la page · un jeton signé de courte durée · un cookie de session | **À chaque appel** : aucun jeton ni secret de signature à gérer ; rien ne survit à la page (S5) ; chaque appel passe par la règle des 5 essais |
| A7 | Adresse de la page réservée | `/reservee` · une adresse longue et difficile à deviner | **`/reservee`** : le mot de passe protège la page, pas l'adresse ; Yannick la retient |
| A9 | Intégration continue ? | GitHub Actions · aucune (contrôles en local) | **GitHub Actions** : les agents fusionnent sans humain ; l'intégration continue est la preuve que l'orchestrateur attend avant chaque fusion. Repo privé : les minutes gratuites de GitHub suffisent (non vérifié) |
| A11 | Polices | Google Fonts, comme la maquette · fichiers des polices servis par le site | **Google Fonts** : rien à versionner ; l'adresse IP du visiteur est vue par Google, ce qui est acceptable ici |

### Points que la spec ne tranche pas, tranchés ici

| N° | Point | Décision |
|---|---|---|
| T1 | Un mot de passe est choisi pour le même participant sur deux appareils à la fois, ou la réponse de « Valider » se perd | Le premier est gardé ; le même mot de passe ouvre le paquet ; un autre compte comme un essai raté et fait passer l'écran à « Redonner son mot de passe » ([Choisir son mot de passe](#choisir-son-mot-de-passe-s2-s7)) |
| T2 | Yannick efface un mot de passe pendant que la personne est sur « Redonner son mot de passe » | « Voir mon tirage » fait passer à « Choisir son mot de passe » |
| T3 | Comment compter les 4 caractères | En points de code, sur le texte sans ses espaces du début et de la fin, mis en NFC ; un emoji compte pour un |
| T4 | Le mot de passe d'administration est-il normalisé ? | Non, comparé tel quel ; son champ est masqué, comme dans la maquette |
| T5 | Quand s'affiche « Beaucoup d'essais ratés… » | Dès le cinquième essai raté, puis à chaque essai pendant la minute, même avec le bon mot de passe |
| T6 | Longueur maximale | Aucune règle visible ; un corps de plus de 2 Ko est refusé (413), ce qui affiche le bandeau « Oups… » |

## Hypothèses et ce qui n'est pas conçu

- **L'horloge de l'appareil** donne le jour du compte à rebours ; un téléphone mal réglé
  affiche un autre nombre de jours.
- **Une seule base de production**, sans sauvegarde : si elle était perdue, le tirage le
  serait aussi, et un nouveau serait fait au premier mot de passe choisi. Upstash garde les
  données sur disque ; ce qu'il fait d'une base gratuite peu utilisée n'est pas vérifié.
- **Pas de journal** des actions ; les journaux de Vercel ne reçoivent ni mot de passe, ni
  empreinte, ni tirage.
- **Pas de domaine propre** : l'adresse est celle que Vercel donne au projet.
- Hors périmètre de la spec, donc non conçu : ajout ou retrait d'un participant, second
  tirage, autre année. Changer la liste demanderait de vider la base.
