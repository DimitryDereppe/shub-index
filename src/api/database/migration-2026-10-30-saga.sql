-- =============================================================================
-- Migration du 2026-10-30 : ajout des sagas (collections TMDB)
-- À jouer UNE fois sur une base existante (init.sql ne sert qu'à une base neuve).
-- Idempotent : rejouable sans erreur grâce aux IF NOT EXISTS.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS saga (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  poster_url VARCHAR(512),
  tmdb_id    INT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE movie ADD COLUMN IF NOT EXISTS saga_id INT REFERENCES saga (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movie_saga_idx ON movie (saga_id);

COMMIT;
