/**
 * Recherche des films et séries inclus dans l'abonnement Prime Video en France
 * (sans location, achat ni chaîne Amazon payante en plus), présents sur le NAS ou non.
 *
 * - Sans titre : /discover de TMDB, déjà filtré sur Prime Video, fait aussi tous
 *   les autres filtres (années, genres, personnes, classification) et le tri.
 * - Avec titre : /discover ne sait pas chercher par titre → on cherche le titre
 *   (une page de 20 résultats, triés par pertinence), on applique la période et
 *   les genres ici (matchesFilters), puis on ne garde que ceux que Prime Video
 *   propose (un appel /watch/providers par résultat, lancés en parallèle).
 *   Une page peut donc contenir moins de 20 résultats, voire aucun.
 *   Personnes, classification et tri ne s'appliquent pas avec un titre.
 * - Réalisateur : TMDB (with_crew) garde aussi les films qu'il a seulement produits
 *   ou écrits → on retire ici ceux qu'il n'a pas réalisés (page parfois incomplète).
 */
import {
  discoverPrimeVideo,
  findPersonId,
  getDirectedMovieIds,
  getWatchProviders,
  isOnPrimeVideo,
  matchesFilters,
  searchTitlePage,
  type MediaType,
  type PrimeVideoFilters,
  type TmdbListItem,
} from "./tmdb.client.ts";

/** TMDB refuse les pages au-delà de 500. */
export const TMDB_MAX_PAGE = 500;

export interface PrimeVideoCriteria extends Omit<PrimeVideoFilters, "castId" | "crewId"> {
  q?: string;
  actor?: string; // nom saisi, traduit en id TMDB ici
  director?: string;
}

export interface PrimeVideoPage {
  items: TmdbListItem[];
  page: number;
  totalPages: number;
  totalResults: number; // résultats TMDB examinés (avec titre : avant les filtres)
}

const EMPTY_PAGE = { items: [], totalPages: 0, totalResults: 0 };

export async function searchPrimeVideo(type: MediaType, criteria: PrimeVideoCriteria, page: number): Promise<PrimeVideoPage> {
  const { q, actor, director, ...filters } = criteria;

  if (q) {
    const tmdbPage = await searchTitlePage(type, q, filters.year, page);
    const candidates = tmdbPage.results.filter((item) => matchesFilters(item, filters));
    const providers = await Promise.all(candidates.map((item) => getWatchProviders(type, item.id)));
    return {
      items: candidates.filter((_, index) => isOnPrimeVideo(providers[index])),
      page: tmdbPage.page,
      totalPages: Math.min(tmdbPage.total_pages, TMDB_MAX_PAGE),
      totalResults: tmdbPage.total_results,
    };
  }

  // personnes : films seulement (TMDB ne sait pas filtrer les séries par acteur)
  let castId: number | undefined;
  let crewId: number | undefined;
  if (type === "movie") {
    const [actorId, directorId] = await Promise.all([
      actor ? findPersonId(actor) : undefined,
      director ? findPersonId(director) : undefined,
    ]);
    // nom inconnu de TMDB → aucun résultat (plutôt que d'ignorer le critère en silence)
    if (actorId === null || directorId === null) return { ...EMPTY_PAGE, page };
    castId = actorId;
    crewId = directorId;
  }

  const [tmdbPage, directed] = await Promise.all([
    discoverPrimeVideo(type, { ...filters, castId, crewId }, page),
    crewId ? getDirectedMovieIds(crewId) : undefined,
  ]);
  return {
    items: directed ? tmdbPage.results.filter((item) => directed.has(item.id)) : tmdbPage.results,
    page: tmdbPage.page,
    totalPages: Math.min(tmdbPage.total_pages, TMDB_MAX_PAGE),
    totalResults: tmdbPage.total_results,
  };
}
