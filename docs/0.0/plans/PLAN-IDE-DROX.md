# Plan IDE Drox — Architecture et roadmap

> ## ⚠️ DOCUMENT EN SOMMEIL — depuis 2026-05-11
>
> Ce plan (Tauri 2 + React + R3F + sidecar Node sur moteur TypeScript conservé) a été établi le 2026-05-10 puis **repivoté le 2026-05-11**. Il ne pilote plus les développements en cours.
>
> **Direction actuelle** (voir [`PLAN-MOTEUR-RUST.md`](./PLAN-MOTEUR-RUST.md)) :
> 1. **Phase 1** — Réécrire le moteur en Rust comme binaire autonome (JSON-RPC sur stdio), pas de couplage UI.
> 2. **Phase 2** — Brancher une extension VS Code minimaliste sur le moteur Rust pour éprouver le moteur en conditions réelles.
> 3. **Phase 3** — Vision visuelle immersive ("moteur thermique habitable") **en sommeil**, à faire mûrir avant tout choix technique.
>
> **Pourquoi ce document est conservé** : le travail de réflexion sur Tauri, R3F, Bevy, le sidecar Node, la stratégie cross-OS et la vision immersive reste utile **plus tard** pour Phase 3. Ne pas le supprimer.
>
> **Pourquoi le pivot** : le besoin d'éprouver concrètement le moteur Rust en conditions réelles a primé sur la construction d'une UI immersive sans paradigme visuel encore stabilisé. Une extension VS Code donne un éditeur state-of-the-art gratuitement et force la discipline d'une interface stable (le moteur devient un produit autonome utilisable par n'importe quel client UI).
>
> ---

**Document de suivi** pour la construction d'un nouveau client IDE Drox, conçu autour du moteur TypeScript existant (`src/`).

**Date de création** : 2026-05-10  
**Statut** : **EN SOMMEIL** depuis 2026-05-11 (voir bannière ci-dessus).

---

## 1. Vision

Construire un **IDE original orienté IA**, qui rompt volontairement avec le paradigme classique « tree de fichiers + éditeur central + terminal en bas » (modèle VS Code / JetBrains). L'objectif est une **interface graphique poussée et immersive** au service d'une nouvelle façon de coder avec un agent IA.

Le moteur métier (boucle agent, outils, client LLM, MCP, sessions) déjà construit dans `src/` est **conservé et réutilisé tel quel**. C'est l'actif central du projet. La nouveauté concerne **uniquement la couche d'interface** et son **enveloppe de distribution**.

### Non-objectifs explicites

- **Pas un fork de VS Code** ni un clone de Cursor / Zed.
- **Pas de réécriture du moteur en Rust** dans cette phase (option ouverte pour plus tard).
- **Pas d'app web hébergée** comme produit principal (le dossier `web/` reste hors scope, voir `docs/REFACTO-WEB-DROX.md`).
- **Pas d'extension marketplace** type VS Code à court terme.

---

## 2. Décisions architecturales

