/**
 * Petits composants d'état réutilisés partout : chargement, erreur.
 * role="status" / role="alert" : les lecteurs d'écran annoncent le message
 * quand il apparaît, sans que l'utilisateur ait à le chercher.
 */
export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <p role="status" className="status">
      {label}
    </p>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="status status--error">
      {message}
    </p>
  );
}
