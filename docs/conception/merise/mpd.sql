-- =============================================================================
-- MPD (Modèle Physique de Données) — shub-index — PostgreSQL 16
-- -----------------------------------------------------------------------------
-- Traduction SQL du MLD (docs/conception/merise/03-mld.md), lui-même dérivé du
-- MCD (02-mcd.md). Copie exacte de ce fichier : src/api/database/init.sql
-- (exécuté au 1er démarrage du conteneur shub-db, ou par `npm run db:init`).
--
-- Les tables "user" et refresh_token reprennent la brique d'authentification
-- d'origine, sauf ON DELETE CASCADE ajouté sur refresh_token.user_id pour
-- permettre la suppression d'un compte (US43).
-- =============================================================================

BEGIN;

-- Suppression dans l'ordre inverse des dépendances (tables filles d'abord)
DROP TABLE IF EXISTS watch_history, favorite CASCADE;
DROP TABLE IF EXISTS movie_cast, movie_director, movie_has_genre, movie_studio CASCADE;
DROP TABLE IF EXISTS media_file, scan, movie, person, genre, saga, studio CASCADE;
DROP TABLE IF EXISTS refresh_token, "user" CASCADE;
DROP TYPE IF EXISTS role, media_file_status, scan_status;

-- unaccent() : retire les accents ("Amélie" → "Amelie") pour la recherche (US12).
-- Extension fournie avec PostgreSQL (contrib), à activer une fois par base.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- -----------------------------------------------------------------------------
-- Types énumérés : liste fermée de valeurs, vérifiée par PostgreSQL lui-même
-- -----------------------------------------------------------------------------
CREATE TYPE role AS ENUM ('member', 'admin'); -- 'author' (hérité d'oquiz) retiré
CREATE TYPE media_file_status AS ENUM ('pending', 'matched', 'unmatched', 'ignored');
CREATE TYPE scan_status AS ENUM ('running', 'success', 'failed');

-- -----------------------------------------------------------------------------
-- Authentification (inchangé par rapport à init.sql)
-- -----------------------------------------------------------------------------
CREATE TABLE "user" (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      VARCHAR(128) NOT NULL UNIQUE,
  firstname  VARCHAR(128) NOT NULL,
  lastname   VARCHAR(128) NOT NULL,
  password   VARCHAR(256) NOT NULL,              -- hash Argon2id, jamais en clair
  role       role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_token (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash VARCHAR(128) NOT NULL UNIQUE,        -- hex SHA-512 = 128 caractères
  consumed   BOOLEAN NOT NULL DEFAULT false,
  user_id    INT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- un seul refresh token valide (non consommé) à la fois par utilisateur
CREATE UNIQUE INDEX refresh_token_user_id_not_consumed
  ON refresh_token (user_id)
  WHERE consumed = false;

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
CREATE TABLE genre (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(64) NOT NULL UNIQUE,
  tmdb_id    INT UNIQUE,                          -- NULL si genre créé à la main
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saga = « collection » TMDB (Star Wars, Harry Potter…), ajoutée le 2026-10-30
CREATE TABLE saga (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,               -- pas UNIQUE : TMDB peut avoir deux collections homonymes
  poster_url VARCHAR(512),
  tmdb_id    INT UNIQUE,                          -- NULL si saga créée à la main
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Studio = société de production TMDB (Marvel Studios, Warner Bros.…), ajouté le 2026-10-30
CREATE TABLE studio (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,               -- pas UNIQUE : homonymes possibles chez TMDB
  tmdb_id    INT UNIQUE,                          -- NULL si studio créé à la main
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE movie (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title          VARCHAR(255) NOT NULL,
  original_title VARCHAR(255),
  release_year   SMALLINT CHECK (release_year BETWEEN 1888 AND 2100), -- 1888 : premier film connu
  runtime        SMALLINT CHECK (runtime > 0),       -- en minutes
  certification  VARCHAR(4) CHECK (certification IN ('TP', '10', '12', '16', '18')), -- classification FR (CNC), NULL si inconnue
  synopsis       TEXT,
  poster_url     VARCHAR(512),
  tmdb_id        INT UNIQUE,                         -- un film TMDB n'est importé qu'une fois
  -- Association APPARTENIR (0,1 côté film) → FK nullable ; supprimer la saga garde ses films
  saga_id        INT REFERENCES saga (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE person (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,               -- pas UNIQUE : deux homonymes possibles
  tmdb_id    INT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Association CLASSER (N-N) → table de liaison, clé primaire composée
CREATE TABLE movie_has_genre (
  movie_id INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  genre_id INT NOT NULL REFERENCES genre (id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

-- Association PRODUIRE (N-N) : un film a plusieurs studios, un studio plusieurs films
CREATE TABLE movie_studio (
  movie_id  INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  studio_id INT NOT NULL REFERENCES studio (id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, studio_id)
);

-- Association RÉALISER (N-N)
CREATE TABLE movie_director (
  movie_id  INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  person_id INT NOT NULL REFERENCES person (id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, person_id)
);

-- Association JOUER (N-N porteuse d'attributs)
CREATE TABLE movie_cast (
  movie_id       INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  person_id      INT NOT NULL REFERENCES person (id) ON DELETE CASCADE,
  character_name VARCHAR(255),                    -- plusieurs personnages : "A / B"
  cast_order     SMALLINT CHECK (cast_order >= 0), -- 0 = premier rôle
  PRIMARY KEY (movie_id, person_id)
);

-- -----------------------------------------------------------------------------
-- Indexation du partage réseau
-- -----------------------------------------------------------------------------
CREATE TABLE media_file (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,              -- relatif à la racine du partage
  filename     VARCHAR(255) NOT NULL,
  extension    VARCHAR(10) NOT NULL,
  size_bytes   BIGINT NOT NULL CHECK (size_bytes >= 0), -- BIGINT : un film 4K dépasse 2 Go (limite d'INT)
  modified_at  TIMESTAMPTZ NOT NULL,              -- date de modif. lue sur le NAS
  status       media_file_status NOT NULL DEFAULT 'pending',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- mis à jour à chaque scan qui voit le fichier
  movie_id     INT REFERENCES movie (id),         -- NULL tant que non identifié (RG1)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- cohérence : "identifié" <=> rattaché à un film
  CONSTRAINT media_file_matched_has_movie
    CHECK ((status = 'matched') = (movie_id IS NOT NULL))
);

CREATE TABLE scan (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        scan_status NOT NULL DEFAULT 'running',
  files_added   INT NOT NULL DEFAULT 0 CHECK (files_added >= 0),
  files_updated INT NOT NULL DEFAULT 0 CHECK (files_updated >= 0),
  files_removed INT NOT NULL DEFAULT 0 CHECK (files_removed >= 0),
  error_message TEXT,                             -- message court, jamais de stack trace
  user_id       INT REFERENCES "user" (id) ON DELETE SET NULL, -- NULL = tâche planifiée (RG6)
  -- cohérence : un scan en cours n'a pas de date de fin, un scan terminé en a une
  CONSTRAINT scan_finished_when_done
    CHECK ((status = 'running') = (finished_at IS NULL)),
  CONSTRAINT scan_dates_order
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

-- RG6 : une seule indexation en cours à la fois (même technique que refresh_token)
CREATE UNIQUE INDEX scan_only_one_running
  ON scan (status)
  WHERE status = 'running';

-- -----------------------------------------------------------------------------
-- Espace personnel (ajouté le 2026-10-30)
-- -----------------------------------------------------------------------------
-- Association REGARDER (N-N, attribut « regardé le ») : rempli au clic « Lire dans VLC ».
-- PK (user_id, movie_id) : revoir un film met sa date à jour au lieu d'ajouter une ligne.
CREATE TABLE watch_history (
  user_id    INT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  movie_id   INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movie_id)
);

-- Association METTRE EN FAVORI (N-N). Maximum 10 par utilisateur : vérifié par l'API
-- (un CHECK ne voit qu'une ligne à la fois, il ne peut pas compter les autres).
CREATE TABLE favorite (
  user_id  INT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  movie_id INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movie_id)
);

-- -----------------------------------------------------------------------------
-- Index de recherche
-- (PostgreSQL indexe déjà automatiquement les PRIMARY KEY et UNIQUE ; il
--  n'indexe PAS les clés étrangères : on ajoute celles qu'on interroge)
-- -----------------------------------------------------------------------------
CREATE INDEX movie_release_year_idx     ON movie (release_year);
CREATE INDEX movie_saga_idx             ON movie (saga_id);
CREATE INDEX movie_has_genre_genre_idx  ON movie_has_genre (genre_id);
CREATE INDEX movie_director_person_idx  ON movie_director (person_id);
CREATE INDEX movie_studio_studio_idx    ON movie_studio (studio_id);
CREATE INDEX movie_cast_person_idx      ON movie_cast (person_id);
CREATE INDEX media_file_movie_idx       ON media_file (movie_id);
CREATE INDEX media_file_status_idx      ON media_file (status);
CREATE INDEX watch_history_movie_idx    ON watch_history (movie_id);
CREATE INDEX favorite_movie_idx         ON favorite (movie_id);

COMMIT;
