/**
 * Tests de lib/network.ts (réseau local, RG10) et lib/playlist.ts (fichier .m3u, US13).
 * Lancer : npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLocalIp, lookupIpv4 } from "../../src/lib/network.ts";
import { buildM3u, buildPlaylistFilename } from "../../src/lib/playlist.ts";

describe("isLocalIp", () => {
  const cidrs = ["192.168.1.0/24", "10.8.0.0/24"];

  it("accepte une IP du réseau local", () => {
    assert.equal(isLocalIp("192.168.1.20", cidrs), true);
  });

  it("accepte une IPv4 écrite à la façon IPv6 (::ffff:…)", () => {
    assert.equal(isLocalIp("::ffff:192.168.1.20", cidrs), true);
  });

  it("accepte la 2ᵉ plage (VPN)", () => {
    assert.equal(isLocalIp("10.8.0.5", cidrs), true);
  });

  it("refuse une IP publique", () => {
    assert.equal(isLocalIp("88.12.34.56", cidrs), false);
  });

  it("refuse une IP Docker (172.x) même si elle est « privée »", () => {
    assert.equal(isLocalIp("172.18.0.1", cidrs), false);
  });

  it("refuse une IPv6 publique, une valeur vide ou invalide", () => {
    assert.equal(isLocalIp("2a01:cb00::1", cidrs), false);
    assert.equal(isLocalIp(undefined, cidrs), false);
    assert.equal(isLocalIp("n'importe quoi", cidrs), false);
  });

  it("refuse tout si aucune plage n'est configurée", () => {
    assert.equal(isLocalIp("192.168.1.20", []), false);
  });
});

describe("lookupIpv4", () => {
  it("résout un nom en adresse IPv4", async () => {
    assert.equal(await lookupIpv4("localhost"), "127.0.0.1");
  });

  it("nom vide ou introuvable → null (jamais d'erreur)", async () => {
    assert.equal(await lookupIpv4(""), null);
    assert.equal(await lookupIpv4("nom-qui-n-existe-pas.invalid"), null);
  });
});

describe("buildM3u", () => {
  it("encode chaque segment du chemin (espaces, crochets, accents)", () => {
    const m3u = buildM3u(
      "Alien 3 (1992)",
      "Films/Alien (Quadrilogie)/Alien 3 (1992) [16] - David Fincher.mkv",
      "smb://192.168.1.37/Shub-Niggurath"
    );
    assert.equal(
      m3u,
      "#EXTM3U\n#EXTINF:-1,Alien 3 (1992)\n" +
        "smb://192.168.1.37/Shub-Niggurath/Films/Alien%20(Quadrilogie)/Alien%203%20(1992)%20%5B16%5D%20-%20David%20Fincher.mkv\n"
    );
  });

  it("encode les accents et ne double pas le « / » du préfixe", () => {
    const m3u = buildM3u("Astérix", "Animé/Astérix.avi", "smb://nas/partage/");
    assert.ok(m3u.includes("smb://nas/partage/Anim%C3%A9/Ast%C3%A9rix.avi"));
  });

  it("retire les retours à la ligne du titre (pas d'injection de ligne dans le .m3u)", () => {
    const m3u = buildM3u("Titre\nfile:///etc/passwd", "Films/a.mkv", "smb://nas/p");
    assert.equal(m3u.split("\n").length, 4); // #EXTM3U, #EXTINF, URL, ligne vide finale
  });
});

describe("buildPlaylistFilename", () => {
  it("garde un nom lisible sans caractères interdits", () => {
    assert.equal(buildPlaylistFilename('Alien 3 (1992) : "Le/retour"'), "Alien 3 (1992) Le retour.m3u");
  });
});
