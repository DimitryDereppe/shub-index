/**
 * Configuration de l'API, lue UNE fois dans les variables d'environnement (.env).
 * Aucune adresse IP, aucun chemin perso ni secret en dur (dépôt destiné à devenir public) :
 * les valeurs par défaut ci-dessous ne servent qu'au développement.
 */

/** "Films, Animé" → ["Films", "Animé"] (liste séparée par des virgules, espaces retirés). */
function toList(value: string | undefined, fallback: string[] = []): string[] {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10), // https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing
  dbUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:randompassword@localhost:5432/shubindex",
  jwtSecret: process.env.JWT_SECRET ?? "",
  // vide = aucune autre origine autorisée (client et API sont sur la même origine) ; jamais "*" par défaut
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "",
  // tentatives ÉCHOUÉES autorisées par IP et par 15 min sur les routes de mot de passe (force brute)
  authRateLimit: parseInt(process.env.AUTH_RATE_LIMIT ?? "10", 10),
  // demandes d'email « mot de passe oublié » par IP et par 15 min (anti-spam)
  emailRateLimit: parseInt(process.env.EMAIL_RATE_LIMIT ?? "5", 10),

  // ---- reverse proxy ----
  // valeur passée à app.set("trust proxy") : adresse/plage du SEUL proxy de confiance (Caddy, Nginx…).
  // Vide = aucun proxy cru → req.ip est l'IP de la connexion TCP (on ne lit jamais X-Forwarded-For).
  trustProxy: process.env.TRUST_PROXY ?? "",

  // ---- TMDB (métadonnées des films) ----
  tmdbToken: process.env.TMDB_TOKEN ?? "", // secret : jamais loggé
  tmdbBaseUrl: process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3",
  tmdbLanguage: process.env.TMDB_LANGUAGE ?? "fr-FR",
  castLimit: parseInt(process.env.CAST_LIMIT ?? "15", 10), // nombre de rôles importés par film

  // ---- partage réseau à indexer ----
  shareRoot: process.env.SHARE_ROOT ?? "/media/shub", // racine du partage vue par l'API (montage en lecture seule)
  scanRoots: toList(process.env.SCAN_ROOTS, ["Films", "Animé"]), // liste blanche des dossiers indexés
  scanExcluded: toList(process.env.SCAN_EXCLUDED, ["Séries", "Extras", "Golden Collection", "_À trier"]),
  videoExtensions: toList(process.env.VIDEO_EXTENSIONS, [
    "mkv", "avi", "mp4", "m4v", "mov", "mpg", "wmv", "flv", "ts", "webm", // = config.json d'organize.py + mpg
  ]).map((ext) => ext.replace(/^\./, "").toLowerCase()),

  // ---- affichage et lecture ----
  shareUncPrefix: process.env.SHARE_UNC_PREFIX ?? "", // ex. \\<ip-du-nas>\Partage (affiché sur la fiche, US09)
  playUrlPrefix: process.env.PLAY_URL_PREFIX ?? "", // ex. smb://<ip-du-nas>/Partage (écrit dans le .m3u, US13)
  lanCidrs: toList(process.env.LAN_CIDRS), // plages "réseau local" (RG10) ; vide = lecture VLC refusée à tous
  // ---- emails (récupération du mot de passe, cf. src/mailer.ts) ----
  // SMTP_HOST vide = aucun email envoyé (le contenu est seulement journalisé, sans le lien)
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? "465"), // process.env donne toujours des chaînes
  smtpSecure: (process.env.SMTP_SECURE ?? "true") === "true", // "false" est une chaîne "vraie" dans un if !
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "", // secret : jamais loggé
  mailFrom: process.env.MAIL_FROM ?? "shub-index <no-reply@localhost>",
  appUrl: (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, ""), // adresse du site, pour les liens des emails
  resetTokenTtlMinutes: 30, // durée de validité d'un lien de réinitialisation

  // nom DuckDNS de la box : son IP publique compte aussi comme "réseau local" (hairpin NAT, cf. lib/network.ts)
  lanPublicHostname: process.env.LAN_PUBLIC_HOSTNAME ?? "",
};
