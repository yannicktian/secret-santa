# secret-santa

Le site du secret santa familial de Noël 2026 : chacun dit qui il est, choisit un mot de
passe, et découvre à qui il offre son cadeau.

| Pour… | Lire |
|---|---|
| Comprendre le besoin | [Cahier des charges](docs/cahier-des-charges.md) |
| Lire les specs, voir les maquettes | [Site du projet](https://claude.ai/artifact/4zsk6C5uLKWQQrimx88gkj) ([sources](docs/site/README.md)) |
| Connaître les mots affichés | [Glossaire](docs/glossaire.md) |
| Savoir comment le site est construit | [Architecture](docs/architecture.md), [découpage de l'epic 1](docs/plans/tirage.md) |
| Ouvrir la production, la vérifier | <https://secret-santa-one-lemon.vercel.app>, [déploiement](docs/deploiement.md) |
| Travailler sur le repo avec un agent | [AGENTS.md](AGENTS.md) |
| Voir les avancées | [Changelog](CHANGELOG.md) |

## Développer

Il faut Node.js 26, ou 24 avec un avertissement de `npm ci`
([versions de Node.js](docs/architecture.md#contrôles)). Les contrôles et le serveur local
n'utilisent que le stockage en mémoire, jamais la base de production.

1. Installer les dépendances et le navigateur des tests :

   ```sh
   npm ci
   npx playwright install chromium
   ```

2. Lancer le site en local, sur <http://localhost:3000> (`PORT=3001 npm run dev` pour
   une autre adresse) :

   ```sh
   npm run dev
   ```

3. Contrôler : lint, types et tests unitaires, puis tests des écrans (Playwright, à 360
   et 1280 pixels) ; avec `CAPTURES=1`, les captures vont dans `captures/`.

   ```sh
   npm run check
   npm run test:e2e
   CAPTURES=1 npm run test:e2e
   ```

Le détail des contrôles est dans l'[architecture](docs/architecture.md#contrôles).
