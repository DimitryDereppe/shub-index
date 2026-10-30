/**
 * Client de l'API TMDB (The Movie Database) : recherche d'un film et lecture
 * de sa fiche complète (crédits + classifications) en un seul appel.
 *
 * Mêmes appels que organize.py sur le NAS :
 *   GET /search/movie?query=…&year=…
 *   GET /movie/:id?append_to_response=credits,release_dates
 * Authentification : jeton "lecture" dans l'en-tête Authorization (Bearer).
 */
import { config } from "../../config.ts";
import { CERTIFICATIONS, type Certification } from "./filename-parser.ts";

// ---------------------------------------------------------------------------
// Formes des réponses TMDB (seulement les champs qu'on utilise)
// ---------------------------------------------------------------------------
export interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string; // "1992-05-22", parfois ""
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  runtime: number | null;
  overview: string;
  poster_path: string | null;
  genres: Array<{ id: number; name: string }>;
  // « collection » TMDB = la saga du film (Star Wars, Harry Potter…) ; null si le film n'en a pas
  belongs_to_collection?: { id: number; name: string; poster_path: string | null } | null;
  // sociétés de production (Marvel Studios, Warner Bros. Pictures…) = les « studios » du film
  production_companies?: Array<{ id: number; name: string }>;
  credits?: {
    cast: Array<{ id: number; name: string; character: string; order: number }>;
    crew: Array<{ id: number; name: string; job: string }>;
  };
  release_dates?: {
    results: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string }> }>;
  };
}

/** Film prêt à être enregistré en base (cf. catalog-import.service.ts). */
export interface MovieImport {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  runtime: number | null;
  certification: Certification | null;
  synopsis: string | null;
  posterUrl: string | null;
  genres: Array<{ tmdbId: number; name: string }>;
  saga: { tmdbId: number; name: string; posterUrl: string | null } | null;
  studios: Array<{ tmdbId: number; name: string }>;
  directors: Array<{ tmdbId: number; name: string }>;
  cast: Array<{ tmdbId: number; name: string; character: string | null; order: number }>;
}

// ---------------------------------------------------------------------------
// Erreurs : on distingue "film inexistant" (404) de "TMDB injoignable"
// ---------------------------------------------------------------------------
export class TmdbError extends Error {}
export class TmdbNotFoundError extends TmdbError {}

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342"; // w342 = largeur 342 px, suffisant pour une vignette

/**
 * Appel GET générique vers TMDB.
 * @throws TmdbNotFoundError si TMDB répond 404, TmdbError pour tout autre problème
 */
