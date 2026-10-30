/**
 * Controller des fichiers vidéo : liste à traiter (admin), association manuelle
 * à un film TMDB ou mise de côté (admin), playlist VLC (membre sur le réseau local).
 */
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../@types/express.js";
import z from "zod";
import { config } from "../../config.ts";
import { BadGatewayError, BadRequestError, NotFoundError } from "../lib/errors.ts";
import { buildPagination, paginationSchema } from "../lib/pagination.ts";
import { buildM3u, buildPlaylistFilename } from "../lib/playlist.ts";
import { emptyToUndefined } from "../lib/zod-helpers.ts";
import mediaFilesDataMapper from "../models/media-files.datamapper.ts";
import watchHistoryDataMapper from "../models/watch-history.datamapper.ts";
import { importMovieByTmdbId } from "../services/catalog-import.service.ts";
import { TmdbError, TmdbNotFoundError } from "../services/tmdb.client.ts";
import { parseIdParam } from "./utils.ts";

const listQuerySchema = paginationSchema.extend({
  status: z.preprocess(emptyToUndefined, z.enum(["pending", "matched", "unmatched", "ignored"]).optional()),
});

// --------------------------------
// GET /media-files?status=unmatched — fichiers à traiter (US26)
// --------------------------------
export async function getAll(req: Request, res: Response) {
  const { status, page, limit } = listQuerySchema.parse(req.query);
  const { rows, total } = await mediaFilesDataMapper.findPage(status, page, limit);
  res.json({ data: rows, pagination: buildPagination(total, page, limit) });
}

// --------------------------------
// PATCH /media-files/:id — { tmdbId } (US27) OU { status: "ignored" } (US28)
// --------------------------------
// z.union : le body doit correspondre à UNE des deux formes ; .strict() refuse tout champ en plus
const updateBodySchema = z.union([
  z.object({ tmdbId: z.number().int().positive() }).strict(),
  z.object({ status: z.literal("ignored") }).strict(),
]);

export async function update(req: Request, res: Response) {
  const id = parseIdParam(req);
  const body = updateBodySchema.parse(req.body);

  const file = await mediaFilesDataMapper.findById(id);
  if (!file) {
    throw new NotFoundError("Fichier introuvable");
  }

  if ("status" in body) {
    await mediaFilesDataMapper.setUnlinkedStatus(id, "ignored");
  } else {
    const movieId = await importFromTmdb(body.tmdbId);
    await mediaFilesDataMapper.setMatched(id, movieId);
  }

  res.json(await mediaFilesDataMapper.findById(id));
}

/** Importe le film TMDB demandé, en traduisant les erreurs TMDB en codes HTTP justes. */
async function importFromTmdb(tmdbId: number): Promise<number> {
  try {
    return await importMovieByTmdbId(tmdbId);
  } catch (error) {
    if (error instanceof TmdbNotFoundError) {
      throw new BadRequestError("Aucun film TMDB avec cet identifiant");
    }
    if (error instanceof TmdbError) {
      console.error("TMDB indisponible (association manuelle)", { tmdbId, error: error.message });
      throw new BadGatewayError("TMDB indisponible, réessayez plus tard");
    }
    throw error;
  }
}

// --------------------------------
// GET /media-files/:id/playlist — fichier .m3u qui ouvre le film dans VLC (US13)
// isConnected + isLocalNetwork ont déjà été vérifiés par le router (RG10)
// --------------------------------
export async function getPlaylist(req: Request, res: Response) {
  const id = parseIdParam(req);
  const file = await mediaFilesDataMapper.findWithMovie(id);
  if (!file) {
    throw new NotFoundError("Fichier introuvable");
  }
  if (!config.playUrlPrefix) {
    throw new NotFoundError("Lecture VLC non configurée (PLAY_URL_PREFIX)");
  }

  // titre affiché dans VLC : "Alien³ (1992)", ou le nom du fichier s'il n'est pas identifié
  const title = file.title
    ? `${file.title}${file.releaseYear ? ` (${file.releaseYear})` : ""}`
    : file.path.split("/").at(-1)!;

  // historique (« regardé » = playlist VLC fournie) : seulement si le fichier est rattaché à un film
  const userId = (req as AuthenticatedRequest).userId;
  if (userId && file.movieId) {
    await watchHistoryDataMapper.record(userId, file.movieId);
  }

  // audio/x-mpegurl = type officiel des .m3u ; "attachment" = le navigateur télécharge
  // le fichier au lieu de l'afficher, puis le système l'ouvre avec VLC
  res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
  // filename* (RFC 5987) : permet les accents dans le nom proposé au téléchargement
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="playlist.m3u"; filename*=UTF-8''${encodeURIComponent(buildPlaylistFilename(title))}`
  );
  res.send(buildM3u(title, file.path, config.playUrlPrefix));
}
