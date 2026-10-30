// DataMapper : accès aux données des fichiers vidéo du partage, aucune logique métier.
import pool from "./database-client.ts";

export type MediaFileStatus = "pending" | "matched" | "unmatched" | "ignored";

/** Ce que l'indexation a besoin de savoir d'un fichier déjà connu. */
export interface KnownMediaFile {
  id: number;
  path: string;
  sizeBytes: number;
  modifiedAt: Date;
  status: MediaFileStatus;
}

/** Fichier tel que renvoyé par l'API (liste admin, US26). */
export interface MediaFileRow {
  id: number;
  path: string;
  filename: string;
  sizeBytes: number;
  status: MediaFileStatus;
  movieId: number | null;
  lastSeenAt: Date;
}

/** Fichier lu sur le disque par l'indexation. */
export interface FileOnDisk {
  path: string; // relatif à la racine du partage, séparateur "/"
  filename: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: Date;
}

const ROW_COLUMNS = `id, path, filename, size_bytes AS "sizeBytes", status, movie_id AS "movieId", last_seen_at AS "lastSeenAt"`;

const mediaFilesDataMapper = {
  /** Tous les fichiers connus, en une requête (l'indexation les range dans une Map par chemin). */
  async findAllKnown(): Promise<KnownMediaFile[]> {
    const result = await pool.query(
      `SELECT id, path, size_bytes AS "sizeBytes", modified_at AS "modifiedAt", status FROM media_file`
    );
    return result.rows;
  },

  async findById(id: number): Promise<MediaFileRow | null> {
    const result = await pool.query(`SELECT ${ROW_COLUMNS} FROM media_file WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  },

  /** Fichier + titre/année de son film (pour la playlist VLC). */
  async findWithMovie(id: number): Promise<{ path: string; movieId: number | null; title: string | null; releaseYear: number | null } | null> {
    const result = await pool.query(
      `SELECT f.path, f.movie_id AS "movieId", m.title, m.release_year AS "releaseYear"
       FROM media_file f LEFT JOIN movie m ON m.id = f.movie_id
       WHERE f.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  /** GET /media-files : liste paginée, filtrable par statut (US26). */
  async findPage(status: MediaFileStatus | undefined, page: number, limit: number): Promise<{ rows: MediaFileRow[]; total: number }> {
    // $1 IS NULL OR status = $1 : un seul SQL, que le filtre soit présent ou non
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM media_file WHERE ($1::media_file_status IS NULL OR status = $1)`,
      [status ?? null]
    );
    const rowsResult = await pool.query(
      `SELECT ${ROW_COLUMNS} FROM media_file
       WHERE ($1::media_file_status IS NULL OR status = $1)
       ORDER BY path
       LIMIT $2 OFFSET $3`,
      [status ?? null, limit, (page - 1) * limit]
    );
    return { rows: rowsResult.rows, total: countResult.rows[0].total };
  },

  /** Nouveau fichier vu par l'indexation (statut "pending" en attendant l'identification). */
  async create(file: FileOnDisk): Promise<number> {
    const result = await pool.query(
      `INSERT INTO media_file (path, filename, extension, size_bytes, modified_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [file.path, file.filename, file.extension, file.sizeBytes, file.modifiedAt]
    );
    return result.rows[0].id;
  },

  /**
   * Fichier modifié (taille ou date) : nouvelles infos, et retour à "pending" pour
   * être ré-identifié — sauf s'il était "ignored" (l'admin a déjà tranché).
   */
  async updateChanged(id: number, file: FileOnDisk): Promise<void> {
    await pool.query(
      `UPDATE media_file
       SET size_bytes = $1, modified_at = $2, last_seen_at = now(), updated_at = now(),
           status = CASE WHEN status = 'ignored' THEN status ELSE 'pending' END,
           movie_id = NULL
       WHERE id = $3`,
      [file.sizeBytes, file.modifiedAt, id]
    );
  },

  /** Fichiers inchangés : on note seulement qu'ils ont été vus pendant cette indexation. */
  async markSeen(ids: number[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await pool.query(`UPDATE media_file SET last_seen_at = now() WHERE id = ANY($1::int[])`, [ids]);
  },

  /** Identifié : relié à un film (la contrainte SQL exige matched ⇔ movie_id non NULL). */
  async setMatched(id: number, movieId: number): Promise<boolean> {
    const result = await pool.query(
      `UPDATE media_file SET status = 'matched', movie_id = $1, updated_at = now() WHERE id = $2`,
      [movieId, id]
    );
    return result.rowCount === 1;
  },

  /** "unmatched", "ignored" ou "pending" : jamais rattaché à un film. */
  async setUnlinkedStatus(id: number, status: Exclude<MediaFileStatus, "matched">): Promise<boolean> {
    const result = await pool.query(
      `UPDATE media_file SET status = $1, movie_id = NULL, updated_at = now() WHERE id = $2`,
      [status, id]
    );
    return result.rowCount === 1;
  },

  /** RG7 : retire les fichiers que l'indexation (réussie) n'a pas vus. Renvoie le nombre retiré. */
  async deleteNotSeenSince(date: Date): Promise<number> {
    const result = await pool.query(`DELETE FROM media_file WHERE last_seen_at < $1`, [date]);
    return result.rowCount ?? 0;
  },
};

export default mediaFilesDataMapper;
