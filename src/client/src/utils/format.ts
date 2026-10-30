/**
 * Mise en forme des valeurs affichées (tailles, dates), en français.
 */

/** 8547123456 → "8,5 Go" */
export function formatSize(bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** "2026-10-27T04:00:12Z" → "27/10/2026 05:00" (heure locale du navigateur) */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Durée entre deux dates → "1 min 53 s" */
export function formatDuration(startIso: string, endIso: string): string {
  const seconds = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}
