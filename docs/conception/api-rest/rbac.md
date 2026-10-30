# RBAC — droits par rôle

> Contrôle d'accès par rôle (*Role-Based Access Control*), appliqué par les
> middlewares déjà en place : `isConnected` (connecté ?) puis
> `checkRoles([...])` (bon rôle ?). Endpoints détaillés :
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/api-rest/endpoints|endpoints]].
>
> Un visiteur ne voit que l'inscription et la connexion ; toute personne
> inscrite est `member`. Deux rôles seulement : `member` et `admin`
> (`author`, hérité d'oquiz, est retiré).
>
> En plus du rôle, **une condition réseau** : la lecture dans VLC exige
> que la requête vienne du réseau local (colonne « Membre (LAN) »). Ce
> n'est pas un rôle — c'est un critère lié à la **requête**, pas au compte :
> le même membre peut lire chez lui et pas depuis son téléphone en 4G.

## 🔐 Authentification

| Verbe | Chemin | Visiteur | Membre | Admin |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | yes | – | – |
| POST | `/auth/login` | yes | yes | yes |
| POST | `/auth/refresh` | yes (cookie) | yes | yes |
| POST | `/auth/logout` | no | yes | yes |
| GET | `/auth/me` | no | yes | yes |
| POST | `/auth/forgot-password` | yes | yes | yes |
| POST | `/auth/reset-password` | yes (lien reçu par email) | yes | yes |

## 👤 Mon compte *(2026-10-30)*

| Verbe | Chemin | Visiteur | Membre | Admin |
| --- | --- | --- | --- | --- |
| PATCH | `/me` | no | yes | yes |
| PATCH | `/me/password` | no | yes | yes |
| DELETE | `/me` | no | yes | yes (sauf le dernier admin) |
| GET / DELETE | `/me/history`, `/me/history/:movieId` | no | yes | yes |
| GET / PUT / DELETE | `/me/favorites`, `/me/favorites/:movieId` | no | yes | yes |

Toujours **ses propres** données : l'id vient du jeton, pas de l'URL.

## 🎬 Catalogue

| Verbe | Chemin | Visiteur | Membre | Admin |
| --- | --- | --- | --- | --- |
| GET | `/movies` | no | yes | yes |
| GET | `/movies/:id` | no | yes | yes |
| PATCH | `/movies/:id` | no | no | yes |
| GET | `/people` | no | yes | yes |
| GET | `/people/:id` | no | yes | yes |
| GET | `/genres` | no | yes | yes |

## ▶️ Lecture VLC

| Verbe | Chemin | Visiteur | Membre (Internet) | Membre (LAN) | Admin |
| --- | --- | --- | --- | --- | --- |
| GET | `/media-files/:id/playlist` | no | no | yes | yes si LAN |

## 📁 Fichiers et 🔄 indexations

| Verbe | Chemin | Visiteur | Membre | Admin |
| --- | --- | --- | --- | --- |
| GET | `/media-files` | no | no | yes |
| PATCH | `/media-files/:id` | no | no | yes |
| POST | `/scans` | no | no | yes |
| GET | `/scans` | no | no | yes |
| GET | `/scans/:id` | no | no | yes |

## 👥 Utilisateurs

| Verbe | Chemin | Visiteur | Membre | Admin |
| --- | --- | --- | --- | --- |
| GET | `/users` | no | no | yes |
| PATCH | `/users/:id` | no | no | yes (sauf son propre rôle) |
| DELETE | `/users/:id` | no | no | yes (sauf soi-même) |

> `GET /users` était accessible à **tout membre connecté** (seul
> `isConnected` le protégeait) : restreint avec `checkRoles(['admin'])`
> le 2026-10-27. Un rôle insuffisant renvoie désormais **403** (et non
> plus 401).

## Pourquoi pas d'ABAC ici

Contrairement à oquiz (« un auteur ne modifie **que ses** quiz »), aucune
règle ne dépend du **propriétaire** d'une donnée : le catalogue est commun
à tous. Le seul cas « soi-même » (ne pas supprimer son propre compte) se
vérifie dans le controller en comparant `req.userId` à `:id`.
