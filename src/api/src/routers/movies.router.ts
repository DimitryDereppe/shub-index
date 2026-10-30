// Routes des films : recherche (membre), fiche (membre), correction (admin).
import { Router } from "express";
import * as moviesController from "../controllers/movies.controller.ts";
import { checkRoles } from "../middlewares/access-control.middleware.ts";
import { Role } from "../lib/roles.ts";

export const router = Router();

/**
 * @openapi
 * /movies:
 *   get:
 *     tags: [Films]
 *     summary: Recherche multicritère paginée
 *     description: Tous les critères sont facultatifs et combinés par ET. Accessible à tout membre connecté.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { name: q, in: query, schema: { type: string }, description: "Mot du titre français, du titre original, du nom de la saga ou d'un studio (sans tenir compte des accents)" }
 *       - { name: year, in: query, schema: { type: integer }, example: 1992 }
 *       - { name: yearFrom, in: query, schema: { type: integer } }
 *       - { name: yearTo, in: query, schema: { type: integer } }
 *       - { name: director, in: query, schema: { type: string }, example: fincher }
 *       - { name: actor, in: query, schema: { type: string }, example: weaver }
 *       - name: genre
 *         in: query
 *         description: Répétable ; le film doit avoir TOUS les genres cités.
 *         schema: { type: array, items: { type: string } }
 *         style: form
 *         explode: true
 *       - { name: saga, in: query, schema: { type: integer }, description: "Id interne d'une saga : ses films seulement" }
 *       - { name: maxCertification, in: query, schema: { type: string, enum: [TP, "10", "12", "16", "18"] } }
 *       - { name: sort, in: query, schema: { type: string, enum: [title, -title, year, -year], default: title } }
 *       - { $ref: "#/components/parameters/page" }
 *       - { $ref: "#/components/parameters/limit" }
 *     responses:
 *       "200":
 *         description: Une page de résultats.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: "#/components/schemas/MovieSummary" } }
 *                 pagination: { $ref: "#/components/schemas/Pagination" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/movies", moviesController.search);

/**
 * @openapi
 * /movies/{id}:
 *   parameters:
 *     - { $ref: "#/components/parameters/id" }
 *   get:
 *     tags: [Films]
 *     summary: Fiche complète d'un film
 *     description: "`canPlay` vaut true si la requête vient du réseau local (bouton « Lire dans VLC »)."
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Fiche du film.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MovieDetail" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 *   patch:
 *     tags: [Films]
 *     summary: Corriger un film à la main (admin)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             minProperties: 1
 *             properties:
 *               title: { type: string }
 *               originalTitle: { type: string, nullable: true }
 *               releaseYear: { type: integer, nullable: true }
 *               runtime: { type: integer, nullable: true }
 *               synopsis: { type: string, nullable: true }
 *               certification: { type: string, enum: [TP, "10", "12", "16", "18"], nullable: true }
 *     responses:
 *       "200":
 *         description: Fiche mise à jour.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/MovieDetail" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 */
router.get("/movies/:id", moviesController.getOne);
router.patch("/movies/:id", checkRoles([Role.admin]), moviesController.update);
