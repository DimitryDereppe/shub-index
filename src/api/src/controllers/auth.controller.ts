import argon2 from "argon2";
import crypto from "node:crypto";
import { config } from "../../config.ts";
import { buildPasswordResetEmail } from "../lib/emails.ts";
import { transporter } from "../mailer.ts";
import passwordResetTokensDataMapper from "../models/password-reset-tokens.datamapper.ts";
import type { Request, Response } from "express";
import z from 'zod';
import { AuthenticatedRequest } from "../@types/express.js";
import { BadRequestError, ConflictError, UnauthorizedError } from "../lib/errors.ts";
import * as libTokens from "../lib/tokens.ts";
import { isValidPassword } from '../lib/validators.ts';
import { emailSchema, personNameSchema } from "../lib/zod-helpers.ts";
import usersDataMapper from "../models/users.datamapper.ts";
import refreshTokensDataMapper from "../models/refresh-tokens.datamapper.ts";
import { withTransaction } from "../models/transaction.ts";
import { getAuthenticatedUser } from "./utils.ts";


// --------------------------------
// POST /auth/register
// --------------------------------
export async function register(req: Request, res: Response) {

  // schema attendu du body
  const registerUserBodySchema = z.object({
    // longueurs max = celles des colonnes : un nom trop long donnait une erreur 500 (BDD)
    firstname: personNameSchema,
    lastname: personNameSchema,
    email: emailSchema,
    password: z.string(),
    confirm: z.string(),
  });

  // validation du body par Zod
  const { firstname, lastname, email, password, confirm } = await registerUserBodySchema.parseAsync(req.body);

  // compare password / confirm
  if (password != confirm) {
    throw new BadRequestError("Password and confirmation do not match");
  }

  // password valide ?
  if (!isValidPassword(password)) {
    throw new BadRequestError("Password invalid");
  }

  // vérifier dans la BDD si l'email n'existe pas déjà ?
  const searchedUser = await usersDataMapper.findByEmail(email);
  if (searchedUser) {
    throw new ConflictError("User already exists");
  }

  // hash du mot passe
  const hashedPassword = await argon2.hash(password);

  // enregistre le nouvel utilisateur dans la BDD
  // newUser contient le nouvel utilisateur créé (le DataMapper ne sélectionne jamais "password" en retour)
  const newUser = await usersDataMapper.create({
    firstname,
    lastname,
    email,
    password: hashedPassword,
  });

  // renvois le code 201 avec le nouvel utilisateur créé
  res.status(201).json(newUser);
}


// hash Argon2 d'un mot de passe quelconque, calculé une seule fois (cf. login)
let dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
  dummyHash ??= await argon2.hash("mot-de-passe-factice");
  return dummyHash;
}


// --------------------------------
// POST /auth/login
// --------------------------------
export async function login(req: Request, res: Response) {

  // schema attendu du body
  const loginUserBodySchema = z.object({
    email: emailSchema,
    password: z.string(),
  });

  // validation du body par Zod
  const { email, password } = await loginUserBodySchema.parseAsync(req.body);

  // rechercher l'utilisateur dans la BDD selon son email (avec son mot de passe hashé)
  const searchedUser = await usersDataMapper.findByEmail(email);
  // même message pour "email inconnu" et "mauvais mot de passe" : sinon un attaquant
  // pourrait tester quels emails ont un compte (énumération des comptes).
  // Même DURÉE aussi : sans compte, on vérifie quand même un hash factice, sinon la
  // réponse arrive en 2 ms au lieu de ~90 ms (temps d'Argon2) et trahit l'email inconnu.
  if (!searchedUser) {
    await argon2.verify(await getDummyHash(), password);
    throw new UnauthorizedError("Email ou mot de passe incorrect");
  }

  // searchedUser.password --> mot de passe hashé et stocké dans la BDD
  // password --> mot de passe en clair reçu du body
  if (!await argon2.verify(searchedUser.password, password)) {
    throw new UnauthorizedError("Email ou mot de passe incorrect");
  }

  // générer les tokens avec leurs cookies
  const cookies = await libTokens.generateAuthenticationCookies(searchedUser);

  // transaction pour gérer les refresh tokens stockés en BDD
  // si la transaction échoue, une erreur est lancée automatiquement puis attrappée par le global-error-handler
  await withTransaction(async (tx) => {
    // 1. revoquer tous les tokens de l'utilisateur
    await libTokens.revokeAllUserRefreshTokens(searchedUser.id, tx);

    // nettoyage : supprime tous les token consommés (consumed true) et expirés de l'utilisateur
    await libTokens.clearUserRefreshTokens(searchedUser.id, tx);

    // 2. créer un nouveau token valide (consumed false)
    // la contrainte unique partielle sur [user_id] where consumed = false garanti qu'un utilisateur a un seul token valide
    await libTokens.createRefreshToken(searchedUser.id, cookies.refreshCookie.token, tx);
  });

  libTokens.insertCookieInResponse(res, cookies.accessCookie);
  libTokens.insertCookieInResponse(res, cookies.refreshCookie);

  res.status(200).json({ message: "success" });
}


