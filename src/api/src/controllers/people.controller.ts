/**
 * Controller des personnes (réalisateurs et acteurs) : autocomplétion et fiche.
 */
import type { Request, Response } from "express";
import z from "zod";
import { NotFoundError } from "../lib/errors.ts";
import { emptyToUndefined } from "../lib/zod-helpers.ts";
import moviesDataMapper from "../models/movies.datamapper.ts";
import peopleDataMapper from "../models/people.datamapper.ts";
import { parseIdParam } from "./utils.ts";

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100), // 2 lettres minimum : "a" renverrait tout le monde
  role: z.preprocess(emptyToUndefined, z.enum(["director", "actor"]).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).default(10)),
});

// --------------------------------
// GET /people?q=web&role=actor — autocomplétion (US11)
// --------------------------------
export async function search(req: Request, res: Response) {
  const { q, role, limit } = searchQuerySchema.parse(req.query);
  res.json(await peopleDataMapper.search(q, role, limit));
}

// --------------------------------
// GET /people/:id — fiche personne + ses films du catalogue (US10)
// --------------------------------
export async function getOne(req: Request, res: Response) {
  const id = parseIdParam(req);
  const person = await peopleDataMapper.findById(id);
  if (!person) {
    throw new NotFoundError("Personne introuvable");
  }

  // les deux listes sont indépendantes : Promise.all lance les deux requêtes en même temps
  const [directed, played] = await Promise.all([
    moviesDataMapper.findDirectedBy(id),
    moviesDataMapper.findPlayedBy(id),
  ]);
  res.json({ ...person, directed, played });
}
