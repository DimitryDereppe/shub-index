# API REST — endpoints

> Base URL : `/api`. Ressources au pluriel, kebab-case, sans verbe (§ 15) ;
> le verbe HTTP porte l'action ; `:id` identifie, la *query string*
> filtre. Droits par rôle : [[Projets perso/Moteur de recherche/shub-index/docs/conception/api-rest/rbac|RBAC]].
> Chaque route sera documentée en **Swagger/OpenAPI** et testée dans un
> fichier `tests/<ressource>.http` (cas nominal **et** d'erreur) dans le
> même commit que son code.

## 🔐 Authentification *(déjà en place)*

| Verbe | Chemin | Request | Response | Description |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | `{email, firstname, lastname, password}` | `201` user (sans `password`) | création de compte (reste ouverte, décision du 2026-10-27) |
| POST | `/auth/login` | `{email, password}` | `200` + cookies `accessToken` / `refreshToken` | connexion |
| POST | `/auth/refresh` | cookie `refreshToken` | `200` + nouveaux cookies | rotation |
| POST | `/auth/logout` | – | `204`, cookies vidés | déconnexion |
| GET | `/auth/me` | – | `200` user | profil connecté |

## 👤 Mon compte *(2026-10-30, tout membre connecté)*

L'id vient du jeton (`req.userId`), **jamais de l'URL** : impossible de
viser le compte d'un autre.

| Verbe | Chemin | Request | Response | Description |
| --- | --- | --- | --- | --- |
| PATCH | `/me` | `{firstname?, lastname?, email?, currentPassword?}` | `200` user · `400` · `401` · `409` email pris | profil ; `currentPassword` requis pour changer d'email ; champ inconnu (`role`…) → `400` |
| PATCH | `/me/password` | `{currentPassword, newPassword, confirm}` | `204`, cookies vidés · `400` · `401` | toutes les sessions sont révoquées : reconnexion obligatoire |
| DELETE | `/me` | `{password}` | `204`, cookies vidés · `401` · `409` dernier admin | historique et favoris partent avec (CASCADE) |
| GET | `/me/history` | – | `200` `Array<MovieSummary & {watchedAt}>` | 10 derniers films lancés dans VLC |
| DELETE | `/me/history` | – | `204` | vider l'historique |
| DELETE | `/me/history/:movieId` | – | `204` · `404` | retirer un film |
| GET | `/me/favorites` | – | `200` `Array<MovieSummary & {addedAt}>` | favoris (10 max) |
| PUT | `/me/favorites/:movieId` | – | `204` · `404` film inconnu · `409` 10 favoris atteints | ajouter (**idempotent** : 2ᵉ appel = rien ne change) |
| DELETE | `/me/favorites/:movieId` | – | `204` · `404` | retirer |

Un visionnage est noté par `GET /media-files/:id/playlist` (clic « Lire
dans VLC ») si le fichier est rattaché à un film. `GET /movies/:id`
renvoie aussi `isFavorite`.

## 🎬 Films — recherche et consultation

| Verbe | Chemin | Request | Response | Description | US |
| --- | --- | --- | --- | --- | --- |
| GET | `/movies` | query (ci-dessous) | `200` `{ data: Array<MovieSummary>, pagination }` | recherche multicritère paginée | US01 → US07 |
| GET | `/movies/:id` | – | `200` `MovieDetail` · `404` | fiche complète | US08, US09 |
| PATCH | `/movies/:id` | `{title?, originalTitle?, releaseYear?, runtime?, synopsis?}` | `200` `MovieDetail` · `400` · `404` | correction manuelle | US29 |

### Paramètres de `GET /movies`

Tous facultatifs, **combinés par ET** (US06) ; validés par un schéma Zod
(type, bornes, liste blanche pour `sort`) → `400` si invalide.

| Paramètre | Exemple | Effet |
| --- | --- | --- |
| `q` | `q=marvel` | titre, titre original, **nom de la saga ou d'un studio** contient le texte (insensible à la casse et aux accents) |
| `saga` | `saga=4` | les films de cette saga (id interne) — lien « Saga » de la fiche film |
| `year` | `year=1992` | année exacte |
| `yearFrom` / `yearTo` | `yearFrom=1980&yearTo=1989` | plage d'années (bornes incluses) |
| `director` | `director=fincher` | un réalisateur dont le nom contient le texte |
| `actor` | `actor=weaver` | un acteur dont le nom contient le texte |
| `genre` | `genre=horreur&genre=science-fiction` | le film a **tous** les genres cités (répétable) |
| `maxCertification` | `maxCertification=12` | classification ≤ 12 (ordre `TP` < `10` < `12` < `16` < `18`) ; les films sans classification sont exclus de ce filtre |
| `sort` | `sort=year` / `sort=-year` / `sort=title` | tri (liste blanche ; `-` = décroissant) — défaut `title` |
| `page` / `limit` | `page=2&limit=20` | pagination, `limit` ≤ 50, défaut 20 |

Exemple de la vie réelle (« SF/horreur de James Cameron ») :
`GET /api/movies?director=cameron&genre=horreur&genre=science-fiction`

**Côté SQL** (codé dans `src/models/movies.datamapper.ts`) : la requête du DataMapper est
construite morceau par morceau — un `EXISTS (…)` par critère présent,
toujours avec des **paramètres `$1, $2…`**, jamais de concaténation de la
valeur saisie. Le seul morceau non paramétrable (la colonne de tri) vient
d'une **liste blanche** (§ 7).

### Formes de réponse

```jsonc
// MovieSummary — un élément de la liste de résultats
{ "id": 42, "title": "Alien³", "originalTitle": "Alien 3", "releaseYear": 1992, "certification": "16",
  "posterUrl": "https://image.tmdb.org/…", "genres": ["Science-Fiction", "Horreur"],
  "directors": [{ "id": 5, "name": "David Fincher" }], "saga": { "id": 4, "name": "Alien - Saga" }, "available": true }

// pagination
{ "page": 1, "limit": 20, "total": 2, "totalPages": 1 }

// MovieDetail — GET /movies/:id
{ "id": 42, "title": "Alien³", "originalTitle": "Alien 3", "releaseYear": 1992,
  "runtime": 114, "certification": "16", "synopsis": "…", "posterUrl": "…", "tmdbId": 8077,
  "canPlay": true,
  "genres": [{ "id": 3, "name": "Science-Fiction" }],
  "directors": [{ "id": 5, "name": "David Fincher" }],
  "saga": { "id": 4, "name": "Alien - Saga" },           // null si le film n'a pas de saga
  "studios": [{ "id": 6, "name": "20th Century Fox" }],   // [] si TMDB n'en donne pas
  "cast": [{ "id": 7, "name": "Sigourney Weaver", "character": "Ellen Ripley", "order": 0 }],
  "files": [{ "id": 101,
              "path": "\\\\192.168.1.37\\Shub-Niggurath\\Films\\Alien (Quadrilogie)\\Alien 3 (1992) [16] - David Fincher.mkv",
              "sizeBytes": 8547123456 }] }
```

- `available` = le film a au moins un fichier présent.
- `onLocalNetwork` = la requête vient du réseau local (`LAN_CIDRS` : LAN et VPN
  WireGuard, ou IP publique de la box). Sinon **`files` est vide** : l'API ne
  révèle aucun chemin du NAS hors de la maison (2026-10-31).
- `canPlay` = la requête vient du réseau local (RG10) : le client affiche
  le bouton « Lire dans VLC » seulement si `true`. Ce n'est **qu'un
  confort d'affichage** : la vraie vérification est refaite par la route
  `/playlist` (on ne fait jamais confiance au client).
- `files[].path` = préfixe UNC lu dans `.env` + chemin relatif stocké en
  base (l'adresse du NAS n'est jamais dans le code ni en base).
- **Pas de `SELECT *`** : chaque DataMapper liste ses colonnes (même
  principe que `PUBLIC_COLUMNS` pour `user`).

## 👤 Personnes et 🏷️ genres

| Verbe | Chemin | Request | Response | Description | US |
| --- | --- | --- | --- | --- | --- |
| GET | `/people` | `?q=web&role=director\|actor&limit=10` | `200` `Array<{id, name}>` | autocomplétion sur le nom | US11 |
| GET | `/people/:id` | – | `200` `{id, name, directed: Array<MovieSummary>, played: Array<MovieSummary & {character}>}` · `404` | fiche personne + films **du catalogue** | US10 |
| GET | `/genres` | – | `200` `Array<{id, name, movieCount}>` | liste pour le filtre (cases à cocher) | US05 |

## ▶️ Lecture dans VLC (membre, réseau local uniquement)

| Verbe | Chemin | Request | Response | Description | US |
| --- | --- | --- | --- | --- | --- |
| GET | `/media-files/:id/playlist` | – | `200` fichier `.m3u` · `403` hors réseau local · `404` | playlist qui ouvre le film dans VLC | US13, US14 |

- En-têtes de réponse : `Content-Type: audio/x-mpegurl` et
  `Content-Disposition: attachment; filename="Alien 3 (1992).m3u"` →
  le navigateur télécharge le fichier et le système l'ouvre avec VLC.
- Contenu : `#EXTM3U`, une ligne `#EXTINF:-1,<titre (année)>`, puis
  `PLAY_URL_PREFIX` + chemin relatif **encodé segment par segment**
  (`smb://192.168.1.37/Shub-Niggurath/Films/Alien%20(Quadrilogie)/…`).
- `GET` est correct ici : la route **ne modifie rien** (§ 8ter).
- Contrôle d'accès : `isConnected` **puis** un middleware
  `isLocalNetwork` qui compare `req.ip` aux plages de `LAN_CIDRS`
  (`192.168.1.0/24`). Le même test calcule `canPlay` dans
  `GET /movies/:id`. Détails et pièges (proxy, IPv6) :
  [[Projets perso/Moteur de recherche/shub-index/docs/conception/analyse-besoin/clarifications|clarifications § 9]].

## 📁 Fichiers (admin)

| Verbe | Chemin | Request | Response | Description | US |
| --- | --- | --- | --- | --- | --- |
| GET | `/media-files` | `?status=unmatched&page=&limit=` | `200` `{data, pagination}` | fichiers à traiter | US26 |
| PATCH | `/media-files/:id` | `{tmdbId}` **ou** `{status: "ignored"}` | `200` fichier · `400` · `404` · `502` si TMDB injoignable | associer à un film TMDB (import du film s'il n'existe pas) ou ignorer | US27, US28 |

## 🔄 Indexations (admin)

| Verbe | Chemin | Request | Response | Description | US |
| --- | --- | --- | --- | --- | --- |
| POST | `/scans` | – | `202 Accepted` `{id, status: "running", startedAt}` · `409` si un scan tourne déjà | lance une indexation **en arrière-plan** | US20, US25 |
| GET | `/scans` | `?page=&limit=` | `200` `{data, pagination}` (récent d'abord) | historique | US24 |
| GET | `/scans/:id` | – | `200` scan · `404` | suivi d'un scan (le client peut l'interroger toutes les quelques secondes) | US24 |

Pourquoi **`202`** et pas `201` : le scan peut durer plusieurs minutes. La
réponse part tout de suite (« demande acceptée, traitement en cours ») et
le travail continue côté serveur ; on suit l'avancement avec
`GET /scans/:id`.

La **tâche planifiée** (US21) n'appelle pas l'API : elle lance le même
code d'indexation en ligne de commande (`npm run scan`, via
`docker compose exec api …` dans la crontab de l'hôte) → `scan.user_id`
reste `NULL`. Pas de compte technique ni de mot de passe dans la crontab.

## 👥 Utilisateurs (admin)

| Verbe | Chemin | Request | Response | Description | US |
| --- | --- | --- | --- | --- | --- |
| GET | `/users` | – | `200` `Array<User>` *(existe)* | liste des comptes | US43 |
| PATCH | `/users/:id` | `{role}` | `200` · `400` · `404` | promouvoir / rétrograder | US42 |
| DELETE | `/users/:id` | – | `204` · `404` · `409` si on supprime son propre compte | suppression | US43 |

## Codes d'erreur communs

Format unique renvoyé par `global-error-handler` : `{ "error": "message lisible" }`
— **jamais** de stack trace ni de SQL (§ 13).

| Code | Quand |
| --- | --- |
| `400` | paramètre / body invalide (Zod) |
| `401` | pas de cookie `accessToken` ou jeton expiré |
| `403` | rôle insuffisant (`checkRoles`) ou lecture VLC hors réseau local |
| `404` | ressource inexistante, route inconnue |
| `409` | conflit : scan déjà en cours, email déjà pris, 10 favoris atteints, suppression du dernier admin |
| `502` | TMDB indisponible lors d'une association manuelle |
| `500` | erreur imprévue (loggée côté serveur avec son contexte) |
