/**
 * Carte d'un film dans une liste de résultats (recherche, fiche personne).
 */
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { MovieSummary } from "../api/types.ts";
import { CertificationBadge } from "./CertificationBadge.tsx";

interface MovieCardProps {
  movie: MovieSummary;
  character?: string | null; // personnage joué (fiche d'un acteur)
}

export function MovieCard({ movie, character }: MovieCardProps) {
  return (
    <article className="movie-card">
      {movie.posterUrl ? (
        // loading="lazy" : l'affiche n'est téléchargée que si elle arrive à l'écran (éco-conception)
        <img className="movie-card__poster" src={movie.posterUrl} alt="" loading="lazy" width="342" height="513" />
      ) : (
        <div className="movie-card__poster movie-card__poster--empty" aria-hidden="true">
          🎬
        </div>
      )}
      <div className="movie-card__body">
        <h3 className="movie-card__title">
          {/* le lien couvre toute la carte (CSS ::after), mais son texte reste le titre */}
          <Link to={`/films/${movie.id}`}>{movie.title}</Link>
        </h3>
        <p className="movie-card__meta">
          {movie.releaseYear ?? "Année inconnue"}
          {movie.certification && <CertificationBadge value={movie.certification} />}
        </p>
        {movie.directors.length > 0 && (
          <p className="movie-card__meta">{movie.directors.map((director) => director.name).join(", ")}</p>
        )}
        {character && <p className="movie-card__meta">Rôle : {character}</p>}
        {movie.genres.length > 0 && <p className="movie-card__genres">{movie.genres.join(" · ")}</p>}
        {!movie.available && <p className="movie-card__missing">Plus présent sur le NAS</p>}
      </div>
    </article>
  );
}

interface MovieGridProps<T extends MovieSummary> {
  movies: Array<T & { character?: string | null }>;
  // boutons affichés SOUS la carte (ex. « Retirer » dans Mon compte) : hors de la carte,
  // sinon le lien du titre, étendu à toute la carte, les recouvrirait
  renderActions?: (movie: T) => ReactNode;
}

/** Grille de cartes (liste sémantique : un lecteur d'écran annonce « liste, 20 éléments »). */
export function MovieGrid<T extends MovieSummary>({ movies, renderActions }: MovieGridProps<T>) {
  return (
    <ul className="movie-grid">
      {movies.map((movie) => (
        <li key={movie.id} className="movie-grid__item">
          <MovieCard movie={movie} character={movie.character} />
          {renderActions && <div className="movie-grid__actions">{renderActions(movie)}</div>}
        </li>
      ))}
    </ul>
  );
}
