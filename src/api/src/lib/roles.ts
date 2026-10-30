// Rôles utilisateur : alignés sur le type Postgres "role" (cf. database/init.sql).
// 'author' (hérité d'oquiz) a été retiré le 2026-10-27 : inutile pour un catalogue commun.
export const Role = {
  member: "member",
  admin: "admin",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
