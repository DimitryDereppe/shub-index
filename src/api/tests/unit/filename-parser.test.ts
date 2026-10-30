/**
 * Tests du parseur de nom de fichier (node:test) — écrits AVANT le code (TDD).
 * Tous les cas viennent de vrais fichiers du NAS (cf. clarifications § 8).
 * Lancer : npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFilename } from "../../src/services/filename-parser.ts";

describe("parseFilename", () => {
  it("lit titre, année, classification et réalisateur", () => {
    assert.deepEqual(parseFilename("Alien 3 (1992) [16] - David Fincher.mkv"), {
      title: "Alien 3",
      year: 1992,
      certification: "16",
      directors: ["David Fincher"],
    });
  });

  it("sépare plusieurs réalisateurs", () => {
    assert.deepEqual(
      parseFilename("Matrix Revolutions (2003) [12] - Lana Wachowski, Lilly Wachowski.avi")?.directors,
      ["Lana Wachowski", "Lilly Wachowski"]
    );
  });

  it("classification vide → null", () => {
    const result = parseFilename("Juste après l'Aube (2026) [] - Olivier Boillot.mp4");
    assert.equal(result?.title, "Juste après l'Aube");
    assert.equal(result?.certification, null);
    assert.deepEqual(result?.directors, ["Olivier Boillot"]);
  });

  it("nom Disney : titre + année seulement", () => {
    assert.deepEqual(parseFilename("Oliver et Compagnie (1988).mkv"), {
      title: "Oliver et Compagnie",
      year: 1988,
      certification: null,
      directors: [],
    });
  });

  it("ignore le suffixe de doublon « (2) »", () => {
    const result = parseFilename("Ghost Rider (2007) [TP] - Mark Steven Johnson (2).avi");
    assert.equal(result?.title, "Ghost Rider");
    assert.equal(result?.certification, "TP");
    assert.deepEqual(result?.directors, ["Mark Steven Johnson"]);
  });

  it("garde un titre qui contient lui-même « - »", () => {
    const result = parseFilename("Star Wars - Épisode I - La Menace Fantôme (1999) [TP] - George Lucas.avi");
    assert.equal(result?.title, "Star Wars - Épisode I - La Menace Fantôme");
    assert.equal(result?.year, 1999);
    assert.deepEqual(result?.directors, ["George Lucas"]);
  });

  it("ignore « - Partie N » (film en plusieurs fichiers)", () => {
    const result = parseFilename("Le Seigneur des Anneaux (2001) [12] - Peter Jackson - Partie 2.mkv");
    assert.equal(result?.title, "Le Seigneur des Anneaux");
    assert.deepEqual(result?.directors, ["Peter Jackson"]);
  });

  it("ignore « - Partie N » sans réalisateur", () => {
    const result = parseFilename("Fantasia (1940) - Partie 1.mkv");
    assert.equal(result?.title, "Fantasia");
    assert.deepEqual(result?.directors, []);
  });

  it("classification inconnue (hors liste) → null", () => {
    assert.equal(parseFilename("Film (2000) [?] - Quelqu'un.mkv")?.certification, null);
  });

  it("nom au format DVD non reconnu → null", () => {
    assert.equal(parseFilename("052540DVD A Gander at Mother Goose MM.avi"), null);
  });

  it("année hors bornes → null", () => {
    assert.equal(parseFilename("Futur (3050).mkv"), null);
  });
});
