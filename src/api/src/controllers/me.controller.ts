/**
 * Controller « Mon compte » : chaque route agit sur l'utilisateur CONNECTÉ.
 * Son id vient du jeton (req.userId, posé par isConnected), jamais de l'URL :
 * impossible de viser le compte de quelqu'un d'autre.
 */
import argon2 from "argon2";
import type { Response } from "express";
import z from "zod";
import type { AuthenticatedRequest } from "../@types/express.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.ts";
import { Role } from "../lib/roles.ts";
import * as libTokens from "../lib/tokens.ts";
import { isValidPassword } from "../lib/validators.ts";
import { emailSchema, personNameSchema } from "../lib/zod-helpers.ts";
import favoritesDataMapper, { MAX_FAVORITES } from "../models/favorites.datamapper.ts";
import moviesDataMapper from "../models/movies.datamapper.ts";
import { UNIQUE_VIOLATION } from "../models/scans.datamapper.ts";
import { withTransaction } from "../models/transaction.ts";
import usersDataMapper from "../models/users.datamapper.ts";
import watchHistoryDataMapper from "../models/watch-history.datamapper.ts";
import { getAuthenticatedUser } from "./utils.ts";

// :movieId dans l'URL (ex. /me/favorites/42) → entier > 0, sinon 400
const movieIdParamSchema = z.object({ movieId: z.coerce.number().int().positive() });

/**
 * Vérifie le mot de passe actuel de l'utilisateur connecté (changement d'email,
 * de mot de passe, suppression du compte) : une session restée ouverte ne suffit pas.
 */
async function checkCurrentPassword(userId: number, password: string): Promise<void> {
  const hash = await usersDataMapper.findPasswordById(userId);
  if (!hash || !(await argon2.verify(hash, password))) {
    // 403 et pas 401 : l'utilisateur EST bien connecté. Un 401 ferait croire au client que
    // son jeton a expiré : il renouvellerait les jetons puis rejouerait la requête
    // (2 vérifications Argon2 et 2 échecs comptés par la limitation au lieu d'un).
    throw new ForbiddenError("Mot de passe actuel incorrect");
  }
}

// --------------------------------
// PATCH /me — { firstname?, lastname?, email?, currentPassword? }
// --------------------------------
const updateProfileSchema = z
  .object({
    firstname: personNameSchema.optional(),
    lastname: personNameSchema.optional(),
    email: emailSchema.optional(),
    currentPassword: z.string().optional(), // obligatoire seulement pour changer d'email
  })
  .strict() // un champ inconnu (role, password…) est refusé : pas d'auto-promotion admin
  .refine((body) => body.firstname || body.lastname || body.email, { message: "Aucun champ à modifier" });

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  const { firstname, lastname, email, currentPassword } = updateProfileSchema.parse(req.body);

  // l'email sert d'identifiant de connexion : le changer demande le mot de passe
  if (email && email !== user.email) {
    if (!currentPassword) {
      throw new BadRequestError("Mot de passe actuel requis pour changer d'email");
    }
    await checkCurrentPassword(user.id, currentPassword);
  }

  try {
    const updated = await usersDataMapper.updateProfile(user.id, { firstname, lastname, email });
    res.json(updated);
  } catch (error) {
    // la contrainte UNIQUE sur user.email refuse un email déjà utilisé par un autre compte
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ConflictError("Cet email est déjà utilisé");
    }
    throw error;
  }
}

// --------------------------------
// PATCH /me/password — { currentPassword, newPassword, confirm }
// --------------------------------
const updatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
  confirm: z.string(),
});

export async function updatePassword(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  const { currentPassword, newPassword, confirm } = updatePasswordSchema.parse(req.body);

  // mêmes règles qu'à l'inscription (auth.controller.ts → register)
  if (newPassword !== confirm) {
    throw new BadRequestError("Le mot de passe et sa confirmation ne correspondent pas");
  }
  if (!isValidPassword(newPassword)) {
    throw new BadRequestError("Mot de passe invalide");
  }
  await checkCurrentPassword(user.id, currentPassword);

  const hashedPassword = await argon2.hash(newPassword);
  await withTransaction(async (tx) => {
    await usersDataMapper.updatePassword(user.id, hashedPassword, tx);
    // toutes les sessions (autres appareils compris) devront se reconnecter avec le nouveau mot de passe
    await libTokens.revokeAllUserRefreshTokens(user.id, tx);
  });

  libTokens.clearAuthenticationCookies(res);
  res.status(204).end();
}

// --------------------------------
// DELETE /me — { password }
// --------------------------------
const deleteAccountSchema = z.object({ password: z.string() });

export async function deleteAccount(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  const { password } = deleteAccountSchema.parse(req.body);

  await checkCurrentPassword(user.id, password);

  // sans ce garde-fou, le site pourrait se retrouver sans aucun administrateur
  if (user.role === Role.admin && (await usersDataMapper.countAdmins()) <= 1) {
    throw new ConflictError("Impossible de supprimer le dernier compte administrateur");
  }

  // historique, favoris et refresh tokens partent avec le compte (ON DELETE CASCADE)
  await usersDataMapper.delete(user.id);

  libTokens.clearAuthenticationCookies(res);
  res.status(204).end();
}

// --------------------------------
// GET /me/history — les 10 derniers films regardés
// --------------------------------
export async function getHistory(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  res.json(await watchHistoryDataMapper.findLatestByUser(user.id));
}

// --------------------------------
// DELETE /me/history/:movieId — retire un film de l'historique
// --------------------------------
export async function removeFromHistory(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  const { movieId } = movieIdParamSchema.parse(req.params);

  if (!(await watchHistoryDataMapper.remove(user.id, movieId))) {
    throw new NotFoundError("Ce film n'est pas dans l'historique");
  }
  res.status(204).end();
}

// --------------------------------
// DELETE /me/history — vide l'historique
// --------------------------------
export async function clearHistory(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  await watchHistoryDataMapper.clear(user.id);
  res.status(204).end();
}

// --------------------------------
// GET /me/favorites
// --------------------------------
export async function getFavorites(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  res.json(await favoritesDataMapper.findByUser(user.id));
}

// --------------------------------
// PUT /me/favorites/:movieId — ajoute un favori (idempotent : l'ajouter 2 fois ne change rien)
// --------------------------------
export async function addFavorite(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  const { movieId } = movieIdParamSchema.parse(req.params);

  if (!(await moviesDataMapper.findById(movieId))) {
    throw new NotFoundError("Film introuvable");
  }

  // déjà en favori : rien à faire (PUT idempotent), même si on est à 10
  if (await favoritesDataMapper.exists(user.id, movieId)) {
    res.status(204).end();
    return;
  }
  // la base ne sait pas compter les lignes d'un utilisateur dans une contrainte : c'est l'API qui vérifie
  if ((await favoritesDataMapper.countByUser(user.id)) >= MAX_FAVORITES) {
    throw new ConflictError(`${MAX_FAVORITES} favoris maximum : retire-en un d'abord`);
  }
  await favoritesDataMapper.add(user.id, movieId);

  res.status(204).end();
}

// --------------------------------
// DELETE /me/favorites/:movieId
// --------------------------------
export async function removeFavorite(req: AuthenticatedRequest, res: Response) {
  const user = await getAuthenticatedUser(req);
  const { movieId } = movieIdParamSchema.parse(req.params);

  if (!(await favoritesDataMapper.remove(user.id, movieId))) {
    throw new NotFoundError("Ce film n'est pas dans les favoris");
  }
  res.status(204).end();
}
