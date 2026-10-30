// DataMapper : accès aux données des refresh tokens, aucune logique métier.
// Dernier paramètre `db` : le pool par défaut, ou la connexion d'une transaction (cf. transaction.ts).
import pool, { type Queryable } from "./database-client.ts";

export interface RefreshTokenRow {
  id: number;
  consumed: boolean;
  user_id: number;
  issued_at: Date;
  expires_at: Date;
}

const refreshTokensDataMapper = {
  async findByHash(tokenHash: string, db: Queryable = pool): Promise<RefreshTokenRow | null> {
    const result = await db.query(
      `SELECT id, consumed, user_id, issued_at, expires_at FROM refresh_token WHERE token_hash = $1`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  },

  async create(userId: number, tokenHash: string, expiresAt: Date, db: Queryable = pool): Promise<void> {
    await db.query(
      `INSERT INTO refresh_token (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  },

  // consomme le token uniquement s'il ne l'était pas déjà (protège des requêtes de refresh concurrentes)
  async consume(id: number, db: Queryable = pool): Promise<boolean> {
    const result = await db.query(
      `UPDATE refresh_token SET consumed = true WHERE id = $1 AND consumed = false`,
      [id]
    );
    return result.rowCount === 1;
  },

  async revokeAllValidForUser(userId: number, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE refresh_token SET consumed = true WHERE user_id = $1 AND consumed = false`,
      [userId]
    );
  },

  async deleteConsumedExpiredForUser(userId: number, db: Queryable = pool): Promise<void> {
    await db.query(
      `DELETE FROM refresh_token WHERE user_id = $1 AND consumed = true AND expires_at < now()`,
      [userId]
    );
  },
};

export default refreshTokensDataMapper;
