# Clarification du besoin — shub-index

> Première étape de la conception (phase 1 de la
> [[Projets perso/Moteur de recherche/roadmap-nouveau-projet|roadmap]]) :
> comprendre **ce qu'on construit** avant de modéliser. Les hypothèses du
> premier jet ont été tranchées le 2026-10-27 (§ 7), à partir d'un constat
> fait sur le NAS (§ 8).

## 1. Le problème

Le NAS **Shub-Niggurath** (partage SMB `\\<ip-du-nas>\Shub-Niggurath`) contient
une vidéothèque rangée en dossiers. Retrouver un film demande aujourd'hui de
**connaître son titre** et de parcourir l'arborescence à la main. Impossible
de répondre à des questions comme :

- « un film de **1992** réalisé par **Fincher** » ;
- « un film avec **Sigourney Weaver** » ;
- « un film de **science-fiction / horreur** de **James Cameron** ».

Ces questions portent sur des informations (année, réalisateur, acteurs,
genres) qui **ne sont pas dans le nom du fichier**.

## 2. La solution visée

Une application web en deux parties :

1. **L'indexation** : un programme parcourt le partage réseau, repère les
   fichiers vidéo, déduit du nom de fichier un **titre** et une **année**
   (expression régulière), puis interroge une **API externe de films**
   (TMDB — *The Movie Database*, **(hypothèse)**) pour récupérer les
   métadonnées : réalisateur(s), acteurs, genres, durée, synopsis, affiche.
   Le résultat est enregistré dans PostgreSQL.
2. **La recherche** : une API REST (Express) et, plus tard, un client web
   (React) permettent de chercher dans ce catalogue en combinant des
   critères (texte libre, année ou plage d'années, réalisateur, acteur,
   genre), puis d'afficher **le chemin du fichier** sur le NAS pour l'ouvrir.

```text
NAS (SMB) ──lecture seule──▶ indexeur ──▶ PostgreSQL ◀── API REST ◀── client web
                                │
                                └──▶ API TMDB (métadonnées)
```

## 3. Périmètre

| Dans le périmètre (v1) | Hors périmètre (plus tard / jamais) |
| --- | --- |
| Films de `Films/` et `Animé/` (≈ 294 fichiers, cf. § 8) | Séries (saisons/épisodes), courts métrages Golden Collection, bonus, musique, livres — le modèle laisse la porte ouverte (le fichier est une entité à part) |
| Indexation complète + ré-indexation incrémentale (ajouts, modifications, suppressions) | Surveillance en temps réel du partage (inotify…) |
| Recherche multicritère + fiche film + fiche personne | Lecture / streaming de la vidéo **dans le navigateur** |
| **Lancer le film dans VLC** depuis un appareil du réseau local (§ 9) | Lancer VLC depuis Internet |
| Correction manuelle d'un fichier mal identifié (admin) | Téléchargement du fichier via l'API |
| Comptes utilisateurs (brique auth déjà en place) | Listes perso (favoris, « déjà vu ») — évolution possible |
| Indexation lancée à la main (admin) ou par tâche planifiée (cron de l'hôte) | Planificateur intégré à l'API |

## 4. Acteurs

| Acteur | Qui | Ce qu'il fait |
| --- | --- | --- |
| **Visiteur** | personne non connectée | créer un compte, se connecter (le catalogue n'est visible qu'une fois connecté) |
| **Membre** | toute personne inscrite | rechercher, consulter les fiches ; **lancer un film dans VLC si elle est sur le réseau local** |
| **Admin** | moi | tout ce que fait un membre + lancer une indexation, corriger les identifications, gérer les comptes |
| **Tâche planifiée** | cron de la machine hôte | lancer une indexation périodique (ex. chaque nuit) |
| **TMDB** | API externe | fournir les métadonnées d'un film |

## 5. Contraintes

- **Accès au NAS en lecture seule** : l'application ne doit jamais
  modifier, renommer ni supprimer un fichier du partage. Le partage est
  monté sur la machine hôte (CIFS) puis exposé au conteneur en `:ro`.
- **Seules `Films/` et `Animé/` sont indexées** (liste blanche
  `SCAN_ROOTS`), moins `Séries/`, `Extras/`, `Golden Collection/`,
  `_À trier/` (`SCAN_EXCLUDED`) — cf. § 8.
- **Pas d'adresse IP ni de chemin perso en dur** (dépôt destiné à devenir
  public) : racine du montage, préfixe UNC affiché, clé TMDB et dossiers
  exclus passent par `.env`.
