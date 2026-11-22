# Spec : le tirage du secret santa

Epic [#1](https://github.com/yannicktian/secret-santa/issues/1). Le site du secret santa
familial du 25 décembre 2026 : chacun dit qui il est, choisit un mot de passe à sa première
visite, et découvre à qui il offre son cadeau. Le site fait le tirage tout seul ; Yannick
efface un mot de passe oublié depuis la page réservée.

Besoin : [cahier des charges](../cahier-des-charges.md). Mots montrés :
[glossaire](../glossaire.md). La page de l'epic sur le site du projet illustre cette spec
et porte la maquette cliquable ; cette spec fait foi.

## Questions auxquelles elle répond

| Qui | Question | Quand |
|---|---|---|
| Un participant | C'est quoi, ce lien, et qu'est-ce que je dois faire ? | À la première visite |
| Un participant | À qui j'offre mon cadeau ? | Une fois, puis quelques fois jusqu'à Noël, pour s'en souvenir |
| Un participant | C'est quand, déjà ? | À chaque visite |
| Un participant | J'ai oublié mon mot de passe : comment je revois mon tirage ? | Rarement |
| Yannick | Qui n'est pas encore venu voir son tirage ? | Quelques fois avant Noël, pour relancer |
| Yannick | Comment remettre quelqu'un sur les rails sans voir son tirage ? | Quand quelqu'un a oublié son mot de passe |

Aucun écran ne répond à « qui m'offre mon cadeau ? » : c'est le secret.

## Périmètre

Sept participants, dans cet ordre partout : Yannick, Léa, Christine, Guigui, Mamet, Anne,
Loulou. Le site a une seule adresse, sa racine, envoyée à chacun. Les participants
l'ouvrent sur leur téléphone : le site est conçu pour lui d'abord (voir
[Affichage](#affichage)).

Écrans : l'accueil, le mot de passe (nouveau ou à redonner), le paquet, et la page
réservée de Yannick.

Hors périmètre : un budget, des idées de cadeaux ou une liste de souhaits, des messages ou
des rappels envoyés aux participants, l'ajout ou le retrait d'un participant, un second
tirage, une autre année.

## Stories

### S1 — L'accueil

La personne ouvre le lien : le site lui dit en deux phrases ce qu'est le secret santa et
quand il a lieu, puis lui demande qui elle est.

Critères :

- L'accueil montre, dans cet ordre : le titre, la présentation, la date, le compte à
  rebours, la question « Qui es-tu ? » et un bouton par participant, dans l'ordre du
  périmètre.
- Le compte à rebours se calcule en jours à l'heure de Paris : « Plus que 33 jours ! » le
  22 novembre 2026, « Plus que 2 jours ! » le 23 décembre, « C'est demain ! » le
  24 décembre, « C'est aujourd'hui ! » le 25 décembre. À partir du 26 décembre, la date et
  le compte à rebours ne s'affichent plus.
- Chaque bouton de participant fait au moins 56 pixels de haut et toute sa surface est
  cliquable.
- Aucun lien de l'accueil ne mène à la page réservée.

### S2 — Choisir son mot de passe, la première fois

La personne touche son prénom pour la première fois : on l'accueille par son prénom et on
lui demande de choisir un mot de passe simple.

Critères :

- L'écran montre « Bonjour <prénom> ! », deux phrases (à quoi sert le mot de passe, en
  choisir un simple), le champ, le bouton « Valider » et le lien « Ce n'est pas moi ».
- Le champ affiche ce qu'on tape, en clair ; le clavier du téléphone n'y ajoute ni
  majuscule ni correction automatique.
- Un mot de passe de moins de 4 caractères, espaces du début et de la fin retirés, est
  refusé avec « Il faut au moins 4 lettres ou chiffres. » ; aucune autre règle.
- « Valider » enregistre le mot de passe et ouvre le paquet (S4) sans redemander le mot de
  passe.
- « Ce n'est pas moi » ramène à l'accueil sans rien enregistrer.

### S3 — Redonner son mot de passe

La personne qui a déjà choisi son mot de passe touche son prénom : on lui demande de le
redonner.

Critères :

- L'écran montre « Bonjour <prénom> ! », le champ « Ton mot de passe », l'aide
  « Majuscules ou minuscules : peu importe. », le bouton « Voir mon tirage » et le lien
  « Ce n'est pas moi ».
- Le mot de passe est reconnu sans tenir compte des majuscules, des accents ni des espaces
  du début et de la fin : « Noël », « noel » et « NOEL » sont le même mot de passe.
- Un bon mot de passe ouvre le paquet (S4).
- Un mauvais mot de passe laisse l'écran tel quel, vide le champ et affiche
  « Ce n'est pas le bon mot de passe. Réessaie, ou demande à Yannick de l'effacer : tu en
  choisiras un nouveau. ». Pour Yannick, la seconde phrase devient « Réessaie, ou
  efface-le depuis la page réservée. ».
- Après 5 mauvais essais de suite pour un même participant, le site refuse les essais pour
  ce participant pendant une minute et affiche « Beaucoup d'essais ratés : attends une
  minute avant de réessayer. » ; un bon essai remet le compte à zéro.

### S4 — Ouvrir le paquet

Une fois son identité confirmée, la personne voit un paquet cadeau. Elle le touche, il
s'ouvre, et elle lit à qui elle offre son cadeau.

Critères :

- L'écran montre le paquet fermé, « Ton tirage est dans ce paquet. » et « Touche le paquet
  pour l'ouvrir. ». Le paquet entier est cliquable.
- Le paquet ouvert montre « Tu offres ton cadeau à », le prénom tiré, en grand,
  « Garde le secret jusqu'au 25 décembre ! » et le bouton « Retour à l'accueil ».
- Le paquet s'ouvre à chaque visite, la première comme les suivantes, et montre toujours
  le même prénom.
- Quand l'appareil demande moins d'animations, le paquet s'ouvre sans animation.
- Ni cet écran ni aucun autre ne dit qui offre son cadeau à la personne.

### S5 — Rien n'est retenu sur l'appareil

Le site ne se souvient pas de la personne d'une visite à l'autre, pour qu'un téléphone ou
une tablette prêté ne montre pas son tirage.

Critères :

- « Retour à l'accueil », le rechargement de la page ou sa fermeture ramènent à l'accueil ;
  revoir son tirage demande à nouveau son mot de passe.
- Le bouton retour du navigateur ne réaffiche pas un paquet ouvert.

### S6 — Effacer un mot de passe oublié

Yannick ouvre la page réservée, voit qui a choisi son mot de passe, et efface celui d'une
personne qui l'a oublié. Elle en choisit un nouveau à sa prochaine visite ; son tirage ne
change pas.

Critères :

- La page réservée a sa propre adresse, choisie par l'architecture, et demande le mot de
  passe d'administration, qui n'est pas celui de Yannick participant.
- Un mauvais mot de passe d'administration affiche « Ce n'est pas le bon mot de passe. » ;
  la règle des 5 essais de S3 s'applique aussi.
- La page liste les participants, dans l'ordre du périmètre, chacun avec son état :
  « Mot de passe choisi » ou « Pas encore de mot de passe ».
- Chaque participant dont le mot de passe est choisi a le bouton « Effacer le mot de
  passe ». Il ouvre la confirmation « Effacer le mot de passe de <prénom> ? » avec
  « <prénom> en choisira un nouveau à sa prochaine visite. Son tirage ne change pas. » et
  les boutons « Effacer » et « Annuler ».
- « Effacer » efface le mot de passe, passe l'état à « Pas encore de mot de passe » et
  affiche « Mot de passe de <prénom> effacé. ». À sa visite suivante, la personne passe par
  S2 et voit le même prénom dans le paquet.
- La page réservée ne montre jamais un tirage ni un mot de passe, pas même ceux de
  Yannick, et la phrase « Les tirages ne s'affichent jamais ici, pas même le tien. » le
  rappelle.

### S7 — Le tirage

Le site fait le tirage tout seul, une seule fois, sans que personne n'ait rien à faire ni à
voir.

Critères :

- Le tirage est fait la première fois qu'un participant valide son mot de passe (S2), avant
  que son paquet s'ouvre ; aucun écran ne dit qu'il n'est pas encore fait.
- Il n'est fait qu'une fois, même si deux participants valident leur mot de passe au même
  moment ; ensuite il ne change plus, ni quand un mot de passe est effacé, ni quand le site
  redémarre.
- Aucun écran ne permet de le refaire ni de le voir en entier.
- Le tirage attribue à chaque participant un autre participant, différent de lui-même ;
  chacun est attribué à un seul participant.
- Le tirage est fait au hasard : tous les tirages qui respectent ces règles ont la même
  chance de sortir, y compris ceux où deux personnes s'offrent leur cadeau l'une à l'autre.
  Un test le vérifie sur un grand nombre de tirages simulés.

## Affichage

- **Mobile first** : chaque écran est conçu pour un téléphone tenu en portrait, dès
  360 pixels de large, sans défilement horizontal ni zoom. Sur une tablette ou un
  ordinateur, la même colonne s'affiche, centrée ; aucun écran n'y ajoute rien.
- Le lien s'ouvre aussi bien dans le navigateur du téléphone que depuis un SMS, WhatsApp
  ou un e-mail, dans le navigateur intégré à ces applications.
- Sur l'écran du mot de passe, quand le clavier du téléphone est ouvert, le champ et le
  bouton « Valider » ou « Voir mon tirage » restent visibles sans faire défiler.
- Tout se fait au doigt : chaque élément à toucher fait au moins 48 pixels de côté, aucun
  ne demande de survol, de double touche ni d'appui long.
- Sur l'accueil, le titre, la présentation et la question « Qui es-tu ? » tiennent dans
  le premier écran d'un téléphone de 360 × 640 pixels ; les boutons des prénoms suivent
  en faisant défiler.
- Le texte courant fait au moins 20 pixels, les boutons au moins 56 pixels de haut ; les
  contrastes atteignent le niveau AA des règles d'accessibilité du web (WCAG).
- Le style est celui d'un jeu vidéo, sobre : écran de sélection pour « Qui es-tu ? »,
  paquet en pixels, boutons qui s'enfoncent quand on les touche. Les titres sont en police
  pixel, le texte courant dans une police faite pour la lecture.
- Un seul thème, le même pour tous, quel que soit le réglage clair ou sombre de
  l'appareil.

## Mots exacts

Les textes entre chevrons sont remplacés : `<prénom>` par le prénom du participant, `<n>`
par un nombre de jours.

### Accueil (S1)

| Élément | Texte |
|---|---|
| Titre | Secret santa de Noël |
| Présentation | Cette année, chacun offre un cadeau à une personne tirée au sort. Chut : personne ne sait qui lui offre le sien ! |
| Date | Rendez-vous le 25 décembre à midi. |
| Compte à rebours | Plus que `<n>` jours ! · C'est demain ! · C'est aujourd'hui ! |
| Question | Qui es-tu ? |
| Boutons | Yannick · Léa · Christine · Guigui · Mamet · Anne · Loulou |

### Mot de passe (S2, S3)

| Élément | Texte |
|---|---|
| Salutation | Bonjour `<prénom>` ! |
| Première fois | C'est ta première visite. Choisis un mot de passe : il te servira à revoir ton tirage plus tard. |
| Conseil | Prends-en un simple, facile à retenir : le nom d'un animal, d'une ville, d'un plat. |
| Champ | Ton mot de passe |
| Bouton, première fois | Valider |
| Trop court | Il faut au moins 4 lettres ou chiffres. |
| Aide, retour | Majuscules ou minuscules : peu importe. |
| Bouton, retour | Voir mon tirage |
| Mauvais mot de passe | Ce n'est pas le bon mot de passe. Réessaie, ou demande à Yannick de l'effacer : tu en choisiras un nouveau. |
| Mauvais mot de passe, Yannick | Ce n'est pas le bon mot de passe. Réessaie, ou efface-le depuis la page réservée. |
| Trop d'essais | Beaucoup d'essais ratés : attends une minute avant de réessayer. |
| Lien | Ce n'est pas moi |

### Paquet (S4)

| Élément | Texte |
|---|---|
| Paquet fermé | Ton tirage est dans ce paquet. |
| Consigne | Touche le paquet pour l'ouvrir. |
| Paquet ouvert | Tu offres ton cadeau à |
| Prénom tiré | `<prénom>` |
| Rappel | Garde le secret jusqu'au 25 décembre ! |
| Bouton | Retour à l'accueil |

### Page réservée (S6)

| Élément | Texte |
|---|---|
| Titre | Page réservée |
| Champ | Mot de passe d'administration |
| Bouton | Entrer |
| Mauvais mot de passe | Ce n'est pas le bon mot de passe. |
| Titre de la liste | Participants |
| État | Mot de passe choisi · Pas encore de mot de passe |
| Bouton | Effacer le mot de passe |
| Confirmation | Effacer le mot de passe de `<prénom>` ? |
| Explication | `<prénom>` en choisira un nouveau à sa prochaine visite. Son tirage ne change pas. |
| Boutons de confirmation | Effacer · Annuler |
| Effacé | Mot de passe de `<prénom>` effacé. |
| Rappel | Les tirages ne s'affichent jamais ici, pas même le tien. |

### Partout

| Élément | Texte |
|---|---|
| Site injoignable | Oups, le site ne répond pas. Vérifie ta connexion à internet, puis réessaie. |
| Bouton | Réessayer |

## États vides et cassés

- **Personne n'a encore validé de mot de passe** : le tirage n'existe pas encore ; rien ne
  le montre, l'accueil est le même (S7).
- **Quelqu'un a choisi le mauvais prénom à sa première visite** et un mot de passe à la
  place d'un autre : la vraie personne arrive sur « Redonner son mot de passe » (S3). Le
  message d'erreur l'envoie vers Yannick, qui efface le mot de passe (S6) ; elle en choisit
  un nouveau. Celui qui s'est trompé a vu le tirage d'un autre : le site ne peut pas
  l'empêcher, il le limite en accueillant par le prénom et en offrant « Ce n'est pas moi »
  avant tout enregistrement.
- **Mot de passe oublié** : S3 puis S6.
- **Yannick oublie son propre mot de passe de participant** : il l'efface depuis la page
  réservée, comme pour les autres.
- **Site injoignable ou réponse en échec** : l'écran en cours reste affiché avec « Oups, le
  site ne répond pas… » et « Réessayer », qui refait la dernière action ; rien n'est perdu
  de ce qui était tapé.
- **Après le 25 décembre** : le site marche toujours ; seuls la date et le compte à rebours
  disparaissent (S1).

## Décisions

Proposées par le product designer ; D3, D4, D5, D7, D8 et D13 validées par Yannick
le 22 novembre 2026, les autres à valider.

| N° | Point | Décision | Raison | Options écartées |
|---|---|---|---|---|
| D1 | Dire qui on est | Un gros bouton par prénom, sans rien taper | Le plus simple pour des personnes peu à l'aise avec un clavier ; sept prénoms tiennent sur un écran de téléphone | Taper son prénom : fautes de frappe, majuscules |
| D2 | Confirmer le prénom touché | Accueillir par « Bonjour <prénom> ! » avec « Ce n'est pas moi », sans écran de confirmation à part | Rattrape une erreur de bouton sans ajouter une étape à chaque visite | Un écran « Tu es bien <prénom> ? » : une étape de plus pour tous |
| D3 | Saisie du mot de passe | En clair, une seule fois, au moins 4 caractères | On voit ce qu'on tape, donc pas besoin de le taper deux fois ; aucune règle à comprendre | Champ masqué avec confirmation : deux saisies à l'aveugle |
| D4 | Reconnaissance du mot de passe | Sans tenir compte des majuscules, des accents ni des espaces au bout | Les téléphones mettent une majuscule au premier mot ; « Noël » ou « noel », c'est le même souvenir | Reconnaissance exacte : de faux oublis, donc des effacements par Yannick |
| D5 | Mémoriser la personne sur l'appareil | Non : chaque visite redemande le mot de passe | En famille, on se prête téléphones et tablettes ; un tirage ne doit pas s'afficher pour le suivant | Rester connecté : plus simple, mais le tirage visible sur un appareil prêté |
| D6 | Afficher le tirage | Un paquet à ouvrir d'une touche, à chaque visite | L'esprit jeu vidéo du cahier des charges, et une petite surprise ; une touche ne coûte rien | Le prénom affiché tout de suite : plus sec |
| D7 | Qui fait le tirage et quand | Le site, tout seul, à la première validation d'un mot de passe, une seule fois | Choix de Yannick : rien à faire ni à oublier avant d'envoyer le lien, et personne ne voit le tirage | Un bouton « Faire le tirage » sur la page réservée : une action de plus pour Yannick. Pouvoir le refaire : ceux qui ont déjà vu le leur se tromperaient de cadeau |
| D8 | Règles du tirage | Seulement celles du cahier des charges : personne ne se tire soi-même, chacun offre à un seul et reçoit d'un seul ; deux personnes peuvent s'offrir l'une à l'autre | Le cahier des charges n'en demande pas d'autre | Exclure les couples ou les paires réciproques : à ajouter si Yannick le demande |
| D9 | Essais ratés | Une minute d'attente après 5 essais ratés de suite | Freine celui qui devinerait le mot de passe d'un autre, sans bloquer longtemps une personne qui hésite | Aucune limite : quatre lettres se devinent. Blocage jusqu'à Yannick : trop lourd |
| D10 | Ton | Tutoiement, phrases courtes, quelques points d'exclamation | Un jeu en famille | Vouvoiement : distant |
| D11 | Ce que voit Yannick | L'état du mot de passe de chacun, jamais un tirage ni un mot de passe | Il participe : il doit pouvoir relancer et dépanner sans connaître de secret | Lui montrer les tirages : il connaîtrait celui des autres |
| D12 | Maquette | Les vrais prénoms, un tirage fictif marqué comme tel | On juge l'écran avec ses vrais boutons ; le tirage montré ne dit rien du vrai, qui n'existe pas encore | Des prénoms inventés : on juge moins bien l'accueil |
| D13 | Appareil visé | Mobile first : chaque écran conçu pour un téléphone en portrait ; tablette et ordinateur affichent la même colonne | Demande de Yannick : les participants seront sur leur téléphone | Un affichage propre à l'ordinateur : du travail pour un usage marginal |
