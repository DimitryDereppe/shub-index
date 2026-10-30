// Routes des comptes utilisateurs (admin uniquement).
import { Router } from "express";
import * as userController from "../controllers/users.controller.ts";
import { checkRoles } from "../middlewares/access-control.middleware.ts";
import { Role } from "../lib/roles.ts";

export const router = Router();

// toutes les routes /users sont réservées aux admins (avant : tout membre connecté voyait la liste)
router.use("/users", checkRoles([Role.admin]));

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Utilisateurs]
 *     summary: Lister les comptes (admin)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Comptes, sans mot de passe.
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: "#/components/schemas/User" } }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 */
router.get("/users", userController.getAllUsers);

/**
 * @openapi
 * /users/{id}:
 *   parameters:
 *     - { $ref: "#/components/parameters/id" }
 *   patch:
 *     tags: [Utilisateurs]
 *     summary: Changer le rôle d'un compte (admin, pas le sien)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties: { role: { type: string, enum: [member, admin] } }
 *     responses:
 *       "200":
 *         description: Compte mis à jour.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/User" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 *       "409": { $ref: "#/components/responses/Conflict" }
 *   delete:
 *     tags: [Utilisateurs]
 *     summary: Supprimer un compte (admin, pas le sien)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "204": { description: Compte supprimé. }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "403": { $ref: "#/components/responses/Forbidden" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 *       "409": { $ref: "#/components/responses/Conflict" }
 */
router.patch("/users/:id", userController.updateRole);
router.delete("/users/:id", userController.deleteUser);
