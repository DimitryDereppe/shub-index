import type { Request } from "express";
import type { AuthenticatedRequest } from "../@types/express.js";
import { idParamSchema } from "../lib/zod-helpers.ts";
import { UnauthorizedError } from "../lib/errors.ts";
import usersDataMapper, { PublicUserRow } from "../models/users.datamapper.ts";

// --------------------------------
// recherche un utilisateur dans la BDD selon son id stocké dans AuthenticatedRequest.userId
// --------------------------------
export async function getAuthenticatedUser(req: AuthenticatedRequest): Promise<PublicUserRow> {

  // userId stocké dans AuthenticatedRequest
  const userId = req.userId;

  if (!userId) {
    // userId n'existe pas --> erreur
    throw new UnauthorizedError("Utilisateur non authentifié");
  }

  // recherche de l'utilisateur dans la BDD
  const user = await usersDataMapper.findById(userId);

  if (!user) {
    // user pas trouvé dans la BDD --> erreur
    throw new UnauthorizedError("Utilisateur non trouvé");
  }

  return user;
}


// --------------------------------
// lit et valide le paramètre :id de la route (ex. /movies/42) — 400 si ce n'est pas un entier > 0
// --------------------------------
export function parseIdParam(req: Request): number {
  return idParamSchema.parse(req.params).id;
}
