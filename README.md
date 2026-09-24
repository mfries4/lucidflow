# LucidFlow

Application web d'édition de **cartes mentales** et de **diagrammes UML** (classes, séquence,
cas d'utilisation, activité) et d'organigrammes. Inspirée de Lucidchart, sans aucune
fonctionnalité d'intelligence artificielle.

## Démarrage avec Docker

```bash
docker compose up -d --build
```

L'application est alors disponible sur **http://localhost:8080**.

```bash
docker compose logs -f     # suivre les journaux
docker compose down        # arrêter
```

Les schémas sont conservés dans le volume Docker `lucidflow-data` (base SQLite `/data/lucidflow.db`) :
ils survivent aux redémarrages et aux reconstructions de l'image. Pour changer le port :
`PORT=3000 docker compose up -d`.

## Fonctionnalités

**Documents**
- Tableau de bord listant tous les schémas, avec aperçu, recherche (insensible aux accents),
  renommage, duplication et suppression.
- Six modèles de départ : carte mentale, organigramme, UML classes / séquence / cas d'utilisation / activité, plus le document vierge.
- **Import PlantUML** : collez un texte et l'application en tire un schéma modifiable —
  diagrammes de classes, de séquence, de cas d'utilisation et cartes mentales. Depuis le tableau
  de bord pour créer un document, ou depuis l'éditeur pour insérer dans le schéma courant.
