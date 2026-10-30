-- =============================================================================
-- Migration du 2026-10-30 : studios (sociétés de production TMDB)
-- À jouer UNE fois sur une base existante. Idempotent (IF NOT EXISTS).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS studio (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  tmdb_id    INT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movie_studio (
  movie_id  INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  studio_id INT NOT NULL REFERENCES studio (id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, studio_id)
);

CREATE INDEX IF NOT EXISTS movie_studio_studio_idx ON movie_studio (studio_id);

COMMIT;
