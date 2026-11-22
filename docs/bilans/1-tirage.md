# Bilan de l'epic 1 — Le tirage

[Issue #1](https://github.com/yannicktian/secret-santa/issues/1) ·
[spec](../specs/tirage.md) · [plan](../plans/tirage.md) ·
[architecture](../architecture.md) · détail (chaque validation, chronologie) : [commentaire de l'issue](https://github.com/yannicktian/secret-santa/issues/1#issuecomment-7077611494).

## Ce qui t'attend

1. **Si tu veux un autre tirage** : sur la page réservée, « Refaire le tirage », puis
   confirmer. La confirmation doit dire « 1 personne a déjà vu son tirage. » (toi) ;
   sinon, quelqu'un d'autre est déjà venu.
2. **Le constat de mise en ligne**, étape par étape, dans
   l'[issue #16](https://github.com/yannicktian/secret-santa/issues/16) : la page réservée,
   ton mot de passe de participant (il fait le vrai tirage), ton paquet, la page réservée à
   nouveau. Dis-le dans l'issue #16 ; elle se ferme alors.
3. **Envoyer le lien** de l'accueil, et lui seul, aux six autres participants.

## À confirmer

Réponds dans l'issue #1, d'un mot (« d'accord ») ou par ce que tu aurais changé.

- Texte des boutons principaux en 20 px au lieu des 18,4 px de la maquette
  ([PR #25](https://github.com/yannicktian/secret-santa/pull/25)). Recommandé : garder.
- Tâche 5 acceptée à 828 lignes au-delà de la limite de 400, le style de tous les écrans
  étant la copie de la maquette ([PR #22](https://github.com/yannicktian/secret-santa/pull/22)).
  Recommandé : garder.
- Trois tâches ajoutées après relecture, avant la mise en ligne : double appui
  ([#28](https://github.com/yannicktian/secret-santa/pull/28)), délai de 15 secondes des
  appels ([#30](https://github.com/yannicktian/secret-santa/pull/30)), CI durcie après
  l'audit ([#35](https://github.com/yannicktian/secret-santa/pull/35)). Recommandé : garder.
- L'accueil charge l'état des sept prénoms dès son ouverture ; un état périmé coûte au pire
  un essai raté, comme T1 ([PR #42](https://github.com/yannicktian/secret-santa/pull/42)).
  Recommandé : garder.

## Livré

- Le site du secret santa, en production : accueil, mot de passe, paquet à ouvrir, page
  réservée, sur téléphone d'abord, dans le style de la maquette validée.
- Tirage uniforme, fait au premier mot de passe choisi ; empreintes scrypt ; 5 essais.
- Page réservée : qui a choisi son mot de passe, effacer un mot de passe, refaire le tirage.
- Indicateur de chargement, puis toucher d'un prénom sans attente.

## Vérifier toi-même

1. Ouvre l'accueil sur ton téléphone : il s'affiche aussitôt, et toucher un prénom ouvre
   l'écran du mot de passe sans attente.
2. Ouvre la page réservée : les sept participants et leur état, jamais un tirage.

## Points d'attention

- **Pas encore vu pour de vrai** : l'écriture dans la base de production avant ton constat
  (seules des lectures ont été faites par les agents) ; le champ et le bouton au-dessus du
  clavier sur un vrai téléphone (essayé dans Chromium seulement).
- **Adresse de production** : elle n'est plus dans le dépôt, devenu public ; les anciennes
  adresses, visibles dans l'historique, répondent 404.
- **Limites acceptées** : qui a le mot de passe d'administration peut voir un tirage en
  effaçant et en rechoisissant un mot de passe ; n'importe qui peut savoir qui a choisi le
  sien. Choisis un mot de passe d'administration long.
- **Rares erreurs passagères** : deux « Refaire le tirage » au même moment pendant un
  choix de mot de passe (« Réessayer » corrige) ; un essai raté pendant un tirage refait
  peut laisser une minute de blocage.
- **Base** : à San Francisco (`sfo1`, gardée sur ta réponse), sans région de lecture
  d'après Vercel (non vu dans la console Upstash) : la garantie du tirage en dépend.
- **Node** : 26 en CI et en production, 24 sur orca-server (avertissement attendu).

## Validations

| Étape | Validations | aucun | mineur | majeur | manquant | non mesuré | Sous-estimations | Surestimations |
|---|---|---|---|---|---|---|---|---|
| spec | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| architecture et découpage | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Les fusions de tâches n'attendent pas l'humain (restrictions du projet) ; aucune n'a eu
de troisième « à corriger ».

## Sécurité

Audit de l'epic entière : 0 critique, 0 haute, 0 moyenne, 2 basses. Une corrigée
([PR #35](https://github.com/yannicktian/secret-santa/pull/35)), une acceptée par toi.
Deux paquets npm lancés par erreur sur orca-server, vérifiés sans danger.

## Changements proposés

- [factory#59](https://github.com/yannicktian/factory/issues/59) et
  [orca-setup#106](https://github.com/yannicktian/orca-setup/issues/106) : ne plus lancer
  de paquet npm non voulu.
- factory : faire de l'étape « Fusionner » du cycle d'une tâche un script qui refuse la
  fusion tant que l'intégration continue du dernier commit n'a pas réussi (une fusion est
  partie sur une vérification en échec, due à la facturation GitHub).
- factory : une petite itération qui touche la spec, chemin sensible ici, passe par un
  relecteur ; à écrire dans la petite itération ou dans les chemins sensibles du projet.
