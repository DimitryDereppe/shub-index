/**
 * Appels à l'API avec fetch.
 *
 * - Le client et l'API sont sur la même origine ("/api") : les cookies httpOnly
 *   (accessToken, refreshToken) partent tout seuls, le JavaScript ne les voit jamais.
 * - L'accessToken expire au bout d'1 h : sur une réponse 401, on demande UNE fois
 *   de nouveaux cookies (POST /auth/refresh) puis on rejoue la requête.
 */

/** Erreur renvoyée par l'API : code HTTP + message lisible ({ error: "…" }). */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown; // objet JS, envoyé en JSON
  signal?: AbortSignal; // pour annuler la requête (cleanup d'un useEffect)
}

// routes pour lesquelles un 401 ne doit PAS déclencher de refresh (sinon boucle ou contresens)
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh"];

// Une seule demande de refresh à la fois : si 3 requêtes reçoivent 401 en même temps,
// elles attendent toutes la MÊME promesse. Sinon le 2ᵉ refresh réutiliserait un jeton
// déjà consommé, et l'API (détection de réutilisation) révoquerait la session.
let refreshInProgress: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  refreshInProgress ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInProgress = null;
    });
  return refreshInProgress;
}

function send(path: string, options: RequestOptions): Promise<Response> {
  return fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
}

/**
 * Appelle l'API et renvoie le JSON de la réponse.
 * @example const movies = await api<Page<MovieSummary>>("/movies?q=alien");
 * @throws ApiError si la réponse n'est pas "ok" (4xx, 5xx)
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    if (await refreshTokens()) {
      response = await send(path, options); // nouveaux cookies → on rejoue la requête
    }
  }

  if (!response.ok) {
    // l'API renvoie toujours { error: "message" } ; repli si le corps n'est pas du JSON
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error ?? `Erreur ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T; // 204 = pas de contenu
  }
  return response.json();
}

/** Message affichable pour n'importe quelle erreur attrapée dans un catch. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Le serveur ne répond pas. Réessayez dans un instant.";
}
