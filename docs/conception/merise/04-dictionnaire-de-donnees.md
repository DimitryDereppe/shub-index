# Dictionnaire de données — shub-index

> SGBD : **PostgreSQL 16**. Détaille chaque colonne du
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/03-mld|MLD]] :
> type, contraintes, exemple. Traduction SQL :
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/05-mpd|MPD]].

## Conventions communes

- `GENERATED` = `INT GENERATED ALWAYS AS IDENTITY` (norme SQL ; `ALWAYS`
  empêche d'insérer un id à la main par erreur).
- `created_at` / `updated_at` : `TIMESTAMPTZ NOT NULL DEFAULT now()` sur
  toutes les tables d'entités (pas sur les tables de liaison).
- `TIMESTAMPTZ` (avec fuseau) plutôt que `TIMESTAMP` : le NAS, le
  conteneur et le navigateur peuvent ne pas être dans le même fuseau.
- `tmdb_id` : `INT UNIQUE`, **nullable** (une donnée peut être créée à la
  main). `UNIQUE` accepte plusieurs `NULL` en PostgreSQL.

## Table `user` *(existante)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 1 | identifiant |
| `email` | VARCHAR(128) | ✅ | ✅ | – | – | `"moi@exemple.fr"` | identifiant de connexion |
| `firstname` | VARCHAR(128) | ❌ | ✅ | – | – | `"Dimitry"` | prénom |
| `lastname` | VARCHAR(128) | ❌ | ✅ | – | – | `"D."` | nom |
| `password` | VARCHAR(256) | ❌ | ✅ | – | – | `"$argon2id$v=19$..."` | hash Argon2id, jamais renvoyé par l'API |
| `role` | ENUM `role` | ❌ | ✅ | – | `'member'` | `'admin'` | `member` / `admin` (`author`, hérité d'oquiz, retiré le 2026-10-27) |

## Table `refresh_token` *(existante)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 12 | identifiant |
| `token_hash` | VARCHAR(128) | ✅ | ✅ | – | – | `"9f86d0…"` | SHA-512 hex du jeton (jamais le jeton en clair) |
| `consumed` | BOOLEAN | ❌ | ✅ | – | `false` | `true` | déjà utilisé pour une rotation |
| `user_id` | INT | ❌ | ✅ | `user(id)` **CASCADE** | – | 1 | propriétaire |
| `issued_at` | TIMESTAMPTZ | ❌ | ✅ | – | `now()` | – | émission |
| `expires_at` | TIMESTAMPTZ | ❌ | ✅ | – | – | – | expiration (1 semaine) |

Contrainte : index unique partiel — un seul jeton non consommé par
utilisateur.

## Table `genre`

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 3 | identifiant |
| `name` | VARCHAR(64) | ✅ | ✅ | – | – | `"Science-Fiction"` | libellé (en français, tel que fourni par TMDB `language=fr-FR`) |
| `tmdb_id` | INT | ✅ | ❌ | – | – | 878 | id du genre chez TMDB |

## Table `saga` *(ajoutée le 2026-10-30)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 4 | identifiant |
| `name` | VARCHAR(255) | ❌ | ✅ | – | – | `"Alien - Saga"` | nom de la collection TMDB (`language=fr-FR`) ; pas unique : homonymes possibles |
| `poster_url` | VARCHAR(512) | ❌ | ❌ | – | – | `"https://image.tmdb.org/t/p/w342/….jpg"` | affiche de la collection, hébergée par TMDB |
| `tmdb_id` | INT | ✅ | ❌ | – | – | 8091 | id de la collection chez TMDB |

## Table `studio` *(ajoutée le 2026-10-30)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 6 | identifiant |
| `name` | VARCHAR(255) | ❌ | ✅ | – | – | `"Marvel Studios"` | société de production (TMDB `production_companies`) |
| `tmdb_id` | INT | ✅ | ❌ | – | – | 420 | id du studio chez TMDB |

## Table `movie`

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 42 | identifiant |
| `title` | VARCHAR(255) | ❌ | ✅ | – | – | `"Alien³"` | titre français (pas unique : remakes) |
| `original_title` | VARCHAR(255) | ❌ | ❌ | – | – | `"Alien 3"` | titre en VO, cherché aussi par US01 |
| `release_year` | SMALLINT | ❌ | ❌ | – | – | 1992 | `CHECK` entre 1888 et 2100 |
| `runtime` | SMALLINT | ❌ | ❌ | – | – | 114 | durée en minutes, `CHECK > 0` |
| `certification` | VARCHAR(4) | ❌ | ❌ | – | – | `'16'` | classification FR (visa CNC) : `CHECK IN ('TP','10','12','16','18')`, `NULL` si inconnue (`[]` dans le nom de fichier) |
| `synopsis` | TEXT | ❌ | ❌ | – | – | `"Ripley s'écrase…"` | résumé (longueur libre) |
| `poster_url` | VARCHAR(512) | ❌ | ❌ | – | – | `"https://image.tmdb.org/t/p/w342/….jpg"` | affiche hébergée par TMDB (pas d'image stockée chez nous — éco-conception) |
| `tmdb_id` | INT | ✅ | ❌ | – | – | 8077 | évite d'importer deux fois le même film |
| `saga_id` | INT | ❌ | ❌ | `saga(id)` SET NULL | – | 4 | saga du film (APPARTENIR) ; `NULL` = aucune saga. Supprimer la saga garde ses films |

## Table `person`

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 7 | identifiant |
| `name` | VARCHAR(255) | ❌ | ✅ | – | – | `"Sigourney Weaver"` | nom affiché (pas unique : homonymes) |
| `tmdb_id` | INT | ✅ | ❌ | – | – | 10205 | distingue deux homonymes |

## Table `movie_has_genre` (CLASSER)

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `movie_id` | INT | PK* | ✅ | `movie(id)` CASCADE | – | 42 | film |
| `genre_id` | INT | PK* | ✅ | `genre(id)` CASCADE | – | 3 | genre |

\* clé primaire composée `(movie_id, genre_id)` : un genre n'est lié
qu'une fois à un film.

## Table `movie_studio` (PRODUIRE) *(2026-10-30)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `movie_id` | INT | PK* | ✅ | `movie(id)` CASCADE | – | 42 | film |
| `studio_id` | INT | PK* | ✅ | `studio(id)` CASCADE | – | 6 | studio |

## Table `movie_director` (RÉALISER)

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `movie_id` | INT | PK* | ✅ | `movie(id)` CASCADE | – | 42 | film |
| `person_id` | INT | PK* | ✅ | `person(id)` CASCADE | – | 5 | réalisateur·rice |

## Table `movie_cast` (JOUER)

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `movie_id` | INT | PK* | ✅ | `movie(id)` CASCADE | – | 42 | film |
| `person_id` | INT | PK* | ✅ | `person(id)` CASCADE | – | 7 | acteur·rice |
| `character_name` | VARCHAR(255) | ❌ | ❌ | – | – | `"Ellen Ripley"` | personnage(s) joué(s) |
| `cast_order` | SMALLINT | ❌ | ❌ | – | – | 0 | rang au générique (0 = premier rôle), `CHECK >= 0` |

On n'importe que les **N premiers rôles** (ex. 15, variable d'env.) :
inutile de stocker 80 figurants par film.

## Table `watch_history` (REGARDER) *(2026-10-30)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `user_id` | INT | PK* | ✅ | `user(id)` CASCADE | – | 2 | qui a regardé |
| `movie_id` | INT | PK* | ✅ | `movie(id)` CASCADE | – | 42 | film regardé |
| `watched_at` | TIMESTAMPTZ | ❌ | ✅ | – | `now()` | – | dernier clic « Lire dans VLC » ; revoir le film met cette date à jour |

\* clé primaire `(user_id, movie_id)` : une ligne par film, l'historique
affiche les 10 plus récentes (`ORDER BY watched_at DESC LIMIT 10`).

## Table `favorite` (METTRE EN FAVORI) *(2026-10-30)*

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `user_id` | INT | PK* | ✅ | `user(id)` CASCADE | – | 2 | propriétaire |
| `movie_id` | INT | PK* | ✅ | `movie(id)` CASCADE | – | 42 | film favori |
| `added_at` | TIMESTAMPTZ | ❌ | ✅ | – | `now()` | – | ordre d'affichage |

Règle : **10 favoris maximum** par utilisateur, vérifiée par l'API
(`409` au 11ᵉ) — un `CHECK` ne voit qu'une ligne, il ne peut pas compter.

## Table `media_file` (FICHIER)

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 101 | identifiant |
| `path` | TEXT | ✅ | ✅ | – | – | `"Films/Alien (Quadrilogie)/Alien 3 (1992) [16] - David Fincher.mkv"` | chemin **relatif** à la racine du partage (le préfixe `\\NAS\…` vient de `.env`) |
| `filename` | VARCHAR(255) | ❌ | ✅ | – | – | `"Alien 3 (1992) [16] - David Fincher.mkv"` | nom seul, sert à l'analyse par regex |
| `extension` | VARCHAR(10) | ❌ | ✅ | – | – | `"mkv"` | en minuscules, sans le point |
| `size_bytes` | BIGINT | ❌ | ✅ | – | – | 8 547 123 456 | `BIGINT` car un `INT` s'arrête à ~2,1 Go |
| `modified_at` | TIMESTAMPTZ | ❌ | ✅ | – | – | – | date de modif. sur le NAS ; avec `size_bytes`, détecte un fichier remplacé |
| `status` | ENUM `media_file_status` | ❌ | ✅ | – | `'pending'` | `'matched'` | `pending` (à traiter) / `matched` (identifié) / `unmatched` (échec auto) / `ignored` (écarté par l'admin) |
| `last_seen_at` | TIMESTAMPTZ | ❌ | ✅ | – | `now()` | – | dernière indexation qui a vu le fichier (détection des suppressions) |
| `movie_id` | INT | ❌ | ❌ | `movie(id)` | – | 42 | film correspondant |

Contrainte `CHECK` : `status = 'matched'` ⇔ `movie_id IS NOT NULL`.

## Table `scan` (INDEXATION)

| Champ | Type | Unique | Not null | Référence | Défaut | Exemple | Explication |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | GENERATED | ✅ | ✅ | – | – | 17 | identifiant |
| `started_at` | TIMESTAMPTZ | ❌ | ✅ | – | `now()` | – | début |
| `finished_at` | TIMESTAMPTZ | ❌ | ❌ | – | – | – | fin, `NULL` tant que `running` |
| `status` | ENUM `scan_status` | ❌ | ✅ | – | `'running'` | `'success'` | `running` / `success` / `failed` |
| `files_added` | INT | ❌ | ✅ | – | 0 | 12 | nouveaux fichiers |
| `files_updated` | INT | ❌ | ✅ | – | 0 | 1 | fichiers modifiés (taille ou date changée) |
| `files_removed` | INT | ❌ | ✅ | – | 0 | 3 | fichiers disparus du NAS |
| `error_message` | TEXT | ❌ | ❌ | – | – | `"Partage non monté"` | message court lisible, **jamais** de stack trace (§ 13) |
| `user_id` | INT | ❌ | ❌ | `user(id)` SET NULL | – | 1 | qui l'a lancé ; `NULL` = tâche planifiée |

Contraintes : `status = 'running'` ⇔ `finished_at IS NULL` ;
`finished_at >= started_at` ; index unique partiel « un seul `running` ».
