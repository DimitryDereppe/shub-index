/**
 * Envoi des emails (Nodemailer) : UN seul transporteur pour toute l'application,
 * créé au chargement du module (cf. Fiches Récap/Cours/Cours-Nodemailer.md § 2).
 *
 * - Production : un vrai serveur SMTP (ex. smtp.gmail.com:465 + mot de passe d'application).
 * - Développement : Mailpit (localhost:1025), les emails sont lus sur localhost:8025.
 * - SMTP_HOST vide : jsonTransport → rien ne part, l'email est seulement fabriqué
 *   (pratique en local, et dans les tests où sendMail est de toute façon remplacé par un mock).
 */
import nodemailer from "nodemailer";
import { config } from "../config.ts";

export const transporter = config.smtpHost
  ? nodemailer.createTransport(
      {
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure, // true = TLS dès la connexion (port 465)
        auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      },
      { from: config.mailFrom } // valeur ajoutée à chaque email
    )
  : nodemailer.createTransport({ jsonTransport: true }, { from: config.mailFrom });

/** true si les emails partent vraiment (sinon : simple simulation). */
export const mailIsConfigured = config.smtpHost !== "";