| Couche | Choix | Justification résumée |
|---|---|---|
| **Coquille de déploiement** | **Tauri 2** | Open source MIT/Apache, gouvernance neutre (Commons Conservancy), binaire 5-15 Mo (vs ~150 Mo Electron), auto-update intégré, multi-plateforme (mac/win/linux) + mobile en v2. |
| **Backend de la coquille** | **Rust** (via Tauri) | Robustesse long-terme, perf système, accès natif. Limité à la coquille, pas de dette d'apprentissage massive. |
| **Bundler / dev server** | **Vite** | Standard de fait pour le frontend Tauri. Build statique adapté (pas de runtime serveur). Next.js a été écarté car ses fonctionnalités phares (SSR, RSC, API Routes) sont inutiles dans une WebView Tauri. |
| **Framework UI** | **React 19** | Plus gros écosystème graphique web. Toutes les libs créatives (R3F, Framer Motion, etc.) sont React-first. Continuité avec ce qui existe dans `web/`. |
| **Composants chrome** | **shadcn/ui + Radix UI + Tailwind CSS** | Composants accessibles à copier-coller, styling utility-first, écosystème mature. |
| **Animations UI** | **Framer Motion** | Référence absolue côté React pour micro-interactions, transitions de panneaux, gestes. |
| **Moteur graphique 3D** | **Three.js + react-three-fiber (R3F) + drei** | Standard de fait pour le 3D web. R3F apporte le modèle déclaratif JSX nécessaire avec React. drei fournit les helpers prêts à l'emploi. |
| **Moteur graphique 2D (option)** | **PixiJS** | Si certaines surfaces immersives sont 2D denses (whiteboard, particules, jeux 2D). Complémentaire de Three.js, pas alternatif. |
| **State global** | **Zustand** | Déjà éprouvé dans `web/`. Léger, simple, sans boilerplate. |
| **Data fetching** | **TanStack Query** | Cache + retries + streaming pour les appels au moteur. |
| **Pattern de rendu** | **Hybride DOM + Canvas** | Chrome (panels, modales, contrôles) en DOM/React/Tailwind. Zone immersive centrale en `<Canvas>` R3F. C'est ce que font Figma, Linear, Excalidraw. |
| **Moteur métier** | **TypeScript existant (`src/`), réutilisé en sidecar** | Zéro réécriture pour démarrer. Pont IPC ou HTTP local entre Tauri et le moteur. Migration Rust possible plus tard, par modules. |
| **Pont moteur ↔ UI** | **Sidecar Node/Bun spawné par Tauri** (acté). Contrat HTTP simple, choix réversible. | Voir §6 décisions ouvertes (gardées comme rappel). |
| **Localisation du nouveau code** | **Sous-dossier `desktop-app/` dans ce repo** (acté) | Monorepo informel pour démarrer. Pas de workspace formel tant que ça ne grossit pas. |