- Enregistrement automatique (après 900 ms d'inactivité), à la sortie de l'éditeur et à la fermeture
  de l'onglet ; bouton d'enregistrement explicite et `Ctrl+S`. Un aperçu du schéma est généré pour
  le tableau de bord. Si le serveur est indisponible, le travail reste à l'écran et repart au
  prochain enregistrement.
- Bouton **Copier** : le schéma part dans le presse-papiers en PNG à fond transparent (rendu ×2),
  prêt à coller dans un document, une présentation ou une messagerie sans passer par un fichier.
- Export **PNG**, **SVG** et **JSON**.

**Édition**
- Bibliothèque de plus de 30 formes classées par famille, posées au clic ou par glisser-déposer.
- Connecteurs coudés, droits ou courbes ; pointes de flèche UML complètes (association, héritage,
  réalisation, dépendance, agrégation, composition, message, retour).
- Pour relier : survolez une forme et tirez l'un des **points bleus**. Un dépôt dans le vide crée
  directement la forme suivante, déjà reliée.
- Compartiments UML éditables (attributs, méthodes) par double-clic ; la boîte s'agrandit toute seule.
- Sur un diagramme de séquence, les messages s'accrochent à la **hauteur exacte** du dépôt sur la
  ligne de vie : la chronologie reste lisible.
- Sélection multiple (lasso ou Maj+clic) avec **redimensionnement du groupe entier** — les écarts sont
  conservés et les formes à proportions fixes (acteur, nœud initial) ne se déforment pas.
- Aimantation sur la grille et sur les formes voisines avec repères d'alignement, alignement /
  répartition, ordre de superposition, copier-coller, annuler/rétablir illimité.
- `Échap` interrompt le geste en cours (déplacement, redimensionnement, tracé d'un lien) et remet
  les formes où elles étaient.
- Panneau de propriétés : remplissage, contour, épaisseur, style de trait, arrondi, opacité,
  police, alignement, étiquettes et cardinalités des liens.

### Raccourcis clavier

| Raccourci | Action |
|---|---|
| `V` / `M` / `C` | Sélection / déplacement de la vue / connecteur |
| Double-clic sur la toile | Nouvelle forme |
| Double-clic sur une forme | Éditer le texte, ou le compartiment UML visé (`Entrée` valide) |
| Double-clic sur un lien | Éditer son étiquette |
| `Échap` | Annuler le geste en cours / la saisie |
| `Maj` en posant une forme | Garder l'outil armé pour en poser plusieurs |
| `Ctrl/Cmd` + `Z` / `Maj`+`Z` | Annuler / rétablir |
| `Ctrl/Cmd` + `C` / `V` / `X` / `D` | Copier / coller / couper / dupliquer |
| `Ctrl/Cmd` + `A` / `S` / `0` | Tout sélectionner / enregistrer / ajuster à l'écran |
| `Suppr` | Supprimer la sélection |
| Flèches (+ `Maj`) | Déplacer de 1 px (de 10 px) |
| `Espace` + glisser, molette | Déplacer la vue |
| `Ctrl/Cmd` + molette | Zoomer |

## Développement hors Docker

Node.js 22 ou plus récent est requis (le serveur utilise le module natif `node:sqlite`).

```bash
npm run setup   # installe les dépendances du client
npm run dev     # API sur :8080 + client Vite sur :5173 (rechargement à chaud)
```

Pour un test du mode production en local :

```bash
npm run build   # construit le client dans server/public
npm start       # http://localhost:8080
```

## Architecture

```
lucidflow-symbole.svg   symbole de marque, source de l'icône (favicon, et plus tard l'app Electron)
client/           interface React 18 + TypeScript, servie par Vite
  src/shapes/     registre des formes (géométrie, rendu SVG, compartiments UML) et palette
  src/lib/        géométrie, routage des liens, aimantation, mesure de texte, export, API
  src/store/      état de l'éditeur (zustand) : document, sélection, caméra, historique
  src/components/ toile, panneaux, barre d'outils
server/           API REST + service des fichiers statiques
  src/db.js       accès SQLite (module natif node:sqlite)
  src/index.js    serveur HTTP (aucune dépendance npm)
Dockerfile        build multi-étapes : compilation du client, image d'exécution minimale
```

Choix techniques :

- **Rendu SVG** plutôt que canvas : texte sélectionnable et net à tous les zooms, export vectoriel
  direct, styles CSS classiques. Le tracé des liens (coudes, pointes, aimantation) est calculé dans
  `src/lib/geometry.ts` et `src/lib/edges.ts`.
- **Aucune dépendance côté serveur** : `node:sqlite` et `node:http` suffisent, ce qui donne une image
  Docker légère et sans compilation native. Les réponses texte sont compressées en gzip
  (le bundle passe de 234 ko à 75 ko sur le réseau).
- **Trois dépendances côté client** (React, React-DOM, zustand) : le bundle fait environ 75 ko gzippés.
- **Rendu mémoïsé** : déplacer une forme ne redessine qu'elle et les liens qui y touchent. Mesuré
  sur un schéma de 300 formes et 280 liens : 1,5 ms de calcul par déplacement (5 ms si les 300
  formes sont sélectionnées).

## API REST

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/documents` | Liste (sans le contenu des schémas) |
| `POST` | `/api/documents` | Création `{ name, kind, data }` |
| `GET` | `/api/documents/:id` | Document complet |
| `PATCH` | `/api/documents/:id` | Mise à jour partielle `{ name?, data?, preview? }` |
| `POST` | `/api/documents/:id/duplicate` | Duplication |
| `DELETE` | `/api/documents/:id` | Suppression |
| `GET` | `/api/health` | État du service |

Un schéma est un objet JSON `{ nodes: [...], edges: [...] }` : les fichiers exportés en JSON peuvent
donc être relus ou produits par un autre outil.

## Import PlantUML

Le texte est analysé dans le navigateur, sans appel réseau. Sont reconnus :

| Type | Syntaxe reprise |
|---|---|
| Classes | `class` / `abstract` / `interface` / `enum`, membres entre accolades, `extends` et `implements`, `package`, relations `<\|--` `..\|>` `*--` `o--` `-->` `..>` avec cardinalités et étiquettes |
| Séquence | `participant` / `actor` / `database`…, messages `->` et `-->`, `activate` / `deactivate`, raccourcis `++` et `--`, messages réflexifs, fragments `alt` / `loop` / `opt` / `par` |
| Cas d'utilisation | `actor`, `usecase`, formes courtes `:Acteur:` et `(Cas)`, `rectangle`/`package` comme frontière, relations avec `<<include>>` et `<<extend>>` |
| Carte mentale | `@startmindmap`, niveaux `*`, `+`, `-`, directives `left side` et `right side` |

Deux limites à connaître : **la mise en page est recalculée par l'application** — PlantUML confie
la sienne à Graphviz, dont nous ne disposons pas ; les positions sont donc lisibles mais
différentes des siennes. Et les **notes** ainsi que les diagrammes d'**activité**, d'**état** et de
**composants** ne sont pas repris : la fenêtre d'import le signale ligne par ligne au lieu
d'échouer en silence.

## Limites connues

- Pas d'édition collaborative en temps réel ni de comptes utilisateurs : l'application est
  mono-utilisateur, comme un outil local ou d'équipe derrière un réseau privé.
- Pas de rotation des formes ni de points de passage manuels sur les connecteurs.
- L'export PNG s'appuie sur le rendu SVG du navigateur (polices système).
- La copie dans le presse-papiers exige une origine sécurisée (`localhost` ou HTTPS) et un
  navigateur qui accepte l'écriture d'images ; sinon le bouton signale l'échec et l'export PNG
  reste disponible.
