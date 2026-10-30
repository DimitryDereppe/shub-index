/**
 * Bouton ☆/★ de la fiche film : ajoute ou retire le film des favoris.
 * PUT /me/favorites/:id pour ajouter, DELETE pour retirer.
 */
import { useState } from "react";
import { api, errorMessage } from "../api/client.ts";
import { ErrorMessage } from "./Status.tsx";

interface FavoriteButtonProps {
  movieId: number;
  initialIsFavorite: boolean; // valeur reçue avec la fiche (GET /movies/:id → isFavorite)
}

export function FavoriteButton({ movieId, initialIsFavorite }: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setIsSending(true);
    setError(null);
    try {
      await api(`/me/favorites/${movieId}`, { method: isFavorite ? "DELETE" : "PUT" });
      setIsFavorite(!isFavorite);
    } catch (caught) {
      setError(errorMessage(caught)); // ex. 409 : « 10 favoris maximum »
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {/* aria-pressed : un lecteur d'écran annonce « bouton bascule, enfoncé / non enfoncé » */}
      <button type="button" className="button button--ghost" aria-pressed={isFavorite} onClick={toggle} disabled={isSending}>
        <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
        {isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
      </button>
      {error && <ErrorMessage message={error} />}
    </>
  );
}
