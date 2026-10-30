// Routes des indexations (admin uniquement).
import { Router } from "express";
import * as scansController from "../controllers/scans.controller.ts";
import { checkRoles } from "../middlewares/access-control.middleware.ts";
import { Role } from "../lib/roles.ts";

export const router = Router();

// toutes les routes de ce router sont réservées aux admins
router.use("/scans", checkRoles([Role.admin]));

/**
 * @openapi
 * /scans:
 *   post:
 *     tags: [Indexations]
 *     summary: Lancer une indexation en arrière-plan (admin)
 *     description: Répond tout de suite (202) ; suivre l'avancement avec GET /scans/{id}.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "202":
 *         description: Indexation acceptée, en cours.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Scan" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "409":
 *         description: Une indexation est déjà en cours.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ApiError" }
 *   get:
 *     tags: [Indexations]
 *     summary: Historique des indexations, la plus récente d'abord (admin)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { $ref: "#/components/parameters/page" }
 *       - { $ref: "#/components/parameters/limit" }
 *     responses:
 *       "200":
 *         description: Une page de l'historique.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { $ref: "#/components/schemas/Scan" } }
 *                 pagination: { $ref: "#/components/schemas/Pagination" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 */
router.post("/scans", scansController.create);
router.get("/scans", scansController.getAll);

/**
 * @openapi
 * /scans/{id}:
 *   parameters:
 *     - { $ref: "#/components/parameters/id" }
 *   get:
 *     tags: [Indexations]
 *     summary: Suivre une indexation (admin)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Indexation.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/Scan" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 */
router.get("/scans/:id", scansController.getOne);
