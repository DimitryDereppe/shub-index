/**
 * Indexations (admin) : lancer un scan (US20), suivre son avancement, historique (US24).
 *
 * Pendant qu'un scan tourne, on redemande l'historique toutes les 3 secondes
 * (setInterval dans un useEffect, arrêté dans le cleanup).
 */
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client.ts";
import type { Page, Scan } from "../../api/types.ts";
import { ErrorMessage, Loading } from "../../components/Status.tsx";
import { useApi } from "../../hooks/useApi.ts";
import { formatDate, formatDuration } from "../../utils/format.ts";

const STATUS_LABELS: Record<Scan["status"], string> = {
  running: "⏳ En cours",
  success: "✅ Réussie",
  failed: "❌ Échouée",
};

export function ScansPage() {
  const scans = useApi<Page<Scan>>("/scans?limit=20");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // valeur dérivée : pas besoin d'un state, on la recalcule à chaque rendu
  const isRunning = scans.status === "success" && scans.data.data.some((scan) => scan.status === "running");
  const { reload } = scans;

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer); // arrêt dès que plus rien ne tourne (ou en quittant la page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  async function startScan() {
    setIsStarting(true);
    setError(null);
    try {
      await api("/scans", { method: "POST" }); // 202 : la réponse arrive tout de suite
      reload();
    } catch (caught) {
      setError(errorMessage(caught)); // ex. 409 : une indexation est déjà en cours
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <>
      <h1>Indexation du NAS</h1>
      <p>
        L'indexation parcourt les dossiers autorisés du partage, ajoute les nouveaux films (identifiés sur TMDB) et
        retire ceux qui ont disparu. Elle tourne aussi automatiquement chaque nuit.
      </p>

      <button type="button" className="button" onClick={startScan} disabled={isStarting || isRunning}>
        {isRunning ? "Indexation en cours…" : "Lancer une indexation"}
      </button>
      {error && <ErrorMessage message={error} />}

      <h2>Historique</h2>
      {scans.status === "loading" && <Loading />}
      {scans.status === "error" && <ErrorMessage message={scans.error} />}
      {scans.status === "success" && (
        <div className="table-wrapper">
          <table className="table">
            <caption className="visually-hidden">Dernières indexations, la plus récente en premier</caption>
            <thead>
              <tr>
                <th scope="col">Début</th>
                <th scope="col">Statut</th>
                <th scope="col">Durée</th>
                <th scope="col">Ajoutés</th>
                <th scope="col">Modifiés</th>
                <th scope="col">Retirés</th>
                <th scope="col">Lancée par</th>
              </tr>
            </thead>
            {/* aria-live : les lecteurs d'écran annoncent la mise à jour des compteurs */}
            <tbody aria-live="polite">
              {scans.data.data.map((scan) => (
                <tr key={scan.id}>
                  <td>{formatDate(scan.startedAt)}</td>
                  <td>
                    {STATUS_LABELS[scan.status]}
                    {scan.errorMessage && <div className="table__error">{scan.errorMessage}</div>}
                  </td>
                  <td>{scan.finishedAt ? formatDuration(scan.startedAt, scan.finishedAt) : "—"}</td>
                  <td>{scan.filesAdded}</td>
                  <td>{scan.filesUpdated}</td>
                  <td>{scan.filesRemoved}</td>
                  <td>{scan.userId ? "Un admin" : "Tâche planifiée"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
