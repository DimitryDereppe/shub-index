// Routes des personnes et des genres (lecture seule, tout membre connecté).
import { Router } from "express";
import * as genresController from "../controllers/genres.controller.ts";
import * as peopleController from "../controllers/people.controller.ts";

export const router = Router();

/**
 * @openapi
 * /people:
 *   get:
 *     tags: [Personnes]
 *     summary: Autocomplétion sur le nom d'une personne
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { name: q, in: query, required: true, schema: { type: string, minLength: 2 }, example: weav }
 *       - { name: role, in: query, schema: { type: string, enum: [director, actor] } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10, maximum: 20 } }
 *     responses:
 *       "200":
 *         description: Personnes trouvées.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: "#/components/schemas/PersonRef" } }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/people", peopleController.search);

/**
 * @openapi
 * /people/{id}:
 *   parameters:
 *     - { $ref: "#/components/parameters/id" }
 *   get:
 *     tags: [Personnes]
 *     summary: Fiche d'une personne et ses films du catalogue
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Fiche personne.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 name: { type: string }
 *                 directed: { type: array, items: { $ref: "#/components/schemas/MovieSummary" } }
 *                 played:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: "#/components/schemas/MovieSummary"
 *                       - type: object
 *                         properties: { character: { type: string, nullable: true } }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 */
router.get("/people/:id", peopleController.getOne);

/**
 * @openapi
 * /genres:
 *   get:
 *     tags: [Genres]
 *     summary: Liste des genres avec leur nombre de films
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Genres triés par nom.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string, example: Horreur }
 *                   movieCount: { type: integer }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/genres", genresController.getAll);
