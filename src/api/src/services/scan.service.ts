/**
 * Indexation du partage réseau (US20 → US25), cf. diagramme d'activité
 * docs/conception/uml/activite/indexation.puml.
 *
 * 1. startScan : crée la ligne "running" (409 si une indexation tourne déjà, RG6)
 * 2. runScan   : parcourt les dossiers autorisés, compare avec la base, identifie
 *                les nouveaux fichiers sur TMDB, retire les fichiers disparus (RG7)
 *
 * Le partage est en LECTURE SEULE : on ne fait que lire (readdir/stat), jamais écrire.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.ts";
import { ConflictError } from "../lib/errors.ts";
import mediaFilesDataMapper, { type FileOnDisk, type KnownMediaFile } from "../models/media-files.datamapper.ts";
import scansDataMapper, { UNIQUE_VIOLATION, type ScanCounters, type ScanRow } from "../models/scans.datamapper.ts";
import { importMovie } from "./catalog-import.service.ts";
import { parseFilename, type ParsedFilename } from "./filename-parser.ts";
import {
  directorsMatch,
  directorsOf,
  getMovieWithCredits,
  normalizeName,
  searchMovie,
  titleVariants,
  TmdbError,
  yearOf,
  type TmdbMovieDetails,
  type TmdbSearchResult,
} from "./tmdb.client.ts";

const STALE_SCAN_MINUTES = 120; // au-delà, un scan "running" est considéré comme abandonné
const MAX_CONSECUTIVE_TMDB_ERRORS = 5; // TMDB en panne → on arrête au lieu d'insister 300 fois
const COUNTERS_REFRESH_EVERY = 20; // compteurs mis à jour en base tous les 20 fichiers

/** Erreur "attendue" qui arrête l'indexation, avec un message lisible par l'admin. */
class ScanAbortError extends Error {}

