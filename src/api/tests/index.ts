// Outils des tests d'intégration : requêtes HTTP (axios), comptes de test, données de test.
import argon2 from "argon2";
import axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { config } from "../config.ts";
import { Role } from "../src/lib/roles.ts";
import pool from "../src/models/database-client.ts";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../src/lib/tokens.ts";

export const apiBaseUrl = `http://localhost:${config.port}/api/`;

// requester anonyme : validateStatus → axios ne lève pas d'erreur sur un 4xx/5xx (on veut les tester)
export const requester: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  validateStatus: () => true,
});

// --------------------------------
// comptes de test
// --------------------------------
export interface TestUser {
  id: number; // rempli par register()
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  role: Role;
}

// mot de passe conforme à isValidPassword (8-16 caractères, maj, min, chiffre, spécial)
export const PASSWORD = "Password!1234";

export const ALICE: TestUser = { id: 0, firstname: "Alice", lastname: "DOE", email: "alice@oclock.io", password: PASSWORD, role: Role.admin };
export const BOB: TestUser = { id: 0, firstname: "Bob", lastname: "DOE", email: "bob@oclock.io", password: PASSWORD, role: Role.member };

/** Crée l'utilisateur directement en base (mot de passe hashé) et note son id. */
export async function register(user: TestUser): Promise<void> {
  const hashedPassword = await argon2.hash(user.password);
  const result = await pool.query(
    `INSERT INTO "user" (firstname, lastname, email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.firstname, user.lastname, user.email, hashedPassword, user.role]
  );
  user.id = result.rows[0].id;
}

/** Connecte l'utilisateur et renvoie "nom=valeur" de ses deux cookies. */
export async function logUser(user: TestUser): Promise<string> {
  const response = await requester.post("/auth/login", { email: user.email, password: user.password });
  if (response.status !== 200) {
    throw new Error(`Connexion impossible (${response.status}) : ${JSON.stringify(response.data)}`);
  }
  const accessCookie = findCookieFromResponse(response, ACCESS_COOKIE.name).split(";")[0];
  const refreshCookie = findCookieFromResponse(response, REFRESH_COOKIE.name).split(";")[0];
  return `${accessCookie}; ${refreshCookie}`;
}

/** Crée l'utilisateur, le connecte, et renvoie un requester qui envoie ses cookies à chaque requête. */
export async function loggedRequester(user: TestUser): Promise<AxiosInstance> {
  await register(user);
  const cookies = await logUser(user);
  return axios.create({
    baseURL: apiBaseUrl,
    validateStatus: () => true,
    headers: { Cookie: cookies },
  });
}

/** Un cookie de la réponse ("<nom>=<valeur>; <options>"), ou "" s'il est absent. */
export function findCookieFromResponse(res: AxiosResponse, name: string): string {
  const cookies: string[] = res.headers["set-cookie"] ?? [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`)) ?? "";
}

// --------------------------------
// données de test
// --------------------------------

/** Insère un film minimal et renvoie son id. */
export async function createMovie(title: string): Promise<number> {
  const result = await pool.query(`INSERT INTO movie (title) VALUES ($1) RETURNING id`, [title]);
  return result.rows[0].id;
}

/** Insère un fichier vidéo identifié (rattaché au film) et renvoie son id. */
export async function createMediaFile(movieId: number, filename: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO media_file (path, filename, extension, size_bytes, modified_at, status, movie_id)
     VALUES ($1, $2, 'mkv', 1000, now(), 'matched', $3) RETURNING id`,
    [`Films/${filename}`, filename, movieId]
  );
  return result.rows[0].id;
}
