import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import z from "zod";
import { HttpClientError } from "../lib/errors.ts";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(error: Error, req: Request, res: Response, next: NextFunction) { // 4 arguments, c'est spécifique à Express et c'est obligatoire

  // 1) Erreurs de validation Zod
  if (error instanceof z.ZodError) {
    console.error("Erreur de validation", { path: req.path, error: z.prettifyError(error) });

    return res.status(400).json({
      error: z.prettifyError(error),
      status: 400, // Bad request
    });
  }

  // 2) Erreur JWT : token expiré OU invalide (signature falsifiée, format cassé…)
  // JsonWebTokenError est la classe mère de TokenExpiredError : un seul test couvre les deux.
  // Avant, seul "expiré" était traité → un faux token donnait une erreur 500.
  if (error instanceof jwt.JsonWebTokenError) {
    console.error("Token JWT refusé", { path: req.path, error: error.message });

    return res.status(401).json({
      error: error instanceof jwt.TokenExpiredError ? "Token expiré" : "Token invalide",
      status: 401
    });
  }

  // 2 bis) JSON du body mal formé (express.json) → 400, pas 500
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "JSON invalide", status: 400 });
  }

  // 3) Erreurs HttpClientError (../lib/errors.ts)
  // Gère tous les HttpClientError --> attrape toutes les classes filles de HttpClientError
  // - ex : throw new NotFoundError()
  // - ex : throw new ConflictError()
  if (error instanceof HttpClientError) {
    console.error(error.name, { path: req.path, status: error.status, error: error.message });

    return res.status(error.status).json({
      error: error.message,
      status: error.status,
    });
  }

  // Erreur non prévue : on logue tout côté serveur (stack incluse), mais on ne renvoie
  // jamais la stack trace ni le détail technique au client (section 13/14 du prompt-header)
  console.error("Erreur interne non gérée", { path: req.path, error: error.message, stack: error.stack });

  // 4) Gérer toutes les erreurs suivantes : code 500
  // Toutes les erreurs non traitées au dessus
  // - ex : la BDD plante
  // - ex : on a fait une erreur de syntaxe
  res.status(500).json({
    error: 'Internal server error',
    status: 500,
  });
}
