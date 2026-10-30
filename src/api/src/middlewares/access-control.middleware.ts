import { NextFunction, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import { config } from "../../config.ts";
import { Role } from "../lib/roles.ts";
import { AuthenticatedRequest } from "../@types/express.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.ts";
import { isLocalRequest } from "../lib/network.ts";
import * as libTokens from "../lib/tokens.ts";
import usersDataMapper from "../models/users.datamapper.ts";


// --------------------------------
// fonction technique TypeScript pour tranformer value en type Role
function isRole(value: unknown): boolean {
  return Object.values(Role).some((role) => role === value);
}


// --------------------------------
// middleware pour vérifier si l'utilisateur est connecté --> access token valide
export async function isConnected(req: AuthenticatedRequest, res: Response, next: NextFunction) {

  // récupérer l'accessToken qui se trouve dans le cookie de la requete
  const accessToken = req.cookies?.[libTokens.ACCESS_COOKIE.name];

  // est-ce j'ai un cookie avec un accessToken dedans ?
  if (!accessToken || typeof accessToken !== "string") {
    throw new UnauthorizedError('Access token invalide');
  }

  // est-ce que l'accessToken est un token JWT valide ?
  // si le token est invalide, verify lance une erreur attrapée par le global-error-handler
  // algorithms : on n'accepte que l'algorithme avec lequel on signe (HS256), rien d'autre
  const payload = jwt.verify(accessToken, config.jwtSecret, { algorithms: ["HS256"] }) as JwtPayload;

  // dans payload j'ai un objet JS avec des "trucs" dedans
  // je dois vérifier si paylaod contient bien userId et userRole

  // est-ce que j'ai bien userId dans la payload ?
  const userId = payload.userId;
  // transforme userId en nombre
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) {
    throw new UnauthorizedError("Invalid user ID in access token");
  }

  // est-ce que j'ai bien userRole dans la paylaod ?
  const userRole = payload.userRole;
  if (!isRole(userRole)) {
    throw new UnauthorizedError("Role invalide");
  }

  // le jeton est valide... mais il a pu être émis AVANT une suppression de compte ou un
  // changement de rôle (il vit 1 h). On relit donc le compte en base : un compte supprimé
  // perd l'accès tout de suite, un admin rétrogradé perd ses droits tout de suite.
  const user = await usersDataMapper.findById(userId);
  if (!user) {
    throw new UnauthorizedError("Compte introuvable");
  }

  // injecter userId et le rôle ACTUEL (celui de la base, pas celui du jeton) dans la requête
  req.userId = user.id;
  req.userRole = user.role;

  next();
}


// --------------------------------
// vérifier les rôles des utilisateurs connectés
// une fonction qui prend en arguemnt la liste des roles autorisés
export function checkRoles(allowedRoles: Array<Role>) {

  // exemple : allowedRoles contient : [ "admin" ]
  // req.userRole = "member"
  // "member" n'est pas dans le tableau allowedRoles --> rejette la requete

  // la fonction checkRole retourne un middleware qui vérfie si le role est autorisé ou pas
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {

    // récupère le role injecté dans l'AuthenticatedRequest
    const role = req.userRole;
    // si pas de role --> erreur
    if (!role) {
      throw new UnauthorizedError('Role invalide');
    }

    // vérifie si role est inclus dans la liste des roles possible (allowedRoles)
    if (!allowedRoles.includes(role)) {
      // le role de l'utilisateur n'est pas dans la liste des roles autorisés
      // 403 (et pas 401) : on sait QUI est l'utilisateur, il n'a simplement pas le droit
      throw new ForbiddenError("Accès réservé aux administrateurs");
    }

    // tout va bien, appelle le middleware suivant
    next();
  };
}


// --------------------------------
// RG10 : la requête vient-elle du réseau local ? (lecture dans VLC)
// --------------------------------
// req.ip = vraie IP du visiteur SEULEMENT si "trust proxy" ne croit que le reverse proxy
// (cf. app.ts et docs/conception/deploiement-aldebaran.md). Sans proxy de confiance,
// Express ignore X-Forwarded-For : un en-tête forgé ne change rien.
export async function isLocalNetwork(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!(await isLocalRequest(req.ip))) {
    throw new ForbiddenError("Lecture possible uniquement depuis le réseau local");
  }
  next();
}
