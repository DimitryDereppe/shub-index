/**
 * bootstrap de l'application
 */

import "dotenv/config";
import { app } from "./src/app.ts";
import { config } from "./config.ts";

app.listen(config.port, () => {
  console.log(`🚀 Server ready at http://localhost:${config.port}`);
});
