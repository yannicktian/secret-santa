# Cahier des charges

## Le besoin

Un secret santa en famille pour Noël, le **25 décembre 2026 à midi**. Chacun offre un cadeau
à une personne tirée au sort, sans savoir qui lui offre le sien.

Sept participants : Yannick, Léa, Christine, Guigui, Mamet, Anne et Loulou.

Un seul lien, l'adresse racine du site (sans chemin, par exemple une adresse Vercel), est
envoyé à chacun.

## Ce que fait le site

1. La page d'accueil présente le secret santa en quelques mots et invite la personne à dire
   qui elle est.
2. La première fois, la personne choisit un mot de passe. Elle le redonnera pour revoir son
   tirage plus tard.
3. Une fois son identité confirmée, elle voit à qui elle offre son cadeau.
4. Si une personne oublie son mot de passe, Yannick l'efface depuis une page réservée ; la
   personne en choisit un nouveau, et son tirage ne change pas.

## Le tirage

- Il est fait au hasard.
- Personne ne se tire soi-même.
- Chacun offre à une seule personne et reçoit d'une seule personne.

## Contraintes

- **UX la plus simple possible** : des personnes âgées, peu à l'aise avec le numérique,
  participent.
- **La page du mot de passe** est concise : elle explique à quoi il sert et invite à en
  choisir un simple, facile à retenir.
- **Le design** ne reprend pas celui des sites générés habituels : sobre mais original,
  sympathique et jovial, un peu dans l'esprit d'un jeu vidéo.

## Restrictions

- Spec, architecture et découpage sont validés par Yannick.
- Aucun mot de passe ni tirage réel n'est versionné, ni montré sur le site du projet, ni
  dans une capture : tests et maquettes utilisent des tirages fictifs.
- Les secrets (clés, jetons, mot de passe d'administration) vont dans `.env`, ignoré par git.
