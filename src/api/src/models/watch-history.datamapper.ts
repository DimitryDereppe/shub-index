// DataMapper : historique de visionnage (table watch_history, association REGARDER), aucune logique métier.
import pool from "./database-client.ts";
import { SUMMARY_COLUMNS, type MovieSummary } from "./movies.datamapper.ts";

/** Nombre de films affichés dans l'historique. */
export const HISTORY_LIMIT = 10;

const watchHistoryDataMapper = {
  /**
   * Note un visionnage. Film déjà vu → seule sa date change (ON CONFLICT … DO UPDATE) :
   * l'historique liste ainsi des films différents, le plus récent en premier.
   */
  async record(userId: number, movieId: number): Promise<void> {
    await pool.query(
      `INSERT INTO watch_history (user_id, movie_id) VALUES ($1, $2)
       ON CONFLICT (user_id, movie_id) DO UPDATE SET watched_at = now()`,
      [userId, movieId]
    );
  },

  /** Les HISTORY_LIMIT derniers films regardés, au format vignette. */
  async findLatestByUser(userId: number): Promise<Array<MovieSummary & { watchedAt: Date }>> {
    const result = await pool.query(
      `SELECT ${SUMMARY_COLUMNS}, wh.watched_at AS "watchedAt"
       FROM watch_history wh JOIN movie m ON m.id = wh.movie_id
       WHERE wh.user_id = $1
       ORDER BY wh.watched_at DESC
       LIMIT $2`,
      [userId, HISTORY_LIMIT]
    );
    return result.rows;
  },

  /** @returns false si ce film n'était pas dans l'historique */
  async remove(userId: number, movieId: number): Promise<boolean> {
    const result = await pool.query(`DELETE FROM watch_history WHERE user_id = $1 AND movie_id = $2`, [userId, movieId]);
    return result.rowCount === 1;
  },

  async clear(userId: number): Promise<void> {
    await pool.query(`DELETE FROM watch_history WHERE user_id = $1`, [userId]);
  },
};

export default watchHistoryDataMapper;
