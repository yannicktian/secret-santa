# Epic 1 — découpage en tâches

Découpage de la [spec du tirage](../specs/tirage.md) selon l'[architecture](../architecture.md).
Chaque tâche se relit seule et laisse le projet en état de marche ; chacune aura son issue,
rattachée à l'epic [#1](https://github.com/yannicktian/secret-santa/issues/1). « Dépend de »
veut dire que ces tâches sont fusionnées. « Fini quand » se prouve dans la pull request ;
« Constat humain » est ce que Yannick constate après la fusion, avant que l'issue soit
close. Taille : 400 lignes modifiées au plus, hors tests et `package-lock.json`.

Le risque passe en premier. Le socle (1) seul, puis, dès que le projet Vercel est relié
au repo (prérequis A), le premier déploiement (6), qui constate ce que l'architecture suppose de
Vercel et de l'intégration Upstash : s'il le contredit, seules les tâches 1 et 6 sont à
reprendre. Les règles du domaine (2, 3, 4) et l'accueil (5) partent en même temps que lui.
Personne n'a le lien avant la tâche 13 : entre deux tâches, aucun participant ne perd rien.

## Lots

| Lot | Tâches, parties ensemble | Attend |
|---|---|---|
| 1 | 1 | — |
| 2 | 2, 3, 4, 5, 6 | la tâche 1 ; pour la 6, aussi le prérequis humain A |
| 3 | 7, 8, 9, 10, 11 | 7 : 2, 3, 4 · 8 : 2, 3 · 9, 10, 11 : 5 |
| 4 | 12 | 7 à 11 |
| 5 | 13 | 6 et 12 ; le prérequis humain B |

Une tâche part dès que ce qu'elle attend est fusionné, sans attendre le reste de son lot.
Aucun fichier n'est modifié par deux tâches d'un même lot ; le README l'est par les
tâches 1, 6 et 13, qui sont de lots différents.

| # | Tâche | Dépend de | Chemins sensibles |
|---|---|---|---|
| 1 | Socle, contrôles et santé du déploiement | — | oui |
| 2 | Stockage et essais ratés | 1 | oui |
| 3 | Le tirage | 1 | oui |
| 4 | Mots de passe des participants | 1 | oui |
| 5 | Accueil, style et site injoignable | 1 | non |
| 6 | Premier déploiement | 1, prérequis A | non (doc) |
| 7 | Fonctions du participant | 2, 3, 4 | oui |
| 8 | Fonction de la page réservée | 2, 3 | oui |
| 9 | Écrans du mot de passe | 5 | non |
| 10 | Écran du paquet | 5 | non |
| 11 | Écrans de la page réservée | 5 | non |
| 12 | Parcours complet et test de fuite | 7, 8, 9, 10, 11 | oui |
| 13 | Mise en ligne | 6, 12, prérequis B | non (doc) |

Les chemins sensibles sont groupés dans les tâches du serveur (1 à 4, 7, 8, 12) ; les
écrans (5, 9, 10, 11) n'en touchent aucun. Les restrictions du projet fusionnent les unes
comme les autres après relecture, sans attendre un humain.

## Prérequis humains

