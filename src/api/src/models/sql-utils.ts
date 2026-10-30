// Petits utilitaires SQL partagés par les DataMappers.

/**
 * Neutralise les jokers de LIKE/ILIKE dans un texte saisi : "%" (n'importe quelle suite)
 * et "_" (n'importe quel caractère). Sans ça, chercher "100%" trouverait "1000 ans".
 * Ce n'est PAS une protection contre l'injection SQL (la valeur reste passée en $1) :
 * c'est pour que la recherche fasse ce que l'utilisateur a tapé.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
