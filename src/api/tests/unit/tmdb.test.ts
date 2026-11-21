/**
 * Tests des fonctions pures du client TMDB (aucun appel réseau).
 * Lancer : npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  certificationOf,
  directorsMatch,
  discoverParams,
  frenchCertificationOf,
  isOnPrimeVideo,
  matchesFilters,
  normalizeName,
  posterUrlOf,
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

describe("certificationOf", () => {
  const withReleases = (byCountry: Record<string, string[]>): TmdbMovieDetails => ({
    ...alien3,
    release_dates: {
      results: Object.entries(byCountry).map(([country, notes]) => ({
        iso_3166_1: country,
        release_dates: notes.map((certification) => ({ certification })),
      })),
    },
  });

  it("Alien : la France (12) est corrigée par la médiane des pays → 16", () => {
    assert.equal(certificationOf(withReleases({ FR: ["12"], DE: ["16"], GB: ["18"], NL: ["16"] })), "16");
  });

  it("une note isolée trop haute ne l'emporte pas", () => {
    assert.equal(certificationOf(withReleases({ FR: ["18"], DE: ["16"], GB: ["15"], NL: ["16"] })), "16");
  });

  it("traduit les échelles étrangères (BBFC 15 → 16, FSK 6 → TP)", () => {
    assert.equal(certificationOf(withReleases({ GB: ["15"] })), "16");
    assert.equal(certificationOf(withReleases({ DE: ["6"] })), "TP");
  });

  it("nombre pair de pays → la plus stricte des deux du milieu", () => {
    assert.equal(certificationOf(withReleases({ FR: ["TP"], DE: ["12"] })), "12");
  });

  it("ignore les pays non suivis (US) et sans note → null", () => {
    assert.equal(certificationOf(withReleases({ US: ["R"] })), null);
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

describe("isOnPrimeVideo", () => {
  // forme réelle de /movie/:id/watch/providers (réduite)
  const prime = { provider_id: 119, provider_name: "Amazon Prime Video" };

  it("vrai si Prime Video est dans l'abonnement en France", () => {
    assert.equal(isOnPrimeVideo({ results: { FR: { flatrate: [prime] } } }), true);
  });

  it("vrai pour la formule avec pubs (2100)", () => {
    assert.equal(
      isOnPrimeVideo({ results: { FR: { flatrate: [{ provider_id: 2100, provider_name: "Amazon Prime Video with Ads" }] } } }),
      true
    );
  });

  it("faux pour une chaîne Amazon payante en plus (HBO Max Amazon Channel)", () => {
    assert.equal(
      isOnPrimeVideo({ results: { FR: { flatrate: [{ provider_id: 1825, provider_name: "HBO Max Amazon Channel" }] } } }),
      false
    );
  });

  it("faux si Prime Video ne le propose que dans un autre pays", () => {
    assert.equal(isOnPrimeVideo({ results: { US: { flatrate: [prime] } } }), false);
  });

  it("faux sans aucune donnée", () => {
    assert.equal(isOnPrimeVideo({}), false);
  });
});

describe("posterUrlOf", () => {
  it("complète le chemin TMDB, null sans affiche", () => {
    assert.equal(posterUrlOf("/abc.jpg"), "https://image.tmdb.org/t/p/w342/abc.jpg");
    assert.equal(posterUrlOf(null), null);
  });
});

describe("discoverParams", () => {
  it("sans critère : Prime Video en France, abonnement seulement, par popularité", () => {
    assert.deepEqual(discoverParams("movie", { genreIds: [], sort: "popularity" }), {
      watch_region: "FR",
      with_watch_providers: "119|2100",
      with_watch_monetization_types: "flatrate",
      sort_by: "popularity.desc",
    });
  });

  it("films : années, genres (ET), personnes, classification TP → U", () => {
    const params = discoverParams("movie", {
      year: 1999,
      yearFrom: 1990,
      yearTo: 2000,
      genreIds: [28, 878],
      castId: 6384,
      crewId: 9339,
      maxCertification: "TP",
      sort: "-year",
    });
    assert.equal(params.primary_release_year, "1999");
    assert.equal(params["primary_release_date.gte"], "1990-01-01");
    assert.equal(params["primary_release_date.lte"], "2000-12-31");
    assert.equal(params.with_genres, "28,878");
    assert.equal(params.with_cast, "6384");
    assert.equal(params.with_crew, "9339");
    assert.equal(params.certification_country, "FR");
    assert.equal(params["certification.lte"], "U");
    assert.equal(params.sort_by, "primary_release_date.desc");
  });

  it("séries : dates de 1re diffusion, tri par nom, ni personnes ni classification", () => {
    const params = discoverParams("tv", { year: 2022, genreIds: [], castId: 1, maxCertification: "12", sort: "title" });
    assert.equal(params.first_air_date_year, "2022");
    assert.equal(params.sort_by, "name.asc");
    assert.equal(params.with_cast, undefined);
    assert.equal(params["certification.lte"], undefined);
  });

  it("tri par note : exige un minimum de votes", () => {
    assert.equal(discoverParams("movie", { genreIds: [], sort: "rating" })["vote_count.gte"], "200");
  });
});

describe("matchesFilters", () => {
  const reacher = { id: 108978, name: "Reacher", first_air_date: "2022-02-03", genre_ids: [10759, 80, 18], overview: "", poster_path: null };

  it("vrai sans critère", () => {
    assert.equal(matchesFilters(reacher, { genreIds: [] }), true);
  });

  it("vérifie la période (série : 1re diffusion)", () => {
    assert.equal(matchesFilters(reacher, { yearFrom: 2020, yearTo: 2023, genreIds: [] }), true);
    assert.equal(matchesFilters(reacher, { yearTo: 2021, genreIds: [] }), false);
  });

  it("exige TOUS les genres", () => {
    assert.equal(matchesFilters(reacher, { genreIds: [80, 18] }), true);
    assert.equal(matchesFilters(reacher, { genreIds: [80, 16] }), false);
  });

  it("date inconnue : écarté seulement si une période est demandée", () => {
    const undated = { ...reacher, first_air_date: "" };
    assert.equal(matchesFilters(undated, { genreIds: [] }), true);
    assert.equal(matchesFilters(undated, { yearFrom: 2000, genreIds: [] }), false);
  });
});
