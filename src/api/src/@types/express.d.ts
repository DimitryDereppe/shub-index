import { Request } from "express";
import { Role } from "../lib/roles.ts";

// définition de ma propre request qui hérite de Request fournie par Express
// elle possède toutes les propriétés de Request
// avec en plus userId et userRole

export interface AuthenticatedRequest extends Request {

  // ici on hérite, donc on récupère tout ce qui constitue Request définie par express

  // ? pour indiquer que la propriété est optionnelle
  userId?: number,
  userRole?: Role,
}
