// DataMapper : accès aux données des genres, aucune logique métier.
import pool, { type Queryable } from "./database-client.ts";

export interface GenreWithCount {
  id: number;
  name: string;
  movieCount: number;
}

const genresDataMapper = {
  // GET /genres : liste pour les cases à cocher du filtre, avec le nombre de films de chaque genre
  async findAllWithCount(): Promise<GenreWithCount[]> {
    const result = await pool.query(
      `SELECT g.id, g.name, COUNT(mg.movie_id)::int AS "movieCount"
       FROM genre g
       LEFT JOIN movie_has_genre mg ON mg.genre_id = g.id
       GROUP BY g.id
       ORDER BY g.name`
    );
    return result.rows;
  },

  /**
   * Crée les genres manquants (ou met leur nom à jour) en UNE requête, puis renvoie leurs id.
   * UNNEST transforme deux tableaux ($1 = ids TMDB, $2 = noms) en lignes, comme un INSERT multiple.
   */
  async upsertFromTmdb(genres: Array<{ tmdbId: number; name: string }>, db: Queryable = pool): Promise<number[]> {
    if (genres.length === 0) {
      return [];
    }
    const result = await db.query(
      `INSERT INTO genre (tmdb_id, name)
       SELECT * FROM UNNEST($1::int[], $2::varchar[])
       ON CONFLICT (tmdb_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      [genres.map((genre) => genre.tmdbId), genres.map((genre) => genre.name)]
    );
    return result.rows.map((row) => row.id);
  },
};

export default genresDataMapper;