Fait, constaté le 22 novembre 2026 : comptes relevés (un seul compte Vercel,
`yannicktians-projects`, offre Hobby, aucun projet secret-santa ni intégration avant) ;
projet Vercel `secret-santa` créé par la CLI ; jeton Vercel des agents posé dans
`~/.config/secret-santa/vercel.env` ; Upstash Redis `secret-santa-kv` installé et relié à
la seule production ; évolution de factory
[#57](https://github.com/yannicktian/factory/pull/57) (restrictions de secret-santa)
fusionnée.

Restent, à faire par Yannick. Ils ne bloquent que la tâche indiquée ; les autres avancent
sans eux.

- **A. Relier le projet Vercel au repo** : donner à l'application Vercel de GitHub l'accès
  au dépôt `yannicktian/secret-santa` (`vercel git connect` échoue tant qu'elle ne l'a
  pas). L'orchestrateur relance ensuite `vercel git connect`. Débloque : 6, donc la mise
  en production à chaque fusion.
- **B. Poser le mot de passe d'administration** en production, de type sensible, sans le
  donner à personne : depuis les réglages du projet sur le site de Vercel, ou dans un
  terminal, depuis un dossier relié au projet :

  ```sh
  npx vercel env add ADMIN_PASSWORD production --sensitive
  ```

  La CLI demande la valeur (commande non essayée). Débloque : 13.

Constat humain à la fin (tâche 13) : ouvrir la page réservée de la production avec le mot
de passe d'administration, voir les sept participants « Pas encore de mot de passe »,
puis envoyer le lien.

## 1. Socle, contrôles et santé du déploiement

- **Fichiers** : `package.json` (`"type": "module"`, `engines.node` `24.x`, scripts
  `check`, `lint`, `typecheck`, `test`, `test:e2e`, `dev`, dépendances aux versions de
  l'[architecture](../architecture.md#contrôles)), `package-lock.json`, `tsconfig.json`,
  `biome.json`, `playwright.config.js` (serveur `scripts/dev-server.js` avec
  `SECRET_SANTA_STORE=memory` et un `ADMIN_PASSWORD` fictif, projets 360 et 1280 pixels), `.gitignore` (`node_modules/`,
  `.vercel/`, `captures/`, `test-results/`, `playwright-report/`, `.env*`), `vercel.json`
  (`outputDirectory`, `cleanUrls`, région `fra1` que la tâche 6 aligne sur celle de la base, en-têtes de sécurité, `no-store` sur
  `/` et `/reservee`), `.github/workflows/check.yml`, `scripts/dev-server.js`,
  `lib/http.js`, `api/health.js`, `public/index.html` (titre « Secret santa de Noël »
  seul, que la tâche 5 remplace), `README.md` (section « Développer » : installer,
  lancer, contrôler).
- **Tests** : `tests/unit/http.test.js` : corps de plus de 2 Ko refusé (413), type autre
  que JSON refusé (415), réponse en `no-store` ; `tests/unit/health.test.js` :
  `store` vaut `missing` sans variables, `memory` avec `SECRET_SANTA_STORE=memory`,
  `redis` avec `KV_REST_API_URL` et `KV_REST_API_TOKEN` (valeurs fictives), `reservedPage` suit la présence
  d'`ADMIN_PASSWORD`, et la réponse ne contient aucune valeur de variable ; un test
  Playwright qui ouvre `/` à 360 pixels.
- **Fini quand** : `npm run check` et `npm run test:e2e` passent en local et dans GitHub
  Actions sur la pull request ; `npm run dev` sert `/`, `/reservee` (404 tant que la
  tâche 11 n'est pas faite) et `/api/health`.

## 2. Stockage et essais ratés

- **Fichiers** : `lib/store.js`, `lib/memory-store.js`, `lib/attempts.js`, et `api/health.js`,
  qui lit désormais le choix du stockage dans `lib/store.js` (la tâche 1 ne regarde que la
  présence des variables).
- **Tests** : `tests/unit/store.test.js` : même suite de contrat sur le double et sur la
  version Redis, celle-ci avec un `fetch` simulé qui vérifie les commandes envoyées
  (`set … nx`, `set … ex 60`, `incr`, `mget`, `del`) et rend les réponses de Redis ; le
  double fait expirer une clé à 60 secondes d'horloge simulée ; `getStore()` refuse la
  mémoire sur Vercel (`VERCEL_ENV` posée), crée le client Redis avec les seules
  `KV_REST_API_URL` et `KV_REST_API_TOKEN` (valeurs fictives), et lève une erreur sans
  variables Redis.
  `tests/unit/attempts.test.js` : 4 ratés puis un bon remettent à zéro ; le cinquième raté
  bloque et répond `locked` ; pendant la minute, tout essai répond `locked` sans
  vérification ; 60 secondes après, 5 nouveaux essais ; deux participants ne se bloquent
  pas l'un l'autre ; `admin` a son propre compteur.
- **Fini quand** : chaque clé de [Données](../architecture.md#données) est écrite par la
  commande que l'architecture donne, et par aucune autre.

## 3. Le tirage

- **Fichiers** : `lib/participants.js`, `lib/draw.js` (`makeDraw`).
- **Tests** : `tests/unit/draw.test.js` : 185 400 tirages à graine fixe, les 1 854 tirages
  possibles sortent, aucun point fixe, khi-deux sous 2 142 ; la même vérification échoue
  sur l'algorithme de Sattolo ; chaque participant donne et reçoit une fois ; des tirages
  avec une paire réciproque sortent ; `crypto.randomInt` par défaut.
  `tests/unit/participants.test.js` : sept participants, dans l'ordre du périmètre,
  prénoms exacts de la spec, identifiants de l'architecture.
- **Fini quand** : le test statistique tourne en moins de 5 secondes dans `npm run check`.

## 4. Mots de passe des participants

- **Fichiers** : `lib/password.js` (`normalizePassword`, `isLongEnough`, `hashPassword`,
  `verifyPassword`).
- **Tests** : `tests/unit/password.test.js` : « Noël », « noel », « NOEL » et « noel  »
  vérifient la même empreinte ; « Noël » ne vérifie pas l'empreinte de « noelle » ;
  « abc », «  abc  » et « a b » refusés, « abcd », « 🎄🎄🎄🎄 » et « !!!! » acceptés ;
  deux empreintes du même mot de passe diffèrent (sel) ; l'empreinte a la forme
  `scrypt$16384$8$1$…$…` et ne contient pas le mot de passe ; une empreinte mal formée ne
  vérifie rien.
- **Fini quand** : aucune fonction du module ne renvoie ni n'écrit le mot de passe tel
  quel.

## 5. Accueil, style et site injoignable

- **Fichiers** : `public/index.html`, `public/style.css`, `public/app.js`,
  `public/countdown.js`, et les écrans d'attente `public/screens/password.js` et
  `public/screens/gift.js` (« Bonjour <prénom> ! » et « Ce n'est pas moi » seuls), que les
  tâches 9 et 10 remplacent.
- **Tests** : `tests/unit/countdown.test.js` : « Plus que 33 jours ! » le 22 novembre 2026,
  « Plus que 2 jours ! » le 23 décembre, « C'est demain ! » le 24, « C'est aujourd'hui ! »
  le 25, rien le 26 ; le 24 décembre à 23 h 30 à Paris (22 h 30 UTC) donne « C'est
  demain ! ». `tests/e2e/home.spec.js`, appels interceptés : l'ordre des éléments de S1 et
  leurs mots exacts ; les sept boutons, dans l'ordre, d'au moins 56 pixels, cliquables sur
  toute leur surface ; titre, présentation et « Qui es-tu ? » dans 360 × 640 ; aucun
  lien vers `/reservee` ; sans défilement horizontal à 360 pixels ; texte courant d'au
  moins 20 pixels ; la date et le compte à rebours absents le 26 décembre (horloge de
  Playwright) ; même rendu en thème sombre ; réseau coupé au toucher d'un prénom :
  bandeau « Oups, le site ne répond pas. Vérifie ta connexion à internet, puis
  réessaie. » et « Réessayer », qui refait l'appel ; aucun cookie ni stockage après le
  passage. Captures de l'accueil aux 22 novembre, 24, 25 et 26 décembre.
- **Fini quand** : l'accueil ressemble à celui de la maquette, à 360 et 1280 pixels ; le
  contraste de chaque texte atteint AA (vérifié sur les couleurs de `style.css`).

## 6. Premier déploiement

- **Fichiers** : `docs/deploiement.md` (relier le dossier par `vercel link`, version fixée
  de la CLI, variables attendues, ce qui a été constaté), `README.md` (adresse de
  production), `docs/architecture.md` seulement si un constat la contredit, signalé dans
  la PR.
- **Tests** : sur le déploiement de production de `main`, fait par l'intégration Git :
  `GET /` sert l'écran de la tâche 1 ou 5, `GET /api/health` répond `store: "redis"` ; les
  en-têtes de `vercel.json` sont présents ; `GET /package.json` et `GET /lib/store.js`
  répondent 404 ; la région de la base, relevée sans lire de donnée, est celle de
  `vercel.json` (sinon `vercel.json` la prend).
- **Fini quand** : `docs/deploiement.md` dit, pour chaque point « non vérifié » de
  l'architecture que ce déploiement montre (signature des fonctions, dossier servi,
  `cleanUrls`, `VERCEL_ENV` à l'exécution, région), ce qui a été constaté. Aucun appel à
  `choose-password`, `open-gift` ni `reserved` en production.

## 7. Fonctions du participant

- **Fichiers** : `lib/gift.js` (`getParticipantState`, `choosePassword`, `openGift`,
  `getOrCreateDraw`), `api/participant.js`, `api/choose-password.js`, `api/open-gift.js`.
- **Tests** : `tests/unit/gift.test.js`, sur le double : état avant et après le choix ;
  `too_short` sans rien écrire, ni empreinte ni tirage ; le premier choix fait le tirage
  avant d'écrire l'empreinte et rend un prénom différent du sien ; deux choix simultanés
  de deux participants : un seul tirage ; le même participant choisit deux fois le même
  mot de passe : 200 et même prénom ; un autre mot de passe : `already_chosen`, essai
  compté ; `open-gift` : bon mot de passe avec majuscules et accents, prénom identique à
  chaque fois ; mauvais : `wrong_password`, puis `locked` au cinquième ; `no_password`
  après effacement ; après effacement et nouveau choix, même prénom ; aucune réponse ne
  contient l'empreinte, le tirage entier ni qui offre au participant ;
  `tests/unit/api-participant.test.js` : chaque fichier de `api/` appelé avec une
  `Request` : 400 pour un identifiant inconnu, 415, 413, codes du tableau des fonctions.
- **Fini quand** : chaque ligne du tableau des fonctions de l'architecture pour ces trois
  appels a son test.

## 8. Fonction de la page réservée

- **Fichiers** : `lib/reserved.js` (`checkAdminPassword`, `listParticipants`,
  `erasePassword`), `api/reserved.js`.
- **Tests** : `tests/unit/reserved.test.js` : mauvais mot de passe : `wrong_password`,
  puis `locked` au cinquième, et le bon refusé pendant la minute ; `ADMIN_PASSWORD`
  absente ou vide : 503 ; le mot de passe d'administration n'est pas normalisé (`Admin`
  ≠ `admin`) ; liste dans l'ordre du périmètre avec `hasPassword` ; effacement : état
  « pas encore », `draw` inchangé, un participant sans mot de passe reste sans ; action
  ou participant inconnus : 400 ; aucune réponse ne contient de tirage, d'empreinte ni
  de mot de passe.
- **Fini quand** : la fonction ne lit jamais la clé `draw` (vérifié par un double qui
  échoue s'il la lit).

## 9. Écrans du mot de passe

- **Fichiers** : `public/screens/password.js`.
- **Tests** : `tests/e2e/password.spec.js`, appels interceptés. S2 : « Bonjour Léa ! »,
  les deux phrases, « Ton mot de passe », « Valider », « Ce n'est pas moi » ; champ en
  clair avec `autocapitalize="none"`, `autocorrect="off"`, `spellcheck="false"` ; « abc »
  affiche « Il faut au moins 4 lettres ou chiffres. » et garde ce qui est tapé ;
  « Valider » ouvre l'écran du paquet sans redemander ; « Ce n'est pas moi » revient à
  l'accueil sans appel d'écriture ; `already_chosen` passe à S3 champ vide. S3 : mots et
  ordre de S3, texte du mot de passe oublié dès l'arrivée, celui de Yannick pour Yannick ;
  `wrong_password` vide le champ et affiche « Ce n'est pas le bon mot de passe.
  Réessaie. » ; `locked` affiche « Beaucoup d'essais ratés : attends une minute avant de
  réessayer. » ; `no_password` passe à S2. Clavier simulé (fenêtre de 360 × 340) : champ
  et bouton visibles sans défiler après le toucher du champ. Réseau coupé à « Valider » et
  à « Voir mon tirage » : bandeau, « Réessayer » refait l'envoi, le champ garde le texte.
  Captures de chaque état.
- **Fini quand** : les écrans ressemblent à ceux de la maquette, à 360 et 1280 pixels.

## 10. Écran du paquet

- **Fichiers** : `public/screens/gift.js`.
- **Tests** : `tests/e2e/gift.spec.js`, appels interceptés, prénom tiré fictif : paquet
  fermé, « Ton tirage est dans ce paquet. », « Touche le paquet pour l'ouvrir. », tout le
  paquet cliquable (toucher son coin) ; ouvert : « Tu offres ton cadeau à », le prénom,
  « Garde le secret jusqu'au 25 décembre ! », « Retour à l'accueil » ; avec
  `reducedMotion: "reduce"`, aucune animation ni attente ; « Retour à l'accueil » revient
  à l'accueil et le prénom n'est plus dans la page ; après retour du navigateur puis
  avant, ou rechargement, l'accueil s'affiche, pas le paquet ; aucune entrée d'historique
  ajoutée ; aucun texte ne dit qui offre à la personne. Captures fermé et ouvert.
- **Fini quand** : le paquet en pixels est celui de la maquette.

## 11. Écrans de la page réservée

- **Fichiers** : `public/reservee.html`, `public/reserved.js`.
- **Tests** : `tests/e2e/reserved.spec.js`, appels interceptés : `/reservee` a pour titre
  « Page réservée », le champ « Mot de passe d'administration », masqué, et « Entrer » ;
  `wrong_password` : « Ce n'est pas le bon mot de passe. » ; `locked` : « Beaucoup
  d'essais ratés : attends une minute avant de réessayer. » ; la liste sous
  « Participants », dans l'ordre, « Mot de passe choisi » ou « Pas encore de mot de
  passe », le bouton « Effacer le mot de passe » seulement pour les premiers ; la
  confirmation « Effacer le mot de passe de Léa ? », « Léa en choisira un nouveau à sa
  prochaine visite. Son tirage ne change pas. », « Effacer » et « Annuler » ; « Annuler »
  n'appelle rien ; « Effacer » appelle `erase` avec le mot de passe tapé et affiche
  « Mot de passe de Léa effacé. » et le nouvel état ; « Les tirages ne s'affichent jamais
  ici, pas même le tien. » ; réseau coupé à « Entrer » et à « Effacer » : bandeau et
  « Réessayer » ; recharger redemande le mot de passe ; aucun stockage. Captures de chaque
  état.
- **Fini quand** : la page ressemble à celle de la maquette, à 360 et 1280 pixels.

## 12. Parcours complet et test de fuite

- **Fichiers** : `tests/e2e/parcours.spec.js`, `tests/securite/fuite.test.js`.
- **Tests** : sans interception, sur le double : Léa arrive pour la première fois, choisit
  « Sapin », ouvre son paquet ; revient, redonne « sapin », même prénom ; Yannick efface
  son mot de passe sur la page réservée ; Léa repasse par S2 avec « houx » et retrouve le
  même prénom ; deux participants qui valident en même temps (deux pages) ont des prénoms
  d'un même tirage. Test de fuite : voir [Tests](../architecture.md#tests) ; il échoue si
  l'on fait renvoyer l'empreinte par une fonction (preuve faite une fois dans la PR, puis
  retirée).
- **Fini quand** : chaque story de la spec est traversée au moins une fois sans
  interception.

## 13. Mise en ligne

- **Fichiers** : `docs/deploiement.md` (constats), `README.md` (le lien à envoyer).
- **Tests** : sur la production, seulement des lectures : `GET /`, `GET /reservee`
  (titre « Page réservée »), `GET /api/health` (`store: "redis"`, `reservedPage: true`) ;
  les contrôles de la tâche 12 passent sur `main`.
- **Fini quand** : `docs/deploiement.md` dit ce qui a été constaté en production, et ce
  qui ne le sera qu'au constat humain et au premier usage (Redis lu par la page réservée,
  puis écrit au premier mot de passe choisi) ; aucun agent n'a écrit dans la base.
- **Constat humain** : Yannick ouvre `/reservee` en production, entre son mot de passe
  d'administration, voit les sept participants « Pas encore de mot de passe », puis
  envoie le lien. Le premier participant qui choisit son mot de passe fait le vrai
  tirage.

## Couverture de la spec

| Spec | Construit et testé par |
|---|---|
| S1, mots de l'accueil, compte à rebours, après le 25 décembre | 5 |
| S2, mots du mot de passe (première fois), trop court | 4 (règle), 7 (fonction), 9 (écran) |
| S3, mots du retour, mot de passe oublié, majuscules et accents, 5 essais | 2 (essais), 4 (normalisation), 7, 9 |
| S4, mots du paquet, moins d'animations | 10 |
| S5, rien retenu, retour du navigateur | 5 (accueil, stockage), 10 (paquet, historique), 11 (page réservée) |
| S6, mots de la page réservée, 5 essais, effacement sans changer le tirage | 2, 8, 11, 12 |
| S7, une seule fois, au hasard, test statistique, jamais montré en entier | 3, 7, 8, 12 |
| « Partout » : site injoignable, « Réessayer » | 5 (bandeau), 9, 10, 11 (sur leurs appels) |
| États vides et cassés : personne n'a validé, mauvais prénom, mot de passe oublié, Yannick oublie le sien | 7, 9, 12 |
| Affichage : mobile first, 48 et 56 pixels, 20 pixels, AA, clavier ouvert, un seul thème, style jeu vidéo | 5 (règles du style), 9, 10, 11 (leurs écrans) |
| Rien de secret envoyé au navigateur | 7, 8 (réponses), 12 (test de fuite) |
| Points tranchés T1 à T6 de l'architecture | 7 (T1, T2, T3, T5, T6), 8 (T4, T5), 9 (T1, T2) |

La spec ne retire rien : aucune tâche de retrait.
