// Échantillonnage (seeding) : deux comptes de test, mots de passe hashés avec Argon2
// (comme à l'inscription — un mot de passe en clair en base ne permettrait pas de se connecter).
// Le catalogue, lui, se remplit avec une indexation (npm run scan:dev).
import argon2 from "argon2";
import pool from "./database-client.ts";

const password = await argon2.hash("Passw0rd!");

await pool.query(
  `INSERT INTO "user" (firstname, lastname, email, password, role) VALUES
    ($1, $2, $3, $4, 'admin'),
    ($5, $6, $7, $4, 'member')
   ON CONFLICT (email) DO NOTHING`,
  ["Alice", "Admin", "alice@example.com", password, "Bob", "Membre", "bob@example.com"]
);

console.log(`📊 Échantillonnage effectué : alice@example.com (admin) et bob@example.com (membre), mot de passe "Passw0rd!".`);

await pool.end();
