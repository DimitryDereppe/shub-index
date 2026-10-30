/**
 * Formes des réponses de l'API (cf. docs/conception/api-rest/endpoints.md et /api/docs).
 */

export type Role = "member" | "admin";
export type Certification = "TP" | "10" | "12" | "16" | "18";
export type MediaFileStatus = "pending" | "matched" | "unmatched" | "ignored";
export type ScanStatus = "running" | "success" | "failed";

export interface User {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  role: Role;
}

export interface PersonRef {
  id: number;
  name: string;
}

/** Saga = collection TMDB (Star Wars, Harry Potter…). */
export interface SagaRef {
  id: number;
  name: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

export interface MovieSummary {
  id: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  certification: Certification | null;
  posterUrl: string | null;
  genres: string[];
  directors: PersonRef[];
  saga: SagaRef | null;
  available: boolean;
}

export interface MovieDetail {
  id: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  runtime: number | null;
  certification: Certification | null;
  synopsis: string | null;
  posterUrl: string | null;
  tmdbId: number | null;
  canPlay: boolean;
  isFavorite: boolean; // le film est dans les favoris de l'utilisateur connecté
  genres: Array<{ id: number; name: string }>;
  directors: PersonRef[];
  saga: SagaRef | null;
  studios: Array<{ id: number; name: string }>; // sociétés de production (TMDB)
  cast: Array<PersonRef & { character: string | null; order: number }>;
  files: Array<{ id: number; path: string; sizeBytes: number }>;
}

/** Un film de l'historique (GET /me/history). */
export interface WatchedMovie extends MovieSummary {
  watchedAt: string;
}

/** Un film des favoris (GET /me/favorites). */
export interface FavoriteMovie extends MovieSummary {
  addedAt: string;
}

/** Nombre maximum de favoris (même règle que l'API). */
export const MAX_FAVORITES = 10;

export interface PersonDetail extends PersonRef {
  directed: MovieSummary[];
  played: Array<MovieSummary & { character: string | null }>;
}

export interface Genre {
  id: number;
  name: string;
  movieCount: number;
}

export interface MediaFile {
  id: number;
  path: string;
  filename: string;
  sizeBytes: number;
  status: MediaFileStatus;
  movieId: number | null;
  lastSeenAt: string;
}

export interface Scan {
  id: number;
  status: ScanStatus;
  startedAt: string;
  finishedAt: string | null;
  filesAdded: number;
  filesUpdated: number;
  filesRemoved: number;
  errorMessage: string | null;
  userId: number | null;
}

export interface AdminUser extends User {
  created_at: string;
}

export const CERTIFICATIONS: Certification[] = ["TP", "10", "12", "16", "18"];