export interface ScanResult extends ScanCounters {
  status: "success" | "failed";
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// 1. Démarrage
// ---------------------------------------------------------------------------

/**
 * Crée l'indexation en base.
 * @param userId admin qui la lance, ou null pour la tâche planifiée (RG6)
 * @throws ConflictError si une indexation est déjà en cours (US25)
 */
export async function startScan(userId: number | null): Promise<ScanRow> {
  await scansDataMapper.failStale(STALE_SCAN_MINUTES);
  try {
    return await scansDataMapper.create(userId);
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ConflictError("Une indexation est déjà en cours");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 2. Déroulement
// ---------------------------------------------------------------------------

/**
 * Exécute l'indexation. Ne lance JAMAIS d'erreur : tout échec est enregistré
 * dans la ligne `scan` (statut "failed" + message court) — indispensable car le
 * controller l'appelle en arrière-plan, sans attendre la fin.
 */
export async function runScan(scan: ScanRow): Promise<ScanResult> {
  const counters: ScanCounters = { filesAdded: 0, filesUpdated: 0, filesRemoved: 0 };

  try {
    // a) lister le disque — RG9 : lève ScanAbortError si un dossier est absent ou vide
    const filesOnDisk = await listShareFiles();

    // b) ce que la base connaît déjà, rangé par chemin (une seule requête, pas une par fichier)
    const knownByPath = new Map<string, KnownMediaFile>();
    for (const known of await mediaFilesDataMapper.findAllKnown()) {
      knownByPath.set(known.path, known);
    }

    // c) comparer fichier par fichier
    const matcher = new TmdbMatcher();
    const unchangedIds: number[] = [];
    let processed = 0;

    for (const file of filesOnDisk) {
      const known = knownByPath.get(file.path);
      let fileId: number;
      let mustIdentify: boolean;

      if (!known) {
        fileId = await mediaFilesDataMapper.create(file);
        counters.filesAdded++;
        mustIdentify = true;
      } else if (hasChanged(known, file)) {
        await mediaFilesDataMapper.updateChanged(known.id, file);
        counters.filesUpdated++;
        fileId = known.id;
        mustIdentify = known.status !== "ignored";
      } else {
        // inchangé : pas d'appel TMDB (US22), sauf s'il était resté "pending" (TMDB en panne la dernière fois)
        unchangedIds.push(known.id);
        fileId = known.id;
        mustIdentify = known.status === "pending";
      }

      if (mustIdentify) {
        await identifyFile(fileId, file.filename, matcher);
      }

      processed++;
      if (processed % COUNTERS_REFRESH_EVERY === 0) {
        await scansDataMapper.updateCounters(scan.id, counters);
      }
    }

    // d) RG7 : ce qui n'a pas été vu pendant CETTE indexation a disparu du NAS
    await mediaFilesDataMapper.markSeen(unchangedIds);
    counters.filesRemoved = await mediaFilesDataMapper.deleteNotSeenSince(scan.startedAt);

    await scansDataMapper.finish(scan.id, "success", counters, null);
    console.log("Indexation terminée", { scanId: scan.id, files: filesOnDisk.length, ...counters });
    return { status: "success", ...counters, errorMessage: null };
  } catch (error) {
    // message destiné à l'admin : on ne recopie que nos propres messages, jamais un détail technique
    const message =
      error instanceof ScanAbortError || error instanceof TmdbError
        ? error.message
        : "Erreur inattendue pendant l'indexation (voir les logs du serveur)";
    console.error("Indexation échouée", { scanId: scan.id, error: (error as Error).message });

    try {
      await scansDataMapper.finish(scan.id, "failed", counters, message);
    } catch (finishError) {
      console.error("Impossible d'enregistrer l'échec de l'indexation", {
        scanId: scan.id,
        error: (finishError as Error).message,
      });
    }
    return { status: "failed", ...counters, errorMessage: message };
  }
}

/** Taille différente ou date de modification différente (tolérance d'1 s : précision des systèmes de fichiers). */
function hasChanged(known: KnownMediaFile, file: FileOnDisk): boolean {
  return (
    known.sizeBytes !== file.sizeBytes ||
    Math.abs(new Date(known.modifiedAt).getTime() - file.modifiedAt.getTime()) > 1000
  );
}

// ---------------------------------------------------------------------------
// Lecture du partage
// ---------------------------------------------------------------------------

/** Tous les fichiers vidéo des dossiers autorisés (SCAN_ROOTS), moins les exclus (SCAN_EXCLUDED). */
async function listShareFiles(): Promise<FileOnDisk[]> {
  const allFiles: FileOnDisk[] = [];

  for (const root of config.scanRoots) {
    const absoluteRoot = path.join(config.shareRoot, root);

    // RG9 — garde-fou anti-vidage : sans lui, un partage non monté (dossier vide)
    // ferait croire que tous les films ont disparu, et RG7 viderait le catalogue
    const stats = await fs.stat(absoluteRoot).catch(() => null);
    if (!stats?.isDirectory()) {
      throw new ScanAbortError(`Dossier « ${root} » introuvable : le partage est-il monté ?`);
    }
    const files = await walk(absoluteRoot, root);
    if (files.length === 0) {
      throw new ScanAbortError(`Aucun fichier vidéo dans « ${root} » : le partage est-il monté ?`);
    }
    allFiles.push(...files);
  }
  return allFiles;
}

// noms comparés après normalisation Unicode (NFC) : "é" peut s'écrire de deux façons en octets
const excludedNames = new Set(config.scanExcluded.map((name) => name.normalize("NFC")));

/**
 * Parcours récursif d'un dossier (la fonction s'appelle elle-même pour chaque sous-dossier).
 * @param absoluteDir chemin réel sur le disque
 * @param relativeDir même dossier, relatif à la racine du partage (c'est lui qu'on stocke)
 */
async function walk(absoluteDir: string, relativeDir: string): Promise<FileOnDisk[]> {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const files: FileOnDisk[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue; // dossiers/fichiers cachés (ex. .auto-organize)
    }
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = `${relativeDir}/${entry.name}`.normalize("NFC");

    if (entry.isDirectory()) {
      if (!excludedNames.has(entry.name.normalize("NFC"))) {
        files.push(...(await walk(absolutePath, relativePath)));
      }
    } else if (entry.isFile()) {
      const extension = path.extname(entry.name).slice(1).toLowerCase();
      if (config.videoExtensions.includes(extension)) {
        const stats = await fs.stat(absolutePath);
        files.push({
          path: relativePath,
          filename: entry.name.normalize("NFC"),
          extension,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime,
        });
      }
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Identification d'un fichier
// ---------------------------------------------------------------------------

/** Nom de fichier → film TMDB → film en base, puis mise à jour du statut du fichier. */
async function identifyFile(fileId: number, filename: string, matcher: TmdbMatcher): Promise<void> {
  const parsed = parseFilename(filename);
  if (!parsed) {
    await mediaFilesDataMapper.setUnlinkedStatus(fileId, "unmatched"); // RG8 : à traiter par l'admin
    return;
  }

  let details: TmdbMovieDetails | null;
  try {
    details = await matcher.find(parsed);
  } catch (error) {
    if (!(error instanceof TmdbError)) {
      throw error;
    }
    // TMDB indisponible : le fichier reste "pending" et sera réessayé à la prochaine indexation
    matcher.consecutiveErrors++;
    console.error("TMDB indisponible pour un fichier", { fileId, error: error.message });
    if (matcher.consecutiveErrors >= MAX_CONSECUTIVE_TMDB_ERRORS) {
      throw new TmdbError("TMDB injoignable : indexation interrompue, les fichiers restent en attente");
    }
    return;
  }
  matcher.consecutiveErrors = 0;

  if (!details) {
    await mediaFilesDataMapper.setUnlinkedStatus(fileId, "unmatched");
    return;
  }
  const movieId = await importMovie(details);
  await mediaFilesDataMapper.setMatched(fileId, movieId);
}

/**
 * Retrouve le film TMDB qui correspond à un nom de fichier, avec deux caches
 * (un film en 2 parties = 2 fichiers, mais une seule recherche TMDB).
 *
 * Stratégie (même esprit qu'organize.py), pour chaque variante du titre (titleVariants) :
 * - chercher titre + année, sinon titre seul avec ±1 an ; garder les 3 premiers résultats ;
 * - si le nom contient des réalisateurs : accepter le 1er résultat dont un réalisateur
 *   correspond (grande confiance) ;
 * - sinon, parmi les résultats de la bonne année (±1) : celui dont le titre est
 *   exactement celui du fichier, ou à défaut l'unique résultat (avec réalisateurs)
 *   ou le premier (sans réalisateurs, ex. Disney) ;
 * - rien de sûr → variante suivante ; plus de variante → "non identifié".
 */
class TmdbMatcher {
  consecutiveErrors = 0;
  private resultsByFile = new Map<string, TmdbMovieDetails | null>();
  private detailsById = new Map<number, TmdbMovieDetails>();

  async find(parsed: ParsedFilename): Promise<TmdbMovieDetails | null> {
    const key = [normalizeName(parsed.title), parsed.year, ...parsed.directors.map(normalizeName)].join("|");
    if (this.resultsByFile.has(key)) {
      return this.resultsByFile.get(key)!;
    }
    const result = await this.search(parsed);
    this.resultsByFile.set(key, result);
    return result;
  }

  private async search(parsed: ParsedFilename): Promise<TmdbMovieDetails | null> {
    for (const query of titleVariants(parsed.title)) {
      const candidates = await this.candidatesFor(query, parsed.year);
      const match = candidates.length > 0 ? await this.choose(parsed, candidates) : null;
      if (match) {
        return match;
      }
    }
    return null; // on préfère "non identifié" (corrigeable par l'admin) à un mauvais film
  }

  /** Les 3 premiers résultats TMDB pour un texte, avec l'année puis à ±1 an. */
  private async candidatesFor(query: string, year: number): Promise<TmdbSearchResult[]> {
    let results = await searchMovie(query, year);
    if (results.length === 0) {
      // l'année TMDB diffère parfois d'un an (sortie française / mondiale)
      results = (await searchMovie(query, null)).filter((r) => isCloseYear(yearOf(r.release_date), year));
    }
    return results.slice(0, 3);
  }

  /** Choisit le bon film parmi les candidats, ou null s'il n'y a pas de choix sûr. */
  private async choose(parsed: ParsedFilename, candidates: TmdbSearchResult[]): Promise<TmdbMovieDetails | null> {
    if (parsed.directors.length > 0) {
      for (const candidate of candidates) {
        const details = await this.details(candidate.id);
        if (directorsMatch(parsed.directors, directorsOf(details).map((director) => director.name))) {
          return details;
        }
      }
    }

    const sameYear = candidates.filter((c) => isCloseYear(yearOf(c.release_date), parsed.year));

    // titre identique (français ou original) : "The Animatrix" parmi ses making-of de la même année
    const wanted = normalizeName(parsed.title);
    const sameTitle = sameYear.filter((c) => normalizeName(c.title) === wanted || normalizeName(c.original_title) === wanted);
    if (sameTitle.length === 1) {
      return this.details(sameTitle[0].id);
    }

    if (parsed.directors.length > 0) {
      // Aucun réalisateur ne colle. Causes vues sur le vrai NAS : nom en kanji sur TMDB
      // (寺沢伸介 ≠ "Shinsuke Terasawa"), ou réalisateur faux dans le nom de fichier.
      // Seconde chance prudente : un SEUL candidat de la bonne année (±1).
      return sameYear.length === 1 ? this.details(sameYear[0].id) : null;
    }
    return sameYear[0] ? this.details(sameYear[0].id) : null; // sans réalisateur (Disney…) : le 1er de la bonne année
  }

  private async details(tmdbId: number): Promise<TmdbMovieDetails> {
    let details = this.detailsById.get(tmdbId);
    if (!details) {
      details = await getMovieWithCredits(tmdbId);
      this.detailsById.set(tmdbId, details);
    }
    return details;
  }
}

function isCloseYear(tmdbYear: number | null, fileYear: number): boolean {
  return tmdbYear !== null && Math.abs(tmdbYear - fileYear) <= 1;
}
