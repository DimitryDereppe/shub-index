/**
 * Petits outils de validation Zod partagés par les controllers.
 */
import z from "zod";

/**
 * Un champ de formulaire vide arrive en "" dans la query string (?year=).
 * On le traite comme "absent" plutôt que de refuser la requête (z.preprocess
 * transforme la valeur AVANT la validation).
 */
export function emptyToUndefined(value: unknown): unknown {
  return value === "" ? undefined : value;
}

/** Texte de recherche facultatif : espaces retirés, 100 caractères maximum. */
export const optionalSearchText = z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional());

/** Paramètre de route :id → entier strictement positif, sinon 400. */
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
