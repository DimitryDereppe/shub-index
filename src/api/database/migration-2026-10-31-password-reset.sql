-- =============================================================================
-- Migration du 2026-10-31 : récupération du mot de passe par email
-- À jouer UNE fois sur une base existante. Idempotent (IF NOT EXISTS).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_token (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  user_id    INT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_token_one_pending
  ON password_reset_token (user_id)
  WHERE used_at IS NULL;

COMMIT;
