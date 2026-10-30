import type { Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../../config.ts";
import type { Role } from "./roles.ts";
import type { Queryable } from "../models/database-client.ts";
import refreshTokensDataMapper from "../models/refresh-tokens.datamapper.ts";

// --------------------------------
// SameSite config
// --------------------------------
// configuration de l'attribut "sameSite" pour les cookies
// sameSite indique au navigateur depuis quel site il peut renvoyer le cookie vers l'API
// il définit les autorisations d'envoi du cookie selon le site à l'origine de la requête
// ---
// Exemple : l'API est sur le domaine A.com et fournit un cookie. Le cookie appartient au domaine A.com
// le front est sur le domaine B.com est envoie des requêtes vers l'API (A.com)
// sameSite indique si le navigateur a le droit d'envoyer le cookie depuis le domaine B.com vers l'API sur A.com
// --
// ici un site correspond au protocole (HTTP ou HTTPS) + le nom de domaine
// https://front.example.com et https://api.example.com --> mêmes sites
// https://example.com et http://example.com --> protocoles différents --> sites différents
// https://front.example.com et https://autre.com --> domaines différents --> sites différents
export const SameSite = {
  // strict : autorise l'envois du cookie uniquement depuis le même site que l'API pour tout type de requêtes (GET, POST, PATCH, PUT, DELETE)
  // pratique si l'API et le FRONT sont sur le même site
  Strict: "strict",

  // lax : mode strict + autorise l'envoi du cookie depuis d'autres sites que l'API, mais uniquement pour des liens GET
  // pratique pour récupérer du contenu de l'API depuis un autre site
  Lax: "lax",

  // none : autorise l'envoi du cookie depuis d'autres sites que l'API pour tout type de requête
  // pratique si le front et l'API ne sont pas sur le même site
  // attention, dans ce cas le navigateur exige aussi le protocole HTTPS pour le partage du cookie
  // https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html#section-5.7
  None: "none",
} as const;
export type SameSiteType = (typeof SameSite)[keyof typeof SameSite];


// --------------------------------
// caractéristiques des tokens
// --------------------------------
// pour ne pas répéter partout le nom et le path du token
export const ACCESS_COOKIE = {
  name: "accessToken",
  path: "/"
};
export const REFRESH_COOKIE = {
  name: "refreshToken",
  path: "/api/auth/refresh"
};


// --------------------------------
// utilisateur minimal nécessaire pour générer les tokens (pas de dépendance à un ORM)
// --------------------------------
export interface AuthUser {
  id: number;
  role: Role;
}


// --------------------------------
// définition générique des données d'un token
// --------------------------------
// interface --> classe sans fonction
export interface Token {
  name: string; // accessToken ou refreshToken
  content: string; // string JWT ou une string aléatoire pour le refreshToken
  expiresInMS: number; // date d'expiration du token
}


// --------------------------------
// définition générique des données d'un cookie
// --------------------------------
// interface --> classe sans fonction
export interface Cookie {

  token: Token; // interface token définie plus haut

  options: {
    // instructions pour le navigateur (attributs définis par les spec des cookies : https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html)
    httpOnly: boolean; // true : non accessible aux script JS, seul le navigateur y a accès
    maxAge: number; // durée de conservation du cookie en ms --> supprime le cookie passé ce délais --> attention, ce delais porte sur le cookie, pas le token qu'il contient !
    sameSite: SameSiteType; // Valeurs autorisées : "strict", "lax" ou "none"
    secure: boolean; // renvois ce cookie uniquement en HTTPS (exception pour localhost en HTTP --> pratique pour les tests ;)
    path: string; // endpoint où renvoyer le cookie "/" --> racine de l'API  ou "/api/auth/refresh" --> uniquement la route refresh de l'API
  };
}


// --------------------------------
// structure géénrique qui contient les deux cookies à renvoyer au navigateur
// --------------------------------
export interface AuthenticationCookies {
  accessCookie: Cookie;
  refreshCookie: Cookie;
}


// --------------------------------
// créer les deux coockies à renvoyer dans une Response express
// --------------------------------
export async function generateAuthenticationCookies(user: AuthUser): Promise<AuthenticationCookies> {
  // calcul du accessToken
  const accessToken: Token = generateAccessToken(user);

  // cookie de transport pour l'accessToken
  const accessCookie: Cookie = newAccessCookie(accessToken);

  // calcul du refreshToken
  const refreshToken: Token = generateRefreshToken();

  // cookie de transport pour le refreshToken
  const refreshCookie: Cookie = newRefreshCookie(refreshToken);

  return {
    accessCookie,
    refreshCookie,
  };
}


// --------------------------------
// crée un token JWT qui contient le user id + role et une date d'expiration d'une heure
// --------------------------------
function generateAccessToken(user: AuthUser): Token {

  // payload du token JWT
  const payload = {
    userId: user.id,
    userRole: user.role,
  };

  // calcul du token JWT (string)
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });

  // object Token à manipuler
  const accessToken: Token = {
    name: ACCESS_COOKIE.name,
    content: token, // JWT
    expiresInMS: 1 * 1000 * 60 * 60, // 1 heure
  };

  return accessToken;
}

// --------------------------------
// crée un access Cookie qui va transporter l'access token
// --------------------------------
export function newAccessCookie(token: Token): Cookie {

  return {
    token,
    options: {
      httpOnly: true,
      maxAge: token.expiresInMS, // même durée du vie que le token
      // strict : le client React et l'API sont servis sur la MÊME origine (/ et /api, derrière Caddy ;
      // proxy Vite en dev) → le navigateur n'envoie jamais ce cookie depuis un autre site (protection CSRF)
      sameSite: SameSite.Strict,
      secure: true, // HTTPS uniquement (sauf requête adressée à localhost, cf. secureFor)
      path: ACCESS_COOKIE.path, // renvoi le cookie pour tous les endpoints sous la racine /
    },
  };
}


