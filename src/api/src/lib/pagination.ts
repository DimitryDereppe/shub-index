/**
 * Pagination commune aux listes (GET /movies, /media-files, /scans) :
 * ?page=2&limit=20 → LIMIT 20 OFFSET 20 côté SQL.
 */
import z from "zod";
import { emptyToUndefined } from "./zod-helpers.ts";

export const paginationSchema = z.object({
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(20)), // ≤ 50 : pas de page géante
});

/** Bloc "pagination" renvoyé avec chaque liste. */
export function buildPagination(total: number, page: number, limit: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
