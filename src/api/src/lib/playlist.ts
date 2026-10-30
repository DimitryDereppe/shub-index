/**
 * Fabrication de la playlist .m3u qui ouvre un film dans VLC (US13).
 * Le navigateur télécharge le fichier, le système l'ouvre avec VLC,
 * et VLC lit la vidéo directement sur le NAS (smb://…).
 */

/**
 * @param title        texte affiché par VLC (ex. "Alien 3 (1992)")
 * @param relativePath chemin du fichier relatif à la racine du partage ("Films/…/x.mkv")
 * @param urlPrefix    début de l'URL réseau (PLAY_URL_PREFIX, ex. "smb://192.168.1.37/Shub-Niggurath")
 * @returns le contenu texte du fichier .m3u
 */
export function buildM3u(title: string, relativePath: string, urlPrefix: string): string {
  // encodeURIComponent sur CHAQUE segment : les espaces, [ ], accents… sont encodés,
  // mais pas les "/" qui séparent les dossiers (on les remet avec join).
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const prefix = urlPrefix.replace(/\/+$/, ""); // pas de "//" si le préfixe finit déjà par "/"

  // un titre ne doit pas pouvoir ajouter une ligne (= une autre URL) au fichier
  const safeTitle = title.replace(/[\r\n]+/g, " ");

  return `#EXTM3U\n#EXTINF:-1,${safeTitle}\n${prefix}/${encodedPath}\n`;
}

/** Nom proposé au téléchargement : on enlève les caractères interdits dans un nom de fichier. */
export function buildPlaylistFilename(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${cleaned || "film"}.m3u`;
}
