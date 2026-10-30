# User stories — shub-index

> Format : **En tant que** [rôle], **je veux** [action] **afin de**
> [bénéfice]. Priorité **MoSCoW** : *Must* (v1 indispensable), *Should*
> (v1 si possible), *Could* (plus tard). Contexte et règles de gestion :
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/analyse-besoin/clarifications|clarifications]].

## Recherche (membre)

| # | En tant que | je veux | afin de | Priorité |
| --- | --- | --- | --- | --- |
| US01 | membre | rechercher un film par un mot de son titre (titre français **ou** original) | le retrouver sans connaître le nom exact du fichier | Must |
| US02 | membre | filtrer par **année** ou par **plage d'années** | trouver « un film de 1992 » ou « des films des années 80 » | Must |
| US03 | membre | filtrer par **réalisateur** (nom partiel, ex. « fincher ») | trouver les films d'un cinéaste | Must |
| US04 | membre | filtrer par **acteur / actrice** (ex. « weaver ») | trouver les films dans lesquels joue une personne | Must |
| US05 | membre | filtrer par un ou plusieurs **genres** | trouver « un film de SF/horreur » | Must |
| US06 | membre | **combiner** tous ces critères | répondre à « un film de SF de James Cameron sorti avant 1990 » | Must |
| US07 | membre | voir les résultats **paginés** et triés (titre, année) | parcourir un grand nombre de résultats | Must |
| US08 | membre | consulter la **fiche** d'un film (affiche, synopsis, durée, genres, réalisateurs, premiers rôles) | vérifier que c'est bien le film cherché | Must |
| US09 | membre | voir le(s) **chemin(s) du fichier** sur le NAS (et sa taille) | ouvrir le film depuis mon explorateur / lecteur | Must |
| US10 | membre | cliquer sur un réalisateur ou un acteur pour voir **sa fiche** et ses films présents dans le catalogue | rebondir d'un film à l'autre | Should |
| US11 | membre | avoir une **autocomplétion** sur les noms de personnes | ne pas devoir connaître l'orthographe exacte | Could |
| US12 | membre | rechercher sans me soucier des **accents** (« amelie » trouve « Amélie ») | ne pas rater un film à cause d'une saisie approximative | Could |
| US13 | membre **sur le réseau local** | cliquer sur « Lire dans VLC » sur la fiche d'un film | regarder le film tout de suite, sans chercher le fichier dans l'explorateur | Must |
| US14 | membre **hors réseau local** | ne pas voir le bouton « Lire dans VLC » | ne pas cliquer sur un lien qui ne peut pas fonctionner depuis Internet | Must |
| US15 | membre | voir la **classification** (TP, 12, 16…) d'un film et filtrer dessus | choisir un film adapté quand des enfants regardent | Should |

## Indexation (admin / tâche planifiée)

| # | En tant que | je veux | afin de | Priorité |
| --- | --- | --- | --- | --- |
| US20 | admin | **lancer une indexation** du partage | mettre le catalogue à jour après avoir ajouté des films | Must |
| US21 | tâche planifiée | lancer une indexation **sans intervention** (ex. chaque nuit) | garder le catalogue à jour automatiquement | Should |
| US22 | admin | que seuls les fichiers **nouveaux ou modifiés** soient réinterrogés auprès de TMDB | indexer vite et respecter le quota de l'API | Must |
| US23 | admin | que les fichiers **supprimés** du NAS disparaissent du catalogue | ne pas chercher un film qui n'existe plus | Must |
| US24 | admin | consulter l'**historique des indexations** (date, durée, statut, nombre d'ajouts/modifs/suppressions, erreur) | savoir si la dernière s'est bien passée | Should |
| US25 | admin | être empêché de lancer une indexation si une autre est **en cours** | éviter deux scans concurrents qui se marchent dessus | Must |
| US26 | admin | voir la liste des fichiers **non identifiés** | les corriger à la main | Must |
| US27 | admin | **associer** un fichier non identifié à un film en donnant son identifiant TMDB | compléter le catalogue quand le nom de fichier est ambigu | Must |
| US28 | admin | marquer un fichier comme **ignoré** (bonus, extrait…) | qu'il ne réapparaisse plus dans la liste à traiter | Should |
| US29 | admin | **corriger** à la main un champ d'un film (titre, année…) | rectifier une donnée TMDB erronée | Could |

## Comptes (brique auth déjà réalisée)

| # | En tant que | je veux | afin de | Priorité |
| --- | --- | --- | --- | --- |
| US39 | visiteur | créer un compte | accéder au catalogue | Must ✅ |
| US40 | visiteur | me connecter | accéder au catalogue (qui n'est pas visible sans compte) | Must ✅ |
| US41 | membre | me déconnecter | sécuriser mon accès sur un poste partagé | Must ✅ |
| US42 | admin | promouvoir un membre en admin | partager l'administration du catalogue | Could |
| US43 | admin | lister / supprimer les comptes | gérer qui a accès | Should |

✅ = déjà implémenté (cf. README, routes `/api/auth/*`).

## Critères d'acceptation (exemples)

- **US06** — *Étant donné* le catalogue contient *Alien³* (1992, Fincher,
  SF/horreur) et *Aliens* (1986, Cameron, SF/action/horreur), *quand* je
  cherche `director=cameron&genre=horreur`, *alors* seul *Aliens* est
  renvoyé.
- **US23** — *Étant donné* un fichier indexé, *quand* il est supprimé du
  NAS puis qu'une indexation se termine **avec succès**, *alors* il
  n'apparaît plus dans `GET /api/movies/:id` (si une indexation échoue en
  cours de route, **rien** n'est retiré).
- **US25** — *Étant donné* une indexation au statut `running`, *quand*
  j'appelle `POST /api/scans`, *alors* je reçois `409 Conflict`.
- **US13 / US14** — *Étant donné* que je suis connecté depuis
  `192.168.1.20`, *quand* j'ouvre la fiche d'*Alien 3*, *alors*
  `canPlay` vaut `true` et `GET /api/media-files/:id/playlist` renvoie un
  `.m3u` qui s'ouvre dans VLC. *Étant donné* que je suis connecté depuis
  Internet, *alors* `canPlay` vaut `false` et la même route renvoie
  `403`, **même si** j'ajoute moi-même un en-tête
  `X-Forwarded-For: 192.168.1.20`.
- **RG9** — *Étant donné* que le partage n'est pas monté (dossier vide),
  *quand* une indexation se lance, *alors* elle passe à `failed` et aucun
  film ne disparaît du catalogue.