- **Clé d'API TMDB** = secret → `.env`, jamais commitée ni loggée.
- **Respect du quota TMDB** : ne pas réinterroger l'API pour un fichier
  déjà identifié et inchangé (on compare chemin + taille + date de
  modification).
- **Volume** : catalogue perso (quelques centaines à quelques milliers de
  films) → une recherche SQL `ILIKE` paramétrée suffit, pas besoin d'un
  moteur dédié (Elasticsearch…) — KISS.
- Standards du dossier : SQL brut paramétré (DataMapper), Merise avant
  tout `CREATE TABLE`, accessibilité, tests `.http`, Swagger dès la
  première route métier.

## 6. Règles de gestion (servent au MCD)

- RG1 — Un **fichier** vidéo correspond à **au plus un** film ; il peut
  n'en avoir **aucun** tant qu'il n'est pas identifié (ou s'il est ignoré).
- RG2 — Un **film** peut avoir **plusieurs fichiers** (ex. une version
  1080p et une version 4K) ; il reste dans le catalogue même si tous ses
  fichiers disparaissent (sa fiche n'est plus « disponible »).
- RG3 — Une **personne** peut être réalisatrice d'un film et actrice
  d'un autre (ou du même) : réalisateurs et acteurs forment **une seule**
  entité PERSONNE, reliée au film par deux associations différentes.
- RG4 — Un film peut avoir **plusieurs réalisateurs** (ex. les Wachowski)
  et **plusieurs genres**.
- RG5 — Pour un acteur dans un film, on retient le **personnage** joué et
  son **ordre d'apparition au générique** (pour n'afficher que les
  premiers rôles).
- RG6 — Une **indexation** (scan) est lancée par un admin **ou** par la
  tâche planifiée (aucun utilisateur dans ce cas). **Une seule** indexation
  peut être en cours à la fois.
- RG7 — Un fichier absent lors d'une indexation terminée avec succès est
  **retiré** de l'index (les fichiers sont la photo du NAS, pas un
  historique).
- RG8 — Un fichier non identifié automatiquement est marqué
  « non identifié » et apparaît dans une liste à traiter par l'admin, qui
  peut l'associer à un film (identifiant TMDB) ou le marquer « ignoré »
  (bonus, making-of…).

- RG9 — **Garde-fou anti-vidage** : si une racine à indexer (`Films/`,
  `Animé/`) est absente ou ne contient aucun fichier vidéo (partage NFS
  pas monté, montage vide après mise en veille), l'indexation **échoue**
  et ne retire rien. Sans cette règle, RG7 effacerait tout le catalogue.
- RG10 — Le bouton **« Lire dans VLC »** n'est proposé (et la route qui
  le sert n'accepte la requête) que si le visiteur est **connecté** et que
  sa requête vient du **réseau local** (adresse IP dans une plage
  configurée). Depuis Internet, on peut chercher mais pas lancer.

## 7. Décisions (questions tranchées le 2026-10-27)

