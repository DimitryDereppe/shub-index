/**
 * Hook personnalisé : charge une ressource de l'API au montage du composant
 * et chaque fois que `path` change (ex. nouvelle page de résultats).
 *
 * Même schéma que dans les exercices SC06 : useEffect + AbortController
 * (cleanup) + statut "loading" | "success" | "error".
 */
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api/client.ts";

type State<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

/**
 * @param path chemin de l'API ("/movies/42"), ou null pour ne rien charger
 * @returns l'état de la requête + reload() pour recharger (après une modification)
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);
  // useRef : mémorise le dernier chemin chargé sans provoquer de nouveau rendu
  const loadedPath = useRef<string | null>(null);

  useEffect(() => {
    if (path === null) {
      return;
    }
    // si le composant disparaît ou si `path` change avant la réponse, on annule la requête :
    // une vieille réponse ne viendra pas écraser la nouvelle
    const controller = new AbortController();
    // nouveau chemin → "Chargement…" ; simple reload() → on garde l'affichage actuel
    // jusqu'à la réponse (pas de clignotement pendant le suivi d'une indexation)
    if (loadedPath.current !== path) {
      setState({ status: "loading" });
      loadedPath.current = path;
    }

    api<T>(path, { signal: controller.signal })
      .then((data) => setState({ status: "success", data }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", error: errorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [path, reloadCount]);

  return { ...state, reload: () => setReloadCount((count) => count + 1) };
}
