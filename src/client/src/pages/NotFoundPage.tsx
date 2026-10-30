/** Page 404 du client (adresse inconnue). */
import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <>
      <h1>Page introuvable</h1>
      <p>Cette adresse ne correspond à aucune page.</p>
      <Link to="/">← Retour à la recherche</Link>
    </>
  );
}
