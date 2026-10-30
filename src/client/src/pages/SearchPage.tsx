/**
 * Recherche multicritère (US01 → US07, US15).
 *
 * Les critères vivent dans l'URL (?director=fincher&year=1992) et pas dans un state :
 * - l'URL est la seule source de vérité (pas de double état à synchroniser) ;
 * - le lien se partage, se met en favori, et « Précédent » revient à la recherche d'avant.
 * Envoyer le formulaire = changer l'URL ; changer l'URL = recharger les résultats.
 */
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CERTIFICATIONS, type Genre, type MovieSummary, type Page } from "../api/types.ts";
import { CERTIFICATION_LABELS } from "../components/CertificationBadge.tsx";
import { MovieGrid } from "../components/MovieCard.tsx";
import { PaginationNav } from "../components/PaginationNav.tsx";
import { PersonInput } from "../components/PersonInput.tsx";
import { ErrorMessage, Loading } from "../components/Status.tsx";
import { useApi } from "../hooks/useApi.ts";

const TEXT_FIELDS = ["q", "year", "yearFrom", "yearTo", "maxCertification", "sort", "saga"];

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const movies = useApi<Page<MovieSummary>>(`/movies?${searchParams}`);
  const genres = useApi<Genre[]>("/genres");

  const selectedGenres = searchParams.getAll("genre");

  // ?saga=12 vient du lien « Saga » d'une fiche film : pas de champ dans le formulaire,
  // on affiche son nom (lu sur le 1er résultat) avec un bouton pour retirer ce filtre
  const sagaId = searchParams.get("saga");
  const sagaName = movies.status === "success" ? movies.data.data[0]?.saga?.name : undefined;

  function removeSagaFilter() {
    const params = new URLSearchParams(searchParams);
    params.delete("saga");
    params.delete("page");
    setSearchParams(params);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    // on ne garde que les champs remplis : l'URL reste lisible
    for (const [key, value] of form.entries()) {
      if (typeof value === "string" && value.trim() !== "") {
        params.append(key, value.trim());
      }
    }
    setSearchParams(params); // nouvelle recherche → retour en page 1 (pas de "page" dans params)
  }

  return (
    <>
      <h1>Rechercher un film</h1>

      {/* key : quand l'URL change (bouton Précédent, Réinitialiser), le formulaire est recréé
          avec les nouvelles valeurs par défaut */}
      <form key={searchParams.toString()} onSubmit={handleSubmit} className="search-form" role="search">
        {sagaId && (
          <p className="field field--wide">
            {/* champ caché : relancer une recherche garde le filtre saga */}
            <input type="hidden" name="saga" value={sagaId} />
            Saga : <strong>{sagaName ?? `n°${sagaId}`}</strong>{" "}
            <button type="button" className="button button--ghost" onClick={removeSagaFilter}>
              Retirer ce filtre
            </button>
          </p>
        )}

        <div className="field field--wide">
          <label htmlFor="q">Titre, saga ou studio</label>
          <input id="q" name="q" type="search" defaultValue={searchParams.get("q") ?? ""} placeholder="ex. alien, marvel, star wars" />
        </div>

        <PersonInput id="director" name="director" label="Réalisateur" role="director" defaultValue={searchParams.get("director") ?? ""} />
        <PersonInput id="actor" name="actor" label="Acteur ou actrice" role="actor" defaultValue={searchParams.get("actor") ?? ""} />

        <div className="field">
          <label htmlFor="year">Année exacte</label>
          <input id="year" name="year" type="number" min="1888" max="2100" defaultValue={searchParams.get("year") ?? ""} />
        </div>

        <fieldset className="field field--range">
          <legend>Entre les années</legend>
          <label htmlFor="yearFrom" className="visually-hidden">Année de début</label>
          <input id="yearFrom" name="yearFrom" type="number" min="1888" max="2100" placeholder="1980" defaultValue={searchParams.get("yearFrom") ?? ""} />
          <span aria-hidden="true">–</span>
          <label htmlFor="yearTo" className="visually-hidden">Année de fin</label>
          <input id="yearTo" name="yearTo" type="number" min="1888" max="2100" placeholder="1989" defaultValue={searchParams.get("yearTo") ?? ""} />
        </fieldset>

        <div className="field">
          <label htmlFor="maxCertification">Classification maximale</label>
          <select id="maxCertification" name="maxCertification" defaultValue={searchParams.get("maxCertification") ?? ""}>
            <option value="">Toutes</option>
            {CERTIFICATIONS.map((certification) => (
              <option key={certification} value={certification}>
                {CERTIFICATION_LABELS[certification]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sort">Trier par</label>
          <select id="sort" name="sort" defaultValue={searchParams.get("sort") ?? "title"}>
            <option value="title">Titre (A → Z)</option>
            <option value="-title">Titre (Z → A)</option>
            <option value="-year">Année (récent d'abord)</option>
            <option value="year">Année (ancien d'abord)</option>
          </select>
        </div>

        <fieldset className="field field--wide genres">
          <legend>Genres (le film doit avoir tous les genres cochés)</legend>
          {genres.status === "success" &&
            genres.data.map((genre) => (
              <label key={genre.id} className="genres__item">
                <input type="checkbox" name="genre" value={genre.name} defaultChecked={selectedGenres.includes(genre.name)} />
                {genre.name} <span className="genres__count">({genre.movieCount})</span>
              </label>
            ))}
          {genres.status === "error" && <ErrorMessage message={genres.error} />}
        </fieldset>

        <div className="search-form__actions">
          <button type="submit" className="button">
            Rechercher
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setSearchParams(new URLSearchParams())}
            disabled={[...TEXT_FIELDS, "director", "actor", "genre"].every((key) => !searchParams.has(key))}
          >
            Réinitialiser
          </button>
        </div>
      </form>

      <section aria-labelledby="results-title" className="results">
        <h2 id="results-title">
          Résultats
          {movies.status === "success" && ` (${movies.data.pagination.total})`}
        </h2>
        {movies.status === "loading" && <Loading label="Recherche en cours…" />}
        {movies.status === "error" && <ErrorMessage message={movies.error} />}
        {movies.status === "success" &&
          (movies.data.data.length === 0 ? (
            <p role="status">Aucun film ne correspond à ces critères.</p>
          ) : (
            <>
              <MovieGrid movies={movies.data.data} />
              <PaginationNav pagination={movies.data.pagination} />
            </>
          ))}
      </section>
    </>
  );
}
