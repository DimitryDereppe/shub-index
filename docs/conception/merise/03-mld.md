# MLD — Modèle Logique de Données

> Dérivé du [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/02-mcd|MCD]]
> par les règles de passage. Notation : **PK** clé primaire, **FK** clé
> étrangère (`#`). Noms de tables et colonnes en anglais, `snake_case`,
> au singulier — comme `user` et `refresh_token` déjà en place.

## Règles de passage appliquées

| Cas dans le MCD | Règle | Ici |
| --- | --- | --- |
| Entité | → une table, l'identifiant devient la PK | FILM → `movie`, PERSONNE → `person`… |
| Association **0,1 / 1,1 — 0,N** (« 1-N ») | → la PK du côté **N** migre en FK du côté **1** | CORRESPONDRE → `media_file.movie_id` ; APPARTENIR → `movie.saga_id` ; LANCER → `scan.user_id` ; POSSÉDER → `refresh_token.user_id` ; DEMANDER → `password_reset_token.user_id` |
| … avec **0,1** (optionnel) | → FK **nullable** | `media_file.movie_id`, `movie.saga_id`, `scan.user_id` |
| … avec **1,1** (obligatoire) | → FK **NOT NULL** | `refresh_token.user_id` |
| Association **0,N — 0,N** (« N-N ») | → table de liaison, PK = couple des deux FK | CLASSER → `movie_has_genre` ; PRODUIRE → `movie_studio` ; RÉALISER → `movie_director` ; JOUER → `movie_cast` ; REGARDER → `watch_history` ; METTRE EN FAVORI → `favorite` |
| Attributs d'une association N-N | → colonnes de la table de liaison | `movie_cast.character_name`, `cast_order` ; `watch_history.watched_at` ; `favorite.added_at` |

## Tables

```text
user            (id PK, email, firstname, lastname, password, role, created_at, updated_at)
refresh_token   (id PK, token_hash, consumed, issued_at, expires_at, #user_id → user.id)
password_reset_token (id PK, token_hash, created_at, expires_at, used_at, #user_id → user.id)

genre           (id PK, name, tmdb_id, created_at, updated_at)
saga            (id PK, name, poster_url, tmdb_id, created_at, updated_at)
studio          (id PK, name, tmdb_id, created_at, updated_at)
movie           (id PK, title, original_title, release_year, runtime, certification, synopsis, poster_url, tmdb_id,
                 #saga_id → saga.id (nullable), created_at, updated_at)
person          (id PK, name, tmdb_id, created_at, updated_at)

movie_has_genre (#movie_id → movie.id, #genre_id → genre.id)          PK (movie_id, genre_id)
movie_studio    (#movie_id → movie.id, #studio_id → studio.id)        PK (movie_id, studio_id)
movie_director  (#movie_id → movie.id, #person_id → person.id)        PK (movie_id, person_id)
movie_cast      (#movie_id → movie.id, #person_id → person.id,
                 character_name, cast_order)                          PK (movie_id, person_id)

media_file      (id PK, path, filename, extension, size_bytes, modified_at,
                 status, last_seen_at, #movie_id → movie.id (nullable), created_at, updated_at)
scan            (id PK, started_at, finished_at, status, files_added, files_updated,
                 files_removed, error_message, #user_id → user.id (nullable))

watch_history   (#user_id → user.id, #movie_id → movie.id, watched_at)    PK (user_id, movie_id)
favorite        (#user_id → user.id, #movie_id → movie.id, added_at)      PK (user_id, movie_id)
```

## Correspondance MCD → MLD

| MCD | MLD |
| --- | --- |
| FILM (titre, titre original, année de sortie, durée, classification, synopsis, affiche, identifiant TMDB) | `movie` (title, original_title, release_year, runtime, certification, synopsis, poster_url, tmdb_id) |
| PERSONNE | `person` |
| GENRE | `genre` |
| SAGA (nom, affiche, identifiant TMDB) | `saga` (name, poster_url, tmdb_id) |
| STUDIO (nom, identifiant TMDB) | `studio` (name, tmdb_id) |
| FICHIER (chemin, nom, extension, taille, date de modif., statut, vu le) | `media_file` (path, filename, extension, size_bytes, modified_at, status, last_seen_at) |
| INDEXATION (début, fin, statut, ajoutés, modifiés, retirés, erreur) | `scan` (started_at, finished_at, status, files_added, files_updated, files_removed, error_message) |
| UTILISATEUR | `user` (déjà existant) |
| JETON DE RAFRAÎCHISSEMENT | `refresh_token` (déjà existant) |

> `media_file` plutôt que `file` : plus explicite, et prépare l'arrivée
> d'autres médias (le fichier pourra un jour pointer vers un épisode).

## Remarque : `movie_cast` et l'acteur aux plusieurs personnages

La PK `(movie_id, person_id)` interdit de lier deux fois la même personne
au même film. Pour Peter Sellers dans *Docteur Folamour* (3 rôles), on
stocke `character_name = 'Mandrake / Muffley / Folamour'` — c'est ce que
TMDB renvoie déjà. KISS : pas besoin d'une table PERSONNAGE.
