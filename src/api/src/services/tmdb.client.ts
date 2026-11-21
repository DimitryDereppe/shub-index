/**
 * Client de l'API TMDB (The Movie Database) : recherche d'un film et lecture
 * de sa fiche complète (crédits + classifications) en un seul appel.
 *
 * Mêmes appels que organize.py sur le NAS :
 *   GET /search/movie?query=…&year=…
 *   GET /movie/:id?append_to_response=credits,release_dates
 * Plus, pour la recherche Prime Video (films absents du NAS compris) :
 *   GET /discover/movie?watch_region=FR&with_watch_providers=…
 *   GET /movie/:id/watch/providers
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

/** Film ou série dans une liste TMDB (recherche, découverte). Les séries ont name au lieu de title. */
export interface TmdbListItem {
  id: number;
  title?: string; // film
  original_title?: string;
  release_date?: string;
  name?: string; // série
  original_name?: string;
  first_air_date?: string;
  genre_ids?: number[];
  overview: string;
  poster_path: string | null;
}

/** "movie" = films, "tv" = séries (mêmes mots que dans les URL TMDB). */
export type MediaType = "movie" | "tv";
export const MEDIA_TYPES: MediaType[] = ["movie", "tv"];

/** Une page de résultats TMDB (20 films, 500 pages au maximum). */
export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

/**
 * Plateformes où voir le film, par pays (données JustWatch fournies par TMDB).
 * flatrate = inclus dans l'abonnement ; rent / buy = location / achat.
 */
