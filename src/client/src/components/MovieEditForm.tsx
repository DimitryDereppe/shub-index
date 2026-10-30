/**
 * Formulaire de correction d'un film par l'admin (US29) → PATCH /movies/:id.
 * Seuls les champs modifiés sont envoyés.
 */
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client.ts";
import { CERTIFICATIONS, type MovieDetail } from "../api/types.ts";
import { CERTIFICATION_LABELS } from "./CertificationBadge.tsx";
import { ErrorMessage } from "./Status.tsx";

interface MovieEditFormProps {
  movie: MovieDetail;
  onDone: () => void; // intention : "c'est enregistré" (le parent recharge la fiche)
  onCancel: () => void;
}

export function MovieEditForm({ movie, onDone, onCancel }: MovieEditFormProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    // texte vide → null ; nombre → Number
    const text = (name: string) => String(form.get(name) ?? "").trim() || null;
    const number = (name: string) => (text(name) === null ? null : Number(text(name)));
    const values = {
      title: text("title") ?? movie.title,
      originalTitle: text("originalTitle"),
      releaseYear: number("releaseYear"),
      runtime: number("runtime"),
      certification: text("certification"),
      synopsis: text("synopsis"),
    };

    // on n'envoie que ce qui a changé
    const changes = Object.fromEntries(
      Object.entries(values).filter(([key, value]) => value !== movie[key as keyof typeof values])
    );
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }

    try {
      await api(`/movies/${movie.id}`, { method: "PATCH", body: changes });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <div className="field">
        <label htmlFor="edit-title">Titre</label>
        <input id="edit-title" name="title" defaultValue={movie.title} required maxLength={255} />
      </div>
      <div className="field">
        <label htmlFor="edit-original">Titre original</label>
        <input id="edit-original" name="originalTitle" defaultValue={movie.originalTitle ?? ""} maxLength={255} />
      </div>
      <div className="field">
        <label htmlFor="edit-year">Année</label>
        <input id="edit-year" name="releaseYear" type="number" min="1888" max="2100" defaultValue={movie.releaseYear ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="edit-runtime">Durée (minutes)</label>
        <input id="edit-runtime" name="runtime" type="number" min="1" max="1000" defaultValue={movie.runtime ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="edit-cert">Classification</label>
        <select id="edit-cert" name="certification" defaultValue={movie.certification ?? ""}>
          <option value="">Inconnue</option>
          {CERTIFICATIONS.map((certification) => (
            <option key={certification} value={certification}>
              {CERTIFICATION_LABELS[certification]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="edit-synopsis">Synopsis</label>
        <textarea id="edit-synopsis" name="synopsis" rows={5} defaultValue={movie.synopsis ?? ""} maxLength={5000} />
      </div>
      {error && <ErrorMessage message={error} />}
      <div className="search-form__actions">
        <button type="submit" className="button">
          Enregistrer
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
