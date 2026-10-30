// Tests d'intégration de la recherche par saga (GET /movies, GET /movies/:id) : npm run test:spec
import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { AxiosInstance } from "axios";
import * as libTests from "../../tests/index.ts";
import { config } from "../../config.ts";
import pool from "../models/database-client.ts";

/** Crée une saga et y range les films donnés ; renvoie l'id de la saga. */
async function createSaga(name: string, movieIds: number[]): Promise<number> {
  const result = await pool.query(`INSERT INTO saga (name) VALUES ($1) RETURNING id`, [name]);
  const sagaId = result.rows[0].id;
  await pool.query(`UPDATE movie SET saga_id = $1 WHERE id = ANY($2)`, [sagaId, movieIds]);
  return sagaId;
}

/** Crée un studio et le relie aux films donnés ; renvoie l'id du studio. */
async function createStudio(name: string, movieIds: number[]): Promise<number> {
  const result = await pool.query(`INSERT INTO studio (name) VALUES ($1) RETURNING id`, [name]);
  const studioId = result.rows[0].id;
  for (const movieId of movieIds) {
    await pool.query(`INSERT INTO movie_studio (movie_id, studio_id) VALUES ($1, $2)`, [movieId, studioId]);
  }
  return studioId;
}

describe("movies.controller — fichiers du NAS selon le réseau", () => {
  let bobRequester: AxiosInstance;
  let movieId: number;

  beforeEach(async () => {
    bobRequester = await libTests.loggedRequester(libTests.BOB);
    movieId = await libTests.createMovie("Alien");
    await libTests.createMediaFile(movieId, "Alien (1979).mkv");
  });

  it("[GET] /movies/:id from the local network should list the files", async () => {
    const { status, data } = await bobRequester.get(`/movies/${movieId}`);

    assert.strictEqual(status, 200);
    assert.strictEqual(data.onLocalNetwork, true);
    assert.strictEqual(data.files.length, 1);
    assert.match(data.files[0].path, /Alien \(1979\)\.mkv$/);
  });

  it("[GET] /movies/:id from outside should not reveal any path", async () => {
    // le serveur de test est appelé depuis 127.0.0.1 : on retire les plages locales le temps du test
    const savedCidrs = config.lanCidrs;
    config.lanCidrs = [];
    try {
      const { status, data } = await bobRequester.get(`/movies/${movieId}`);

      assert.strictEqual(status, 200);
      assert.strictEqual(data.onLocalNetwork, false);
      assert.strictEqual(data.canPlay, false);
      assert.deepStrictEqual(data.files, []);
      assert.ok(!JSON.stringify(data).includes("Alien (1979).mkv"), "aucun nom de fichier dans la réponse");
    } finally {
      config.lanCidrs = savedCidrs; // ne pas fausser les tests suivants
    }
  });
});

describe("movies.controller — studios", () => {
  let bobRequester: AxiosInstance;
  let ironMan: number;
  let deadpool: number;

  beforeEach(async () => {
    bobRequester = await libTests.loggedRequester(libTests.BOB);
    ironMan = await libTests.createMovie("Iron Man");
    deadpool = await libTests.createMovie("Deadpool");
    await libTests.createMovie("Harry Potter à l'école des sorciers");
    await createStudio("Marvel Studios", [ironMan]);
    await createStudio("Marvel Entertainment", [ironMan, deadpool]);
  });

  it("[GET] /movies?q=marvel should find every movie of a Marvel studio, once each", async () => {
    const response = await bobRequester.get("/movies?q=marvel");

    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    // Iron Man a DEUX studios Marvel : il ne doit apparaître qu'une fois (EXISTS, pas de JOIN)
    const titles = response.data.data.map((movie: { title: string }) => movie.title).sort();
    assert.deepStrictEqual(titles, ["Deadpool", "Iron Man"]);
  });

  it("[GET] /movies/:id should list the studios of the movie, sorted by name", async () => {
    const { data } = await bobRequester.get(`/movies/${ironMan}`);

    assert.deepStrictEqual(
      data.studios.map((studio: { name: string }) => studio.name),
      ["Marvel Entertainment", "Marvel Studios"]
    );
  });
});

describe("movies.controller — sagas", () => {
  let bobRequester: AxiosInstance;
  let newHope: number;
  let empire: number;
  let sagaId: number;

  beforeEach(async () => {
    bobRequester = await libTests.loggedRequester(libTests.BOB);
    newHope = await libTests.createMovie("La Guerre des étoiles");
    empire = await libTests.createMovie("L'Empire contre-attaque");
    await libTests.createMovie("Alien");
    sagaId = await createSaga("Star Wars - Saga", [newHope, empire]);
  });

  describe("[GET] /movies?q=", () => {
    it("should find the movies of a saga by its name, even if the title does not contain it", async () => {
      const response = await bobRequester.get("/movies?q=star wars");

      assert.strictEqual(response.status, 200, JSON.stringify(response.data));
      const titles = response.data.data.map((movie: { title: string }) => movie.title).sort();
      assert.deepStrictEqual(titles, ["L'Empire contre-attaque", "La Guerre des étoiles"]);
    });

    it("should still find a movie by its own title", async () => {
      const { data } = await bobRequester.get("/movies?q=alien");
      assert.deepStrictEqual(data.data.map((movie: { title: string }) => movie.title), ["Alien"]);
    });
  });

  describe("[GET] /movies?saga=", () => {
    it("should return only the movies of the saga", async () => {
      const { status, data } = await bobRequester.get(`/movies?saga=${sagaId}`);

      assert.strictEqual(status, 200);
      assert.strictEqual(data.pagination.total, 2);
      assert.ok(data.data.every((movie: { saga: { id: number } }) => movie.saga.id === sagaId));
    });

    it("should respond 400 for an invalid saga id", async () => {
      const response = await bobRequester.get("/movies?saga=abc");
      assert.strictEqual(response.status, 400, JSON.stringify(response.data));
    });
  });

  describe("[GET] /movies/:id", () => {
    it("should include the saga of the movie", async () => {
      const { data } = await bobRequester.get(`/movies/${empire}`);
      assert.deepStrictEqual(data.saga, { id: sagaId, name: "Star Wars - Saga" });
    });

    it("should return saga null for a movie without saga", async () => {
      const { data: page } = await bobRequester.get("/movies?q=alien");
      const { data } = await bobRequester.get(`/movies/${page.data[0].id}`);
      assert.strictEqual(data.saga, null);
    });
  });
});
