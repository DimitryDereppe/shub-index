/**
 * Fichiers à traiter (admin) : liste par statut (US26), association manuelle à un
 * film TMDB (US27) ou mise de côté (US28).
 */
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { api, errorMessage } from "../../api/client.ts";
import type { MediaFile, MediaFileStatus, Page } from "../../api/types.ts";
import { PaginationNav } from "../../components/PaginationNav.tsx";
import { ErrorMessage, Loading } from "../../components/Status.tsx";
import { useApi } from "../../hooks/useApi.ts";
import { formatSize } from "../../utils/format.ts";

const STATUS_LABELS: Record<MediaFileStatus, string> = {
  unmatched: "Non identifiés",
  pending: "En attente (TMDB indisponible)",
  ignored: "Ignorés",
  matched: "Identifiés",
};

export function MediaFilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get("status") ?? "unmatched") as MediaFileStatus;
  const page = searchParams.get("page") ?? "1";
  const files = useApi<Page<MediaFile>>(`/media-files?${new URLSearchParams({ status, page })}`);

  return (
    <>
      <h1>Fichiers du NAS</h1>
      <p>
        Un fichier non identifié n'apparaît pas dans la recherche. Cherchez le film sur TMDB, puis collez son
        identifiant (le nombre dans l'adresse : themoviedb.org/movie/<strong>9994</strong>-…).
      </p>

      <div className="field">
        <label htmlFor="status">Afficher</label>
        <select id="status" value={status} onChange={(event) => setSearchParams({ status: event.target.value })}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {files.status === "loading" && <Loading />}
      {files.status === "error" && <ErrorMessage message={files.error} />}
      {files.status === "success" &&
        (files.data.data.length === 0 ? (
          <p role="status">Aucun fichier dans cette catégorie. 🎉</p>
        ) : (
          <>
            <p>{files.data.pagination.total} fichier(s)</p>
            <ul className="file-admin-list">
              {files.data.data.map((file) => (
                <li key={file.id}>
                  <MediaFileItem file={file} onChange={files.reload} />
                </li>
              ))}
            </ul>
            <PaginationNav pagination={files.data.pagination} />
          </>
        ))}
    </>
  );
}

/** Un fichier + ses actions. `onChange` : prop d'intention, le parent recharge la liste. */
function MediaFileItem({ file, onChange }: { file: MediaFile; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // titre deviné depuis le nom de fichier, pour préparer la recherche TMDB
  const guessedTitle = file.filename.replace(/\.[^.]+$/, "").replace(/\s*\(\d{4}\).*$/, "");

  async function update(body: { tmdbId: number } | { status: "ignored" }) {
    setIsSending(true);
    setError(null);
    try {
      await api(`/media-files/${file.id}`, { method: "PATCH", body });
      onChange();
    } catch (caught) {
      setError(errorMessage(caught));
      setIsSending(false);
    }
  }

  function handleAssociate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tmdbId = Number(new FormData(event.currentTarget).get("tmdbId"));
    update({ tmdbId });
  }

  return (
    <article className="file-admin">
      <h2 className="file-admin__name">{file.filename}</h2>
      <p className="file-admin__path">
        <code>{file.path}</code> · {formatSize(file.sizeBytes)}
      </p>

      {file.status === "matched" && file.movieId ? (
        <Link to={`/films/${file.movieId}`}>Voir le film associé</Link>
      ) : (
        <div className="file-admin__actions">
          <form onSubmit={handleAssociate} className="inline-form">
            <label htmlFor={`tmdb-${file.id}`}>Identifiant TMDB</label>
            <input id={`tmdb-${file.id}`} name="tmdbId" type="number" min="1" required inputMode="numeric" />
            <button type="submit" className="button" disabled={isSending}>
              Associer
            </button>
          </form>
          <a
            href={`https://www.themoviedb.org/search/movie?query=${encodeURIComponent(guessedTitle)}`}
            target="_blank"
            rel="noreferrer"
          >
            Chercher « {guessedTitle} » sur TMDB <span className="visually-hidden">(nouvel onglet)</span>
          </a>
          {file.status !== "ignored" && (
            <button type="button" className="button button--ghost" onClick={() => update({ status: "ignored" })} disabled={isSending}>
              Ignorer <span className="visually-hidden">{file.filename}</span>
            </button>
          )}
        </div>
      )}
      {error && <ErrorMessage message={error} />}
    </article>
  );
}
