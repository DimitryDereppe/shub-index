/**
 * Contenu des emails envoyés par l'API (fonctions pures : testées sans envoyer d'email).
 */

/** Échappe le HTML : un prénom comme « <script> » doit s'afficher, pas s'exécuter dans l'email. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Email « réinitialiser mon mot de passe ».
 * Deux versions du même message : texte (toujours lisible) et HTML simple.
 */
export function buildPasswordResetEmail(firstname: string, link: string, validMinutes: number) {
  const subject = "shub-index — réinitialiser votre mot de passe";

  const text = [
    `Bonjour ${firstname},`,
    "",
    "Vous avez demandé à réinitialiser votre mot de passe shub-index.",
    `Ouvrez ce lien pour en choisir un nouveau (valable ${validMinutes} minutes, une seule fois) :`,
    link,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
  ].join("\n");

  const safeLink = escapeHtml(link);
  const html = `<p>Bonjour ${escapeHtml(firstname)},</p>
<p>Vous avez demandé à réinitialiser votre mot de passe <strong>shub-index</strong>.</p>
<p><a href="${safeLink}">Choisir un nouveau mot de passe</a> (lien valable ${validMinutes} minutes, une seule fois).</p>
<p>Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${safeLink}</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.</p>`;

  return { subject, text, html };
}
