/**
 * Recherche multicritère (US01 → US07, US15).
 *
 * Les critères vivent dans l'URL (?director=fincher&year=1992) et pas dans un state :
 * - l'URL est la seule source de vérité (pas de double état à synchroniser) ;
 * - le lien se partage, se met en favori, et « Précédent » revient à la recherche d'avant.
 * Envoyer le formulaire = changer l'URL ; changer l'URL = recharger les résultats.
 *
 * Les champs partent TOUJOURS vides (pas de pré-remplissage depuis l'URL) : chaque
 * recherche repart de zéro, aucun ancien filtre ne reste caché dans le formulaire.
 * La recherche en cours est rappelée au-dessus des résultats (describeSearch).
 */
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CERTIFICATIONS, type Certification, type Genre, type MovieSummary, type Page } from "../api/types.ts";
import { CERTIFICATION_LABELS } from "../components/CertificationBadge.tsx";
import { MovieGrid } from "../components/MovieCard.tsx";
import { PaginationNav } from "../components/PaginationNav.tsx";
import { PersonInput } from "../components/PersonInput.tsx";
import { ErrorMessage, Loading } from "../components/Status.tsx";
import { useApi } from "../hooks/useApi.ts";

const SORT_LABELS: Record<string, string> = {
  "-title": "titre Z → A",
  "-year": "plus récents d'abord",
  year: "plus anciens d'abord",
};

/**
 * Résumé lisible de la recherche en cours, lu dans l'URL :
 * ?q=deadpool&maxCertification=12 → ["« deadpool »", "classification max -12"]
 */
function describeSearch(params: URLSearchParams, sagaName: string | undefined): string[] {
  const parts: string[] = [];
  const q = params.get("q");
  if (q) parts.push(`« ${q} »`);
  if (params.get("saga")) parts.push(`saga ${sagaName ?? `n°${params.get("saga")}`}`);
  if (params.get("director")) parts.push(`réalisateur ${params.get("director")}`);
  if (params.get("actor")) parts.push(`avec ${params.get("actor")}`);
  if (params.get("year")) parts.push(`année ${params.get("year")}`);
  if (params.get("yearFrom") || params.get("yearTo")) {
    parts.push(`entre ${params.get("yearFrom") ?? "…"} et ${params.get("yearTo") ?? "…"}`);
  }
  const genres = params.getAll("genre");
  if (genres.length > 0) parts.push(`genres ${genres.join(" + ")}`);
  const maxCertification = params.get("maxCertification") as Certification | null;
  if (maxCertification) parts.push(`classification max : ${CERTIFICATION_LABELS[maxCertification]}`);
  const sort = params.get("sort");
  if (sort && SORT_LABELS[sort]) parts.push(`tri : ${SORT_LABELS[sort]}`);
  return parts;
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const movies = useApi<Page<MovieSummary>>(`/movies?${searchParams}`);
  const genres = useApi<Genre[]>("/genres");

  // ?saga=12 vient du lien « Saga » d'une fiche film : son nom est lu sur le 1er résultat
  const sagaName = movies.status === "success" ? movies.data.data[0]?.saga?.name : undefined;
  const currentSearch = describeSearch(searchParams, sagaName);

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

      {/* key : à chaque nouvelle URL (nouvelle recherche, Précédent…), React recrée le
          formulaire → tous les champs reviennent à leur valeur par défaut, donc vides */}
      <form key={searchParams.toString()} onSubmit={handleSubmit} className="search-form" role="search">
        <div className="field field--wide">
          <label htmlFor="q">Titre, saga ou studio</label>
          <input id="q" name="q" type="search" defaultValue="" placeholder="ex. alien, marvel, star wars" />
        </div>

        <PersonInput id="director" name="director" label="Réalisateur" role="director" defaultValue="" />
        <PersonInput id="actor" name="actor" label="Acteur ou actrice" role="actor" defaultValue="" />

        <div className="field">
          <label htmlFor="year">Année exacte</label>
          <input id="year" name="year" type="number" min="1888" max="2100" defaultValue="" />
        </div>

        <fieldset className="field field--range">
          <legend>Entre les années</legend>
          <label htmlFor="yearFrom" className="visually-hidden">Année de début</label>
          <input id="yearFrom" name="yearFrom" type="number" min="1888" max="2100" placeholder="1980" defaultValue="" />
          <span aria-hidden="true">–</span>
          <label htmlFor="yearTo" className="visually-hidden">Année de fin</label>
          <input id="yearTo" name="yearTo" type="number" min="1888" max="2100" placeholder="1989" defaultValue="" />
        </fieldset>

        <div className="field">
          <label htmlFor="maxCertification">Classification maximale</label>
          <select id="maxCertification" name="maxCertification" defaultValue="">
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
          <select id="sort" name="sort" defaultValue="title">
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
                <input type="checkbox" name="genre" value={genre.name} />
                {genre.name} <span className="genres__count">({genre.movieCount})</span>
              </label>
            ))}
          {genres.status === "error" && <ErrorMessage message={genres.error} />}
        </fieldset>

        <div className="search-form__actions">
          <button type="submit" className="button">
            Rechercher
          </button>
          {/* type="reset" : vide ce qu'on vient de taper, sans relancer de recherche */}
          <button type="reset" className="button button--ghost">
            Vider les champs
          </button>
        </div>
      </form>

      <section aria-labelledby="results-title" className="results">
        <h2 id="results-title">
          Résultats
          {movies.status === "success" && ` (${movies.data.pagination.total})`}
        </h2>
        {currentSearch.length > 0 && (
          <p className="results__summary">
            Pour : <strong>{currentSearch.join(" · ")}</strong>{" "}
            <button type="button" className="button button--ghost" onClick={() => setSearchParams(new URLSearchParams())}>
              Tout afficher
            </button>
          </p>
        )}
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
