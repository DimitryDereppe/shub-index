/**
 * Recherche Prime Video : films et séries inclus dans l'abonnement en France
 * (ni location, ni achat, ni chaîne Amazon payante en plus), sur le NAS ou non.
 *
 * Mêmes principes que la recherche du catalogue (SearchPage) : les critères vivent
 * dans l'URL, les champs repartent vides, la recherche en cours est rappelée au-dessus
 * des résultats. Seul le type (films / séries) reste choisi d'une recherche à l'autre.
 *
 * Limites de TMDB : avec un titre, seuls l'année, la période et les genres comptent ;
 * acteur, réalisateur et classification n'existent que pour les films. Les champs
 * qui ne servent pas sont retirés du formulaire (donc jamais envoyés).
 * Un film déjà dans le catalogue renvoie vers sa fiche ; sinon, le lien ouvre Prime Video.
 */
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { CERTIFICATIONS, type Certification, type Page, type PrimeVideoTitle } from "../api/types.ts";
import { CERTIFICATION_LABELS } from "../components/CertificationBadge.tsx";
import { PaginationNav } from "../components/PaginationNav.tsx";
import { ErrorMessage, Loading } from "../components/Status.tsx";
import { useApi } from "../hooks/useApi.ts";

type MediaType = "movie" | "tv";
type TmdbGenre = { id: number; name: string };

const SORT_LABELS: Record<string, string> = {
  "-year": "plus récents d'abord",
  year: "plus anciens d'abord",
  rating: "mieux notés",
  title: "titre A → Z",
};

/** Résumé lisible de la recherche en cours (cf. describeSearch dans SearchPage). */
function describeSearch(params: URLSearchParams, genres: TmdbGenre[]): string[] {
  const parts: string[] = [];
  const q = params.get("q");
  if (q) parts.push(`« ${q} »`);
  if (params.get("director")) parts.push(`réalisateur ${params.get("director")}`);
  if (params.get("actor")) parts.push(`avec ${params.get("actor")}`);
  if (params.get("year")) parts.push(`année ${params.get("year")}`);
  if (params.get("yearFrom") || params.get("yearTo")) {
    parts.push(`entre ${params.get("yearFrom") ?? "…"} et ${params.get("yearTo") ?? "…"}`);
  }
  const genreNames = params.getAll("genre").map((id) => genres.find((genre) => String(genre.id) === id)?.name ?? `n°${id}`);
  if (genreNames.length > 0) parts.push(`genres ${genreNames.join(" + ")}`);
  const maxCertification = params.get("maxCertification") as Certification | null;
  if (maxCertification) parts.push(`classification max : ${CERTIFICATION_LABELS[maxCertification]}`);
  const sort = params.get("sort");
  if (sort && SORT_LABELS[sort]) parts.push(`tri : ${SORT_LABELS[sort]}`);
  return parts;
}

