/**
 * Controller des comptes (admin) : liste, changement de rôle, suppression (US42, US43).
 */
import type { Response } from "express";
import z from "zod";
import type { AuthenticatedRequest } from "../@types/express.js";
import { ConflictError, NotFoundError } from "../lib/errors.ts";
import { Role } from "../lib/roles.ts";
import usersDataMapper from "../models/users.datamapper.ts";
import { parseIdParam } from "./utils.ts";

// --------------------------------
// GET /users
// --------------------------------
export async function getAllUsers(req: AuthenticatedRequest, res: Response) {
  const users = await usersDataMapper.findAll();

  res.json(users);
}

// --------------------------------
// PATCH /users/:id — { role } (US42)
// --------------------------------
const updateRoleSchema = z.object({ role: z.enum([Role.member, Role.admin]) }).strict();

export async function updateRole(req: AuthenticatedRequest, res: Response) {
  const id = parseIdParam(req);
  const { role } = updateRoleSchema.parse(req.body);

  // un admin qui se rétrograde lui-même pourrait laisser le site sans aucun admin
  if (id === req.userId) {
    throw new ConflictError("Impossible de modifier son propre rôle");
  }

  const user = await usersDataMapper.updateRole(id, role);
  if (!user) {
    throw new NotFoundError("Utilisateur introuvable");
  }
  res.json(user);
}

// --------------------------------
// DELETE /users/:id (US43)
// --------------------------------
export async function deleteUser(req: AuthenticatedRequest, res: Response) {
  const id = parseIdParam(req);

  if (id === req.userId) {
    throw new ConflictError("Impossible de supprimer son propre compte");
  }
  if (!(await usersDataMapper.delete(id))) {
    throw new NotFoundError("Utilisateur introuvable");
  }
  res.status(204).end();
}