| # | Question | Décision |
| --- | --- | --- |
| 1 | Source des métadonnées | **TMDB** (le script `organize.py` du NAS l'utilise déjà pour nommer les fichiers) |
| 2 | Nommage des fichiers | **vérifié sur le NAS**, voir § 8 : convention unique, 100 % des films concernés la respectent |
| 3 | Rôle `author` | **retiré** (inutile ici) → ENUM `member` / `admin` ; implique de modifier `init.sql` **et** `src/lib/roles.ts` |
| 4 | Inscription | **reste ouverte** (`POST /api/auth/register` public) |
| 4 bis | Détecter le réseau local pour lancer VLC | **possible**, voir § 9 → pas besoin d'un rôle dédié |
| 5 | Hébergement | **aldebaran**, derrière le Caddy existant, accessible depuis Internet → voir [[Projets perso/Moteur de recherche/shub-index/docs/conception/deploiement-aldebaran|déploiement sur aldebaran]] |

### Questions restantes

- **VPN WireGuard** (`10.8.0.0/24` sur aldebaran) : un proche connecté
  par le VPN compte-t-il comme « réseau local » pour la lecture VLC ? Il
  suffit d'ajouter la plage dans `LAN_CIDRS`, à condition que le VPN
  donne aussi accès au NAS.
- **Inscription ouverte + site public** : n'importe qui sur Internet
  pourra créer un compte et voir **la liste des films du NAS**. Si ça
  dérange : n'autoriser l'inscription que depuis le réseau local (même
  détection qu'au § 9), sans rien changer d'autre.
- **Partage SMB et invités** : VLC ouvrira `smb://192.168.1.37/...`. Si
  le partage demande un identifiant, VLC le demandera au premier
  lancement. À tester depuis un PC du réseau.

## 8. Constat sur le NAS (vérifié le 2026-10-27 depuis aldebaran)

Partage monté en **NFS** sur aldebaran : `192.168.1.37:/srv/nas` →
`/mnt/nas` (automount systemd), racine `/mnt/nas/Shub-Niggurath`.

| Dossier | Fichiers vidéo | Dans l'index v1 ? |
| --- | --- | --- |
| `Films/` (hors `Séries/` et `Extras/`) | 146 | ✅ |
| `Animé/` (hors `Séries/` et `Golden Collection/`) | 148 | ✅ (Disney, DC, Astérix…) |
| `Films/Séries/`, `Animé/Séries/` | 224 + … | ❌ séries (hors périmètre v1) |
| `**/Extras/` | 48 | ❌ bonus DVD |
| `Animé/Golden Collection/` | 372 | ❌ courts métrages au nommage DVD (`052540DVD A Gander at Mother Goose MM.avi`) |
| `**/_À trier/` | 0 | ❌ zone de tri d'`organize.py` |
| `Photos/`, `Photos_*`, `Migrations/`, `_Téléchargements/`, coffre chiffré… | ~990 | ❌ vidéos perso / dépôt torrent / **données privées** |

On n'indexe donc **que deux racines** (liste blanche `SCAN_ROOTS`) moins
une liste de sous-dossiers exclus (`SCAN_EXCLUDED`) : plus sûr qu'indexer
tout le partage en excluant au cas par cas (un nouveau dossier perso ne
sera jamais indexé par erreur).

**Convention de nommage** (produite par `.auto-organize/organize.py`
lors du téléchargement, après vérification sur TMDB) :

```text
Titre (Année) [Classification] - Réalisateur 1, Réalisateur 2.ext
Alien 3 (1992) [16] - David Fincher.mkv
Matrix Revolutions (2003) [12] - Lana Wachowski, Lilly Wachowski.avi
Juste après l'Aube (2026) [] - Olivier Boillot.mp4      ← classification inconnue
Oliver et Compagnie (1988).mkv                          ← Disney/Pixar : titre + année seulement
Ghost Rider (2007) [TP] - Mark Steven Johnson (2).avi   ← doublon : suffixe " (2)"
… - Partie 1.mkv / … - Partie 2.mkv                     ← film en plusieurs fichiers (6 cas)
```

Conséquences pour la conception :

- la regex extrait **titre, année, classification, réalisateur(s)** ;
  l'année **et** le réalisateur permettent de retrouver le bon film sur
  TMDB avec une grande confiance (on compare les réalisateurs renvoyés) ;
- la **classification française** (TP, 10, 12, 16, 18) est une donnée
  utile → ajoutée au film (`certification`) ;
- un nom peut être **faux** : le log d'`organize.py` montre
  `Ghost.FRENCH.DVDRip.avi` renommé en *Ghost Rider (2007)* le 2026-10-26
  (probablement *Ghost*, 1990). L'indexeur suivra le nom ; la correction
  manuelle par l'admin (US27) reste nécessaire.

**Cas de test du parseur de nom de fichier** (à écrire en `node:test`
*avant* le code, démarche TDD — tous tirés de vrais fichiers du NAS) :

| Nom de fichier | titre | année | classif. | réalisateurs |
| --- | --- | --- | --- | --- |
| `Alien 3 (1992) [16] - David Fincher.mkv` | `Alien 3` | 1992 | `16` | `David Fincher` |
| `Matrix Revolutions (2003) [12] - Lana Wachowski, Lilly Wachowski.avi` | `Matrix Revolutions` | 2003 | `12` | `Lana Wachowski`, `Lilly Wachowski` |
| `Juste après l'Aube (2026) [] - Olivier Boillot.mp4` | `Juste après l'Aube` | 2026 | `null` | `Olivier Boillot` |
| `Oliver et Compagnie (1988).mkv` | `Oliver et Compagnie` | 1988 | `null` | *(aucun)* |
| `Ghost Rider (2007) [TP] - Mark Steven Johnson (2).avi` | `Ghost Rider` | 2007 | `TP` | `Mark Steven Johnson` (le ` (2)` est ignoré) |
| `Star Wars - Épisode I - La Menace Fantôme (1999) [TP] - George Lucas.avi` | `Star Wars - Épisode I - La Menace Fantôme` | 1999 | `TP` | `George Lucas` (le titre contient lui-même ` - `) |
| `… (2001) [12] - X - Partie 2.mkv` | … | 2001 | `12` | `X` (le ` - Partie 2` est ignoré) |
| `052540DVD A Gander at Mother Goose MM.avi` | → **non reconnu** (`null`) | | | |

Extensions vidéo trouvées : `mp4`, `avi`, `mkv`, `mov`, `mpg`, `m4v` —
reprendre la liste `video_extensions` d'`organize.py` pour rester cohérent.

## 9. Lancer le film dans le VLC du visiteur

**Détecter un *compte* du réseau local** (session Windows, utilisateur
du NAS…) depuis un navigateur n'est pas faisable simplement. **Détecter
que la requête vient du réseau local, oui** : l'adresse IP du visiteur
est dans `192.168.1.0/24`. C'est ce qui est retenu (RG10).

**Comment le navigateur « lance » VLC** : il ne peut pas ouvrir une
application tout seul. L'API renvoie un petit fichier **playlist `.m3u`**
qui contient l'adresse réseau du film :

```text
#EXTM3U
#EXTINF:-1,Alien 3 (1992)
smb://192.168.1.37/Shub-Niggurath/Films/Alien%20(Quadrilogie)/Alien%203%20(1992)%20%5B16%5D%20-%20David%20Fincher.mkv
```

Le navigateur le télécharge, le système l'ouvre avec VLC (application par
défaut des `.m3u` quand VLC est installé, sur Windows, Linux, macOS et
Android), et **VLC lit directement depuis le NAS** : la vidéo ne passe
pas par aldebaran, ni par Internet.

Points d'attention :

- les caractères spéciaux du chemin (espaces, accents, `[ ]`) doivent être
  **encodés** dans l'URL (`encodeURIComponent` sur chaque segment) ;
- derrière Caddy, l'IP vue par Express est celle de **Caddy**. Il faut
  `app.set('trust proxy', …)` pour lire la vraie IP dans
  `X-Forwarded-For`, **et** que l'API ne soit joignable **que** par Caddy
  (port non publié). Sinon n'importe qui pourrait envoyer
  `X-Forwarded-For: 192.168.1.10` et se faire passer pour un appareil du
  réseau local ;
- ne **jamais** compter les plages Docker (`172.16.0.0/12`) comme
  locales : en IPv6, Docker peut présenter un visiteur d'Internet avec
  l'IP de sa passerelle `172.x` ;
- un appareil du réseau local qui passe par le **nom de domaine public**
  (duckdns) peut arriver avec l'IP de la box ou l'IP publique selon le
  routeur (*hairpin NAT*) : à tester au déploiement ; au besoin, ajouter
  un nom de domaine local qui pointe directement sur `192.168.1.35`.
