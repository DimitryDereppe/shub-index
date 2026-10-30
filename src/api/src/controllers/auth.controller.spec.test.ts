// Tests d'intégration des correctifs de sécurité (relecture du 2026-10-31) : npm run test:spec
import assert from "node:assert";
import { describe, it } from "node:test";
import { config } from "../../config.ts";
import * as libTests from "../../tests/index.ts";
import pool from "../models/database-client.ts";

const NEW_USER = {
  firstname: "Chloé",
  lastname: "MARTIN",
  email: "  Chloe.Martin@Exemple.FR ",
  password: libTests.PASSWORD,
  confirm: libTests.PASSWORD,
};

describe("auth — inscription et connexion", () => {
  it("[POST] /auth/register should store the email trimmed and in lowercase", async () => {
    const response = await libTests.requester.post("/auth/register", NEW_USER);

    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    assert.strictEqual(response.data.email, "chloe.martin@exemple.fr");
  });

  it("[POST] /auth/login should not depend on the email case", async () => {
    await libTests.requester.post("/auth/register", NEW_USER);

    const response = await libTests.requester.post("/auth/login", {
      email: "CHLOE.MARTIN@exemple.fr",
      password: libTests.PASSWORD,
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
  });

  it("[POST] /auth/register should refuse the same email with other capitals (409)", async () => {
    await libTests.requester.post("/auth/register", NEW_USER);

    const response = await libTests.requester.post("/auth/register", { ...NEW_USER, email: "CHLOE.martin@exemple.fr" });
    assert.strictEqual(response.status, 409, JSON.stringify(response.data));
  });

  it("[POST] /auth/register should respond 400 (not 500) for a too long name", async () => {
    const response = await libTests.requester.post("/auth/register", { ...NEW_USER, firstname: "x".repeat(200) });
    assert.strictEqual(response.status, 400, JSON.stringify(response.data));
  });
});

describe("isConnected — le compte est relu en base", () => {
  it("should reject a still valid token once the account is deleted (401)", async () => {
    const bobRequester = await libTests.loggedRequester(libTests.BOB);
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [libTests.BOB.id]);

    const response = await bobRequester.get("/movies");
    assert.strictEqual(response.status, 401, JSON.stringify(response.data));
  });

  it("should apply a demotion immediately, without waiting for the token to expire (403)", async () => {
    const aliceRequester = await libTests.loggedRequester(libTests.ALICE); // admin
    assert.strictEqual((await aliceRequester.get("/users")).status, 200);

    await pool.query(`UPDATE "user" SET role = 'member' WHERE id = $1`, [libTests.ALICE.id]);

    const response = await aliceRequester.get("/users");
    assert.strictEqual(response.status, 403, JSON.stringify(response.data));
  });
});

describe("documentation Swagger", () => {
  it("[GET] /docs should be reserved to logged-in members (401)", async () => {
    const response = await libTests.requester.get("/docs/");
    assert.strictEqual(response.status, 401);
  });
});

describe("limitation des tentatives", () => {
  it("should respond 429 after too many wrong passwords", async () => {
    await libTests.register(libTests.BOB);
    const savedLimit = config.authRateLimit;
    config.authRateLimit = 1; // 1 seul échec toléré le temps de ce test
    try {
      const wrongLogin = { email: libTests.BOB.email, password: "Mauvais!123" };
      await libTests.requester.post("/auth/login", wrongLogin);
      const response = await libTests.requester.post("/auth/login", wrongLogin);

      assert.strictEqual(response.status, 429, JSON.stringify(response.data));
      assert.match(response.data.error, /Trop de tentatives/);
    } finally {
      config.authRateLimit = savedLimit; // ne pas bloquer les tests suivants
    }
  });
});
