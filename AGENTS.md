# Consignes

Le besoin est décrit dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md) : le lire
avant toute tâche. Le projet suit le workflow [factory](https://github.com/yannicktian/factory).

## Langue

- Français pour la documentation, les specs, les issues, les PR et les messages de commit.
- Anglais pour le code et les identifiants. Les mots affichés suivent les mots exacts des
  specs et le glossaire, `docs/glossaire.md`, écrit avec la première spec.

## Données

- Aucun mot de passe ni tirage réel dans un fichier versionné, une capture ou le site du
  projet : seulement des tirages fictifs.
- Les secrets vont dans `.env`, ignoré par git. Ne jamais l'afficher, ni afficher la sortie
  d'une commande qui contient un jeton.

## Documentation

La documentation décrit l'état courant. L'historique et les raisons des choix passés vont
dans [CHANGELOG.md](CHANGELOG.md).

## Factory

Ce qui ne change pas d'une epic à l'autre, pour les sessions de factory :

- **Langue des échanges** : français.
- **Worktree** : `orca worktree create --name <nom> --repo path:/home/orca/repos/secret-santa
  --base-branch origin/main --issue <issue de la tâche, ou de l'epic hors tâche>`, supprimé
  par `orca worktree rm` ; jamais de worktree dans `/tmp` ni dans un dossier improvisé.
- **Site du projet** : l'adresse et les fichiers publiés sont dans `docs/site/README.md`,
  créé avec la première spec ; une page par epic dans `docs/site/epics/`.
- **Outils de l'orchestrateur** : `gh` pour les issues et les PR, `orca` pour les worktrees et
  les sessions visibles, l'outil Artifact de Claude Code pour publier le site, des agents
  (développeur, relecteur, auditeur de sécurité) lancés en arrière-plan, chacun dans son
  worktree.
- **Interdit aux agents** : les mots de passe et le tirage réels, la base de production, et
  `.env`. Les créer ou les lire est une tâche humaine.
- **Restrictions** : la ligne de secret-santa dans les
  [restrictions par projet](https://github.com/yannicktian/factory/blob/main/docs/cahier-des-charges.md#restrictions-par-projet)
  de factory ; les chemins sensibles sont déclarés par l'architecture.
