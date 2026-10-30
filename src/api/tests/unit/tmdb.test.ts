/**
 * Tests des fonctions pures du client TMDB (aucun appel réseau).
 * Lancer : npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  directorsMatch,
  frenchCertificationOf,
  normalizeName,
  sagaOf,
  studiosOf,
  titleVariants,
  toMovieImport,
  yearOf,
  type TmdbMovieDetails,
} from "../../src/services/tmdb.client.ts";

// fiche TMDB réduite d'Alien³ (forme réelle de /movie/8077?append_to_response=credits,release_dates)
const alien3: TmdbMovieDetails = {
  id: 8077,
  title: "Alien³",
  original_title: "Alien³",
  release_date: "1992-05-22",
  runtime: 114,
  overview: "Ripley s'écrase sur Fiorina 161…",
  poster_path: "/abc.jpg",
  genres: [{ id: 878, name: "Science-Fiction" }, { id: 27, name: "Horreur" }],
  credits: {
    cast: [
      { id: 2, name: "Charles S. Dutton", character: "Dillon", order: 1 },
      { id: 1, name: "Sigourney Weaver", character: "Ellen Ripley", order: 0 },
      { id: 1, name: "Sigourney Weaver", character: "Voix", order: 5 },
      { id: 3, name: "Charles Dance", character: "Clemens", order: 2 },
    ],
    crew: [
      { id: 7467, name: "David Fincher", job: "Director" },
      { id: 7467, name: "David Fincher", job: "Director" },
      { id: 9, name: "Elliot Goldenthal", job: "Original Music Composer" },
    ],
  },
  release_dates: {
    results: [
      { iso_3166_1: "US", release_dates: [{ certification: "R" }] },
      { iso_3166_1: "FR", release_dates: [{ certification: "" }, { certification: "16" }] },
    ],
  },
};

describe("yearOf / normalizeName", () => {
  it("lit l'année d'une date TMDB", () => {
    assert.equal(yearOf("1992-05-22"), 1992);
    assert.equal(yearOf(""), null);
  });

  it("ignore accents, casse et ponctuation", () => {
    assert.equal(normalizeName("Étienne Chatiliez"), "etiennechatiliez");
    assert.equal(normalizeName("J.J. Abrams"), "jjabrams");
  });
});

describe("directorsMatch", () => {
  it("trouve un réalisateur commun malgré les accents", () => {
    assert.equal(directorsMatch(["Etienne Chatiliez"], ["Étienne Chatiliez"]), true);
  });

  it("un seul réalisateur commun suffit (co-réalisation)", () => {
    assert.equal(directorsMatch(["Joe Russo", "Anthony Russo"], ["Anthony Russo"]), true);
  });

  it("refuse si aucun réalisateur ne correspond", () => {
    assert.equal(directorsMatch(["Mark Steven Johnson"], ["Jerry Zucker"]), false);
  });
});

describe("frenchCertificationOf", () => {
  it("ignore les classifications françaises vides", () => {
    assert.equal(frenchCertificationOf(alien3), "16");
  });

  it("garde la plus stricte des sorties françaises, pas la première", () => {
    const releases = [{ certification: "U" }, { certification: "12" }, { certification: "10" }];
    const details = { ...alien3, release_dates: { results: [{ iso_3166_1: "FR", release_dates: releases }] } };
    assert.equal(frenchCertificationOf(details), "12");
  });

  it("traduit « U » en « TP »", () => {
    const details = { ...alien3, release_dates: { results: [{ iso_3166_1: "FR", release_dates: [{ certification: "U" }] }] } };
    assert.equal(frenchCertificationOf(details), "TP");
  });

  it("pas de sortie française → null", () => {
    assert.equal(frenchCertificationOf({ ...alien3, release_dates: { results: [] } }), null);
  });
});

describe("sagaOf", () => {
  it("lit la collection TMDB et complète l'URL de l'affiche", () => {
    const details = { ...alien3, belongs_to_collection: { id: 8091, name: "Alien - Saga", poster_path: "/saga.jpg" } };
    assert.deepEqual(sagaOf(details), {
      tmdbId: 8091,
      name: "Alien - Saga",
      posterUrl: "https://image.tmdb.org/t/p/w342/saga.jpg",
    });
  });

  it("collection sans affiche → posterUrl null", () => {
    const details = { ...alien3, belongs_to_collection: { id: 8091, name: "Alien - Saga", poster_path: null } };
    assert.equal(sagaOf(details)?.posterUrl, null);
  });

  it("pas de collection (null ou champ absent) → null", () => {
    assert.equal(sagaOf({ ...alien3, belongs_to_collection: null }), null);
    assert.equal(sagaOf(alien3), null);
  });
});

describe("studiosOf", () => {
  it("garde les studios dans l'ordre TMDB, sans doublon", () => {
    const details = {
      ...alien3,
      production_companies: [
        { id: 420, name: "Marvel Studios" },
        { id: 7505, name: "Marvel Entertainment" },
        { id: 420, name: "Marvel Studios" },
      ],
    };
    assert.deepEqual(studiosOf(details), [
      { tmdbId: 420, name: "Marvel Studios" },
      { tmdbId: 7505, name: "Marvel Entertainment" },
    ]);
  });

  it("champ absent → []", () => {
    assert.deepEqual(studiosOf(alien3), []);
  });
});

describe("toMovieImport", () => {
  const movie = toMovieImport(alien3, 2);

  it("garde les champs principaux et l'URL complète de l'affiche", () => {
    assert.equal(movie.tmdbId, 8077);
    assert.equal(movie.releaseYear, 1992);
    assert.equal(movie.originalTitle, null); // identique au titre → inutile de le répéter
    assert.equal(movie.posterUrl, "https://image.tmdb.org/t/p/w342/abc.jpg");
  });

  it("dédoublonne les réalisateurs", () => {
    assert.deepEqual(movie.directors, [{ tmdbId: 7467, name: "David Fincher" }]);
  });

  it("trie le casting, fusionne les doubles rôles et respecte la limite", () => {
    assert.deepEqual(
      movie.cast.map((member) => [member.name, member.character, member.order]),
      [
        ["Sigourney Weaver", "Ellen Ripley / Voix", 0],
        ["Charles S. Dutton", "Dillon", 1],
      ]
    );
  });
});

describe("titleVariants", () => {
  it("commence toujours par le titre tel quel", () => {
    assert.deepEqual(titleVariants("Alien 3"), ["Alien 3"]);
  });

  it("titre avec « - » : sans le tiret, puis la partie avant (nom de la saga)", () => {
    assert.deepEqual(titleVariants("Underworld 3 - la Rébellion des Lycans"), [
      "Underworld 3 - la Rébellion des Lycans",
      "Underworld 3 la Rébellion des Lycans",
      "Underworld 3",
    ]);
  });

  it("retire « Les Aventures de » en tête (titres Disney)", () => {
    assert.ok(
      titleVariants("Les Aventures de Bernard et Bianca au Pays des Kangourous").includes(
        "Bernard et Bianca au Pays des Kangourous"
      )
    );
  });

  it("met le premier mot au singulier", () => {
    assert.ok(titleVariants("Frères des Ours").includes("Frère des Ours"));
  });

  it("ne garde pas de variante trop courte ni de doublon", () => {
    assert.deepEqual(titleVariants("Ys - X"), ["Ys - X", "Ys X"]);
  });
});
