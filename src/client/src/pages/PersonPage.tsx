/**
 * Fiche d'une personne : films réalisés et films joués présents dans le catalogue (US10).
 */
import { Link, useParams } from "react-router";
import type { PersonDetail } from "../api/types.ts";
import { MovieGrid } from "../components/MovieCard.tsx";
import { ErrorMessage, Loading } from "../components/Status.tsx";
import { useApi } from "../hooks/useApi.ts";

export function PersonPage() {
  const { id } = useParams();
  const person = useApi<PersonDetail>(`/people/${id}`);

  if (person.status === "loading") {
    return <Loading />;
  }
  if (person.status === "error") {
    return (
      <>
        <h1>Personne introuvable</h1>
        <ErrorMessage message={person.error} />
        <Link to="/">← Retour à la recherche</Link>
      </>
    );
  }

  const { name, directed, played } = person.data;
  return (
    <>
      <h1>{name}</h1>
      {directed.length > 0 && (
        <section aria-labelledby="directed-title">
          <h2 id="directed-title">A réalisé ({directed.length})</h2>
          <MovieGrid movies={directed} />
        </section>
      )}
      {played.length > 0 && (
        <section aria-labelledby="played-title">
          <h2 id="played-title">A joué dans ({played.length})</h2>
          <MovieGrid movies={played} />
        </section>
      )}
    </>
  );
}