// --------------------------------
// GET /auth/me
// --------------------------------
export async function getMe(req: AuthenticatedRequest, res: Response) {

  const user = await getAuthenticatedUser(req);

  // envoi la réponse avec user (id + rôle : le client en a besoin pour afficher le menu admin)
  res.status(200).json({
    id: user.id,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    role: user.role,
  });
}


// --------------------------------
// POST /auth/refresh
// --------------------------------
export async function refresh(req: Request, res: Response) {

  // 1. récupérer le refresh token dans les cookies
  const refreshToken = req.cookies?.[libTokens.REFRESH_COOKIE.name];

  // refreshToken existe et est un string ? (certains cookies peuvent être du JSON...)
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new UnauthorizedError("Refresh token is missing");
  }

  // il faut une transaction pour effectuer les opération du refresh
  // si la transaction échoue, une erreur est lancée automatiquement puis attrappée par le global-error-handler
  // il faut récupérer le résultat de la transaction
  // définition du type de retour de la transaction : ok ou fail
  type RefreshResult =
    | { ok: true; cookies: libTokens.AuthenticationCookies } // ok avec les cookies générés
    | { ok: false; reason: string; }; // fail avec une raison de l'echec au format string

  // début de la transaction
  const result = await withTransaction<RefreshResult>(async (tx) => {

    // la difficulté du refresh est de gérer correction les requêtes concurentes (simultanée) de refresh
    // on cherche le token une première fois dans la BDD pour récupérer l'utilisateur associé
    // et vérifier que le token n'est pas déjà consommé
    // puis lorsqu'on consomme le token, il faut de nouveau vérifier que le token n'est pas déjà consommé !

    const now = new Date(); // maintenant

    // calcul du hash du refreshToken --> l'algorithme utilisé est déterministe
    // le hash est donc le même que celui stocké dans la BDD
    const hash = libTokens.getTokenHash(refreshToken);

    // 1. chercher le token dans la BDD
    const token = await refreshTokensDataMapper.findByHash(hash, tx);

    // token non trouvé ou expiré --> erreur --> refuser le refresh
    if (!token || token.expires_at <= now) {
      return { ok: false, reason: "Token invalide" };
    }

    // token déjà consommé --> erreur --> refuser le refresh
    if (token.consumed) {
      // révoquer tous les tokens de l'utilisateur
      await libTokens.revokeAllUserRefreshTokens(token.user_id, tx);
      // refuser la requete
      return { ok: false, reason: "Token déjà utilisé" };
    }

    // 2. le token est valide, on le consomme
    if (!await libTokens.consumeRefreshToken(token.id, tx)) {
      // le token a déjà été consommé par une autre requête "simultanée" --> erreur --> refuser le refresh
      // révoquer tous les tokens de l'utilisateur
      await libTokens.revokeAllUserRefreshTokens(token.user_id, tx);
      // on refuse la requete
      return { ok: false, reason: "Token déjà utilisé" };
    }

    // chercher l'utilisateur associé au token (pas de include: {user: true} possible en SQL brut sans jointure)
    const user = await usersDataMapper.findById(token.user_id, tx);
    if (!user) {
      return { ok: false, reason: "Utilisateur introuvable" };
    }

    // 3. le token a bien été consommé, on continue
    const cookies: libTokens.AuthenticationCookies = await libTokens.generateAuthenticationCookies(user);

    // 4. enregistrer le nouveau token dans la BDD
    await libTokens.createRefreshToken(user.id, cookies.refreshCookie.token, tx);

    // nettoyage : supprime tous les token consommés (consumed true) et expirés de l'utilisateur
    await libTokens.clearUserRefreshTokens(user.id, tx);

    // tout va bien, on retourne les cookies de transport des tokens
    return { ok: true, cookies };
  });

  if (result.ok) {
    // le refreshToken est bien créé dans la BDD
    // enregistre les token dans le header de la réponse
    libTokens.insertCookieInResponse(res, result.cookies.accessCookie);
    libTokens.insertCookieInResponse(res, result.cookies.refreshCookie);

    // envois la réponse 200 OK
    res.status(200).json({ message: "refresh token" });
  } else {
    throw new UnauthorizedError(result.reason);
  }
}


