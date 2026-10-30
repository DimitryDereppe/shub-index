# Conception — shub-index

> Dossier de conception complet, à lire dans l'ordre. Rédigé le
> 2026-10-27, puis complété le même jour après vérification du NAS et
> d'aldebaran (questions tranchées). **Implémenté le 2026-10-27** (API,
> client React, Docker) : le MPD est branché dans `src/api/database/init.sql`.

## 1. Analyse du besoin

- [[Projets perso/Moteur de recherche/shub-index/docs/conception/analyse-besoin/clarifications|Clarifications]] —
  problème, solution, périmètre, acteurs, contraintes, **règles de gestion
  RG1 → RG10**, décisions, **constat sur le NAS** (nommage, dossiers,
  cas de test du parseur), **lecture dans VLC**.
- [[Projets perso/Moteur de recherche/shub-index/docs/conception/analyse-besoin/user-stories|User stories]] —
  US01 → US43, priorités MoSCoW, critères d'acceptation.
- [[Projets perso/Moteur de recherche/shub-index/docs/conception/deploiement-aldebaran|Déploiement sur aldebaran]] —
  existant (Caddy, NFS, ports), variables d'environnement, sécurité de la
  détection du réseau local, crontab.

## 2. Merise (dictionnaire → MCD → MLD → MPD)

1. [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/01-recueil-des-donnees|Recueil des données]]
2. [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/02-mcd|MCD]] —
   schéma draw.io [merise/mcd.drawio.svg](merise/mcd.drawio.svg)
3. [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/03-mld|MLD]]
4. [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/04-dictionnaire-de-donnees|Dictionnaire de données]]
5. [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/05-mpd|MPD]] —
   script [merise/mpd.sql](merise/mpd.sql), validé sur PostgreSQL 16

## 3. UML (PlantUML, `.puml` + rendu `.png`)

| Diagramme | Source | Rendu |
| --- | --- | --- |
| Cas d'utilisation | [dcu-global.puml](uml/cas-utilisation/dcu-global.puml) | [png](uml/cas-utilisation/cas-utilisation-shub-index.png) |
| Séquence — recherche | [recherche-film.puml](uml/sequence/recherche-film.puml) | [png](uml/sequence/recherche-film.png) |
| Séquence — lancer une indexation | [indexation.puml](uml/sequence/indexation.puml) | [png](uml/sequence/indexation.png) |
| Séquence — lire dans VLC | [lecture-vlc.puml](uml/sequence/lecture-vlc.puml) | [png](uml/sequence/lecture-vlc.png) |
| Activité — algorithme d'indexation | [indexation.puml](uml/activite/indexation.puml) | [png](uml/activite/indexation-activite.png) |
| Entité-relation (reflet du MPD) | [shub-index-database.puml](uml/entite-relation/shub-index-database.puml) | [png](uml/entite-relation/base-de-donnees-shub-index.png) |
| Classes — couches de l'API | [architecture-api.puml](uml/classes/architecture-api.puml) | [png](uml/classes/architecture-api.png) |
| Déploiement | [shub-index-deploy-docker.puml](uml/deploiement/shub-index-deploy-docker.puml) | [png](uml/deploiement/deploiement-shub-index.png) |

Régénérer les images après modification d'un `.puml` (sans installer Java) :

```bash
cd docs/conception/uml
docker run --rm -u "$(id -u):$(id -g)" -e JAVA_TOOL_OPTIONS=-Duser.home=/tmp -v "$PWD":/data plantuml/plantuml:1.2024.7 -tpng "/data/**.puml"
```

## 4. API REST

- [[Projets perso/Moteur de recherche/shub-index/docs/conception/api-rest/endpoints|Endpoints]] —
  routes, paramètres de recherche, formes de réponse, codes d'erreur.
- [[Projets perso/Moteur de recherche/shub-index/docs/conception/api-rest/rbac|RBAC]] —
  qui a droit à quoi (visiteur / membre / admin).

## Implémentation (faite le 2026-10-27)

1. ✅ `init.sql` = `mpd.sql` (+ `unaccent`), `author` retiré de `src/lib/roles.ts`.
2. ✅ Codé dans l'ordre prévu : `filename-parser` (TDD `node:test`) →
   `tmdb.client` → DataMappers → `scan.service` → routes `/scans` →
   routes de recherche → `isLocalNetwork` + `/playlist` ; chaque route a
   son `.http` (`tests/`) et sa doc Swagger (`/api/docs`).
3. ✅ Client React (`src/client/`) et pile Docker complète.

## Reste à faire

1. Répondre aux **questions restantes** (clarifications § 7 : VPN,
   inscription ouverte sur un site public, accès invité au SMB).
2. Déployer sur aldebaran (cf. note de déploiement) — rien n'y a encore
   été installé.
