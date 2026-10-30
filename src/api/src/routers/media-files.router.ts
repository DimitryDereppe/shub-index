// Routes des fichiers vidéo : playlist VLC (membre, réseau local) et gestion (admin).
import { Router } from "express";
import * as mediaFilesController from "../controllers/media-files.controller.ts";
import { checkRoles, isLocalNetwork } from "../middlewares/access-control.middleware.ts";
import { Role } from "../lib/roles.ts";

export const router = Router();

/**
 * @openapi
 * /media-files/{id}/playlist:
 *   parameters:
 *     - { $ref: "#/components/parameters/id" }
 *   get:
 *     tags: [Fichiers]
 *     summary: Playlist .m3u qui ouvre le film dans VLC (réseau local uniquement)
 *     description: Le navigateur télécharge le fichier, le système l'ouvre avec VLC qui lit le film directement sur le NAS.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Fichier .m3u.
 *         content:
 *           audio/x-mpegurl:
 *             schema: { type: string, example: "#EXTM3U\n#EXTINF:-1,Alien³ (1992)\nsmb://nas/partage/Films/Alien%203.mkv\n" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 */
router.get("/media-files/:id/playlist", isLocalNetwork, mediaFilesController.getPlaylist);

/**
 * @openapi
 * /media-files:
 *   get:
 *     tags: [Fichiers]
 *     summary: Liste des fichiers indexés (admin), filtrable par statut
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [pending, matched, unmatched, ignored] } }
 *       - { $ref: "#/components/parameters/page" }
 *       - { $ref: "#/components/parameters/limit" }
 *     responses:
 *       "200":
 *         description: Une page de fichiers.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: "#/components/schemas/MediaFile" } }
 *                 pagination: { $ref: "#/components/schemas/Pagination" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 */
router.get("/media-files", checkRoles([Role.admin]), mediaFilesController.getAll);

/**
 * @openapi
 * /media-files/{id}:
 *   parameters:
 *     - { $ref: "#/components/parameters/id" }
 *   patch:
 *     tags: [Fichiers]
 *     summary: Associer un fichier à un film TMDB, ou l'ignorer (admin)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [tmdbId]
 *                 properties: { tmdbId: { type: integer, example: 8077 } }
 *               - type: object
 *                 required: [status]
 *                 properties: { status: { type: string, enum: [ignored] } }
 *     responses:
 *       "200":
 *         description: Fichier mis à jour.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MediaFile" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 *       "502":
 *         description: TMDB indisponible.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ApiError" }
 */
router.patch("/media-files/:id", checkRoles([Role.admin]), mediaFilesController.update);
