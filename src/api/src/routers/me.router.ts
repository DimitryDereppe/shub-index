// Routes « Mon compte » : profil, mot de passe, suppression, historique, favoris (tout membre connecté).
import { Router } from "express";
import * as meController from "../controllers/me.controller.ts";

export const router = Router();

/**
 * @openapi
 * /me:
 *   patch:
 *     tags: [Mon compte]
 *     summary: Modifier son prénom, son nom ou son email
 *     description: Changer d'email demande `currentPassword` (l'email sert d'identifiant de connexion).
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               firstname: { type: string }
 *               lastname: { type: string }
 *               email: { type: string, format: email }
 *               currentPassword: { type: string }
 *     responses:
 *       "200":
 *         description: Compte mis à jour.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/User" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "409": { $ref: "#/components/responses/Conflict" }
 *   delete:
 *     tags: [Mon compte]
 *     summary: Supprimer son compte (mot de passe requis)
 *     description: Refusé (409) pour le dernier administrateur. Historique et favoris sont supprimés avec le compte.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [password], properties: { password: { type: string } } }
 *     responses:
 *       "204": { description: Compte supprimé, cookies effacés. }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "409": { $ref: "#/components/responses/Conflict" }
 */
router.patch("/me", meController.updateProfile);
router.delete("/me", meController.deleteAccount);

/**
 * @openapi
 * /me/password:
 *   patch:
 *     tags: [Mon compte]
 *     summary: Changer son mot de passe
 *     description: Mêmes règles qu'à l'inscription. Toutes les sessions sont fermées (reconnexion nécessaire).
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirm]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *               confirm: { type: string }
 *     responses:
 *       "204": { description: Mot de passe changé, cookies effacés. }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.patch("/me/password", meController.updatePassword);

/**
 * @openapi
 * /me/history:
 *   get:
 *     tags: [Mon compte]
 *     summary: Les 10 derniers films regardés (clic « Lire dans VLC »)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Du plus récent au plus ancien.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: "#/components/schemas/MovieSummary"
 *                   - { type: object, properties: { watchedAt: { type: string, format: date-time } } }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *   delete:
 *     tags: [Mon compte]
 *     summary: Vider l'historique
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "204": { description: Historique vidé. }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 * /me/history/{movieId}:
 *   delete:
 *     tags: [Mon compte]
 *     summary: Retirer un film de l'historique
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - { name: movieId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       "204": { description: Film retiré. }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 */
router.get("/me/history", meController.getHistory);
router.delete("/me/history", meController.clearHistory);
router.delete("/me/history/:movieId", meController.removeFromHistory);

/**
 * @openapi
 * /me/favorites:
 *   get:
 *     tags: [Mon compte]
 *     summary: Ses favoris (10 au maximum)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Du plus récent au plus ancien.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: "#/components/schemas/MovieSummary"
 *                   - { type: object, properties: { addedAt: { type: string, format: date-time } } }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 * /me/favorites/{movieId}:
 *   parameters:
 *     - { name: movieId, in: path, required: true, schema: { type: integer } }
 *   put:
 *     tags: [Mon compte]
 *     summary: Ajouter un film aux favoris (idempotent)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "204": { description: Film en favori (ajouté ou déjà présent). }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 *       "409": { $ref: "#/components/responses/Conflict" }
 *   delete:
 *     tags: [Mon compte]
 *     summary: Retirer un film des favoris
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "204": { description: Film retiré. }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 *       "404": { $ref: "#/components/responses/NotFound" }
 */
router.get("/me/favorites", meController.getFavorites);
router.put("/me/favorites/:movieId", meController.addFavorite);
router.delete("/me/favorites/:movieId", meController.removeFavorite);
