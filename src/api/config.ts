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
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "*",

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
  // nom DuckDNS de la box : son IP publique compte aussi comme "réseau local" (hairpin NAT, cf. lib/network.ts)
  lanPublicHostname: process.env.LAN_PUBLIC_HOSTNAME ?? "",
};
