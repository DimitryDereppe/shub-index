// DataMapper : favoris d'un utilisateur (table favorite, association METTRE EN FAVORI), aucune logique métier.
import pool, { type Queryable } from "./database-client.ts";
import { SUMMARY_COLUMNS, type MovieSummary } from "./movies.datamapper.ts";

/** Nombre maximum de favoris par utilisateur (règle vérifiée par l'API, cf. me.controller.ts). */
export const MAX_FAVORITES = 10;

const favoritesDataMapper = {
  /** Favoris d'un utilisateur, du plus récent au plus ancien, au format vignette. */
  async findByUser(userId: number): Promise<Array<MovieSummary & { addedAt: Date }>> {
    const result = await pool.query(
      `SELECT ${SUMMARY_COLUMNS}, fav.added_at AS "addedAt"
       FROM favorite fav JOIN movie m ON m.id = fav.movie_id
       WHERE fav.user_id = $1
       ORDER BY fav.added_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async countByUser(userId: number, db: Queryable = pool): Promise<number> {
    const result = await db.query(`SELECT COUNT(*)::int AS total FROM favorite WHERE user_id = $1`, [userId]);
    return result.rows[0].total;
  },

  async exists(userId: number, movieId: number, db: Queryable = pool): Promise<boolean> {
    const result = await db.query(`SELECT 1 FROM favorite WHERE user_id = $1 AND movie_id = $2`, [userId, movieId]);
    return result.rowCount === 1;
  },

  /** Ajoute un favori ; ne fait rien s'il existe déjà (ON CONFLICT DO NOTHING). */
  async add(userId: number, movieId: number, db: Queryable = pool): Promise<void> {
    await db.query(
      `INSERT INTO favorite (user_id, movie_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, movieId]
    );
  },

  /** @returns false si ce film n'était pas en favori */
  async remove(userId: number, movieId: number): Promise<boolean> {
    const result = await pool.query(`DELETE FROM favorite WHERE user_id = $1 AND movie_id = $2`, [userId, movieId]);
    return result.rowCount === 1;
  },
};

export default favoritesDataMapper;
