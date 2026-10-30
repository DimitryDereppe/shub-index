/**
 * Parseur de nom de fichier vidéo (logique pure, sans BDD ni réseau).
 *
 * Convention produite par organize.py sur le NAS (cf. clarifications § 8) :
 *   "Titre (Année) [Classification] - Réalisateur 1, Réalisateur 2.ext"
 *   "Titre (Année).ext"                      (Disney/Pixar)
 * avec deux suffixes parasites possibles : " (2)" (doublon) et " - Partie 2".
 */

/** Classifications françaises acceptées (même liste que le CHECK SQL de movie.certification). */
export const CERTIFICATIONS = ["TP", "10", "12", "16", "18"] as const;
export type Certification = (typeof CERTIFICATIONS)[number];

export interface ParsedFilename {
  title: string;
  year: number;
  certification: Certification | null;
  directors: string[];
}

// ^(titre le plus court possible) (année)( [classif])?( - reste)?$
// - "+?" (paresseux) : le titre s'arrête à la PREMIÈRE "(dddd)", donc un titre
//   qui contient " - " (Star Wars - Épisode I…) reste entier.
// - groupes nommés (?<nom>…) : on lit match.groups.title au lieu de match[1].
const FILENAME_REGEX =
  /^(?<title>.+?) \((?<year>\d{4})\)(?: \[(?<certification>[^\]]*)\])?(?: - (?<directors>.+))?$/;

// suffixes à retirer avant d'appliquer la regex principale
const DUPLICATE_SUFFIX = / \(\d{1,2}\)$/; // " (2)" — 1 ou 2 chiffres, pour ne pas manger une année
const PART_SUFFIX = / - Partie \d+$/i; // " - Partie 2"

/**
 * Déduit titre, année, classification et réalisateurs d'un nom de fichier.
 * @param filename nom du fichier AVEC son extension (ex. "Alien 3 (1992) [16] - David Fincher.mkv")
 * @returns les informations lues, ou null si le nom ne suit pas la convention
 */
export function parseFilename(filename: string): ParsedFilename | null {
  // 1. retirer l'extension (".mkv") : tout ce qui suit le dernier point
  const lastDot = filename.lastIndexOf(".");
  let base = lastDot > 0 ? filename.slice(0, lastDot) : filename;

  // 2. retirer les suffixes parasites (dans n'importe quel ordre, d'où la boucle)
  let previous;
  do {
    previous = base;
    base = base.replace(DUPLICATE_SUFFIX, "").replace(PART_SUFFIX, "");
  } while (base !== previous);

  // 3. appliquer la regex : pas de correspondance → nom non reconnu
  const match = FILENAME_REGEX.exec(base.trim());
  if (!match?.groups) {
    return null;
  }

  const year = Number(match.groups.year);
  if (year < 1888 || year > 2100) {
    return null; // mêmes bornes que le CHECK SQL de movie.release_year
  }

  return {
    title: match.groups.title.trim(),
    year,
    certification: toCertification(match.groups.certification),
    directors: splitDirectors(match.groups.directors),
  };
}

/** "16" → "16" ; "" / "?" / undefined → null (valeur hors liste = inconnue). */
function toCertification(value: string | undefined): Certification | null {
  const trimmed = value?.trim() ?? "";
  return (CERTIFICATIONS as readonly string[]).includes(trimmed) ? (trimmed as Certification) : null;
}

/** "Joe Russo, Anthony Russo" → ["Joe Russo", "Anthony Russo"] ; absent → []. */
function splitDirectors(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "" && name !== "?");
}
