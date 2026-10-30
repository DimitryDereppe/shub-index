/**
 * Configuration Vite.
 * En développement, le "proxy" renvoie /api vers l'API Express : pour le navigateur,
 * client et API ont alors la MÊME origine (localhost:5173), comme en production
 * derrière Caddy → les cookies SameSite=Strict fonctionnent et pas besoin de CORS.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.API_TARGET ?? "http://localhost:4000",
    },
  },
});
