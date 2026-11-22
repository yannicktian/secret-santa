# Changelog

## 2026-11-22 · Refacto de l'epic 1

- Sans comportement changé, tests inchangés. Serveur (PR #46) : les clés des essais ratés
  écrites seulement par `lib/attempts.js`, une seule lecture des mots de passe choisis, une
  seule recherche d'un participant (`lib/participants.js`). Écrans (PR #47) : `element()`
  et `button()` dans `public/dom.js`, `turn()` et le changement d'écran dans
  `public/call.js`, une seule confirmation sur la page réservée, CSS inutilisé retiré.
- Défaut d'outillage trouvé, laissé à une issue : le port des tests e2e est commun à tous
  les worktrees (#48).

## 2026-11-22 · Epic 1 — Le tirage

- Le site du secret santa, en production : accueil, mot de passe choisi à la première
  visite, paquet à ouvrir, page réservée de Yannick (qui a choisi son mot de passe,
  effacer un mot de passe, refaire le tirage). Tirage uniforme fait au premier mot de passe
  choisi, empreintes scrypt, 5 essais ; pages statiques et fonctions Vercel, Redis Upstash.
- En cours d'epic, à la demande de Yannick : Node 26 pour la CI et Vercel ; « Refaire le
  tirage » (S8) ; indicateur de chargement puis toucher d'un prénom sans attente ; dépôt
  rendu public pour débloquer GitHub Actions, l'adresse de production retirée du dépôt.
- Après relecture : double appui, délai de 15 secondes des appels ; après l'audit de
  sécurité : CI durcie. Bilan : `docs/bilans/1-tirage.md`.

## 2026-11-22 · Accueil : indicateur de chargement au toucher d'un prénom

- Petite itération demandée par Yannick : au toucher d'un prénom, son bouton montre trois
  pixels qui clignotent à la place de sa flèche (immobiles avec « moins d'animations ») et
  les sept boutons sont désactivés jusqu'à la réponse ; avec « Oups… », ils redeviennent
  actifs. Un second toucher pendant l'attente n'a donc plus d'effet : les tests où un
  second prénom remplaçait une réponse tardive sont remplacés. Charger l'état des prénoms
  dès l'ouverture de l'accueil, pour supprimer l'attente, sera une tâche à part.

## 2026-11-22 · Architecture et découpage de l'epic 1

- Architecture du site (`docs/architecture.md`) : pages statiques et fonctions Vercel sans
  framework, Redis Upstash, tirage écrit une seule fois par `SET … NX`, empreintes scrypt,
  règle des 5 essais par compteur et clé de blocage, page réservée sans session. Les choix
  d'hébergement, de stockage, d'empreinte, les restrictions, l'absence de base sur les
  déploiements de revue (l'offre gratuite d'Upstash n'en accepte qu'une, une base de test
  a été écartée) et JavaScript exigé sont ceux de Yannick ; les autres (A1 à A7, A9, A11, T1 à T6)
  sont proposés avec cette architecture.
- Découpage en 13 tâches et 5 lots (`docs/plans/tirage.md`), avec les prérequis humains.
- Site du projet : page de l'architecture, sections « Architecture technique » et lots sur
  la page de l'epic 1.

## 2026-11-22 · Spec de l'epic 1

- Première version de la spec du tirage (`docs/specs/tirage.md`), du glossaire et du site
  du projet, avec la page de l'epic 1 et sa maquette cliquable sur un tirage fictif.

## 2026-11-22

- Création du projet : cahier des charges, consignes des agents. Le projet suit factory ;
  spec, architecture et découpage sont validés par Yannick.
