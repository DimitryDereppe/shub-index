/**
 * Controller de la recherche Prime Video : films et séries inclus dans l'abonnement
 * en France, qu'ils soient sur le NAS ou non. Chaque film indique s'il est aussi dans
 * le catalogue (les séries ne sont pas indexées : jamais « sur le NAS »).
 */
import type { Request, Response } from "express";
import z from "zod";
import { BadGatewayError } from "../lib/errors.ts";
import { emptyToUndefined, optionalSearchText } from "../lib/zod-helpers.ts";
import moviesDataMapper from "../models/movies.datamapper.ts";
import { searchPrimeVideo, TMDB_MAX_PAGE } from "../services/prime-video.service.ts";
import { CERTIFICATIONS } from "../services/filename-parser.ts";
import {
  getGenres,
  MEDIA_TYPES,
  posterUrlOf,
  PRIME_VIDEO_SORTS,
  TmdbError,
  yearOf,
  type PrimeVideoSort,
} from "../services/tmdb.client.ts";

const typeSchema = z.preprocess(emptyToUndefined, z.enum(MEDIA_TYPES).default("movie"));
const yearSchema = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1888).max(2100).optional());

// ?genre=28&genre=12 arrive en tableau ; ?genre=28 en simple texte → toujours un tableau d'ids TMDB
const genresSchema = z.preprocess(
  (value) => (value === undefined || value === "" ? [] : Array.isArray(value) ? value : [value]),
  z.array(z.coerce.number().int().positive()).max(10)
);

const searchQuerySchema = z
  .object({
    type: typeSchema,
    q: optionalSearchText,
    year: yearSchema,
    yearFrom: yearSchema,
    yearTo: yearSchema,
    genre: genresSchema,
    actor: optionalSearchText,
    director: optionalSearchText,
    maxCertification: z.preprocess(emptyToUndefined, z.enum(CERTIFICATIONS).optional()),
    // liste blanche : seules les clés de PRIME_VIDEO_SORTS passent
    sort: z.preprocess(
      emptyToUndefined,
      z.enum(Object.keys(PRIME_VIDEO_SORTS) as [PrimeVideoSort, ...PrimeVideoSort[]]).default("popularity")
    ),
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(TMDB_MAX_PAGE).default(1)),
  })
  .refine((query) => !query.yearFrom || !query.yearTo || query.yearFrom <= query.yearTo, {
    message: "yearFrom doit être inférieur ou égal à yearTo",
  });

/** Erreur TMDB → 502 (comme l'association manuelle des fichiers) ; le reste remonte tel quel. */
async function fromTmdb<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof TmdbError) {
      console.error("TMDB indisponible (recherche Prime Video)", { error: error.message });
      throw new BadGatewayError("TMDB indisponible, réessayez plus tard");
    }
    throw error;
  }
}

// --------------------------------
// GET /prime-video — films ou séries inclus dans Prime Video en France
// --------------------------------
export async function search(req: Request, res: Response) {
  const query = searchQuerySchema.parse(req.query);

  const result = await fromTmdb(() =>
    searchPrimeVideo(
      query.type,
      {
        q: query.q,
        year: query.year,
        yearFrom: query.yearFrom,
        yearTo: query.yearTo,
        genreIds: query.genre,
        actor: query.actor,
        director: query.director,
        maxCertification: query.maxCertification,
        sort: query.sort,
      },
      query.page
    )
  );

  // une seule requête SQL pour toute la page : quels films connaît-on déjà ?
  // (ids TMDB des films et des séries indépendants → on ne cherche que pour les films)
  const inCatalog =
    query.type === "movie" ? await moviesDataMapper.findByTmdbIds(result.items.map((item) => item.id)) : [];
  const byTmdbId = new Map(inCatalog.map((row) => [row.tmdbId, row]));

  res.json({
    data: result.items.map((item) => {
      const title = item.title ?? item.name ?? "";
      const originalTitle = item.original_title ?? item.original_name;
      const known = byTmdbId.get(item.id);
      return {
        type: query.type,
        tmdbId: item.id,
        title,
        originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
        releaseYear: yearOf(item.release_date ?? item.first_air_date), // série : année de la 1ʳᵉ diffusion
        synopsis: item.overview || null,
        posterUrl: posterUrlOf(item.poster_path),
        movieId: known?.id ?? null, // fiche du catalogue (/films/:id), null si inconnu
        onNas: known?.available ?? false, // au moins un fichier présent sur le NAS
      };
    }),
    pagination: {
      page: result.page,
      limit: 20, // taille fixe des pages TMDB
      total: result.totalResults,
      totalPages: result.totalPages,
    },
  });
}

// --------------------------------
// GET /prime-video/genres — genres TMDB des films ou des séries (cases à cocher du formulaire)
// --------------------------------
export async function listGenres(req: Request, res: Response) {
  const { type } = z.object({ type: typeSchema }).parse(req.query);
  res.json(await fromTmdb(() => getGenres(type)));
}
