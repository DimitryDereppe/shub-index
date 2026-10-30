import express from "express";
import helmet from "helmet";
import { xss } from "express-xss-sanitizer";
import cors from "cors";
import cookieParser from "cookie-parser";
import { router as apiRouter } from "./routers/index.router.ts";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.ts";
import { globalErrorHandler } from "./middlewares/global-error-handler.ts";
import { config } from "../config.ts";

export const app = express();

// Derrière un reverse proxy (Caddy en prod, Nginx du client en local), l'IP de la connexion est
// celle du proxy. "trust proxy" dit à Express de lire la vraie IP du visiteur dans X-Forwarded-For,
// mais UNIQUEMENT si la requête vient du proxy indiqué (jamais `true` = "croire tout le monde" :
// n'importe qui pourrait alors se déclarer "réseau local", cf. RG10).
if (config.trustProxy) {
  app.set("trust proxy", config.trustProxy);
}

// pas d'en-tête "X-Powered-By: Express" (inutile d'annoncer la techno aux curieux)
app.disable("x-powered-by");

// catalogue privé : aucune réponse de l'API ne doit être indexée (même consigne que robots.txt)
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

// en-têtes HTTP de sécurité (CSP, X-Content-Type-Options...) : en premier, pour protéger aussi les réponses d'erreur
app.use(helmet());

// origin: config.allowedOrigins --> indique au navigateur qu'on accepte des requêtes depuis le front (URL configurée dans le .env)
// credentials: true --> autorise les cookies venant du front
app.use(cors({ origin: config.allowedOrigins, credentials: true }));

app.use(express.json());

// nettoie body/query/params/headers des payloads XSS : après express.json(), pour sanitizer le body déjà parsé
app.use(xss());

app.use(cookieParser()); // pour lire les cookies plus facilement

// je branche le middleware apiRouter sur la router "/api"
/// https://expressjs.com/fr/5x/guide/using-middleware/
app.use("/api", apiRouter);

// Not found middleware
app.use(notFoundMiddleware);

// Global error middleware
app.use(globalErrorHandler);
