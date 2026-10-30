/**
 * Limitation des tentatives sur les routes qui vérifient un mot de passe
 * (connexion, inscription, changement de mot de passe, suppression du compte).
 *
 * Sans elle, un robot peut essayer des milliers de mots de passe : Argon2 ralentit
 * chaque essai, mais ne les compte pas. Ici, au-delà de config.authRateLimit
 * ÉCHECS en 15 minutes depuis la même IP, l'API répond 429 (Too Many Requests).
 *
 * skipSuccessfulRequests : seuls les échecs comptent. Toute la maison sort par la même
 * IP publique (hairpin NAT) : les connexions réussies de la famille ne la bloquent pas.
 */
import { rateLimit } from "express-rate-limit";
import { config } from "../../config.ts";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // fenêtre de 15 minutes
  limit: () => config.authRateLimit, // fonction : relue à chaque requête (les tests la modifient)
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8", // en-tête RateLimit : le client sait quand réessayer
  legacyHeaders: false,
  // même forme que les autres erreurs de l'API (global-error-handler)
  message: { error: "Trop de tentatives : réessayez dans 15 minutes", status: 429 },
});
