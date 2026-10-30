/**
 * Rattrapage, à lancer UNE fois après la migration du 2026-10-30 :
 * le scan ne réimporte jamais un film déjà en base, donc les films existants
 * n'ont ni saga, ni studios, ni la nouvelle classification (« la plus stricte »).
 * Ce script redemande à TMDB la fiche de chaque film et complète la base.
 *
 *   npm run backfill            → SIMULATION : affiche les changements, n'écrit rien
 *   npm run backfill -- --apply → écrit vraiment en base
 *
 * Un film corrigé à la main par un admin (US29) garde SA classification :
 * seule sa saga est ajoutée.
 */
import "dotenv/config";
import pool from "./models/database-client.ts";
import moviesDataMapper from "./models/movies.datamapper.ts";
import sagasDataMapper from "./models/sagas.datamapper.ts";
import studiosDataMapper from "./models/studios.datamapper.ts";
import { frenchCertificationOf, getMovieWithCredits, sagaOf, studiosOf } from "./services/tmdb.client.ts";

const apply = process.argv.includes("--apply");
console.log(apply ? "✍️  Mode ÉCRITURE" : "👀 Mode SIMULATION (ajouter -- --apply pour écrire)");

let certificationChanges = 0;
let sagasFound = 0;
let studioLinks = 0;
let errors = 0;

try {
  const movies = await moviesDataMapper.findAllWithTmdbId();
  console.log(`${movies.length} films à vérifier`);

  // un film après l'autre (pas de Promise.all) : on reste gentil avec TMDB
  for (const movie of movies) {
    try {
      const details = await getMovieWithCredits(movie.tmdbId);
      const saga = sagaOf(details);
      const certification = movie.editedByAdmin ? movie.certification : frenchCertificationOf(details);

      if (certification !== movie.certification) {
        certificationChanges++;
        console.log(`  ${movie.title} : classification ${movie.certification ?? "?"} → ${certification ?? "?"}`);
      }
      if (saga) {
        sagasFound++;
      }
      const studios = studiosOf(details);
      studioLinks += studios.length;

      if (apply) {
        const sagaId = saga ? await sagasDataMapper.upsertFromTmdb(saga) : null;
        await moviesDataMapper.updateCertificationAndSaga(movie.id, certification, sagaId);
        // ajoute les studios (ON CONFLICT DO NOTHING : relancer le script ne crée pas de doublon)
        await moviesDataMapper.addStudios(movie.id, await studiosDataMapper.upsertFromTmdb(studios));
      }
    } catch (error) {
      // un film en erreur (TMDB indisponible…) ne bloque pas les autres
      errors++;
      console.error(`  ❌ ${movie.title} (TMDB ${movie.tmdbId}) : ${(error as Error).message}`);
    }
  }

  console.log(`✅ Terminé : ${certificationChanges} classification(s) modifiée(s), ${sagasFound} film(s) dans une saga, ` +
    `${studioLinks} lien(s) film-studio, ${errors} erreur(s)`);
  process.exitCode = errors === 0 ? 0 : 1;
} finally {
  await pool.end();
}
