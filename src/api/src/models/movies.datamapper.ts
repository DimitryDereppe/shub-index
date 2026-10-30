/**
 * DataMapper : accès aux données des films, aucune logique métier.
 *
 * Les colonnes sont renommées en camelCase directement dans le SQL (AS "releaseYear")
 * pour coller aux formes de réponse de l'API (docs/conception/api-rest/endpoints.md).
 * Genres et réalisateurs sont agrégés en JSON par PostgreSQL (json_agg) : UNE requête
 * pour toute une page de résultats, pas une requête par film (pas de N+1).
 */
import pool, { type Queryable } from "./database-client.ts";
import { escapeLike } from "./sql-utils.ts";
import type { Certification } from "../services/filename-parser.ts";
import type { MovieImport } from "../services/tmdb.client.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MovieSummary {
  id: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  certification: Certification | null;
  posterUrl: string | null;
  genres: string[];
  directors: Array<{ id: number; name: string }>;
  saga: { id: number; name: string } | null;
  available: boolean; // au moins un fichier présent sur le NAS
}

export interface MovieDetailRow extends Omit<MovieSummary, "genres" | "available"> {
  runtime: number | null;
  synopsis: string | null;
  tmdbId: number | null;
  genres: Array<{ id: number; name: string }>;
  studios: Array<{ id: number; name: string }>;
  cast: Array<{ id: number; name: string; character: string | null; order: number }>;
  files: Array<{ id: number; path: string; sizeBytes: number }>;
}

/** Critères de GET /movies, déjà validés par Zod dans le controller. */
export interface MovieSearchCriteria {
  q?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  director?: string;
  actor?: string;
  genres: string[];
  sagaId?: number;
  certifications?: Certification[]; // classifications autorisées (déjà calculées depuis maxCertification)
  sort: MovieSort;
  page: number;
  limit: number;
}

// LISTE BLANCHE du tri (§ 7) : la clé vient de la requête, mais le SQL vient d'ici.
export const MOVIE_SORTS = {
  title: "m.title ASC, m.id ASC",
  "-title": "m.title DESC, m.id DESC",
  year: "m.release_year ASC NULLS LAST, m.title ASC",
  "-year": "m.release_year DESC NULLS LAST, m.title ASC",
} as const;
export type MovieSort = keyof typeof MOVIE_SORTS;

/** Champs modifiables à la main par un admin (US29) → nom de la colonne SQL. */
export const EDITABLE_COLUMNS = {
  title: "title",
  originalTitle: "original_title",
  releaseYear: "release_year",
  runtime: "runtime",
  synopsis: "synopsis",
  certification: "certification",
} as const;
export type MovieEditableFields = Partial<Record<keyof typeof EDITABLE_COLUMNS, string | number | null>>;

// ---------------------------------------------------------------------------
// Morceaux de SQL réutilisés (aucune donnée saisie dedans : uniquement du texte fixe)
// ---------------------------------------------------------------------------
// exporté : réutilisé par les favoris et l'historique (mêmes vignettes que la recherche)
export const SUMMARY_COLUMNS = `
  m.id, m.title, m.original_title AS "originalTitle", m.release_year AS "releaseYear",
  m.certification, m.poster_url AS "posterUrl",
  COALESCE((SELECT json_agg(g.name ORDER BY g.name)
            FROM movie_has_genre mg JOIN genre g ON g.id = mg.genre_id
            WHERE mg.movie_id = m.id), '[]') AS genres,
  COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
            FROM movie_director md JOIN person p ON p.id = md.person_id
            WHERE md.movie_id = m.id), '[]') AS directors,
  (SELECT json_build_object('id', s.id, 'name', s.name) FROM saga s WHERE s.id = m.saga_id) AS saga,
  EXISTS (SELECT 1 FROM media_file f WHERE f.movie_id = m.id) AS available`;

/**
 * Construit la clause WHERE de la recherche.
 * Chaque critère présent ajoute une condition ; chaque VALEUR saisie part dans `values`
 * et n'apparaît dans le SQL que sous forme de $1, $2… (jamais concaténée).
 */
