-- =============================================================================
-- Migration du 2026-10-30 : espace personnel (historique + favoris)
-- À jouer UNE fois sur une base existante. Idempotent (IF NOT EXISTS).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS watch_history (
  user_id    INT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  movie_id   INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS favorite (
  user_id  INT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  movie_id INT NOT NULL REFERENCES movie (id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS watch_history_movie_idx ON watch_history (movie_id);
CREATE INDEX IF NOT EXISTS favorite_movie_idx      ON favorite (movie_id);

COMMIT;
