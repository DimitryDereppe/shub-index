# MPD — Modèle Physique de Données

> Script SQL complet : [mpd.sql](mpd.sql) (PostgreSQL 16). Dernière étape
> de la chaîne
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/01-recueil-des-donnees|recueil]] →
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/02-mcd|MCD]] →
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/03-mld|MLD]] →
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/04-dictionnaire-de-donnees|dictionnaire]] → MPD.

## Statut

**Branché le 2026-10-27** : `src/api/database/init.sql` est une copie
exacte de `mpd.sql` (+ `CREATE EXTENSION unaccent` pour la recherche sans
accents, US12). Pour l'appliquer à une base existante : `npm run db:init`,
ou `docker compose down -v && docker compose up` (le volume vide rejoue
`/docker-entrypoint-initdb.d/` — **efface les données**).

## Ce qui change par rapport à `init.sql`

- 8 nouvelles tables (catalogue + indexation) et 2 nouveaux types ENUM.
- ENUM `role` réduit à `member` / `admin` (`author` retiré), fait dans
  le même temps dans `src/lib/roles.ts`.
- `refresh_token.user_id` passe en `ON DELETE CASCADE` (supprimer un compte
  supprime ses jetons — sinon la suppression est refusée par la FK).
- Le script est encadré par `BEGIN; … COMMIT;` : s'il échoue au milieu,
  rien n'est créé à moitié.

## Évolution du 2026-10-30 : sagas

Table `saga` + colonne `movie.saga_id` (+ index). Sur une base **existante**,
on ne rejoue pas `mpd.sql` (il efface tout) : on joue la migration
`src/api/database/migration-2026-10-30-saga.sql` (idempotente,
`IF NOT EXISTS`), puis `npm run backfill -- --apply` dans le conteneur API
pour remplir les sagas des films déjà importés.

## Évolution du 2026-10-30 : espace personnel

Tables `watch_history` et `favorite` (+ index). Base existante :
`src/api/database/migration-2026-10-30-compte.sql` (idempotente).

Studios (même jour) : tables `studio` et `movie_studio` (+ index),
migration `src/api/database/migration-2026-10-30-studio.sql` ; le même
`npm run backfill` remplit les studios des films existants.

Mot de passe oublié (2026-10-31) : table `password_reset_token`, migration
`src/api/database/migration-2026-10-31-password-reset.sql`.

## Contraintes métier portées par la base

Elles protègent les données **même si** le code de l'API a un bug :

| Contrainte | Règle de gestion | Technique |
| --- | --- | --- |
| `media_file_matched_has_movie` | RG1 : identifié ⇔ rattaché à un film | `CHECK ((status = 'matched') = (movie_id IS NOT NULL))` — comparaison de deux booléens |
| `scan_only_one_running` | RG6 : une seule indexation en cours | index **unique partiel** `ON scan (status) WHERE status = 'running'` (même astuce que `refresh_token`) |
| `scan_finished_when_done` | un scan terminé a une date de fin | `CHECK ((status = 'running') = (finished_at IS NULL))` |
| `release_year BETWEEN 1888 AND 2100` | année plausible | `CHECK` |
| `certification IN ('TP','10','12','16','18')` | classifications françaises connues | `CHECK` (liste courte et stable ; `NULL` autorisé) |
| `size_bytes BIGINT` | un fichier 4K pèse plus de 2 Go | type adapté (un `INT` déborderait) |

## Index ajoutés (et pourquoi)

PostgreSQL crée tout seul un index sur chaque `PRIMARY KEY` et `UNIQUE`,
**mais pas sur les clés étrangères**. On en ajoute là où la recherche
filtre ou joint :

- `movie(release_year)` — filtre par année (US02) ;
- `movie(saga_id)` — « les films de cette saga » (2026-10-30) ;
- `watch_history(movie_id)`, `favorite(movie_id)` — accélèrent le
  `ON DELETE CASCADE` quand un film est supprimé (la PK commence par
  `user_id`, elle sert déjà pour « les favoris de cet utilisateur ») ;
- `movie_has_genre(genre_id)`, `movie_studio(studio_id)`, `movie_director(person_id)`,
  `movie_cast(person_id)` — « les films de cette personne / de ce genre »
  (la PK composée commence par `movie_id`, elle ne sert pas dans l'autre
  sens) ;
- `media_file(movie_id)`, `media_file(status)` — fichiers d'un film, liste
  des non-identifiés (US26).

Les recherches textuelles `ILIKE '%fincher%'` ne profitent pas d'un index
classique ; pour quelques milliers de lignes ce n'est pas un problème.
Évolution possible si besoin : extensions `pg_trgm` (index trigrammes) et
`unaccent` (US12).

## Validation réalisée (2026-10-27)

Rejoué dans un conteneur jetable `postgres:16-alpine` (supprimé ensuite) :

- `psql -v ON_ERROR_STOP=1 -f mpd.sql` → OK, 10 tables ; **rejoué une 2ᵉ
  fois** sans erreur (les `DROP … IF EXISTS` le rendent idempotent) ;
- jeu d'essai *Alien³* (1992, Fincher) / *Aliens* (1986, Cameron), tous
  deux SF + horreur avec Sigourney Weaver : la requête « réalisateur
  contient `cameron` **et** genre `horreur` » renvoie seulement *Aliens*
  (critère d'acceptation US06) ;
- refus attendus : fichier `matched` sans `movie_id` → violation de
  `media_file_matched_has_movie` ; 2ᵉ scan `running` → violation de
  `scan_only_one_running` ; scan passé à `success` sans `finished_at` →
  violation de `scan_finished_when_done`.
- 2ᵉ passage après l'ajout de `certification` et le retrait de `author` :
  mêmes résultats ; `certification = '16'` et `NULL` acceptés, `'U'`
  refusé (`movie_certification_check`), rôle `'author'` refusé
  (`invalid input value for enum role`).
