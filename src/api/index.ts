/**
 * bootstrap de l'application
 */

import "dotenv/config";
import { app } from "./src/app.ts";
import { config } from "./config.ts";

// sans secret, aucun jeton ne peut être signé ni vérifié : mieux vaut refuser de démarrer
// que de répondre 500 à chaque connexion
if (!config.jwtSecret) {
  console.error("JWT_SECRET manquant dans .env : démarrage annulé");
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`🚀 Server ready at http://localhost:${config.port}`);
});
