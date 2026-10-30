// DataMapper : accès aux données des indexations (scans), aucune logique métier.
import pool from "./database-client.ts";

export type ScanStatus = "running" | "success" | "failed";

export interface ScanCounters {
  filesAdded: number;
  filesUpdated: number;
  filesRemoved: number;
}

export interface ScanRow extends ScanCounters {
  id: number;
  status: ScanStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
  userId: number | null; // NULL = lancé par la tâche planifiée (RG6)
}

const COLUMNS = `id, status, started_at AS "startedAt", finished_at AS "finishedAt",
  files_added AS "filesAdded", files_updated AS "filesUpdated", files_removed AS "filesRemoved",
  error_message AS "errorMessage", user_id AS "userId"`;

// code d'erreur PostgreSQL "violation de contrainte d'unicité"
export const UNIQUE_VIOLATION = "23505";

const scansDataMapper = {
  /**
   * Crée un scan "running". L'index unique partiel scan_only_one_running fait échouer
   * l'INSERT (code 23505) si un scan tourne déjà : c'est la BASE qui garantit RG6,
   * même si deux admins cliquent en même temps.
   */
  async create(userId: number | null): Promise<ScanRow> {
    const result = await pool.query(`INSERT INTO scan (user_id) VALUES ($1) RETURNING ${COLUMNS}`, [userId]);
    return result.rows[0];
  },

  /** Compteurs intermédiaires, pour suivre l'avancement avec GET /scans/:id. */
  async updateCounters(id: number, counters: ScanCounters): Promise<void> {
    await pool.query(
      `UPDATE scan SET files_added = $1, files_updated = $2, files_removed = $3 WHERE id = $4`,
      [counters.filesAdded, counters.filesUpdated, counters.filesRemoved, id]
    );
  },

  async finish(id: number, status: "success" | "failed", counters: ScanCounters, errorMessage: string | null): Promise<void> {
    await pool.query(
      `UPDATE scan
       SET status = $1, finished_at = now(), files_added = $2, files_updated = $3, files_removed = $4, error_message = $5
       WHERE id = $6`,
      [status, counters.filesAdded, counters.filesUpdated, counters.filesRemoved, errorMessage, id]
    );
  },

  /**
   * Un scan resté "running" depuis trop longtemps (serveur redémarré en plein scan)
   * bloquerait tous les suivants : on le passe en "failed".
   */
  async failStale(olderThanMinutes: number): Promise<void> {
    await pool.query(
      `UPDATE scan
       SET status = 'failed', finished_at = now(), error_message = 'Interrompue (serveur arrêté pendant l''indexation ?)'
       WHERE status = 'running' AND started_at < now() - make_interval(mins => $1)`,
      [olderThanMinutes]
    );
  },

  async findPage(page: number, limit: number): Promise<{ rows: ScanRow[]; total: number }> {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM scan`);
    const rowsResult = await pool.query(
      `SELECT ${COLUMNS} FROM scan ORDER BY started_at DESC LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit]
    );
    return { rows: rowsResult.rows, total: countResult.rows[0].total };
  },

  async findById(id: number): Promise<ScanRow | null> {
    const result = await pool.query(`SELECT ${COLUMNS} FROM scan WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  },
};

export default scansDataMapper;