export interface TmdbWatchProviders {
  results?: Record<string, { link?: string; flatrate?: Array<{ provider_id: number; provider_name: string }> }>;
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
// Disponibilité sur Prime Video
// ---------------------------------------------------------------------------

/** Pays de la recherche Prime Video (le catalogue change d'un pays à l'autre). */
export const WATCH_REGION = "FR";

/** Prime Video inclus dans l'abonnement : 119 = Amazon Prime Video, 2100 = formule avec pubs. */
export const PRIME_VIDEO_PROVIDER_IDS = [119, 2100];

/** Critères de la recherche Prime Video (les mêmes que la recherche du catalogue). */
export interface PrimeVideoFilters {
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  genreIds: number[]; // ids TMDB : le titre doit avoir TOUS ces genres
  castId?: number; // films seulement (TMDB ne filtre pas les séries par personne)
  crewId?: number; // films seulement ; « crew » = toute l'équipe technique (production comprise)
  maxCertification?: Certification; // films seulement (pas de classification des séries sur /discover)
  sort: PrimeVideoSort;
}

/** Tris proposés → valeur sort_by de TMDB, pour les films et pour les séries. */
export const PRIME_VIDEO_SORTS = {
  popularity: { movie: "popularity.desc", tv: "popularity.desc" },
  "-year": { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
  year: { movie: "primary_release_date.asc", tv: "first_air_date.asc" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
  title: { movie: "title.asc", tv: "name.asc" },
} as const;
export type PrimeVideoSort = keyof typeof PRIME_VIDEO_SORTS;

// classification française « TP » = « U » chez TMDB ; les autres sont identiques
const TMDB_FR_CERTIFICATIONS: Record<Certification, string> = { TP: "U", "10": "10", "12": "12", "16": "16", "18": "18" };

// en dessous, une note moyenne ne veut rien dire (un seul vote à 10/10 passerait en tête)
const MIN_VOTES_FOR_RATING_SORT = "200";

/**
 * Paramètres de /discover pour Prime Video en France + les critères choisis.
 * Fonction pure (testée) : discoverPrimeVideo se contente de l'appeler.
 */
export function discoverParams(type: MediaType, filters: PrimeVideoFilters): Record<string, string> {
  const dateField = type === "movie" ? "primary_release_date" : "first_air_date";
  const params: Record<string, string> = {
    watch_region: WATCH_REGION,
    with_watch_providers: PRIME_VIDEO_PROVIDER_IDS.join("|"), // "|" = OU pour TMDB
    with_watch_monetization_types: "flatrate", // abonnement seulement, pas la location ni l'achat
    sort_by: PRIME_VIDEO_SORTS[filters.sort][type],
  };

  if (filters.year) params[type === "movie" ? "primary_release_year" : "first_air_date_year"] = String(filters.year);
  if (filters.yearFrom) params[`${dateField}.gte`] = `${filters.yearFrom}-01-01`;
  if (filters.yearTo) params[`${dateField}.lte`] = `${filters.yearTo}-12-31`;
  if (filters.genreIds.length > 0) params.with_genres = filters.genreIds.join(","); // "," = ET pour TMDB
  if (filters.sort === "rating") params["vote_count.gte"] = MIN_VOTES_FOR_RATING_SORT;

  if (type === "movie") {
    if (filters.castId) params.with_cast = String(filters.castId);
    if (filters.crewId) params.with_crew = String(filters.crewId);
    if (filters.maxCertification) {
      params.certification_country = "FR";
      params["certification.lte"] = TMDB_FR_CERTIFICATIONS[filters.maxCertification];
    }
  }
  return params;
}

/** Films ou séries inclus dans Prime Video en France, filtrés et triés. */
export async function discoverPrimeVideo(
  type: MediaType,
  filters: PrimeVideoFilters,
  page: number
): Promise<TmdbPage<TmdbListItem>> {
  return tmdbGet<TmdbPage<TmdbListItem>>(`/discover/${type}`, { ...discoverParams(type, filters), page: String(page) });
}

/** Recherche de films ou de séries par titre, une page de résultats complets (affiche, résumé). */
export async function searchTitlePage(
  type: MediaType,
  query: string,
  year: number | undefined,
  page: number
): Promise<TmdbPage<TmdbListItem>> {
  const params: Record<string, string> = { query, page: String(page) };
  if (year) params[type === "movie" ? "primary_release_year" : "first_air_date_year"] = String(year);
  return tmdbGet<TmdbPage<TmdbListItem>>(`/search/${type}`, params);
}

/** Plateformes où voir un film ou une série, pour tous les pays. */
export async function getWatchProviders(type: MediaType, tmdbId: number): Promise<TmdbWatchProviders> {
  return tmdbGet<TmdbWatchProviders>(`/${type}/${tmdbId}/watch/providers`);
}

/** Genres TMDB des films ou des séries (les deux listes diffèrent : « Action & Adventure » côté séries). */
export async function getGenres(type: MediaType): Promise<Array<{ id: number; name: string }>> {
  const data = await tmdbGet<{ genres: Array<{ id: number; name: string }> }>(`/genre/${type}/list`);
  return data.genres ?? [];
}

/** Id TMDB de la personne la plus connue portant ce nom, ou null si personne. */
export async function findPersonId(name: string): Promise<number | null> {
  const data = await tmdbGet<{ results: Array<{ id: number }> }>("/search/person", { query: name });
  return data.results?.[0]?.id ?? null; // TMDB trie par popularité
}

/** Ids TMDB des films RÉALISÉS par cette personne (with_crew compte aussi la production, l'écriture…). */
export async function getDirectedMovieIds(personId: number): Promise<Set<number>> {
  const data = await tmdbGet<{ crew: Array<{ id: number; job: string }> }>(`/person/${personId}/movie_credits`);
  return new Set((data.crew ?? []).filter((member) => member.job === "Director").map((member) => member.id));
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
 * Notes de chaque pays traduites en classification française.
 * La France seule est trop laxiste (Alien, Matrix, Terminator en -12 ou TP) :
 * on la compare à l'Allemagne (FSK), au Royaume-Uni (BBFC) et aux Pays-Bas (Kijkwijzer).
 */
const COUNTRY_SCALES: Record<string, Record<string, Certification>> = {
  FR: { U: "TP", TP: "TP", "10": "10", "12": "12", "16": "16", "18": "18" },
  DE: { "0": "TP", "6": "TP", "12": "12", "16": "16", "18": "18" },
  GB: { U: "TP", PG: "TP", "12A": "12", "12": "12", "15": "16", "18": "18", R18: "18" },
  NL: { AL: "TP", "6": "TP", "9": "10", "12": "12", "14": "16", "16": "16", "18": "18" },
};

/**
 * Classification d'un pays, traduite à l'échelle française ; null si le pays n'a pas de note connue.
 * Un film a souvent plusieurs sorties (cinéma, DVD, ressortie...) :
 * on garde la note la PLUS STRICTE, pas la première trouvée.
 * CERTIFICATIONS est rangé du plus permissif au plus strict → sa position sert de niveau.
 */
export function countryCertificationOf(details: TmdbMovieDetails, country: string): Certification | null {
  const scale = COUNTRY_SCALES[country];
  const entry = details.release_dates?.results.find((result) => result.iso_3166_1 === country);
  let strictest: Certification | null = null;
  for (const release of entry?.release_dates ?? []) {
    const certification = scale?.[release.certification.trim()];
    if (!certification) continue;
    if (strictest === null || CERTIFICATIONS.indexOf(certification) > CERTIFICATIONS.indexOf(strictest)) {
      strictest = certification;
    }
  }
  return strictest;
}

/** Classification française seule (la plus stricte des sorties françaises). */
export function frenchCertificationOf(details: TmdbMovieDetails): Certification | null {
  return countryCertificationOf(details, "FR");
}

/**
 * Classification retenue pour le catalogue : médiane des pays connus (FR, DE, GB, NL).
 * Avec un nombre pair de pays, on prend la plus stricte des deux du milieu.
 * La médiane écarte une note isolée trop basse (France) ou trop haute (une sortie DVD).
 * Ex. Alien : FR 12, DE 16, GB 18, NL 16 → 16.
 */
export function certificationOf(details: TmdbMovieDetails): Certification | null {
  const levels = Object.keys(COUNTRY_SCALES)
    .map((country) => countryCertificationOf(details, country))
    .filter((certification) => certification !== null)
    .map((certification) => CERTIFICATIONS.indexOf(certification))
    .sort((a, b) => a - b);
  if (levels.length === 0) return null;
  return CERTIFICATIONS[levels[Math.floor(levels.length / 2)]];
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
    posterUrl: posterUrlOf(collection.poster_path),
  };
}

/** Le film est-il inclus dans l'abonnement Prime Video dans ce pays ? */
export function isOnPrimeVideo(providers: TmdbWatchProviders, region: string = WATCH_REGION): boolean {
  const flatrate = providers.results?.[region]?.flatrate ?? [];
  return flatrate.some((provider) => PRIME_VIDEO_PROVIDER_IDS.includes(provider.provider_id));
}

/**
 * Avec un titre, TMDB ne filtre que l'année exacte : la période et les genres
 * sont vérifiés ici, sur les résultats de la recherche.
 */
export function matchesFilters(item: TmdbListItem, filters: Pick<PrimeVideoFilters, "yearFrom" | "yearTo" | "genreIds">): boolean {
  const year = yearOf(item.release_date ?? item.first_air_date);
  if ((filters.yearFrom || filters.yearTo) && year === null) return false;
  if (filters.yearFrom && year !== null && year < filters.yearFrom) return false;
  if (filters.yearTo && year !== null && year > filters.yearTo) return false;
  const genreIds = item.genre_ids ?? [];
  return filters.genreIds.every((id) => genreIds.includes(id));
}

/** "/abc.jpg" → URL complète de l'affiche ; null si TMDB n'en a pas. */
export function posterUrlOf(posterPath: string | null | undefined): string | null {
  return posterPath ? POSTER_BASE_URL + posterPath : null;
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
    certification: certificationOf(details),
    synopsis: details.overview || null,
    posterUrl: posterUrlOf(details.poster_path),
    genres: details.genres.map((genre) => ({ tmdbId: genre.id, name: genre.name })),
    saga: sagaOf(details),
    studios: studiosOf(details),
    directors: directorsOf(details),
    cast: [...castByPerson.values()],
  };
}
