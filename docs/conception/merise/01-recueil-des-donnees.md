# Recueil des données — shub-index

> Étape 0 de Merise : lister **en vrac, en français**, toutes les
> informations que l'application doit mémoriser, à partir des
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/analyse-besoin/user-stories|user stories]].
> Pas encore de tables ni de types : on se demande seulement « qu'est-ce
> qu'on a besoin de retenir ? ».

## Le film (US01 → US09)

- le titre du film (en français)
- le titre original
- l'année de sortie
- la durée (en minutes)
- la classification française (TP, 10, 12, 16, 18 — déjà présente dans le
  nom du fichier, entre crochets)
- le résumé (synopsis)
- l'affiche (lien vers l'image)
- l'identifiant du film chez TMDB (pour ne pas le réinterroger, et
  retrouver un film déjà connu)

## Les personnes (US03, US04, US10)

- le nom de la personne
- l'identifiant de la personne chez TMDB (deux homonymes = deux personnes)
- les réalisateurs d'un film
- les acteurs d'un film
- le personnage joué par un acteur dans un film
- l'ordre d'apparition de l'acteur au générique (premiers rôles)

## Les genres (US05)

- le nom du genre (« Science-Fiction », « Horreur »…)
- l'identifiant du genre chez TMDB
- les genres d'un film

## Les fichiers vidéo (US09, US22, US23, US26 → US28)

- le chemin du fichier sur le partage (relatif à la racine du partage)
- le nom du fichier
- son extension (`mkv`, `mp4`, `avi`…)
- sa taille
- sa date de dernière modification (sert à détecter un fichier modifié)
- son statut d'identification (en attente / identifié / non identifié /
  ignoré)
- la date à laquelle il a été vu pour la dernière fois par une indexation
  (sert à détecter un fichier supprimé)
- le film auquel il correspond

## Les indexations (US20 → US25)

- la date et l'heure de début
- la date et l'heure de fin
- le statut (en cours / réussie / échouée)
- le nombre de fichiers ajoutés, modifiés, retirés
- le message d'erreur en cas d'échec
- l'utilisateur qui l'a lancée (aucun si c'est la tâche planifiée)

## Les utilisateurs et l'authentification (déjà en place)

- l'email, le prénom, le nom, le mot de passe (haché), le rôle
- les jetons de rafraîchissement : empreinte (hash), consommé ou non,
  date d'émission, date d'expiration, utilisateur propriétaire

## Ce qu'on ne stocke **pas** (et pourquoi)

| Donnée | Raison |
| --- | --- |
| le contenu des fichiers vidéo | l'app indexe, elle ne copie pas |
| l'adresse IP / le nom du NAS | variable d'environnement (dépôt public à terme) |
| la clé TMDB | secret → `.env` |
| les notes TMDB, budget, box-office… | non utilisées par la recherche — KISS, ajout possible plus tard |
| l'âge, la photo des personnes | idem |
| la résolution (1080p, 4K…) | absente des noms de fichiers du NAS ; la lire dans la vidéo demanderait un outil dédié (`ffprobe`) — évolution possible |