async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!config.tmdbToken) {
    throw new TmdbError("TMDB_TOKEN manquant dans la configuration");
  }

  // URL + searchParams : les valeurs (titre saisi…) sont encodées proprement, jamais concaténées
  const url = new URL(config.tmdbBaseUrl + path);
  url.searchParams.set("language", config.tmdbLanguage);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // 2 essais maximum : TMDB peut répondre 429 ("trop de requêtes") si on va trop vite
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.tmdbToken}`, accept: "application/json" },
        signal: AbortSignal.timeout(15_000), // abandonne après 15 s au lieu d'attendre indéfiniment
      });
    } catch {
      // réseau coupé, DNS, délai dépassé… (on ne recopie pas l'URL : elle pourrait contenir des données)
      throw new TmdbError("TMDB injoignable");
    }

    if (response.status === 429 && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000)); // on patiente 2 s puis on réessaie
      continue;
    }
    if (response.status === 404) {
      throw new TmdbNotFoundError("Film introuvable sur TMDB");
    }
    if (!response.ok) {
      throw new TmdbError(`TMDB a répondu ${response.status}`);
    }
    return (await response.json()) as T;
  }
  throw new TmdbError("TMDB : trop de requêtes");
}

/** Recherche par titre (+ année si connue). Résultats triés par pertinence par TMDB. */
export async function searchMovie(title: string, year: number | null): Promise<TmdbSearchResult[]> {
  const params: Record<string, string> = { query: title };
  if (year) {
    params.year = String(year);
  }
  const data = await tmdbGet<{ results: TmdbSearchResult[] }>("/search/movie", params);
  return data.results ?? [];
}

/** Fiche complète d'un film : genres, crédits (réalisateurs, acteurs) et classifications. */
export async function getMovieWithCredits(tmdbId: number): Promise<TmdbMovieDetails> {
  return tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, { append_to_response: "credits,release_dates" });
}

// ---------------------------------------------------------------------------
// Fonctions pures (testées dans tests/unit/tmdb.test.ts)
// ---------------------------------------------------------------------------

/** "1992-05-22" → 1992 ; "" → null */
export function yearOf(releaseDate: string | undefined): number | null {
  const year = Number(releaseDate?.slice(0, 4));
  return Number.isInteger(year) && year >= 1888 ? year : null;
}

/** Noms des réalisateurs d'une fiche TMDB (métier "Director" dans l'équipe technique). */
export function directorsOf(details: TmdbMovieDetails): Array<{ tmdbId: number; name: string }> {
  const directors = (details.credits?.crew ?? []).filter((member) => member.job === "Director");
  // un même réalisateur peut apparaître deux fois : on garde la 1ʳᵉ occurrence
  const unique = directors.filter((member, index) => directors.findIndex((d) => d.id === member.id) === index);
  return unique.map((member) => ({ tmdbId: member.id, name: member.name }));
}

/**
 * Classification française : "U" → "TP" (comme organize.py) ; hors liste → null.
 * Un film a souvent plusieurs sorties françaises (cinéma, DVD, ressortie...) :
 * on garde la note la PLUS STRICTE, pas la première trouvée.
 * CERTIFICATIONS est rangé du plus permissif au plus strict → sa position sert de niveau.
 */
export function frenchCertificationOf(details: TmdbMovieDetails): Certification | null {
  const france = details.release_dates?.results.find((entry) => entry.iso_3166_1 === "FR");
  let strictest: Certification | null = null;
  for (const release of france?.release_dates ?? []) {
    const value = release.certification.trim() === "U" ? "TP" : release.certification.trim();
    if (!(CERTIFICATIONS as readonly string[]).includes(value)) continue;
    const certification = value as Certification;
    if (strictest === null || CERTIFICATIONS.indexOf(certification) > CERTIFICATIONS.indexOf(strictest)) {
      strictest = certification;
    }
  }
  return strictest;
}

/** Studios (sociétés de production TMDB) du film, sans doublon ; [] si TMDB n'en donne pas. */
export function studiosOf(details: TmdbMovieDetails): MovieImport["studios"] {
  const companies = details.production_companies ?? [];
  // un même studio peut apparaître deux fois : on garde la 1ʳᵉ occurrence (comme directorsOf)
  const unique = companies.filter((company, index) => companies.findIndex((c) => c.id === company.id) === index);
  return unique.map((company) => ({ tmdbId: company.id, name: company.name }));
}

/** Saga (collection TMDB) du film, ou null s'il n'en fait pas partie. */
export function sagaOf(details: TmdbMovieDetails): MovieImport["saga"] {
  const collection = details.belongs_to_collection;
  if (!collection) {
    return null;
  }
  return {
    tmdbId: collection.id,
    name: collection.name,
    posterUrl: collection.poster_path ? POSTER_BASE_URL + collection.poster_path : null,
  };
}

/**
 * "Étienne Chatiliez" → "etiennechatiliez" : minuscules, sans accents ni ponctuation,
 * pour comparer des noms écrits un peu différemment.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD") // "é" devient "e" + accent séparé…
    .replace(/[̀-ͯ]/g, "") // …qu'on supprime
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// débuts de titres français qui manquent souvent sur TMDB ("Les Aventures de Bernard et Bianca…")
const OPTIONAL_TITLE_PREFIXES = [/^les nouvelles aventures de /i, /^les aventures de /i];

/**
 * Textes à essayer, dans l'ordre, pour retrouver un titre sur TMDB quand le nom
 * de fichier diffère un peu du titre TMDB (cas réels du NAS) :
 * 1. le titre tel quel ;
 * 2. sans les " - " ("Spider-Man - Homecoming" : le tiret remplace un ":" interdit) ;
 * 3. la partie avant le 1er " - " ("Underworld 3 - la Rébellion…" → "Underworld 3") ;
 * 4. sans "Les Aventures de" en tête ;
 * 5. premier mot au singulier ("Frères des Ours" → "Frère des Ours").
 * Les variantes larges (3, 4, 5) ne sont sûres que parce que l'appelant vérifie
 * ensuite l'année et le réalisateur du film trouvé.
 */
export function titleVariants(title: string): string[] {
  const variants = [title];

  if (title.includes(" - ")) {
    variants.push(title.replaceAll(" - ", " "));
    variants.push(title.split(" - ")[0]);
  }
  for (const prefix of OPTIONAL_TITLE_PREFIXES) {
    if (prefix.test(title)) {
      variants.push(title.replace(prefix, ""));
    }
  }
  const [firstWord, ...otherWords] = title.split(" ");
  if (firstWord.length > 3 && firstWord.endsWith("s") && otherWords.length > 0) {
    variants.push([firstWord.slice(0, -1), ...otherWords].join(" "));
  }

  // new Set : retire les doublons ; filter : une variante de moins de 3 lettres trouverait n'importe quoi
  return [...new Set(variants.map((variant) => variant.trim()))].filter((variant) => variant.length >= 3);
}

/** Au moins un réalisateur du nom de fichier se retrouve-t-il sur la fiche TMDB ? */
export function directorsMatch(fromFilename: string[], fromTmdb: string[]): boolean {
  const tmdbNames = new Set(fromTmdb.map(normalizeName));
  return fromFilename.some((name) => tmdbNames.has(normalizeName(name)));
}

/**
 * Transforme une fiche TMDB en film prêt à importer.
 * @param castLimit nombre d'acteurs gardés (les premiers du générique)
 */
export function toMovieImport(details: TmdbMovieDetails, castLimit: number): MovieImport {
  // un acteur qui joue deux personnages apparaît deux fois → une seule ligne "A / B"
  // (la clé primaire de movie_cast est (movie_id, person_id))
  const castByPerson = new Map<number, MovieImport["cast"][number]>();
  const sortedCast = [...(details.credits?.cast ?? [])].sort((a, b) => a.order - b.order);
  for (const member of sortedCast) {
    const existing = castByPerson.get(member.id);
    if (existing) {
      existing.character = [existing.character, member.character].filter(Boolean).join(" / ") || null;
    } else if (castByPerson.size < castLimit) {
      castByPerson.set(member.id, {
        tmdbId: member.id,
        name: member.name,
        character: member.character || null,
        order: castByPerson.size, // 0, 1, 2… sans trous
      });
    }
  }

  return {
    tmdbId: details.id,
    title: details.title,
    originalTitle: details.original_title && details.original_title !== details.title ? details.original_title : null,
    releaseYear: yearOf(details.release_date),
    runtime: details.runtime && details.runtime > 0 ? details.runtime : null,
    certification: frenchCertificationOf(details),
    synopsis: details.overview || null,
    posterUrl: details.poster_path ? POSTER_BASE_URL + details.poster_path : null,
    genres: details.genres.map((genre) => ({ tmdbId: genre.id, name: genre.name })),
    saga: sagaOf(details),
    studios: studiosOf(details),
    directors: directorsOf(details),
    cast: [...castByPerson.values()],
  };
}
