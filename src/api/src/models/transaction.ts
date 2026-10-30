/**
 * Exécute une série de requêtes dans une transaction SQL (BEGIN/COMMIT/ROLLBACK).
 *
 * Une transaction doit passer par UNE seule connexion : on en emprunte une au
 * pool, on la donne à `run` (paramètre `tx`), puis on la rend au pool.
 * Chaque DataMapper appelé dans `run` reçoit `tx` en dernier argument.
 *
 * @example
 * await withTransaction(async (tx) => {
 *   await refreshTokensDataMapper.revokeAllValidForUser(userId, tx);
 *   await refreshTokensDataMapper.create(userId, hash, expiresAt, tx);
 * });
 */
import type pg from "pg";
import pool from "./database-client.ts";

export async function withTransaction<T>(run: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const result = await run(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release(); // toujours rendre la connexion, même en cas d'erreur
  }
}
