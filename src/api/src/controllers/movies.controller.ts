/**
 * Controller des films : valide les entrées (Zod), appelle le DataMapper,
 * met en forme la réponse. Ni SQL ni HTML ici (SoC, § 3).
 */
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../@types/express.js";
import z from "zod";
import { config } from "../../config.ts";
import { NotFoundError } from "../lib/errors.ts";
import { isLocalRequest } from "../lib/network.ts";
import { buildPagination, paginationSchema } from "../lib/pagination.ts";
import { emptyToUndefined, optionalSearchText } from "../lib/zod-helpers.ts";
import favoritesDataMapper from "../models/favorites.datamapper.ts";
import moviesDataMapper, { MOVIE_SORTS, type MovieSort } from "../models/movies.datamapper.ts";
import { CERTIFICATIONS } from "../services/filename-parser.ts";
import { parseIdParam } from "./utils.ts";

const yearSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1888).max(2100).optional());

// ?genre=horreur&genre=science-fiction arrive en tableau ; ?genre=horreur en simple texte → toujours un tableau
const genresSchema = z.preprocess(
  (value) => (value === undefined || value === "" ? [] : Array.isArray(value) ? value : [value]),
  z.array(z.string().trim().min(1).max(64)).max(10)
);

const searchQuerySchema = paginationSchema
  .extend({
    q: optionalSearchText,
    year: yearSchema,
    yearFrom: yearSchema,
    yearTo: yearSchema,
    director: optionalSearchText,
    actor: optionalSearchText,
    genre: genresSchema,
    saga: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
    maxCertification: z.preprocess(emptyToUndefined, z.enum(CERTIFICATIONS).optional()),
    // liste blanche : seules les clés de MOVIE_SORTS passent (§ 7)
    sort: z.preprocess(
      emptyToUndefined,
      z.enum(Object.keys(MOVIE_SORTS) as [MovieSort, ...MovieSort[]]).default("title")
    ),
  })
  .refine((query) => !query.yearFrom || !query.yearTo || query.yearFrom <= query.yearTo, {
    message: "yearFrom doit être inférieur ou égal à yearTo",
  });

// --------------------------------
// GET /movies — recherche multicritère paginée (US01 → US07, US15)
// --------------------------------
export async function search(req: Request, res: Response) {
  const query = searchQuerySchema.parse(req.query);

  // "maxCertification=12" → les classifications autorisées : TP, 10, 12
  const certifications = query.maxCertification
    ? CERTIFICATIONS.slice(0, CERTIFICATIONS.indexOf(query.maxCertification) + 1)
    : undefined;

  const { rows, total } = await moviesDataMapper.search({
    q: query.q,
    year: query.year,
    yearFrom: query.yearFrom,
    yearTo: query.yearTo,
    director: query.director,
    actor: query.actor,
    genres: query.genre,
    sagaId: query.saga,
    certifications,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  });

  res.json({ data: rows, pagination: buildPagination(total, query.page, query.limit) });
}

// --------------------------------
// GET /movies/:id — fiche complète (US08, US09, US13/US14 via canPlay)
// --------------------------------
export async function getOne(req: Request, res: Response) {
  const id = parseIdParam(req);
  const userId = (req as AuthenticatedRequest).userId;
  const movie = await moviesDataMapper.findById(id);
  if (!movie) {
    throw new NotFoundError("Film introuvable");
  }

  // réseau local (LAN, VPN, IP publique de la box) : seul cas où l'on montre les fichiers du NAS
  const onLocalNetwork = await isLocalRequest(req.ip);

  res.json({
    ...movie,
    // pour le bouton ☆/★ de la fiche (userId posé par isConnected, toujours présent ici)
    isFavorite: userId ? await favoritesDataMapper.exists(userId, id) : false,
    onLocalNetwork,
    // simple confort d'affichage : la route /playlist refait la vérification (on ne croit jamais le client)
    canPlay: config.playUrlPrefix !== "" && onLocalNetwork,
    // hors réseau local, AUCUN chemin ne part : masquer la section côté React ne suffirait pas,
    // le JSON resterait lisible dans l'onglet Réseau du navigateur
    files: onLocalNetwork ? movie.files.map((file) => ({ ...file, path: toDisplayPath(file.path) })) : [],
  });
}

/**
 * Chemin affiché sur la fiche (US09) : préfixe UNC du .env + chemin relatif stocké en base,
 * avec des "\" comme dans l'explorateur Windows. L'adresse du NAS n'est jamais en base.
 */
function toDisplayPath(relativePath: string): string {
  if (!config.shareUncPrefix) {
    return relativePath;
  }
  return `${config.shareUncPrefix.replace(/\\+$/, "")}\\${relativePath.replaceAll("/", "\\")}`;
}

// --------------------------------
// PATCH /movies/:id — correction manuelle par un admin (US29)
// --------------------------------
const nullableText = (max: number) => z.string().trim().max(max).nullable();

const updateBodySchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    originalTitle: nullableText(255),
    releaseYear: z.number().int().min(1888).max(2100).nullable(),
    runtime: z.number().int().positive().max(1000).nullable(),
    synopsis: nullableText(5000),
    certification: z.enum(CERTIFICATIONS).nullable(),
  })
  .partial() // tous les champs deviennent facultatifs…
  .strict() // …mais un champ inconnu est refusé (pas de modification de tmdb_id, id…)
  .refine((body) => Object.keys(body).length > 0, { message: "Aucun champ à modifier" });

export async function update(req: Request, res: Response) {
  const id = parseIdParam(req);
  const fields = updateBodySchema.parse(req.body);

  if (!(await moviesDataMapper.update(id, fields))) {
    throw new NotFoundError("Film introuvable");
  }
  await getOne(req, res); // renvoie la fiche à jour, même forme que GET /movies/:id
}
