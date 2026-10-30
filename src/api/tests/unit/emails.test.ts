/**
 * Tests du contenu des emails (aucun envoi). Lancer : npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPasswordResetEmail, escapeHtml } from "../../src/lib/emails.ts";

describe("escapeHtml", () => {
  it("neutralise les caractères HTML", () => {
    assert.equal(escapeHtml(`<script>alert("x")</script> & 'y'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });
});

describe("buildPasswordResetEmail", () => {
  const link = "https://shub.exemple.fr/reinitialiser?jeton=abc_DEF-123";
  const email = buildPasswordResetEmail("<b>Alice</b>", link, 30);

  it("met le lien et la durée dans les deux versions", () => {
    assert.ok(email.text.includes(link));
    assert.ok(email.html.includes(`href="${link}"`));
    assert.ok(email.text.includes("30 minutes") && email.html.includes("30 minutes"));
  });

  it("échappe le prénom dans la version HTML", () => {
    assert.ok(email.html.includes("&lt;b&gt;Alice&lt;/b&gt;"));
    assert.ok(!email.html.includes("<b>Alice</b>"));
  });
});
