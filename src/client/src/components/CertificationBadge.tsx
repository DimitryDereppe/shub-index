/**
 * Pastille de classification (TP, 10, 12, 16, 18 — US15).
 * Le texte complet est donné aux lecteurs d'écran, la pastille courte aux yeux.
 */
import type { Certification } from "../api/types.ts";

const LABELS: Record<Certification, string> = {
  TP: "Tous publics",
  "10": "Déconseillé aux moins de 10 ans",
  "12": "Déconseillé aux moins de 12 ans",
  "16": "Déconseillé aux moins de 16 ans",
  "18": "Interdit aux moins de 18 ans",
};

export function CertificationBadge({ value }: { value: Certification }) {
  return (
    <span className={`badge badge--cert-${value}`} title={LABELS[value]}>
      <span aria-hidden="true">{value === "TP" ? "TP" : `-${value}`}</span>
      <span className="visually-hidden">{LABELS[value]}</span>
    </span>
  );
}

export { LABELS as CERTIFICATION_LABELS };