// --------------------------------
// POST /auth/logout
// --------------------------------
export async function logout(req: AuthenticatedRequest, res: Response) {

  // rechercher l'utilisateur depuis le userId de la requete
  const user = await getAuthenticatedUser(req);

  // transaction pour révoquer tous les tokens de l'utilisateur
  await withTransaction(async (tx) => {
    // logout --> revoke all tokens of the user
    await libTokens.revokeAllUserRefreshTokens(user.id, tx);
  });


  // supprime les deux cookies (access + refresh) côté navigateur
  libTokens.clearAuthenticationCookies(res);

  res.status(204).end(); // 204 = pas de contenu : on n'envoie pas de body
}


// --------------------------------
// POST /auth/forgot-password — { email } : envoie un lien de réinitialisation par email
// --------------------------------
const forgotPasswordSchema = z.object({ email: emailSchema });

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);

  // réponse IDENTIQUE que le compte existe ou non, et envoyée TOUT DE SUITE :
  // ni le message ni le temps de réponse ne révèlent si cet email a un compte
  res.status(202).json({ message: "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé." });

  // la suite (base + envoi de l'email) se déroule APRÈS la réponse : une erreur ici
  // ne peut plus passer par le global-error-handler, on la journalise nous-mêmes
  try {
    await sendPasswordResetLink(email);
  } catch (error) {
    console.error("Envoi du lien de réinitialisation impossible", { error: (error as Error).message });
  }
}

/** Crée un lien de réinitialisation et l'envoie par email (ne fait rien si le compte n'existe pas). */
async function sendPasswordResetLink(email: string): Promise<void> {
  const user = await usersDataMapper.findByEmail(email);
  if (!user) {
    return;
  }

  // jeton secret et imprévisible (comme le refresh token) ; base64url : utilisable tel quel dans une URL
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.resetTokenTtlMinutes * 60 * 1000);

  // en base, seulement l'EMPREINTE : une fuite de la base ne donnerait aucun lien utilisable
  await withTransaction((tx) =>
    passwordResetTokensDataMapper.replaceForUser(user.id, libTokens.getTokenHash(token), expiresAt, tx)
  );

  const link = `${config.appUrl}/reinitialiser?jeton=${token}`;
  await transporter.sendMail({ to: user.email, ...buildPasswordResetEmail(user.firstname, link, config.resetTokenTtlMinutes) });
}


// --------------------------------
// POST /auth/reset-password — { token, newPassword, confirm }
// --------------------------------
const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string(),
  confirm: z.string(),
});

export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword, confirm } = resetPasswordSchema.parse(req.body);

  // mêmes règles qu'à l'inscription
  if (newPassword !== confirm) {
    throw new BadRequestError("Le mot de passe et sa confirmation ne correspondent pas");
  }
  if (!isValidPassword(newPassword)) {
    throw new BadRequestError("Mot de passe invalide");
  }

  const hashedPassword = await argon2.hash(newPassword);

  // tout ou rien : lien consommé + nouveau mot de passe + sessions fermées
  const userId = await withTransaction(async (tx) => {
    const resetToken = await passwordResetTokensDataMapper.findByHash(libTokens.getTokenHash(token), tx);
    // 400 (et pas 401) : personne n'est connecté ici, il n'y a aucun jeton de session à renouveler
    if (!resetToken || resetToken.used_at || resetToken.expires_at <= new Date()) {
      return null;
    }
    if (!(await passwordResetTokensDataMapper.markUsed(resetToken.id, tx))) {
      return null; // utilisé au même instant par une autre requête
    }
    await usersDataMapper.updatePassword(resetToken.user_id, hashedPassword, tx);
    // quiconque était connecté avec l'ancien mot de passe doit se reconnecter
    await libTokens.revokeAllUserRefreshTokens(resetToken.user_id, tx);
    return resetToken.user_id;
  });

  if (userId === null) {
    throw new BadRequestError("Lien invalide ou expiré : refaites une demande de réinitialisation");
  }

  libTokens.clearAuthenticationCookies(res);
  res.status(204).end();
}
