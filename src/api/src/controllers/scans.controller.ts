/**
 * Controller des indexations (admin) : lancer, consulter l'historique, suivre un scan.
 */
import type { Response } from "express";
import type { AuthenticatedRequest } from "../@types/express.js";
import { NotFoundError } from "../lib/errors.ts";
import { buildPagination, paginationSchema } from "../lib/pagination.ts";
import scansDataMapper from "../models/scans.datamapper.ts";
import { runScan, startScan } from "../services/scan.service.ts";
import { parseIdParam } from "./utils.ts";

// --------------------------------
// POST /scans — lance une indexation EN ARRIÈRE-PLAN (US20, US25)
// --------------------------------
export async function create(req: AuthenticatedRequest, res: Response) {
  // 409 si une indexation tourne déjà (levée par startScan)
  const scan = await startScan(req.userId ?? null);

  // pas de "await" : on répond tout de suite, l'indexation continue après la réponse.
  // runScan ne lance jamais d'erreur (elle enregistre l'échec en base), donc rien ne peut
  // faire planter le serveur ici ; le .catch n'est qu'une ceinture de sécurité.
  runScan(scan).catch((error) => console.error("Indexation : erreur non gérée", { scanId: scan.id, error: error.message }));

  // 202 Accepted = "demande acceptée, traitement en cours" (≠ 201 : rien n'est encore terminé)
  res.status(202).json(scan);
}

// --------------------------------
// GET /scans — historique, le plus récent d'abord (US24)
// --------------------------------
export async function getAll(req: AuthenticatedRequest, res: Response) {
  const { page, limit } = paginationSchema.parse(req.query);
  const { rows, total } = await scansDataMapper.findPage(page, limit);
  res.json({ data: rows, pagination: buildPagination(total, page, limit) });
}

// --------------------------------
// GET /scans/:id — suivi d'un scan (le client l'interroge toutes les quelques secondes)
// --------------------------------
export async function getOne(req: AuthenticatedRequest, res: Response) {
  const scan = await scansDataMapper.findById(parseIdParam(req));
  if (!scan) {
    throw new NotFoundError("Indexation introuvable");
  }
  res.json(scan);
}
