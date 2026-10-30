/**
 * Fiche d'un film (US08, US09, US13/US14, US29 pour l'admin).
 */
import { useState } from "react";
import { Link, useParams } from "react-router";
import type { MovieDetail } from "../api/types.ts";
import { CertificationBadge } from "../components/CertificationBadge.tsx";
import { FavoriteButton } from "../components/FavoriteButton.tsx";
import { MovieEditForm } from "../components/MovieEditForm.tsx";
import { ErrorMessage, Loading } from "../components/Status.tsx";
import { useAuth } from "../context/AuthContext.tsx";
import { useApi } from "../hooks/useApi.ts";
import { formatSize } from "../utils/format.ts";

export function MoviePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const movie = useApi<MovieDetail>(`/movies/${id}`);
  const [isEditing, setIsEditing] = useState(false);

  if (movie.status === "loading") {
    return <Loading />;
  }
  if (movie.status === "error") {
    return (
      <>
        <h1>Film introuvable</h1>
        <ErrorMessage message={movie.error} />
        <Link to="/">← Retour à la recherche</Link>
      </>
    );
  }

  const film = movie.data;
  return (
    <article className="movie">
      <Link to="/" className="back-link" onClick={(event) => {
        // revenir à la recherche précédente (avec ses critères) si on vient de là
        if (window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
      }}>
        ← Retour aux résultats
      </Link>

      <div className="movie__layout">
        {film.posterUrl && (
          <img className="movie__poster" src={film.posterUrl} alt={`Affiche de ${film.title}`} width="342" height="513" />
        )}

        <div className="movie__info">
          <h1>
            {film.title} {film.releaseYear && <span className="movie__year">({film.releaseYear})</span>}
          </h1>
          {film.originalTitle && <p className="movie__original">Titre original : {film.originalTitle}</p>}

          {/* key : si on passe d'un film à l'autre, le bouton repart de la valeur du nouveau film */}
          <p>
            <FavoriteButton key={film.id} movieId={film.id} initialIsFavorite={film.isFavorite} />
          </p>

          <p className="movie__meta">
            {film.certification && <CertificationBadge value={film.certification} />}
            {film.runtime && <span>{film.runtime} min</span>}
            {film.genres.length > 0 && <span>{film.genres.map((genre) => genre.name).join(" · ")}</span>}
          </p>

          {film.saga && (
            <p>
              Saga : <Link to={`/?saga=${film.saga.id}`}>{film.saga.name}</Link>
            </p>
          )}

          {film.studios.length > 0 && (
            <p>
              Studios :{" "}
              {film.studios.map((studio, index) => (
                <span key={studio.id}>
                  {index > 0 && ", "}
                  {/* encodeURIComponent : « Warner Bros. Pictures » devient un paramètre d'URL valide */}
                  <Link to={`/?q=${encodeURIComponent(studio.name)}`}>{studio.name}</Link>
                </span>
              ))}
            </p>
          )}

          {film.directors.length > 0 && (
            <p>
              Réalisation :{" "}
              {film.directors.map((director, index) => (
                <span key={director.id}>
                  {index > 0 && ", "}
                  <Link to={`/personnes/${director.id}`}>{director.name}</Link>
                </span>
              ))}
            </p>
          )}

          {film.synopsis && <p className="movie__synopsis">{film.synopsis}</p>}

          {!film.onLocalNetwork ? (
            <p className="field__help">
              Les fichiers du NAS et la lecture dans VLC ne sont visibles que depuis le réseau local (ou le VPN).
            </p>
          ) : (
            <section aria-labelledby="files-title" className="movie__files">
              <h2 id="files-title">Sur le NAS</h2>
              {film.files.length === 0 ? (
                <p>Aucun fichier : le film a été retiré du partage.</p>
              ) : (
                <ul className="file-list">
                  {film.files.map((file) => (
                    <li key={file.id} className="file-list__item">
                      <code className="file-list__path">{file.path}</code>
                      <span className="file-list__size">{formatSize(file.sizeBytes)}</span>
                      <span className="file-list__actions">
                        <CopyButton text={file.path} />
                        {/* canPlay n'est qu'un confort d'affichage : l'API revérifie le réseau (RG10) */}
                        {film.canPlay && (
                          <a className="button" href={`/api/media-files/${file.id}/playlist`} download>
                            ▶ Lire dans VLC
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {film.cast.length > 0 && (
        <section aria-labelledby="cast-title">
          <h2 id="cast-title">Distribution</h2>
          <ul className="cast-list">
            {film.cast.map((member) => (
              <li key={member.id}>
                <Link to={`/personnes/${member.id}`}>{member.name}</Link>
                {member.character && <span className="cast-list__character"> — {member.character}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {user?.role === "admin" && (
        <section aria-labelledby="admin-title" className="admin-box">
          <h2 id="admin-title">Administration</h2>
          {film.tmdbId && (
            <p>
              Fiche TMDB n°{film.tmdbId} —{" "}
              <a href={`https://www.themoviedb.org/movie/${film.tmdbId}`} target="_blank" rel="noreferrer">
                voir sur TMDB <span className="visually-hidden">(nouvel onglet)</span>
              </a>
            </p>
          )}
          {isEditing ? (
            <MovieEditForm
              movie={film}
              onDone={() => {
                setIsEditing(false);
                movie.reload();
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <button type="button" className="button button--ghost" onClick={() => setIsEditing(true)}>
              Corriger les informations
            </button>
          )}
        </section>
      )}
    </article>
  );
}

/** Copie le chemin dans le presse-papiers, pour le coller dans l'explorateur (US09). */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers refusé (HTTP non sécurisé…) : l'utilisateur peut toujours sélectionner le texte
    }
  }

  return (
    <button type="button" className="button button--ghost" onClick={copy}>
      {copied ? "Copié ✓" : "Copier le chemin"}
      <span className="visually-hidden" role="status">
        {copied ? "Chemin copié" : ""}
      </span>
    </button>
  );
}
