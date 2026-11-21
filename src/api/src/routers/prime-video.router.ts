// Route de la recherche Prime Video (membre) : films et séries inclus dans l'abonnement en France, sur le NAS ou non.
import { Router } from "express";
import * as primeVideoController from "../controllers/prime-video.controller.ts";

export const router = Router();

/**
 * @openapi
 * /prime-video:
 *   get:
 *     tags: [Prime Video]
 *     summary: Films ou séries inclus dans l'abonnement Prime Video en France
 *     description: >
 *       Données JustWatch fournies par TMDB, y compris ce qui est absent du NAS.
 *       Abonnement seulement : ni location, ni achat, ni chaîne Amazon payante en plus.
 *       Sans `q` : les plus populaires. Avec `q` : recherche par titre, puis filtre Prime Video
 *       (une page peut alors contenir moins de 20 résultats, voire aucun ; seuls l'année, la période
 *       et les genres s'appliquent). Acteur, réalisateur et classification : films seulement.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { name: type, in: query, schema: { type: string, enum: [movie, tv], default: movie }, description: "movie = films, tv = séries" }
 *       - { name: q, in: query, schema: { type: string }, example: reacher, description: "Titre (facultatif)" }
 *       - { name: year, in: query, schema: { type: integer }, description: "Série : année de la 1re diffusion" }
 *       - { name: yearFrom, in: query, schema: { type: integer } }
 *       - { name: yearTo, in: query, schema: { type: integer } }
 *       - name: genre
 *         in: query
 *         description: "Id de genre TMDB (cf. /prime-video/genres), répétable ; il faut TOUS les genres cités."
 *         schema: { type: array, items: { type: integer } }
 *         style: form
 *         explode: true
 *       - { name: actor, in: query, schema: { type: string }, example: tom cruise, description: "Films seulement, sans titre" }
 *       - { name: director, in: query, schema: { type: string }, example: christopher nolan, description: "Films seulement, sans titre (films réalisés, pas seulement produits)" }
 *       - { name: maxCertification, in: query, schema: { type: string, enum: [TP, "10", "12", "16", "18"] }, description: "Classification française TMDB ; films seulement, sans titre" }
 *       - { name: sort, in: query, schema: { type: string, enum: [popularity, -year, year, rating, title], default: popularity }, description: "Sans titre seulement (avec un titre : pertinence)" }
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, maximum: 500, default: 1 } }
 *     responses:
 *       "200":
 *         description: Une page de résultats.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type: { type: string, enum: [movie, tv] }
 *                       tmdbId: { type: integer }
 *                       title: { type: string }
 *                       originalTitle: { type: string, nullable: true }
 *                       releaseYear: { type: integer, nullable: true, description: "Série : année de la 1re diffusion" }
 *                       synopsis: { type: string, nullable: true }
 *                       posterUrl: { type: string, nullable: true }
 *                       movieId: { type: integer, nullable: true, description: "Id du film dans le catalogue, null s'il n'y est pas (toujours null pour une série)" }
 *                       onNas: { type: boolean, description: "Au moins un fichier présent sur le NAS" }
 *                 pagination: { $ref: "#/components/schemas/Pagination" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "502": { description: TMDB injoignable. }
 */
router.get("/prime-video", primeVideoController.search);

/**
 * @openapi
 * /prime-video/genres:
 *   get:
 *     tags: [Prime Video]
 *     summary: Genres TMDB des films ou des séries
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { name: type, in: query, schema: { type: string, enum: [movie, tv], default: movie } }
 *     responses:
 *       "200":
 *         description: Liste des genres.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { type: object, properties: { id: { type: integer }, name: { type: string, example: Action } } }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "502": { description: TMDB injoignable. }
 */
router.get("/prime-video/genres", primeVideoController.listGenres);
