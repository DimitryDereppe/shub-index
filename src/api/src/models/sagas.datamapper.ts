// DataMapper : accès aux données des sagas (collections TMDB), aucune logique métier.
import pool, { type Queryable } from "./database-client.ts";

const sagasDataMapper = {
  /**
   * Crée la saga si elle n'existe pas encore (ou met son nom/affiche à jour), puis renvoie son id.
   * Même principe que genresDataMapper.upsertFromTmdb, mais pour UNE seule saga.
   */
  async upsertFromTmdb(saga: { tmdbId: number; name: string; posterUrl: string | null }, db: Queryable = pool): Promise<number> {
    const result = await db.query(
      `INSERT INTO saga (tmdb_id, name, poster_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (tmdb_id) DO UPDATE SET name = EXCLUDED.name, poster_url = EXCLUDED.poster_url, updated_at = now()
       RETURNING id`,
      [saga.tmdbId, saga.name, saga.posterUrl]
    );
    return result.rows[0].id;
  },
};

export default sagasDataMapper;
