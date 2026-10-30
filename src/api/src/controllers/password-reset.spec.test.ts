// Tests d'intégration de la récupération du mot de passe : npm run test:spec
// L'envoi d'email est remplacé par un mock (node:test) qui garde les emails « envoyés ».
import assert from "node:assert";
import { beforeEach, describe, it, mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "../../config.ts";
import * as libTests from "../../tests/index.ts";
import { transporter } from "../mailer.ts";
import pool from "../models/database-client.ts";

const NEW_PASSWORD = "Nouveau!5678";

describe("récupération du mot de passe", () => {
  let sentMails: Array<{ to: string; text: string }>;

  beforeEach(async () => {
    sentMails = [];
    mock.method(transporter, "sendMail", async (mail: { to: string; text: string }) => {
      sentMails.push(mail);
      return {};
    });
    await libTests.register(libTests.BOB);
  });

  /** L'email part APRÈS la réponse 202 : on attend qu'il soit « envoyé » (2 s max). */
  async function waitForMail(): Promise<{ to: string; text: string }> {
    for (let i = 0; i < 40 && sentMails.length === 0; i++) {
      await delay(50);
    }
    assert.ok(sentMails.length > 0, "aucun email envoyé");
    return sentMails.at(-1)!;
  }

  /** Demande un lien pour Bob et renvoie le jeton lu dans l'email. */
  async function requestToken(): Promise<string> {
    const response = await libTests.requester.post("/auth/forgot-password", { email: libTests.BOB.email });
    assert.strictEqual(response.status, 202, JSON.stringify(response.data));
    const mail = await waitForMail();
    const token = mail.text.match(/jeton=([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(token, "lien absent de l'email");
    return token;
  }

  it("[POST] /auth/forgot-password should email a link to the account", async () => {
    await requestToken();

    assert.strictEqual(sentMails[0].to, libTests.BOB.email);
    assert.ok(sentMails[0].text.startsWith(`Bonjour ${libTests.BOB.firstname}`));
    assert.ok(sentMails[0].text.includes(`${config.appUrl}/reinitialiser?jeton=`));
  });

  it("should answer exactly the same for an unknown email, and send nothing", async () => {
    const known = await libTests.requester.post("/auth/forgot-password", { email: libTests.BOB.email });
    await waitForMail();
    sentMails = [];

    const unknown = await libTests.requester.post("/auth/forgot-password", { email: "personne@exemple.fr" });
    await delay(300);

    assert.strictEqual(unknown.status, known.status);
    assert.deepStrictEqual(unknown.data, known.data);
    assert.strictEqual(sentMails.length, 0);
  });

  it("should store only the hash of the token", async () => {
    const token = await requestToken();

    const { rows } = await pool.query(`SELECT token_hash FROM password_reset_token`);
    assert.strictEqual(rows.length, 1);
    assert.notStrictEqual(rows[0].token_hash, token);
  });

  it("[POST] /auth/reset-password should change the password and close the old sessions", async () => {
    const oldSession = await libTests.logUser(libTests.BOB);
    const token = await requestToken();

    const response = await libTests.requester.post("/auth/reset-password", { token, newPassword: NEW_PASSWORD, confirm: NEW_PASSWORD });
    assert.strictEqual(response.status, 204, JSON.stringify(response.data));

    const newLogin = await libTests.requester.post("/auth/login", { email: libTests.BOB.email, password: NEW_PASSWORD });
    assert.strictEqual(newLogin.status, 200, "le nouveau mot de passe doit marcher");
    const oldLogin = await libTests.requester.post("/auth/login", { email: libTests.BOB.email, password: libTests.PASSWORD });
    assert.strictEqual(oldLogin.status, 401, "l'ancien mot de passe ne doit plus marcher");

    // l'ancienne session ne peut plus renouveler ses jetons
    const refresh = await libTests.requester.post("/auth/refresh", null, { headers: { Cookie: oldSession } });
    assert.strictEqual(refresh.status, 401);
  });

  it("should refuse a link used twice (400)", async () => {
    const token = await requestToken();
    await libTests.requester.post("/auth/reset-password", { token, newPassword: NEW_PASSWORD, confirm: NEW_PASSWORD });

    const second = await libTests.requester.post("/auth/reset-password", { token, newPassword: "Autre!9876", confirm: "Autre!9876" });
    assert.strictEqual(second.status, 400, JSON.stringify(second.data));
  });

  it("should refuse an expired link (400)", async () => {
    const token = await requestToken();
    await pool.query(`UPDATE password_reset_token SET expires_at = now() - interval '1 minute'`);

    const response = await libTests.requester.post("/auth/reset-password", { token, newPassword: NEW_PASSWORD, confirm: NEW_PASSWORD });
    assert.strictEqual(response.status, 400, JSON.stringify(response.data));
  });

  it("should invalidate the previous link when a new one is requested", async () => {
    const first = await requestToken();
    sentMails = [];
    await requestToken();

    const response = await libTests.requester.post("/auth/reset-password", { token: first, newPassword: NEW_PASSWORD, confirm: NEW_PASSWORD });
    assert.strictEqual(response.status, 400, JSON.stringify(response.data));
  });

  it("should refuse a forged token and a weak password (400)", async () => {
    const forged = await libTests.requester.post("/auth/reset-password", { token: "x".repeat(43), newPassword: NEW_PASSWORD, confirm: NEW_PASSWORD });
    assert.strictEqual(forged.status, 400);

    const token = await requestToken();
    const weak = await libTests.requester.post("/auth/reset-password", { token, newPassword: "faible", confirm: "faible" });
    assert.strictEqual(weak.status, 400);
  });

  it("should limit the number of email requests (429)", async () => {
    const saved = config.emailRateLimit;
    config.emailRateLimit = 1;
    try {
      await libTests.requester.post("/auth/forgot-password", { email: libTests.BOB.email });
      const response = await libTests.requester.post("/auth/forgot-password", { email: libTests.BOB.email });
      assert.strictEqual(response.status, 429, JSON.stringify(response.data));
    } finally {
      config.emailRateLimit = saved;
      await delay(300); // laisse finir l'envoi lancé après la 1re réponse
    }
  });
});
