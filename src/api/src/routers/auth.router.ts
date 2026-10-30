// Routes d'authentification (cookies httpOnly + JWT) : publiques sauf logout et me.
import { Router } from "express";
import { authRateLimiter } from "../middlewares/rate-limit.middleware.ts";
import * as authController from "../controllers/auth.controller.ts";
import { isConnected } from "../middlewares/access-control.middleware.ts";

export const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Authentification]
 *     summary: Créer un compte (rôle member)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstname, lastname, email, password, confirm]
 *             properties:
 *               firstname: { type: string }
 *               lastname: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, description: "8 à 16 caractères, majuscule, minuscule, chiffre et caractère spécial" }
 *               confirm: { type: string }
 *     responses:
 *       "201":
 *         description: Compte créé.
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/User" }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "409": { $ref: "#/components/responses/Conflict" }
 */
router.post("/auth/register", authRateLimiter, authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Authentification]
 *     summary: Se connecter (pose les cookies accessToken et refreshToken)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       "200": { description: Connecté, cookies posés. }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/auth/login", authRateLimiter, authController.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Authentification]
 *     summary: Renouveler les cookies (rotation du refresh token)
 *     responses:
 *       "200": { description: Nouveaux cookies posés. }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/auth/refresh", authController.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Authentification]
 *     summary: Se déconnecter (révoque les refresh tokens, vide les cookies)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "204": { description: Déconnecté. }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.post("/auth/logout", isConnected, authController.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Authentification]
 *     summary: Profil de l'utilisateur connecté
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       "200":
 *         description: Profil.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 firstname: { type: string }
 *                 lastname: { type: string }
 *                 email: { type: string }
 *                 role: { type: string, enum: [member, admin] }
 *       "401": { $ref: "#/components/responses/Unauthorized" }
 */
router.get("/auth/me", isConnected, authController.getMe);
