/**
 * Controller des genres : liste pour le filtre de recherche (US05).
 */
import type { Request, Response } from "express";
import genresDataMapper from "../models/genres.datamapper.ts";

// --------------------------------
// GET /genres
// --------------------------------
export async function getAll(req: Request, res: Response) {
  res.json(await genresDataMapper.findAllWithCount());
}