function buildSearchWhere(criteria: MovieSearchCriteria): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // ajoute une valeur et renvoie son numéro de paramètre ("$3")
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (criteria.q) {
    const p = param(`%${escapeLike(criteria.q)}%`);
    // le titre, le titre original, le nom de la saga OU d'un studio :
    // « star wars » trouve toute la saga, « marvel » tous les films Marvel
    conditions.push(`(unaccent(m.title) ILIKE unaccent(${p}) OR unaccent(COALESCE(m.original_title, '')) ILIKE unaccent(${p})
                      OR EXISTS (SELECT 1 FROM saga s WHERE s.id = m.saga_id AND unaccent(s.name) ILIKE unaccent(${p}))
                      OR EXISTS (SELECT 1 FROM movie_studio ms JOIN studio st ON st.id = ms.studio_id
                                 WHERE ms.movie_id = m.id AND unaccent(st.name) ILIKE unaccent(${p})))`);
  }
  if (criteria.sagaId !== undefined) {
    conditions.push(`m.saga_id = ${param(criteria.sagaId)}`);
  }
  if (criteria.year !== undefined) {
    conditions.push(`m.release_year = ${param(criteria.year)}`);
  }
  if (criteria.yearFrom !== undefined) {
    conditions.push(`m.release_year >= ${param(criteria.yearFrom)}`);
  }
  if (criteria.yearTo !== undefined) {
    conditions.push(`m.release_year <= ${param(criteria.yearTo)}`);
  }
  if (criteria.director) {
    conditions.push(`EXISTS (SELECT 1 FROM movie_director md JOIN person p ON p.id = md.person_id
                             WHERE md.movie_id = m.id AND unaccent(p.name) ILIKE unaccent(${param(`%${escapeLike(criteria.director)}%`)}))`);
  }
  if (criteria.actor) {
    conditions.push(`EXISTS (SELECT 1 FROM movie_cast mc JOIN person p ON p.id = mc.person_id
                             WHERE mc.movie_id = m.id AND unaccent(p.name) ILIKE unaccent(${param(`%${escapeLike(criteria.actor)}%`)}))`);
  }
  // un EXISTS PAR genre : le film doit avoir TOUS les genres cités (US05/US06)
  for (const genre of criteria.genres) {
    conditions.push(`EXISTS (SELECT 1 FROM movie_has_genre mg JOIN genre g ON g.id = mg.genre_id
                             WHERE mg.movie_id = m.id AND lower(unaccent(g.name)) = lower(unaccent(${param(genre)})))`);
  }
  if (criteria.certifications) {
    // = ANY($n) : "la valeur est dans ce tableau" ; un film sans classification (NULL) est exclu
    conditions.push(`m.certification = ANY(${param(criteria.certifications)})`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------
const moviesDataMapper = {
  /** GET /movies : une page de résultats + le nombre total (pour la pagination). */
  async search(criteria: MovieSearchCriteria): Promise<{ rows: MovieSummary[]; total: number }> {
    const { where, values } = buildSearchWhere(criteria);

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM movie m ${where}`, values);

    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;
    const rowsResult = await pool.query(
      `SELECT ${SUMMARY_COLUMNS}
       FROM movie m
       ${where}
       ORDER BY ${MOVIE_SORTS[criteria.sort]}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      [...values, criteria.limit, (criteria.page - 1) * criteria.limit]
    );

    return { rows: rowsResult.rows, total: countResult.rows[0].total };
  },

  /** GET /movies/:id : fiche complète (genres, réalisateurs, casting, fichiers). */
  async findById(id: number): Promise<MovieDetailRow | null> {
    const result = await pool.query(
      `SELECT m.id, m.title, m.original_title AS "originalTitle", m.release_year AS "releaseYear",
              m.runtime, m.certification, m.synopsis, m.poster_url AS "posterUrl", m.tmdb_id AS "tmdbId",
              COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                        FROM movie_has_genre mg JOIN genre g ON g.id = mg.genre_id
                        WHERE mg.movie_id = m.id), '[]') AS genres,
              COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
                        FROM movie_director md JOIN person p ON p.id = md.person_id
                        WHERE md.movie_id = m.id), '[]') AS directors,
              (SELECT json_build_object('id', s.id, 'name', s.name) FROM saga s WHERE s.id = m.saga_id) AS saga,
              COALESCE((SELECT json_agg(json_build_object('id', st.id, 'name', st.name) ORDER BY st.name)
                        FROM movie_studio ms JOIN studio st ON st.id = ms.studio_id
                        WHERE ms.movie_id = m.id), '[]') AS studios,
              COALESCE((SELECT json_agg(json_build_object('id', p.id, 'name', p.name,
                                                          'character', mc.character_name, 'order', mc.cast_order)
                                        ORDER BY mc.cast_order)
                        FROM movie_cast mc JOIN person p ON p.id = mc.person_id
                        WHERE mc.movie_id = m.id), '[]') AS cast,
              COALESCE((SELECT json_agg(json_build_object('id', f.id, 'path', f.path, 'sizeBytes', f.size_bytes)
                                        ORDER BY f.path)
                        FROM media_file f
                        WHERE f.movie_id = m.id), '[]') AS files
       FROM movie m
       WHERE m.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  /** Films réalisés par une personne (fiche personne, US10). */
  async findDirectedBy(personId: number): Promise<MovieSummary[]> {
    const result = await pool.query(
      `SELECT ${SUMMARY_COLUMNS}
       FROM movie m JOIN movie_director md ON md.movie_id = m.id
       WHERE md.person_id = $1
       ORDER BY m.release_year NULLS LAST, m.title`,
      [personId]
    );
    return result.rows;
  },

  /** Films dans lesquels joue une personne, avec le personnage (fiche personne, US10). */
  async findPlayedBy(personId: number): Promise<Array<MovieSummary & { character: string | null }>> {
    const result = await pool.query(
      `SELECT ${SUMMARY_COLUMNS}, mc.character_name AS character
       FROM movie m JOIN movie_cast mc ON mc.movie_id = m.id
       WHERE mc.person_id = $1
       ORDER BY m.release_year NULLS LAST, m.title`,
      [personId]
    );
    return result.rows;
  },

  async findIdByTmdbId(tmdbId: number, db: Queryable = pool): Promise<number | null> {
    const result = await db.query(`SELECT id FROM movie WHERE tmdb_id = $1`, [tmdbId]);
    return result.rows[0]?.id ?? null;
  },

  /**
   * Crée le film (sans ses liens) et renvoie son id.
   * @param sagaId id de la saga en base (déjà créée), ou null
   */
  async create(movie: MovieImport, sagaId: number | null, db: Queryable = pool): Promise<number> {
    const result = await db.query(
      `INSERT INTO movie (tmdb_id, title, original_title, release_year, runtime, certification, synopsis, poster_url, saga_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [movie.tmdbId, movie.title, movie.originalTitle, movie.releaseYear, movie.runtime,
        movie.certification, movie.synopsis, movie.posterUrl, sagaId]
    );
    return result.rows[0].id;
  },

  /**
   * Films déjà importés depuis TMDB (pour le script de rattrapage).
   * editedByAdmin : l'import écrit created_at = updated_at ; seul un PATCH admin (US29) les sépare.
   */
  async findAllWithTmdbId(): Promise<
    Array<{ id: number; tmdbId: number; title: string; certification: Certification | null; editedByAdmin: boolean }>
  > {
    const result = await pool.query(
      `SELECT id, tmdb_id AS "tmdbId", title, certification, updated_at > created_at AS "editedByAdmin"
       FROM movie WHERE tmdb_id IS NOT NULL ORDER BY title`
    );
    return result.rows;
  },

  /**
   * Rattrapage : met à jour la classification et la saga d'un film déjà en base.
   * updated_at n'est volontairement PAS touché : il sert à repérer les corrections admin (cf. ci-dessus).
   */
  async updateCertificationAndSaga(id: number, certification: Certification | null, sagaId: number | null, db: Queryable = pool): Promise<void> {
    await db.query(
      `UPDATE movie SET certification = $1, saga_id = $2 WHERE id = $3`,
      [certification, sagaId, id]
    );
  },

  /** Relie un film à ses genres (table de liaison movie_has_genre). */
  async addGenres(movieId: number, genreIds: number[], db: Queryable = pool): Promise<void> {
    await db.query(
      `INSERT INTO movie_has_genre (movie_id, genre_id)
       SELECT $1, UNNEST($2::int[])
       ON CONFLICT DO NOTHING`,
      [movieId, genreIds]
    );
  },

  /** Relie un film à ses studios (table de liaison movie_studio). */
  async addStudios(movieId: number, studioIds: number[], db: Queryable = pool): Promise<void> {
    await db.query(
      `INSERT INTO movie_studio (movie_id, studio_id)
       SELECT $1, UNNEST($2::int[])
       ON CONFLICT DO NOTHING`,
      [movieId, studioIds]
    );
  },

  async addDirectors(movieId: number, personIds: number[], db: Queryable = pool): Promise<void> {
    await db.query(
      `INSERT INTO movie_director (movie_id, person_id)
       SELECT $1, UNNEST($2::int[])
       ON CONFLICT DO NOTHING`,
      [movieId, personIds]
    );
  },

  async addCast(
    movieId: number,
    cast: Array<{ personId: number; character: string | null; order: number }>,
    db: Queryable = pool
  ): Promise<void> {
    if (cast.length === 0) {
      return;
    }
    await db.query(
      `INSERT INTO movie_cast (movie_id, person_id, character_name, cast_order)
       SELECT $1, * FROM UNNEST($2::int[], $3::varchar[], $4::smallint[])
       ON CONFLICT DO NOTHING`,
      [movieId, cast.map((c) => c.personId), cast.map((c) => c.character), cast.map((c) => c.order)]
    );
  },

  /**
   * PATCH /movies/:id : met à jour uniquement les champs fournis.
   * Les NOMS de colonnes viennent de EDITABLE_COLUMNS (liste blanche), les valeurs de $n.
   * @returns false si le film n'existe pas
   */
  async update(id: number, fields: MovieEditableFields): Promise<boolean> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(EDITABLE_COLUMNS)) {
      if (key in fields) {
        values.push(fields[key as keyof MovieEditableFields]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE movie SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`,
      values
    );
    return result.rowCount === 1;
  },
};

export default moviesDataMapper;
