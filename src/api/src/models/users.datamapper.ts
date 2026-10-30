// DataMapper : accès aux données des utilisateurs, aucune logique métier.
// Dernier paramètre `db` : le pool par défaut, ou la connexion d'une transaction (cf. transaction.ts).
import pool, { type Queryable } from "./database-client.ts";
import type { Role } from "../lib/roles.ts";

export interface PublicUserRow {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  role: Role;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithPasswordRow extends PublicUserRow {
  password: string; // mot de passe hashé (argon2) — usage interne uniquement, jamais renvoyé au client
}

const PUBLIC_COLUMNS = `id, email, firstname, lastname, role, created_at, updated_at`;

const usersDataMapper = {
  async findAll(): Promise<PublicUserRow[]> {
    // jamais "password" dans une réponse HTTP (cf. standards du projet, section 12)
    const result = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM "user" ORDER BY id`);
    return result.rows;
  },

  async findById(id: number, db: Queryable = pool): Promise<PublicUserRow | null> {
    const result = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM "user" WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  // inclut le mot de passe hashé : réservé à la vérification interne du login (auth.controller.ts)
  async findByEmail(email: string): Promise<UserWithPasswordRow | null> {
    const result = await pool.query(
      `SELECT ${PUBLIC_COLUMNS}, password FROM "user" WHERE email = $1`,
      [email]
    );
    return result.rows[0] ?? null;
  },

  async create(data: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
  }): Promise<PublicUserRow> {
    const result = await pool.query(
      `INSERT INTO "user" (firstname, lastname, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_COLUMNS}`,
      [data.firstname, data.lastname, data.email, data.password]
    );
    return result.rows[0];
  },

  // US42 : promouvoir / rétrograder — renvoie null si l'utilisateur n'existe pas
  async updateRole(id: number, role: Role): Promise<PublicUserRow | null> {
    const result = await pool.query(
      `UPDATE "user" SET role = $1, updated_at = now() WHERE id = $2 RETURNING ${PUBLIC_COLUMNS}`,
      [role, id]
    );
    return result.rows[0] ?? null;
  },

  // mot de passe hashé d'un utilisateur : réservé aux vérifications de me.controller.ts (jamais renvoyé)
  async findPasswordById(id: number): Promise<string | null> {
    const result = await pool.query(`SELECT password FROM "user" WHERE id = $1`, [id]);
    return result.rows[0]?.password ?? null;
  },

  // PATCH /me : seuls les champs fournis changent (COALESCE garde l'ancienne valeur si $n est NULL)
  async updateProfile(id: number, data: { firstname?: string; lastname?: string; email?: string }): Promise<PublicUserRow | null> {
    const result = await pool.query(
      `UPDATE "user"
       SET firstname = COALESCE($1, firstname), lastname = COALESCE($2, lastname),
           email = COALESCE($3, email), updated_at = now()
       WHERE id = $4
       RETURNING ${PUBLIC_COLUMNS}`,
      [data.firstname ?? null, data.lastname ?? null, data.email ?? null, id]
    );
    return result.rows[0] ?? null;
  },

  async updatePassword(id: number, hashedPassword: string, db: Queryable = pool): Promise<void> {
    await db.query(`UPDATE "user" SET password = $1, updated_at = now() WHERE id = $2`, [hashedPassword, id]);
  },

  async countAdmins(): Promise<number> {
    const result = await pool.query(`SELECT COUNT(*)::int AS total FROM "user" WHERE role = 'admin'`);
    return result.rows[0].total;
  },

  // US43 : les refresh tokens partent avec (ON DELETE CASCADE), les scans gardent leur trace (SET NULL)
  async delete(id: number): Promise<boolean> {
    const result = await pool.query(`DELETE FROM "user" WHERE id = $1`, [id]);
    return result.rowCount === 1;
  },
};

export default usersDataMapper;
