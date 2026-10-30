// Routes d'authentification (cookies httpOnly + JWT) : publiques sauf logout et me.
import { Router } from "express";
import { authRateLimiter, emailRateLimiter } from "../middlewares/rate-limit.middleware.ts";
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

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Authentification]
 *     summary: Mot de passe oublié — envoie un lien de réinitialisation par email
 *     description: Réponse identique que le compte existe ou non (pas de fuite des comptes). Lien valable 30 min, une seule fois.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [email], properties: { email: { type: string, format: email } } }
 *     responses:
 *       "202": { description: Demande prise en compte (toujours le même message). }
 *       "400": { $ref: "#/components/responses/BadRequest" }
 *       "429": { description: Trop de demandes depuis cette IP (15 min). }
 * /auth/reset-password:
 *   post:
 *     tags: [Authentification]
 *     summary: Choisir un nouveau mot de passe avec le lien reçu par email
 *     description: Mêmes règles qu'à l'inscription ; toutes les sessions sont fermées.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword, confirm]
 *             properties:
 *               token: { type: string, description: "paramètre « jeton » du lien" }
 *               newPassword: { type: string }
 *               confirm: { type: string }
 *     responses:
 *       "204": { description: Mot de passe changé, cookies effacés. }
 *       "400": { description: Lien invalide, expiré ou déjà utilisé ; ou mot de passe refusé. }
 *       "429": { description: Trop d'échecs depuis cette IP (15 min). }
 */
router.post("/auth/forgot-password", emailRateLimiter, authController.forgotPassword);
router.post("/auth/reset-password", authRateLimiter, authController.resetPassword);
