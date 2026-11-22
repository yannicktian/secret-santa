# Changelog

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
