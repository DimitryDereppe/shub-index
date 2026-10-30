// DataMapper : jetons de réinitialisation du mot de passe, aucune logique métier.
// On ne manipule que l'EMPREINTE (token_hash) du jeton, jamais le jeton lui-même.
import pool, { type Queryable } from "./database-client.ts";

export interface PasswordResetTokenRow {
  id: number;
  user_id: number;
  expires_at: Date;
  used_at: Date | null;
}

const passwordResetTokensDataMapper = {
  /**
   * Remplace le lien en attente de l'utilisateur par un nouveau : l'ancien lien cesse
   * de marcher (un seul lien utilisable à la fois, cf. index unique partiel).
   */
  async replaceForUser(userId: number, tokenHash: string, expiresAt: Date, db: Queryable = pool): Promise<void> {
    await db.query(`DELETE FROM password_reset_token WHERE user_id = $1 AND used_at IS NULL`, [userId]);
    await db.query(
      `INSERT INTO password_reset_token (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  },

  async findByHash(tokenHash: string, db: Queryable = pool): Promise<PasswordResetTokenRow | null> {
    const result = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_token WHERE token_hash = $1`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  },

  /**
   * Marque le lien comme utilisé, SEULEMENT s'il ne l'était pas déjà :
   * deux envois simultanés du même lien → un seul réussit (comme refresh_token.consume).
   */
  async markUsed(id: number, db: Queryable = pool): Promise<boolean> {
    const result = await db.query(
      `UPDATE password_reset_token SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
      [id]
    );
    return result.rowCount === 1;
  },
};

export default passwordResetTokensDataMapper;
