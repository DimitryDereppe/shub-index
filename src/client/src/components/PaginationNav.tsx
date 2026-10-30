/**
 * Navigation entre les pages de résultats. La page est dans l'URL (?page=3) :
 * le bouton « Précédent » du navigateur et le partage de lien fonctionnent.
 */
import { Link, useSearchParams } from "react-router";
import type { Pagination } from "../api/types.ts";

export function PaginationNav({ pagination }: { pagination: Pagination }) {
  const [searchParams] = useSearchParams();

  if (pagination.totalPages <= 1) {
    return null;
  }

  // même URL que la page actuelle, seul "page" change
  function linkTo(page: number): string {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `?${params}`;
  }

  const { page, totalPages } = pagination;
  return (
    <nav aria-label="Pages de résultats" className="pagination">
      {page > 1 ? <Link to={linkTo(page - 1)}>← Précédente</Link> : <span aria-hidden="true" />}
      <span aria-current="page">
        Page {page} sur {totalPages}
      </span>
      {page < totalPages ? <Link to={linkTo(page + 1)}>Suivante →</Link> : <span aria-hidden="true" />}
    </nav>
  );
}
