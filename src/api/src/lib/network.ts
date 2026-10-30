/**
 * Détection du réseau local (RG10) : la requête vient-elle d'une IP
 * comprise dans une des plages configurées (LAN_CIDRS, ex. "192.168.1.0/24") ?
 *
 * Fiable SEULEMENT si l'API n'est joignable que par le reverse proxy et que
 * `trust proxy` ne fait confiance qu'à lui (cf. docs/conception/deploiement-aldebaran.md).
 */
import dns from "node:dns/promises";
import net from "node:net";
import { config } from "../../config.ts";

/**
 * @param ip    adresse vue par Express (`req.ip`), éventuellement au format "::ffff:192.168.1.20"
 * @param cidrs plages autorisées, notation CIDR ("adresse/nombre de bits fixes")
 * @returns true si l'IP appartient à une des plages
 */
export function isLocalIp(ip: string | undefined, cidrs: string[]): boolean {
  if (!ip) {
    return false;
  }

  // Node présente parfois une IPv4 sous forme d'IPv6 "mappée" : "::ffff:192.168.1.20"
  const cleanIp = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  const family = net.isIPv4(cleanIp) ? "ipv4" : net.isIPv6(cleanIp) ? "ipv6" : null;
  if (!family) {
    return false; // pas une adresse IP
  }

  // net.BlockList (module natif de Node) : une liste de plages d'adresses
  // qu'on peut interroger avec check(ip). On y range les plages "locales".
  const localRanges = new net.BlockList();
  for (const cidr of cidrs) {
    const [address, bits] = cidr.split("/");
    const rangeFamily = net.isIPv4(address) ? "ipv4" : "ipv6";
    localRanges.addSubnet(address, Number(bits), rangeFamily);
  }

  return localRanges.check(cleanIp, family);
}

/**
 * Adresse IPv4 d'un nom de domaine (ex. "owikiclock.duckdns.org" → IP publique de la box).
 * @returns l'adresse, ou null si le nom est vide ou introuvable (ne lance jamais d'erreur)
 */
export async function lookupIpv4(hostname: string): Promise<string | null> {
  if (!hostname) {
    return null;
  }
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return address;
  } catch {
    return null;
  }
}

// IP publique de la box, relue au plus toutes les 5 minutes (elle change de temps en temps)
const PUBLIC_IP_TTL_MS = 5 * 60 * 1000;
let publicIpCache: { ip: string | null; readAt: number } | null = null;

async function boxPublicIp(): Promise<string | null> {
  if (!publicIpCache || Date.now() - publicIpCache.readAt > PUBLIC_IP_TTL_MS) {
    publicIpCache = { ip: await lookupIpv4(config.lanPublicHostname), readAt: Date.now() };
  }
  return publicIpCache.ip;
}

/**
 * La requête vient-elle du réseau local ? (utilisé par isLocalNetwork et canPlay)
 *
 * Deux cas :
 * 1. l'IP est dans LAN_CIDRS (accès direct, ex. 192.168.1.33) ;
 * 2. l'IP est l'IP PUBLIQUE de la box (LAN_PUBLIC_HOSTNAME) : un appareil du réseau qui
 *    ouvre le site par son nom de domaine ressort par la box et revient avec son IP
 *    publique ("hairpin NAT", constaté le 2026-10-27). Un visiteur d'Internet ne peut pas
 *    se faire passer pour cette adresse : sa connexion TCP n'aboutirait pas.
 */
export async function isLocalRequest(ip: string | undefined): Promise<boolean> {
  if (isLocalIp(ip, config.lanCidrs)) {
    return true;
  }
  const publicIp = await boxPublicIp();
  const cleanIp = ip?.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  return publicIp !== null && cleanIp === publicIp;
}
