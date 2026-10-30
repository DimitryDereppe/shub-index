# MCD — Modèle Conceptuel de Données

> Schéma **draw.io** : [mcd.drawio.svg](mcd.drawio.svg) — à ouvrir dans VS Code
> avec l'extension *Draw.io Integration* (`hediet.vscode-drawio`) pour le
> modifier ; le fichier reste une image SVG affichable partout. Depuis le
> 2026-10-30, il remplace le schéma Mocodo (`mcd.mcd` / `mcd.svg`, supprimés). Données de départ :
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/merise/01-recueil-des-donnees|recueil des données]] ;
> règles de gestion RG1 → RG8 :
> [[Projets perso/Moteur de recherche/shub-index/docs/conception/analyse-besoin/clarifications|clarifications]].

![MCD shub-index](mcd.drawio.svg)

## Version texte (notation Mocodo)

> Gardée comme résumé lisible ; la référence est le schéma draw.io.

```text
GENRE: code genre, nom, identifiant TMDB genre
CLASSER, 0N FILM, 0N GENRE
FILM: code film, titre, titre original, année de sortie, durée, classification, synopsis, affiche, identifiant TMDB film
RÉALISER, 0N PERSONNE, 0N FILM
PERSONNE: code personne, nom, identifiant TMDB personne

SAGA: code saga, nom, affiche, identifiant TMDB saga
APPARTENIR, 01 FILM, 0N SAGA
STUDIO: code studio, nom, identifiant TMDB studio
PRODUIRE, 0N FILM, 0N STUDIO
:
:
:

FICHIER: code fichier, chemin, nom du fichier, extension, taille, date de modification, statut d'identification, vu le
CORRESPONDRE, 01 FICHIER, 0N FILM
:
JOUER, 0N PERSONNE, 0N FILM: personnage, ordre au générique
:

INDEXATION: code indexation, début, fin, statut, fichiers ajoutés, fichiers modifiés, fichiers retirés, message d'erreur
LANCER, 0N UTILISATEUR, 01 INDEXATION
UTILISATEUR: code utilisateur, email, prénom, nom, mot de passe, rôle
POSSÉDER, 0N UTILISATEUR, 11 JETON DE RAFRAÎCHISSEMENT
JETON DE RAFRAÎCHISSEMENT: code jeton, empreinte, consommé, émis le, expire le
DEMANDER, 0N UTILISATEUR, 11 JETON DE RÉINITIALISATION
JETON DE RÉINITIALISATION: code jeton, empreinte, créé le, expire le, utilisé le

REGARDER, 0N UTILISATEUR, 0N FILM: regardé le
METTRE EN FAVORI, 0N UTILISATEUR, 0N FILM: ajouté le
```

> Rappel de lecture : la cardinalité écrite à côté d'une entité dit
> **combien de fois cette entité participe** à l'association. `01 FICHIER`
> dans CORRESPONDRE = « un fichier correspond à 0 ou 1 film ».

## Justification des cardinalités

| Association | Côté A | Côté B | Pourquoi |
| --- | --- | --- | --- |
| CLASSER | FILM **0,N** | GENRE **0,N** | un film a plusieurs genres (RG4), mais TMDB peut n'en donner aucun ; un genre peut n'avoir encore aucun film |
| RÉALISER | FILM **0,N** | PERSONNE **0,N** | plusieurs réalisateurs possibles (RG4) ; 0 si TMDB ne le connaît pas ; une personne peut n'être qu'actrice |
| JOUER | FILM **0,N** | PERSONNE **0,N** | casting multiple ; documentaire sans acteur ; une personne peut n'être que réalisatrice. **Attributs portés par l'association** : `personnage` et `ordre au générique` n'appartiennent ni au film ni à la personne seuls, mais au **couple** (RG5) |
| APPARTENIR | FILM **0,1** | SAGA **0,N** | un film fait partie d'au plus une saga (la « collection » TMDB), beaucoup n'en ont aucune ; une saga n'est créée qu'avec un film, mais peut perdre tous ses films (0) *(ajouté le 2026-10-30)* |
| PRODUIRE | FILM **0,N** | STUDIO **0,N** | un film a souvent plusieurs studios (Iron Man : Marvel Studios + Marvel Entertainment + Fairview), TMDB peut n'en donner aucun ; un studio produit plusieurs films *(2026-10-30)* |
| CORRESPONDRE | FICHIER **0,1** | FILM **0,N** | un fichier = au plus un film, aucun tant qu'il n'est pas identifié (RG1) ; un film peut avoir plusieurs versions ou n'avoir plus aucun fichier (RG2) |
| LANCER | INDEXATION **0,1** | UTILISATEUR **0,N** | lancée par un admin **ou** par la tâche planifiée (aucun utilisateur) (RG6) |
| REGARDER | UTILISATEUR **0,N** | FILM **0,N** | un utilisateur regarde plusieurs films, un film est regardé par plusieurs utilisateurs ; **attribut porté** : `regardé le` (au couple, comme `personnage` dans JOUER) *(2026-10-30)* |
| METTRE EN FAVORI | UTILISATEUR **0,N** | FILM **0,N** | même raisonnement ; attribut `ajouté le`. La limite de **10** n'est pas une cardinalité Merise exprimable par la base : elle est vérifiée par l'API *(2026-10-30)* |
| DEMANDER | JETON DE RÉINITIALISATION **1,1** | UTILISATEUR **0,N** | un lien « mot de passe oublié » appartient toujours à un utilisateur ; un utilisateur peut en demander plusieurs (un seul utilisable à la fois) *(2026-10-31)* |
| POSSÉDER | JETON **1,1** | UTILISATEUR **0,N** | brique auth reprise d'oquiz : un jeton appartient toujours à un utilisateur |

## Choix de modélisation discutés

- **Une seule entité PERSONNE** plutôt que RÉALISATEUR + ACTEUR (RG3) :
  Clint Eastwood réalise *Impitoyable* et y joue. Avec deux entités, il
  serait stocké deux fois et la fiche personne (US10) serait éclatée. Le
  **rôle** de la personne est porté par **l'association** (RÉALISER ou
  JOUER), pas par l'entité.
- **FICHIER séparé de FILM** : c'est ce qui permet plusieurs versions
  d'un même film (RG2), de garder un fichier non identifié sans inventer
  de film, et plus tard de rattacher un fichier à un **épisode** de série
  sans toucher à FILM.
- **INDEXATION est une entité** (et pas un simple log texte) : on doit
  pouvoir l'interroger (« y a-t-il un scan en cours ? » RG6, historique
  US24).
- **SAGA en 0,1 et pas en 0,N** (2026-10-30) : on reprend la « collection »
  TMDB, qui n'autorise qu'**une** saga par film. Conséquence assumée : un
  regroupement plus large comme « Marvel » (plusieurs sagas) n'est pas
  représentable ; il faudrait passer en 0,N (table de liaison) pour ça.
  → C'est **STUDIO** (0,N — 0,N) qui couvre ce besoin : « marvel » trouve
  tous les films d'un studio Marvel, quelle que soit leur saga.
- **Pas d'entité ANNÉE** : l'année est une simple propriété du film
  (valeur atomique, pas d'autre information à retenir dessus).
- **Pas d'entité EXTENSION** : valeur courte sans propriété propre — KISS.
- **Pas de résolution** : les noms de fichiers du NAS ne l'indiquent pas
  (constat du 2026-10-27), la colonne serait toujours vide.
