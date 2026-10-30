/**
 * Indexation en ligne de commande, pour la tâche planifiée (US21) :
 *   npm run scan          (dans le conteneur : docker compose exec -T shub-api npm run scan)
 *   npm run scan:dev      (en local, avec src/api/.env)
 *
 * Même code que POST /api/scans, mais sans passer par l'API : pas de compte
 * technique ni de mot de passe dans la crontab, et scan.user_id reste NULL (RG6).
 * Code de sortie : 0 si succès, 1 sinon (cron peut ainsi signaler l'échec).
 */
import "dotenv/config";
import pool from "./models/database-client.ts";
import { runScan, startScan } from "./services/scan.service.ts";

try {
  const scan = await startScan(null);
  console.log(`🔄 Indexation n°${scan.id} démarrée`);
  const result = await runScan(scan);
  console.log(result.status === "success" ? "✅ Indexation réussie" : `❌ Indexation échouée : ${result.errorMessage}`, {
    ajoutés: result.filesAdded,
    modifiés: result.filesUpdated,
    retirés: result.filesRemoved,
  });
  process.exitCode = result.status === "success" ? 0 : 1;
} catch (error) {
  // ex. une indexation est déjà en cours (ConflictError), ou la BDD est injoignable
  console.error(`❌ Indexation non lancée : ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end(); // ferme les connexions, sinon le processus ne s'arrête pas
}