// --------------------------------
// crée un refresh token
// --------------------------------
function generateRefreshToken(): Token {

  // pour le refresh token il faut un identifiant unique, secrêt et non calculable à l'avance
  // une chaîne de caractère aléatoire suffisamment longue
  // on stocke la string en base64 --> une manière d'encoder du texte de manière consise
  const randomKey = crypto.randomBytes(256).toString("base64");

  const refreshToken: Token = {
    name: REFRESH_COOKIE.name,
    content: randomKey,
    expiresInMS: 1 * 1000 * 60 * 60 * 24 * 7, // 1 semaine
  };

  return refreshToken;
}


// --------------------------------
// crée le refresh Cookie qui va transporter le refresh token
// --------------------------------
export function newRefreshCookie(token: Token): Cookie {

  return {
    token,
    options: {
      httpOnly: true,
      maxAge: token.expiresInMS, // même durée du vie que le token
      sameSite: SameSite.Strict, // même raison que l'access cookie
      secure: true,
      path: REFRESH_COOKIE.path, // renvoi le cookie uniquement pour le endpoint /api/auth/refresh
    },
  };
}


// --------------------------------
// enregistre un cookie dans une Response express
// --------------------------------
export function insertCookieInResponse(res: Response, cookie: Cookie): void {
  // la fonction res.cookie prend 3 arguments :
  // - nom du cookie : string
  // - valeur du cookie : string
  // - options : objet JS
  res.cookie(cookie.token.name, cookie.token.content, { ...cookie.options, secure: secureFor(res, cookie) });
}


// --------------------------------
// attribut Secure réellement envoyé : toujours, SAUF pour une requête adressée à localhost
// --------------------------------
// Sur http://localhost, les navigateurs acceptent les cookies Secure, mais pas les clients HTTP
// en ligne de commande (httpyac, REST Client) : sans cette exception, les tests .http échouent.
// Aucun risque en production : le site y est appelé par son nom de domaine, jamais "localhost",
// et le cookie n'est de toute façon renvoyé qu'à la personne qui a fait la requête.
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]", "::1"];

function secureFor(res: Response, cookie: Cookie): boolean {
  return cookie.options.secure && !LOCAL_HOSTNAMES.includes(res.req.hostname);
}


// --------------------------------
// supprime un cookie dans une Response express
// --------------------------------
export function clearCookieInResponse(res: Response, cookie: Cookie): void {
  // envois au navigateur des cookies vides avec des dates périmées
  // la fonction res.clearCookie prend deux arguments :
  // - nom du cookie : string
  // - options : objet JS
  res.clearCookie(cookie.token.name, {
    path: cookie.options.path,
    httpOnly: cookie.options.httpOnly,
    secure: secureFor(res, cookie),
    sameSite: cookie.options.sameSite
  });
}


// --------------------------------
// supprime les DEUX cookies d'authentification (déconnexion, changement de mot de passe, suppression du compte)
// --------------------------------
export function clearAuthenticationCookies(res: Response): void {
  // des tokens vides, expirés "maintenant" : seuls leur nom et le path du cookie comptent ici
  const emptyAccessToken: Token = { name: ACCESS_COOKIE.name, content: "", expiresInMS: 0 };
  const emptyRefreshToken: Token = { name: REFRESH_COOKIE.name, content: "", expiresInMS: 0 };
  clearCookieInResponse(res, newAccessCookie(emptyAccessToken));
  clearCookieInResponse(res, newRefreshCookie(emptyRefreshToken));
}


// --------------------------------
// révoque tous les refresh tokens valides d'un utilisateur
// --------------------------------
// tx : connexion de la transaction en cours (withTransaction, models/transaction.ts)
export async function revokeAllUserRefreshTokens(userId: number, tx: Queryable): Promise<void> {
  await refreshTokensDataMapper.revokeAllValidForUser(userId, tx);
}


// --------------------------------
// supprime les refresh tokens consommés et expirés d'un utilisateur
// --------------------------------
export async function clearUserRefreshTokens(userId: number, tx: Queryable): Promise<void> {
  await refreshTokensDataMapper.deleteConsumedExpiredForUser(userId, tx);
}


// --------------------------------
// crée un refresh token en BDD pour un utilisateur
// --------------------------------
export async function createRefreshToken(userId: number, token: Token, tx: Queryable): Promise<void> {
  await refreshTokensDataMapper.create(
    userId,
    getTokenHash(token.content),
    new Date(Date.now() + token.expiresInMS),
    tx
  );
}


// --------------------------------
// consomme un refresh token (rotation) — renvoie faux s'il l'était déjà
// --------------------------------
export async function consumeRefreshToken(id: number, tx: Queryable): Promise<boolean> {
  return refreshTokensDataMapper.consume(id, tx);
}


// --------------------------------
// calcul le hash du refresh token
// --------------------------------
export function getTokenHash(token: string): string {
  // ici, pour des refresh token on utilise l'algorithme sha512
  // l'algorithme est rapide et déterministe : une même source porduit toujours le même hash
  // sauf que : les token sont des strings aléatoires de 256 octects et renouvelés très régulièrement
  // la taille des token + leur valeur aléatoire + leur courte durée de vie rend impossible l'exploitation des hash s'ils sont volés
  // un attanquant ne pas essayer par brut force toutes les combinaisons possible de token
  // FIXME cette constatation est valable en 2026
  return crypto.createHash("sha512").update(token).digest("hex");
}
