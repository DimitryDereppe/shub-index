// Routeur principal de l'API (monté sur /api dans app.ts) : documentation, auth publique,
// puis toutes les routes réservées aux utilisateurs connectés.
import path from "node:path";
import { Router } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { isConnected } from "../middlewares/access-control.middleware.ts";
import { router as authRouter } from "./auth.router.ts";
import { router as meRouter } from "./me.router.ts";
import { router as mediaFilesRouter } from "./media-files.router.ts";
import { router as moviesRouter } from "./movies.router.ts";
import { router as peopleRouter } from "./people.router.ts";
import { router as scansRouter } from "./scans.router.ts";
import { router as usersRouter } from "./users.router.ts";

export const router = Router();

// --------------------------------
// Documentation OpenAPI : swagger-jsdoc assemble les blocs @openapi des routers
// --------------------------------
const specification = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API shub-index",
      version: "1.0.0",
      description: "Moteur de recherche du catalogue de films du NAS. Authentification par cookies httpOnly (se connecter avec POST /auth/login).",
    },
    servers: [{ url: "/api" }],
  },
  apis: [path.join(import.meta.dirname, "*.router.{ts,js}")],
});

// Avant isConnected pour rendre la page publique : http://localhost:4000/api/docs
router.use("/docs", swaggerUi.serve, swaggerUi.setup(specification));

router.use(authRouter);

// toutes les routes qui suivent sont accessibles uniquement si l'utilisateur est connecté
// connecté --> possède un accessToken valide
router.use(isConnected);

router.use(meRouter);
router.use(moviesRouter);
router.use(peopleRouter);
router.use(mediaFilesRouter);
router.use(scansRouter);
router.use(usersRouter);

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     cookieAuth:
 *       type: apiKey
 *       in: cookie
 *       name: accessToken
 *   parameters:
 *     id:
 *       name: id
 *       in: path
 *       required: true
 *       schema: { type: integer, minimum: 1 }
 *     page:
 *       name: page
 *       in: query
 *       schema: { type: integer, minimum: 1, default: 1 }
 *     limit:
 *       name: limit
 *       in: query
 *       schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *   schemas:
 *     ApiError:
 *       type: object
 *       properties:
 *         error: { type: string }
 *         status: { type: integer }
 *     Pagination:
 *       type: object
 *       properties:
 *         page: { type: integer }
 *         limit: { type: integer }
 *         total: { type: integer }
 *         totalPages: { type: integer }
 *     PersonRef:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         name: { type: string, example: David Fincher }
 *     SagaRef:
 *       type: object
 *       nullable: true
 *       description: Collection TMDB du film (null s'il n'en a pas)
 *       properties:
 *         id: { type: integer }
 *         name: { type: string, example: Alien - Saga }
 *     MovieSummary:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         title: { type: string, example: Alien³ }
 *         originalTitle: { type: string, nullable: true }
 *         releaseYear: { type: integer, nullable: true, example: 1992 }
 *         certification: { type: string, nullable: true, enum: [TP, "10", "12", "16", "18"] }
 *         posterUrl: { type: string, nullable: true }
 *         genres: { type: array, items: { type: string }, example: [Horreur, Science-Fiction] }
 *         directors: { type: array, items: { $ref: "#/components/schemas/PersonRef" } }
 *         saga: { $ref: "#/components/schemas/SagaRef" }
 *         available: { type: boolean, description: "Au moins un fichier présent sur le NAS" }
 *     MovieDetail:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         title: { type: string }
 *         originalTitle: { type: string, nullable: true }
 *         releaseYear: { type: integer, nullable: true }
 *         runtime: { type: integer, nullable: true, description: minutes }
 *         certification: { type: string, nullable: true }
 *         synopsis: { type: string, nullable: true }
 *         posterUrl: { type: string, nullable: true }
 *         tmdbId: { type: integer, nullable: true }
 *         canPlay: { type: boolean, description: "Requête venue du réseau local : bouton VLC affichable" }
 *         isFavorite: { type: boolean, description: "Film dans les favoris de l'utilisateur connecté" }
 *         studios:
 *           type: array
 *           description: Sociétés de production (TMDB)
 *           items: { type: object, properties: { id: { type: integer }, name: { type: string, example: Marvel Studios } } }
 *         genres:
 *           type: array
 *           items: { type: object, properties: { id: { type: integer }, name: { type: string } } }
 *         directors: { type: array, items: { $ref: "#/components/schemas/PersonRef" } }
 *         saga: { $ref: "#/components/schemas/SagaRef" }
 *         cast:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id: { type: integer }
 *               name: { type: string }
 *               character: { type: string, nullable: true }
 *               order: { type: integer }
 *         files:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id: { type: integer }
 *               path: { type: string, description: "Chemin UNC affichable (\\\\nas\\partage\\…)" }
 *               sizeBytes: { type: integer }
 *     MediaFile:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         path: { type: string, description: Chemin relatif à la racine du partage }
 *         filename: { type: string }
 *         sizeBytes: { type: integer }
 *         status: { type: string, enum: [pending, matched, unmatched, ignored] }
 *         movieId: { type: integer, nullable: true }
 *         lastSeenAt: { type: string, format: date-time }
 *     Scan:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         status: { type: string, enum: [running, success, failed] }
 *         startedAt: { type: string, format: date-time }
 *         finishedAt: { type: string, format: date-time, nullable: true }
 *         filesAdded: { type: integer }
 *         filesUpdated: { type: integer }
 *         filesRemoved: { type: integer }
 *         errorMessage: { type: string, nullable: true }
 *         userId: { type: integer, nullable: true, description: "NULL = tâche planifiée" }
 *     User:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         email: { type: string }
 *         firstname: { type: string }
 *         lastname: { type: string }
 *         role: { type: string, enum: [member, admin] }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 *   responses:
 *     BadRequest:
 *       description: Paramètre ou body invalide.
 *       content: { application/json: { schema: { $ref: "#/components/schemas/ApiError" } } }
 *     Unauthorized:
 *       description: Pas connecté (cookie accessToken absent, expiré ou invalide).
 *       content: { application/json: { schema: { $ref: "#/components/schemas/ApiError" } } }
 *     Forbidden:
 *       description: Rôle insuffisant, ou lecture VLC hors réseau local.
 *       content: { application/json: { schema: { $ref: "#/components/schemas/ApiError" } } }
 *     NotFound:
 *       description: Ressource inexistante.
 *       content: { application/json: { schema: { $ref: "#/components/schemas/ApiError" } } }
 *     Conflict:
 *       description: Conflit (indexation déjà en cours, action sur son propre compte…).
 *       content: { application/json: { schema: { $ref: "#/components/schemas/ApiError" } } }
 */
