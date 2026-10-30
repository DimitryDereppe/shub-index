// DataMapper : accès aux données des personnes (réalisateurs ET acteurs, RG3), aucune logique métier.
import pool, { type Queryable } from "./database-client.ts";
import { escapeLike } from "./sql-utils.ts";

export interface PersonRow {
  id: number;
  name: string;
}

const peopleDataMapper = {
  /**
   * Autocomplétion (US11) : personnes dont le nom contient `q` (sans tenir compte des accents).
   * @param role "director" ou "actor" pour ne garder que les réalisateurs ou les acteurs
   */
  async search(q: string, role: "director" | "actor" | undefined, limit: number): Promise<PersonRow[]> {
    // le nom de table vient d'une LISTE BLANCHE (jamais de la saisie) : seul morceau non paramétrable
    const roleFilter =
      role === "director"
        ? "AND EXISTS (SELECT 1 FROM movie_director md WHERE md.person_id = p.id)"
        : role === "actor"
          ? "AND EXISTS (SELECT 1 FROM movie_cast mc WHERE mc.person_id = p.id)"
          : "";

    const result = await pool.query(
      `SELECT p.id, p.name
       FROM person p
       WHERE unaccent(p.name) ILIKE unaccent($1) ${roleFilter}
       ORDER BY p.name
       LIMIT $2`,
      [`%${escapeLike(q)}%`, limit]
    );
    return result.rows;
  },

  async findById(id: number): Promise<PersonRow | null> {
    const result = await pool.query(`SELECT id, name FROM person WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  /**
   * Crée ou met à jour des personnes TMDB en une requête (UNNEST), et renvoie
   * la correspondance "id TMDB → id en base".
   * Attention : `people` ne doit pas contenir deux fois le même tmdbId (PostgreSQL refuse
   * de modifier deux fois la même ligne dans un seul ON CONFLICT) — dédoublonné par l'appelant.
   */
  async upsertFromTmdb(people: Array<{ tmdbId: number; name: string }>, db: Queryable = pool): Promise<Map<number, number>> {
    const idsByTmdbId = new Map<number, number>();
    if (people.length === 0) {
      return idsByTmdbId;
    }
    const result = await db.query(
      `INSERT INTO person (tmdb_id, name)
       SELECT * FROM UNNEST($1::int[], $2::varchar[])
       ON CONFLICT (tmdb_id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id, tmdb_id`,
      [people.map((person) => person.tmdbId), people.map((person) => person.name)]
    );
    for (const row of result.rows) {
      idsByTmdbId.set(row.tmdb_id, row.id);
    }
    return idsByTmdbId;
  },
};

export default peopleDataMapper;