### Schéma d'architecture cible

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  UI (HTML / CSS / JS)                            │  │
│  │  ─────────────────────                           │  │
│  │  Vite + React 19                                 │  │
│  │  + Tailwind + shadcn/ui      (chrome)            │  │
│  │  + Framer Motion             (animations)        │  │
│  │  + Three.js + R3F + drei     (zone immersive)    │  │
│  │  + Zustand + TanStack Query  (état + data)       │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │  WebView (système : WebKit / WebView2 / WKGTK)   │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │  Tauri 2 (Rust)                                  │  │
│  │  ──────────────                                  │  │
│  │  • Fenêtre native, IPC, plugins FS/dialog/shell  │  │
│  │  • Auto-update, code signing                     │  │
│  │  • Sidecar : spawn du moteur TS                  │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │ IPC / HTTP local             │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │  Moteur Drox (TypeScript, repo actuel `src/`)    │  │
│  │  ──────────────────────────────────────────       │  │
│  │  • Boucle agent, tool system                     │  │
│  │  • Client LLM (Ollama / DROX_API_BASE_URL)       │  │
│  │  • MCP, sessions, permissions, settings          │  │
│  │  • (Continue d'évoluer indépendamment)           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Système d'exploitation (mac / win / linux)            │
└────────────────────────────────────────────────────────┘
```

---

## 3. Pourquoi cette stack (résumé condensé des arbitrages)

### Pourquoi Tauri 2 plutôt qu'Electron ?

- **Binaire 10× plus léger** (utilise la WebView du système au lieu d'embarquer Chromium).
- **Mémoire 3-5× moindre** au runtime.
- **Licence MIT/Apache** strictement permissive, gouvernance neutre.
- **Mobile en v2** (Electron est desktop-only).
- Limitation à connaître : différences subtiles entre WebViews OS (WebKit / WebView2 / WebKitGTK).

### Pourquoi React plutôt que Vue / Svelte / Solid ?

- **Écosystème graphique le plus dense** : R3F (Three.js), Framer Motion, react-spring, react-konva, etc. sont tous React-first.
- Réutilisation possible de patterns du dossier `web/`.
- Pas de « taxe écosystème » sur les libs créatives (sur Svelte/Solid, beaucoup d'équivalents existent mais avec moins de doc, exemples, mainteneurs).

### Pourquoi pas de framework Rust côté UI (Dioxus, Leptos, Yew) ?

- Écosystème graphique en Rust/WASM **immature** vs React + Three.js (15 ans d'avance).
- Multiplie le temps de dev par 3-5× au démarrage.
- Conserve l'option « migration plus tard » sans bloquer la livraison v1.

### Pourquoi conserver le moteur en TypeScript ?

- Tout le travail de dé-anthropisation déjà investi dans `src/` est réutilisé.
- Aucune réécriture coûteuse pour démarrer.
- Migration Rust possible **module par module** quand la valeur est prouvée.

### Pourquoi Vite plutôt que Next.js ?

- Tauri sert un **bundle statique**, pas une app serveur.
- Toutes les fonctionnalités phares de Next.js (SSR, RSC, API Routes, edge runtime) sont **inutilisables** dans ce contexte.
- Vite est plus rapide, plus léger, et c'est le standard officiel des templates Tauri.

---

## 4. Périmètre v0.1 (première version testable)

L'objectif de la v0.1 est **modeste et explicite** : valider la chaîne complète **UI ↔ Tauri ↔ moteur TS** sur un cas trivial, pour ensuite itérer sur l'expérience.

### Ce qui doit fonctionner

- Une fenêtre Tauri qui s'ouvre.
- Un frontend React + Vite qui se charge dans la WebView.
- Tailwind + shadcn opérationnels (au moins un bouton, une zone de texte stylés).
- Three.js + R3F : un `<Canvas>` qui affiche **au moins une scène 3D minimale** (une primitive qui tourne).
- Un **pont IPC ou HTTP** vers le moteur `src/` qui permet d'envoyer un prompt et de recevoir une réponse streamée.
- Affichage textuel simple de la réponse côté UI (pas encore d'immersion graphique).

### Ce qui n'est PAS attendu en v0.1

- Le « paradigme nouveau » de l'IDE (encore à définir, voir §6).
- L'éditeur de code (Monaco, CodeMirror) — pas requis pour valider la chaîne.
- Le terminal embarqué.
- Les outils complets du moteur (Read/Edit/Bash/Grep visualisés).
- Le code signing, l'auto-update, la distribution multi-OS.
- Une UI « polished » — c'est un proof-of-chain, pas un produit.

---

## 5. Roadmap par phases

### Phase 0 — Décisions préalables

- [x] **Localisation du code** → sous-dossier **`desktop-app/`** dans ce repo. Pas de workspace formel pour démarrer ; migration vers workspace pnpm si la complexité augmente.
- [x] **Nature du pont moteur ↔ UI** → **sidecar Node/Bun spawné par Tauri**. Contrat API initial réduit à un endpoint type `POST /chat` avec streaming. Choix réversible : le contrat HTTP entre UI et sidecar est suffisamment abstrait pour basculer plus tard sur IPC Rust ou service HTTP séparé sans toucher l'UI.
- [x] **Cible OS prioritaire pour la v0.1** → **Windows uniquement** dans un premier temps. Pas de matrice CI multi-OS active en Phase 1. Activation matrice GitHub Actions (`windows-latest` + `macos-latest` + `ubuntu-latest`) prévue à partir de Phase 2/3. Validation Mac/Linux finale (signing, installers) repoussée à Phase 4.

### Phase 1 — Base de la nouvelle UI (premier objectif explicite)

Cette phase répond à la consigne : **« créer la base côté nouvelle UI afin de tester notre nouvelle UI sur le moteur TS existant »**.

#### 1.1 Bootstrap du projet Tauri

- [ ] Installer la toolchain Rust (rustup) et Tauri CLI sur la machine de dev.
- [ ] Créer le dossier **`desktop-app/`** à la racine du repo et initialiser un projet Tauri avec template Vite + React + TypeScript.
- [ ] Vérifier que `cargo tauri dev` ouvre une fenêtre vide.
- [ ] Vérifier que `cargo tauri build` produit un binaire local.

#### 1.2 Stack frontend

- [ ] Installer Tailwind CSS + configuration de base.
- [ ] Installer shadcn/ui CLI et générer 2-3 composants de référence (Button, Input, Dialog).
- [ ] Installer Framer Motion (vérification d'une animation triviale).
- [ ] Installer **three** + **@react-three/fiber** + **@react-three/drei**.
- [ ] Afficher un `<Canvas>` R3F avec un `<mesh>` qui tourne (preuve que la chaîne 3D fonctionne).
- [ ] Installer **zustand** et créer un store minimal.
- [ ] Installer **@tanstack/react-query** et configurer le `QueryClient`.

#### 1.3 Pont moteur ↔ UI (selon décision Phase 0)

- [ ] Définir le **contrat API minimal** v0 : un endpoint type `POST /chat` qui prend un prompt et streame la réponse.
- [ ] Implémenter le côté moteur : exposer cet endpoint depuis `src/` (via une nouvelle commande type `drox serve`, ou un script `bun src/entrypoints/serve.ts`).
- [ ] Implémenter le côté Tauri : configurer le **sidecar** (ou la connexion HTTP) pour démarrer/parler au moteur.
- [ ] Tester le pont en dehors de l'UI (curl ou équivalent).

#### 1.4 Premier flux end-to-end

- [ ] Côté UI : un input texte + bouton « Envoyer ».
- [ ] Au clic, envoyer le prompt au moteur via le pont.
- [ ] Recevoir la réponse en streaming et l'afficher dans une zone de texte.
- [ ] Logger côté UI les événements (start, chunks, done, errors) pour debug.

#### 1.5 Validation

- [ ] La fenêtre Tauri se lance avec le frontend chargé.
- [ ] Une scène 3D minimale tourne dans un coin (preuve R3F).
- [ ] Envoyer un prompt depuis l'UI déclenche bien le moteur TS et la réponse arrive en stream.
- [ ] Le `tsc --noEmit` côté `desktop/` est vert.
- [ ] Le binaire de release se génère sans erreur sur l'OS cible.

**Critère de fin Phase 1** : on peut **démontrer** une boucle complète UI → moteur → UI dans un binaire Tauri standalone, avec la 3D techniquement disponible.

### Phase 2 — Définition du paradigme visuel (bloquant pour Phase 3+)

Cette phase est **conceptuelle**, pas technique. Sans réponse, toute UI avancée serait prématurée.

- [ ] Documenter **ce qu'on visualise** : codebase, agents, conversations, sessions, dépendances, etc.
- [ ] Documenter **comment c'est organisé spatialement** : canvas infini, scène 3D, graphe, métaphore physique ?
- [ ] Documenter **quel est le geste primaire** : voix, frappe, dessin, drag, raccourcis ?
- [ ] Croquis / mockups (papier ou Figma, peu importe la forme).
- [ ] Décider **quelles libs graphiques** sont vraiment au cœur (R3F seul ? + Pixi ? + React Flow pour les graphes ? + D3 ?).

**Critère de fin Phase 2** : un document `VISION-IDE-DROX.md` (ou équivalent) qui pose une direction claire pour Phase 3.

### Phase 3 — Construction de l'expérience immersive

Cette phase ne peut commencer qu'après Phase 2.

- [ ] Implémenter la première vue immersive selon le paradigme défini.
- [ ] Brancher les outils du moteur (Read/Edit/Bash/Grep/MCP) dans l'UI de manière visuelle.
- [ ] Ajouter le multi-conversation / multi-agent visuel.
- [ ] Animations Framer Motion sur les transitions principales.
- [ ] Polish UX (raccourcis, palette de commandes, settings).

### Phase 4 — Production et distribution

- [ ] Code signing macOS (Apple Developer Program, ~99$/an).
- [ ] Code signing Windows (certificat OV ou EV, ~250-700$/an).
- [ ] Auto-update via Tauri updater plugin (manifest hébergé sur GitHub Releases).
- [ ] Pipeline CI : build pour les 3 OS sur push tag.
- [ ] Site / page de téléchargement.
- [ ] Documentation utilisateur de base.

### Phase 5 et au-delà

- [ ] Migration progressive du moteur en Rust (par modules).
- [ ] Support mobile via Tauri 2 (iOS / Android).
- [ ] Plugins / extensibilité utilisateur.
- [ ] Collaboration multi-utilisateurs (à clarifier si pertinent).

---

## 6. Décisions ouvertes (à acter avant Phase 1)

### A. Localisation du nouveau code

| Option | Avantage | Inconvénient |
|---|---|---|
| **Sous-dossier `desktop/` dans ce repo** | Partage facile de types et d'utilitaires. Un seul historique git. | Le repo grossit. Releases à coordonner. |
| **Repo séparé `drox-ide`** | Découplage complet. Releases indépendantes. | Setup CI ×2. Partage de types plus lourd (publication npm). |
| **Workspace pnpm/npm dans ce repo** | Compromis. Plusieurs `package.json` cohérents. | Légère complexité de setup. |

**Proposition par défaut** : sous-dossier `desktop/` sans workspace formel pour démarrer. Migration vers workspace pnpm si ça grossit.

### B. Nature du pont moteur ↔ UI

| Option | Avantage | Inconvénient |
|---|---|---|
| **Sidecar Node/Bun spawné par Tauri** | Le moteur est packagé dans le binaire Tauri. Une seule app à lancer. | Embarquement de Node dans la distribution (~30-50 Mo). |
| **Service HTTP local lancé séparément** | Plus propre pour le dev. Réutilisable hors Tauri. | L'utilisateur doit lancer 2 processus, ou orchestration manuelle. |
| **IPC Tauri custom (Rust ↔ TS via stdio)** | Pas de port HTTP. Plus sécurisé par défaut. | Plus complexe à implémenter et débugger. |

**Proposition par défaut** : **sidecar Node** (le binaire `bun` peut même être embarqué pour rester léger). C'est ce que font la plupart des apps Tauri qui réutilisent du code Node existant.

### C. OS cible pour la v0.1

| Option | Recommandation |
|---|---|
| Un seul (mac, win **ou** linux) | Plus rapide. Validation isolée. |
| Les trois en parallèle | Découvre les divergences WebView tôt. Triple le coût de validation. |

**Décision actée** : **Windows uniquement pour la v0.1**. Voir §6bis pour la stratégie cross-OS détaillée.

---

## 6bis. Stratégie cross-OS (éviter les développements séparés)

Avec Tauri + React + sidecar Node, **~95% du code est cross-OS gratuitement**. Il ne s'agit pas de « 3 développements séparés » mais d'**un seul développement + une matrice de build CI + quelques points de validation OS-spécifiques étroits**.

### Ce qui est cross-OS sans effort

| Couche | Cross-OS gratuit |
|---|---|
| React, Tailwind, shadcn/ui, Framer Motion | Oui, total |
| Three.js / R3F (WebGL) | Oui, total |
| Sidecar Node (moteur TS `src/`) | Oui, total (Node abstrait l'OS) |
| API Tauri (fenêtre, IPC, FS, dialog, shell, notifications, raccourcis) | Oui — Tauri expose une API JS unifiée sur les 3 OS |
| Auto-update | Oui — 1 manifest, 3 targets dans la config |

### Vrais points de divergence cross-OS (peu nombreux)

| Point | Mitigation |
|---|---|
| **WebView sous-jacent** : WebView2 (Win), WKWebView (Mac), WebKitGTK (Linux). Différences sur API web récentes (WebGPU encore inégal). | Éviter les API web bleeding edge en v0/v1. Valider tôt les surfaces critiques sur la cible. |
| **Code signing** : Microsoft (Win, ~250-700 $/an OV ou EV), Apple Developer Program (Mac, ~99 $/an), pas requis sur Linux. | 3 process distincts mais isolés dans la CI, pas dans le code. |
| **Format d'installer** : `.msi`/`.exe`/`.nsis` (Win), `.dmg`/`.pkg` (Mac), `.deb`/`.AppImage`/`.rpm` (Linux). | Tauri génère les 3 depuis le même projet via flags CLI. |
| **Path / séparateurs** : `\` vs `/`. | Toujours passer par `path` API de Tauri ou `node:path` côté sidecar. Jamais de concat manuelle. |
| **Raccourcis clavier** : Ctrl (Win/Linux) vs Cmd (Mac). | Plugin `tauri-plugin-global-shortcut` + abstraction simple côté UI. |
| **Polices système** : varient. | Embarquer ses propres polices (woff2) si l'identité visuelle compte. |

### Pattern qui supprime les « développements séparés »

1. **~90% du dev se fait dans le navigateur**, pas dans Tauri. `vite dev` + Chrome/Firefox sur Windows. Tauri lancé seulement pour valider l'intégration native.
2. **CI matricielle GitHub Actions** dès Phase 2 :

   ```yaml
   strategy:
     matrix:
       os: [windows-latest, macos-latest, ubuntu-latest]
   ```

   À chaque push, build + test sur les 3 OS. Détection immédiate des régressions cross-OS sans bloquer le dev local.
3. **VM / cloud pour les OS non disponibles physiquement** :
   - Pas de Mac ? MacStadium, MacInCloud, AWS EC2 Mac (location à l'heure pour validation finale).
   - Pas de Linux ? WSL2 sur Windows tourne Ubuntu nativement, suffit pour build et tests Tauri.
4. **Validation OS-spécifique repoussée à la phase utile**. Phase 1-3 = code-only (cross-OS gratuit en théorie). Phase 4 = signing/packaging par OS.

### Ce qui n'existe PAS (clarification honnête)

- **Pas de framework qui « simule parfaitement » les 3 WebView** sur une seule machine. Pour être sûr du rendu macOS, il faut un Mac réel ou virtuel à un moment.
- **Pas d'émulateur d'OS desktop** aussi propre que sur mobile (iOS Simulator / Android Emulator). Sur desktop, c'est VM ou machine réelle.

### Conclusion pratique pour ce projet

- Phase 1 → 100% sur Windows, aucune matrice CI active.
- Phase 2-3 → activation matrice CI 3 OS, validation visuelle ponctuelle Mac/Linux via VM si besoin.
- Phase 4 → location VM Mac (30 min suffisent) pour signing/packaging final.

**Estimation** : sur l'ensemble du projet, le coût « cross-OS » réel = quelques heures de VM louée et une config CI à écrire **une fois**. Pas un développement parallèle.

---

## 7. Risques et points d'attention

| Risque | Mitigation |
|---|---|
| **Scope creep** : faire avancer dé-anthropisation + nouvel IDE en parallèle est ambitieux. | Alterner par sprints courts (1 semaine moteur / 1 semaine IDE) plutôt que tout en simultané. Prioriser dans le moteur ce qui sera réutilisé par l'IDE. |
| **Paradigme visuel non défini** : risque de prototyper 5 directions avant de savoir quoi construire. | Phase 2 (définition vision) **bloque** Phase 3. Ne pas démarrer l'immersif tant que la direction n'est pas posée. |
| **Couplage trop fort moteur ↔ UI** | Définir le contrat API du pont **avant** d'implémenter, et le versionner. Le moteur doit rester utilisable sans l'IDE. |
| **Différences WebView entre OS** | Tester tôt sur l'OS cible. Éviter les API web très récentes (WebGPU encore inégal selon WebView). |
| **Embarquement de Node dans le binaire** (si sidecar) | Accepter le poids (~50 Mo) en v0/v1. Migration progressive du moteur en Rust si la taille devient un problème. |
| **Code signing : coût et délais** | Anticiper l'achat des certificats avant Phase 4. Budget annuel ~350-800$ selon Win/Mac. |

---

## 8. Liens avec les autres documents du dépôt

- **`docs/GUIDE-REFONTE-DROX.md`** — journal chronologique de tout le chantier. Ajouter des entrées datées quand les phases du présent plan avancent.
- **`docs/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md`** — chantier dé-anthropisation du moteur, qui continue **en parallèle** de ce plan IDE.
- **`docs/REFACTO-WEB-DROX.md`** — analyse du dossier `web/` legacy. À titre informatif uniquement : ce document ne concerne **pas** le présent plan IDE (l'app Next.js du dossier `web/` n'est pas reprise).

---

## 9. TL;DR

```
Stack validée :
  • Coquille     : Tauri 2 (Rust)
  • Bundler      : Vite
  • UI           : React 19 + Tailwind + shadcn/ui + Framer Motion
  • 3D immersif  : Three.js + react-three-fiber + drei
  • État         : Zustand + TanStack Query
  • Moteur       : TypeScript existant (`src/`) réutilisé en sidecar

Roadmap :
  Phase 0   → Acter 3 décisions ouvertes (où, pont, OS)
  Phase 1   → Base UI + pont + premier flux end-to-end (LIVRABLE)
  Phase 2   → Définir le paradigme visuel (BLOQUANT)
  Phase 3   → Construire l'expérience immersive
  Phase 4   → Code signing + auto-update + distribution
  Phase 5+  → Migration Rust progressive, mobile, plugins…

Premier objectif concret : Phase 1 — prouver la chaîne UI ↔ moteur,
avec la 3D techniquement disponible mais pas encore exploitée.
```