function PrimeVideoForm({ type, onSearch }: { type: MediaType; onSearch: (params: URLSearchParams) => void }) {
  // le type choisi dans la liste change les genres proposés et les champs « films seulement »
  const [formType, setFormType] = useState<MediaType>(type);
  // titre saisi → TMDB trie par pertinence et ignore personnes, classification et tri
  const [title, setTitle] = useState("");
  const withTitle = title.trim() !== "";
  const showMovieFilters = formType === "movie" && !withTitle;
  const genres = useApi<TmdbGenre[]>(`/prime-video/genres?type=${formType}`);

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
    onSearch(params); // nouvelle recherche → retour en page 1
  }

  return (
    // onReset : « Vider les champs » vide aussi le titre → les champs masqués reviennent
    <form onSubmit={handleSubmit} onReset={() => setTitle("")} className="search-form" role="search">
      <div className="field">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" value={formType} onChange={(event) => setFormType(event.target.value as MediaType)}>
          <option value="movie">Films</option>
          <option value="tv">Séries</option>
        </select>
      </div>

      <div className="field field--wide">
        <label htmlFor="q">Titre</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue=""
          placeholder="vide = tout le catalogue Prime Video"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      {showMovieFilters && (
        <>
          <div className="field">
            <label htmlFor="director">Réalisateur</label>
            <input id="director" name="director" type="text" defaultValue="" placeholder="ex. christopher nolan" />
          </div>
          <div className="field">
            <label htmlFor="actor">Acteur ou actrice</label>
            <input id="actor" name="actor" type="text" defaultValue="" placeholder="ex. tom cruise" />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="year">{formType === "tv" ? "Année de 1re diffusion" : "Année exacte"}</label>
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

      {showMovieFilters && (
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
      )}

      {!withTitle && (
        <div className="field">
          <label htmlFor="sort">Trier par</label>
          <select id="sort" name="sort" defaultValue="popularity">
            <option value="popularity">Popularité</option>
            <option value="-year">Année (récent d'abord)</option>
            <option value="year">Année (ancien d'abord)</option>
            <option value="rating">Note TMDB</option>
            <option value="title">Titre (A → Z)</option>
          </select>
        </div>
      )}

      <fieldset className="field field--wide genres">
        <legend>Genres (il faut tous les genres cochés)</legend>
        {genres.status === "success" &&
          genres.data.map((genre) => (
            <label key={genre.id} className="genres__item">
              <input type="checkbox" name="genre" value={genre.id} />
              {genre.name}
            </label>
          ))}
        {genres.status === "error" && <ErrorMessage message={genres.error} />}
      </fieldset>

      <div className="search-form__actions">
        <button type="submit" className="button">
          Rechercher
        </button>
        <button type="reset" className="button button--ghost">
          Vider les champs
        </button>
      </div>
    </form>
  );
}

function PrimeVideoCard({ item }: { item: PrimeVideoTitle }) {
  // recherche Prime Video plutôt qu'un lien direct : TMDB ne donne pas l'adresse de la page Amazon
  const primeUrl = `https://www.primevideo.com/search/?phrase=${encodeURIComponent(item.title)}`;
  return (
    <article className="movie-card">
      {item.posterUrl ? (
        <img className="movie-card__poster" src={item.posterUrl} alt="" loading="lazy" width="342" height="513" />
      ) : (
        <div className="movie-card__poster movie-card__poster--empty" aria-hidden="true">
          {item.type === "tv" ? "📺" : "🎬"}
        </div>
      )}
      <div className="movie-card__body">
        <h3 className="movie-card__title">
          {item.movieId ? (
            <Link to={`/films/${item.movieId}`}>{item.title}</Link>
          ) : (
            <a href={primeUrl} target="_blank" rel="noopener noreferrer">
              {item.title} <span className="visually-hidden">(ouvre Prime Video dans un nouvel onglet)</span>
            </a>
          )}
        </h3>
        <p className="movie-card__meta">
          {item.releaseYear ?? "Année inconnue"}
          {item.onNas && <span className="badge badge--nas">Sur le NAS</span>}
        </p>
        {item.originalTitle && <p className="movie-card__meta">{item.originalTitle}</p>}
      </div>
    </article>
  );
}

export function PrimeVideoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const results = useApi<Page<PrimeVideoTitle>>(`/prime-video?${searchParams}`);
  const type: MediaType = searchParams.get("type") === "tv" ? "tv" : "movie";
  // même liste que le formulaire quand le type n'a pas changé : sert aux noms des genres du résumé
  const genres = useApi<TmdbGenre[]>(`/prime-video/genres?type=${type}`);
  const currentSearch = describeSearch(searchParams, genres.status === "success" ? genres.data : []);

  return (
    <>
      <h1>Inclus dans Prime Video</h1>
      <p>Films et séries compris dans l'abonnement en France, qu'ils soient sur le NAS ou non.</p>

      {/* key : à chaque nouvelle URL, React recrée le formulaire → champs vides, type de l'URL */}
      <PrimeVideoForm key={searchParams.toString()} type={type} onSearch={setSearchParams} />

      <section aria-labelledby="results-title" className="results">
        <h2 id="results-title">{type === "tv" ? "Séries" : "Films"}</h2>
        {currentSearch.length > 0 && (
          <p className="results__summary">
            Pour : <strong>{currentSearch.join(" · ")}</strong>{" "}
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setSearchParams(new URLSearchParams(type === "tv" ? { type } : {}))}
            >
              Tout afficher
            </button>
          </p>
        )}
        {results.status === "loading" && <Loading label="Recherche en cours…" />}
        {results.status === "error" && <ErrorMessage message={results.error} />}
        {results.status === "success" && (
          <>
            {results.data.data.length === 0 ? (
              <p role="status">
                Rien d'inclus dans Prime Video pour ces critères sur cette page.
                {results.data.pagination.page < results.data.pagination.totalPages && " Essayez la page suivante."}
              </p>
            ) : (
              <ul className="movie-grid">
                {results.data.data.map((item) => (
                  <li key={item.tmdbId} className="movie-grid__item">
                    <PrimeVideoCard item={item} />
                  </li>
                ))}
              </ul>
            )}
            <PaginationNav pagination={results.data.pagination} />
          </>
        )}
        {/* attribution demandée par TMDB pour les données de disponibilité */}
        <p className="results__summary">
          <small>Disponibilités : JustWatch, via TMDB. Elles peuvent avoir changé depuis.</small>
        </p>
      </section>
    </>
  );
}
