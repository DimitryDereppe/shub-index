// ================================================================================
// Environnement des tests d'intégration (*.spec.test.ts), repris d'oQuiz (SC03)
// et adapté à pg (pas de Prisma ici).
//
// === AVANT les tests ===
// Variables chargées par le flag --env-file (tests/config/.env.test)
// Conteneur PostgreSQL jetable (shubtest) + création des tables (database/init.sql)
// Lancement du serveur Express de test
//
// === Entre chaque test ===
// On vide toutes les tables (chaque test part d'une base vide)
//
// === APRÈS les tests ===
// Arrêt du serveur, fermeture du pool, suppression du conteneur
// ================================================================================
import { execSync } from "node:child_process";
import type { Server } from "node:http";
import path from "node:path";
import { after, before, beforeEach } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { app } from "../../src/app.ts";
import pool from "../../src/models/database-client.ts";

const CONTAINER = "shubtest";
const INIT_SQL = path.join(import.meta.dirname, "../../database/init.sql");

let server: Server;

before(async () => {
  // (hack) un conteneur oublié par un test interrompu bloquerait le port
  execSync(`docker rm -f ${CONTAINER} 2>/dev/null || true`);

  // base JETABLE → on peut sacrifier la durabilité pour la vitesse (démarrage ~45 s → quelques s) :
  // --tmpfs : données en mémoire vive ; fsync=off : PostgreSQL n'attend plus l'écriture sur disque
  execSync(`
    docker run -d --name ${CONTAINER} \
    -p ${process.env.POSTGRES_PORT}:5432 \
    --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=${process.env.POSTGRES_USER} \
    -e POSTGRES_PASSWORD=${process.env.POSTGRES_PASSWORD} \
    -e POSTGRES_DB=${process.env.POSTGRES_DB} \
    postgres:16-alpine -c fsync=off -c synchronous_commit=off -c full_page_writes=off
  `);

  await waitForDatabase();

  // crée les tables : le même script que la prod (une base neuve)
  execSync(
    `docker exec -i ${CONTAINER} psql -q -v ON_ERROR_STOP=1 -U ${process.env.POSTGRES_USER} -d ${process.env.POSTGRES_DB} < "${INIT_SQL}"`,
    { stdio: ["pipe", "ignore", "inherit"] } // n'affiche que les erreurs (pas les NOTICE du DROP IF EXISTS)
  );

  server = app.listen(process.env.PORT);
});

beforeEach(async () => {
  await truncateTables();
});

after(async () => {
  server?.close();
  await pool.end();
  execSync(`docker rm -f ${CONTAINER}`);
});

// essaie de se connecter 1 fois par seconde, 60 fois au maximum
async function waitForDatabase() {
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`PostgreSQL indisponible après ${maxAttempts} tentatives`, { cause: error });
      }
      await delay(1000);
    }
  }
}

// vide toutes les tables du schéma public et remet les compteurs d'id à 1
async function truncateTables() {
  await pool.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}
