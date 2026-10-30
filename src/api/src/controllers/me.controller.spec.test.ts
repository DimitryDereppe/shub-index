// Tests d'intégration « Mon compte » : npm run test:spec (ou test:spec:me pour ce fichier seul).
// La base est vidée avant chaque test (tests/config/global-setup.ts).
import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";
import type { AxiosInstance } from "axios";
import * as libTests from "../../tests/index.ts";
import { ACCESS_COOKIE } from "../lib/tokens.ts";
import pool from "../models/database-client.ts";

describe("me.controller", () => {
  let bobRequester: AxiosInstance; // Bob : simple membre, connecté

  beforeEach(async () => {
    bobRequester = await libTests.loggedRequester(libTests.BOB);
  });

  // =====================================================================
  describe("accès", () => {
    it("should respond 401 without being logged in", async () => {
      const response = await libTests.requester.get("/me/favorites");
      assert.strictEqual(response.status, 401, JSON.stringify(response.data));
    });
  });

  // =====================================================================
  describe("[PATCH] /me", () => {
    it("should update firstname and lastname without password", async () => {
      const response = await bobRequester.patch("/me", { firstname: "Robert", lastname: "MARTIN" });

      assert.strictEqual(response.status, 200, JSON.stringify(response.data));
      assert.strictEqual(response.data.firstname, "Robert");
      assert.strictEqual(response.data.lastname, "MARTIN");
      assert.strictEqual(response.data.email, libTests.BOB.email); // inchangé
      assert.ok(!response.data.password, "le hash ne doit jamais être renvoyé");
    });

    it("should respond 400 when changing email without current password", async () => {
      const response = await bobRequester.patch("/me", { email: "robert@oclock.io" });
      assert.strictEqual(response.status, 400, JSON.stringify(response.data));
    });

    it("should respond 401 when changing email with a wrong password", async () => {
      const response = await bobRequester.patch("/me", { email: "robert@oclock.io", currentPassword: "Mauvais!123" });
      assert.strictEqual(response.status, 401, JSON.stringify(response.data));
    });

    it("should change email with the right password", async () => {
      const response = await bobRequester.patch("/me", { email: "robert@oclock.io", currentPassword: libTests.PASSWORD });

      assert.strictEqual(response.status, 200, JSON.stringify(response.data));
      assert.strictEqual(response.data.email, "robert@oclock.io");
    });

    it("should respond 409 when the email belongs to another account", async () => {
      await libTests.register(libTests.ALICE);

      const response = await bobRequester.patch("/me", { email: libTests.ALICE.email, currentPassword: libTests.PASSWORD });
      assert.strictEqual(response.status, 409, JSON.stringify(response.data));
    });

    it("should refuse to change role (unknown field → 400)", async () => {
      const response = await bobRequester.patch("/me", { role: "admin" });

      assert.strictEqual(response.status, 400, JSON.stringify(response.data));
      const { rows } = await pool.query(`SELECT role FROM "user" WHERE id = $1`, [libTests.BOB.id]);
      assert.strictEqual(rows[0].role, "member");
    });
  });

  // =====================================================================
  describe("[PATCH] /me/password", () => {
    const NEW_PASSWORD = "Nouveau!5678";

    it("should change the password, clear cookies and allow login with the new one", async () => {
      const response = await bobRequester.patch("/me/password", {
        currentPassword: libTests.PASSWORD,
        newPassword: NEW_PASSWORD,
        confirm: NEW_PASSWORD,
      });

      assert.strictEqual(response.status, 204, JSON.stringify(response.data));
      // cookie d'accès vidé dans la réponse → l'utilisateur doit se reconnecter
      assert.match(libTests.findCookieFromResponse(response, ACCESS_COOKIE.name), new RegExp(`^${ACCESS_COOKIE.name}=;`));

      const oldLogin = await libTests.requester.post("/auth/login", { email: libTests.BOB.email, password: libTests.PASSWORD });
      assert.strictEqual(oldLogin.status, 401, "l'ancien mot de passe ne doit plus marcher");
      const newLogin = await libTests.requester.post("/auth/login", { email: libTests.BOB.email, password: NEW_PASSWORD });
      assert.strictEqual(newLogin.status, 200, JSON.stringify(newLogin.data));
    });

    it("should respond 401 with a wrong current password", async () => {
      const response = await bobRequester.patch("/me/password", {
        currentPassword: "Mauvais!123",
        newPassword: NEW_PASSWORD,
        confirm: NEW_PASSWORD,
      });
      assert.strictEqual(response.status, 401, JSON.stringify(response.data));
    });

    it("should respond 400 when confirmation does not match", async () => {
      const response = await bobRequester.patch("/me/password", {
        currentPassword: libTests.PASSWORD,
        newPassword: NEW_PASSWORD,
        confirm: "Autre!5678",
      });
      assert.strictEqual(response.status, 400, JSON.stringify(response.data));
    });

    it("should respond 400 when the new password is too weak", async () => {
      const response = await bobRequester.patch("/me/password", {
        currentPassword: libTests.PASSWORD,
        newPassword: "faible",
        confirm: "faible",
      });
      assert.strictEqual(response.status, 400, JSON.stringify(response.data));
    });
  });

  // =====================================================================
  describe("[DELETE] /me", () => {
    it("should respond 401 with a wrong password and keep the account", async () => {
      const response = await bobRequester.delete("/me", { data: { password: "Mauvais!123" } });

      assert.strictEqual(response.status, 401, JSON.stringify(response.data));
      const { rowCount } = await pool.query(`SELECT 1 FROM "user" WHERE id = $1`, [libTests.BOB.id]);
      assert.strictEqual(rowCount, 1);
    });

    it("should delete the account with its favorites and history", async () => {
      const movieId = await libTests.createMovie("Alien");
      await bobRequester.put(`/me/favorites/${movieId}`);
      await pool.query(`INSERT INTO watch_history (user_id, movie_id) VALUES ($1, $2)`, [libTests.BOB.id, movieId]);

      const response = await bobRequester.delete("/me", { data: { password: libTests.PASSWORD } });

      assert.strictEqual(response.status, 204, JSON.stringify(response.data));
      const users = await pool.query(`SELECT 1 FROM "user" WHERE id = $1`, [libTests.BOB.id]);
      const favorites = await pool.query(`SELECT 1 FROM favorite WHERE user_id = $1`, [libTests.BOB.id]);
      const history = await pool.query(`SELECT 1 FROM watch_history WHERE user_id = $1`, [libTests.BOB.id]);
      assert.strictEqual(users.rowCount, 0);
      assert.strictEqual(favorites.rowCount, 0, "ON DELETE CASCADE sur favorite");
      assert.strictEqual(history.rowCount, 0, "ON DELETE CASCADE sur watch_history");
    });

    it("should respond 409 for the last admin", async () => {
      const aliceRequester = await libTests.loggedRequester(libTests.ALICE); // seule admin

      const response = await aliceRequester.delete("/me", { data: { password: libTests.PASSWORD } });
      assert.strictEqual(response.status, 409, JSON.stringify(response.data));
    });
  });

  // =====================================================================
  describe("[PUT|DELETE|GET] /me/favorites", () => {
    it("should add a favorite and list it", async () => {
      const movieId = await libTests.createMovie("Alien");

      const put = await bobRequester.put(`/me/favorites/${movieId}`);
      assert.strictEqual(put.status, 204, JSON.stringify(put.data));

      const { status, data: favorites } = await bobRequester.get("/me/favorites");
      assert.strictEqual(status, 200);
      assert.strictEqual(favorites.length, 1);
      assert.strictEqual(favorites[0].title, "Alien");
    });

    it("should be idempotent (adding twice keeps one favorite)", async () => {
      const movieId = await libTests.createMovie("Alien");

      await bobRequester.put(`/me/favorites/${movieId}`);
      const second = await bobRequester.put(`/me/favorites/${movieId}`);

      assert.strictEqual(second.status, 204, JSON.stringify(second.data));
      const { data: favorites } = await bobRequester.get("/me/favorites");
      assert.strictEqual(favorites.length, 1);
    });

    it("should respond 409 for an 11th favorite", async () => {
      for (let i = 1; i <= 10; i++) {
        const movieId = await libTests.createMovie(`Film ${i}`);
        const response = await bobRequester.put(`/me/favorites/${movieId}`);
        assert.strictEqual(response.status, 204, `favori n°${i} : ${JSON.stringify(response.data)}`);
      }
      const eleventh = await libTests.createMovie("Film 11");

      const response = await bobRequester.put(`/me/favorites/${eleventh}`);

      assert.strictEqual(response.status, 409, JSON.stringify(response.data));
      const { data: favorites } = await bobRequester.get("/me/favorites");
      assert.strictEqual(favorites.length, 10);
    });

    it("should respond 404 for an unknown movie", async () => {
      const response = await bobRequester.put("/me/favorites/999");
      assert.strictEqual(response.status, 404, JSON.stringify(response.data));
    });

    it("should remove a favorite", async () => {
      const movieId = await libTests.createMovie("Alien");
      await bobRequester.put(`/me/favorites/${movieId}`);

      const response = await bobRequester.delete(`/me/favorites/${movieId}`);

      assert.strictEqual(response.status, 204, JSON.stringify(response.data));
      const { data: favorites } = await bobRequester.get("/me/favorites");
      assert.deepStrictEqual(favorites, []);
    });

    it("should not see the favorites of another user", async () => {
      const movieId = await libTests.createMovie("Alien");
      await bobRequester.put(`/me/favorites/${movieId}`);
      const aliceRequester = await libTests.loggedRequester(libTests.ALICE);

      const { data: favorites } = await aliceRequester.get("/me/favorites");
      assert.deepStrictEqual(favorites, []);
    });

    it("should expose isFavorite on the movie page", async () => {
      const movieId = await libTests.createMovie("Alien");

      const before = await bobRequester.get(`/movies/${movieId}`);
      await bobRequester.put(`/me/favorites/${movieId}`);
      const after = await bobRequester.get(`/movies/${movieId}`);

      assert.strictEqual(before.data.isFavorite, false);
      assert.strictEqual(after.data.isFavorite, true);
    });
  });

  // =====================================================================
  describe("[GET|DELETE] /me/history", () => {
    it("should record a movie when the VLC playlist is requested", async () => {
      const movieId = await libTests.createMovie("Alien");
      const fileId = await libTests.createMediaFile(movieId, "Alien (1979).mkv");

      const playlist = await bobRequester.get(`/media-files/${fileId}/playlist`);
      assert.strictEqual(playlist.status, 200, JSON.stringify(playlist.data));

      const { status, data: history } = await bobRequester.get("/me/history");
      assert.strictEqual(status, 200);
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].title, "Alien");
      assert.ok(history[0].watchedAt);
    });

    it("should keep one line per movie and put the last watched first", async () => {
      const alien = await libTests.createMovie("Alien");
      const aliens = await libTests.createMovie("Aliens");
      const alienFile = await libTests.createMediaFile(alien, "Alien.mkv");
      const aliensFile = await libTests.createMediaFile(aliens, "Aliens.mkv");

      await bobRequester.get(`/media-files/${alienFile}/playlist`);
      await bobRequester.get(`/media-files/${aliensFile}/playlist`);
      await bobRequester.get(`/media-files/${alienFile}/playlist`); // Alien revu

      const { data: history } = await bobRequester.get("/me/history");
      assert.deepStrictEqual(history.map((movie: { title: string }) => movie.title), ["Alien", "Aliens"]);
    });

    it("should return only the 10 latest movies", async () => {
      for (let i = 1; i <= 12; i++) {
        const movieId = await libTests.createMovie(`Film ${i}`);
        // dates décalées d'une minute : Film 12 est le plus récent
        await pool.query(
          `INSERT INTO watch_history (user_id, movie_id, watched_at) VALUES ($1, $2, now() - make_interval(mins => $3))`,
          [libTests.BOB.id, movieId, 12 - i]
        );
      }

      const { data: history } = await bobRequester.get("/me/history");

      assert.strictEqual(history.length, 10);
      assert.strictEqual(history[0].title, "Film 12");
      assert.strictEqual(history[9].title, "Film 3");
    });

    it("should remove one movie from the history", async () => {
      const movieId = await libTests.createMovie("Alien");
      await pool.query(`INSERT INTO watch_history (user_id, movie_id) VALUES ($1, $2)`, [libTests.BOB.id, movieId]);

      const response = await bobRequester.delete(`/me/history/${movieId}`);

      assert.strictEqual(response.status, 204, JSON.stringify(response.data));
      const { data: history } = await bobRequester.get("/me/history");
      assert.deepStrictEqual(history, []);
    });

    it("should respond 404 when removing a movie not in the history", async () => {
      const response = await bobRequester.delete("/me/history/999");
      assert.strictEqual(response.status, 404, JSON.stringify(response.data));
    });

    it("should clear the whole history", async () => {
      for (const title of ["Alien", "Aliens"]) {
        const movieId = await libTests.createMovie(title);
        await pool.query(`INSERT INTO watch_history (user_id, movie_id) VALUES ($1, $2)`, [libTests.BOB.id, movieId]);
      }

      const response = await bobRequester.delete("/me/history");

      assert.strictEqual(response.status, 204, JSON.stringify(response.data));
      const { data: history } = await bobRequester.get("/me/history");
      assert.deepStrictEqual(history, []);
    });
  });
});
