/**
 * Connexion à PostgreSQL (requêtes SQL brutes, pas d'ORM — cf. standards du projet).
 *
 * pg.Pool plutôt qu'un pg.Client unique : le pool garde plusieurs connexions
 * ouvertes et en prête une à chaque requête. Indispensable depuis que
 * l'indexation tourne EN ARRIÈRE-PLAN pendant que d'autres visiteurs
 * utilisent l'API : avec une seule connexion, le BEGIN d'une transaction
 * aurait englobé les requêtes de tout le monde.
 */
import pg from "pg";
import { config } from "../../config.ts";

// Les colonnes BIGINT (ex. media_file.size_bytes) arrivent en texte par défaut,
// car un BIGINT peut dépasser ce qu'un Number JS représente exactement.
// Une taille de fichier reste très loin de cette limite (9 Po) → conversion en nombre.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

const pool = new pg.Pool({ connectionString: config.dbUrl, max: 10 });

// une connexion inactive du pool peut tomber (BDD redémarrée…) : on le note
// au lieu de laisser l'erreur arrêter le processus
pool.on("error", (error) => {
  console.error("Connexion PostgreSQL inactive perdue", { error: error.message });
});

/**
 * Ce dont un DataMapper a besoin pour exécuter du SQL : soit le pool (cas
 * général), soit la connexion réservée à une transaction (cf. transaction.ts).
 */
export type Queryable = pg.Pool | pg.PoolClient;

export default pool;
