// DataMapper : accès aux données des studios (sociétés de production TMDB), aucune logique métier.
import pool, { type Queryable } from "./database-client.ts";

const studiosDataMapper = {
  /**
   * Crée les studios manquants (ou met leur nom à jour) en UNE requête, puis renvoie leurs id.
   * Même technique que genresDataMapper.upsertFromTmdb (UNNEST de deux tableaux).
   */
  async upsertFromTmdb(studios: Array<{ tmdbId: number; name: string }>, db: Queryable = pool): Promise<number[]> {
    if (studios.length === 0) {
      return [];
    }
    const result = await db.query(
      `INSERT INTO studio (tmdb_id, name)
       SELECT * FROM UNNEST($1::int[], $2::varchar[])
       ON CONFLICT (tmdb_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      [studios.map((studio) => studio.tmdbId), studios.map((studio) => studio.name)]
    );
    return result.rows.map((row) => row.id);
  },
};

export default studiosDataMapper;
