# Documentation Drox — hub central

**Dernière structuration** : 2026-05-20  
Toute la doc de **suivi de projet** (plans, backlog, guides, architecture, UI, ops) est regroupée ici. Les anciens chemins à la racine du fork ou dans `drox-engine/` redirigent vers ce hub.

**Entrée rapide dev** : [`../../DROX.md`](../../DROX.md) (onboarding < 15 min, racine du fork).

---

## Arborescence

| Dossier | Contenu |
|---------|---------|
| [`guides/`](guides/) | Guides de référence et journal de refonte historique |
| [`plans/`](plans/) | Plans actifs ou en sommeil (intégration, moteur Rust, IDE, dé-branding) |
| [`suivi/`](suivi/) | Backlog sprints, livrables, priorités post–phase 2 |
| [`architecture/`](architecture/) | Inventaire moteur, protocole JSON-RPC, périmètre web |
| [`ide/`](ide/) | Suivi UI workbench (chat natif, modules webview) |
| [`operations/`](operations/) | Smoke tests, procédures manuelles, patchnotes stabilisation |
| [`nexus/`](nexus/) | Vision produit Nexus (hors périmètre Drox strict) |

---

## Version 1.2.0 (cap produit actuel)

Docs réparties sous [`1.2.0/steps/`](1.2.0/steps/) — **ordre = numéro de dossier** (`01-vision` → `11-operations`).

| Dossier | Entrée recommandée |
|---------|-------------------|
| [`01-vision/`](1.2.0/steps/01-vision/) | [VISION-CONSOLIDEE-1.2.0.md](1.2.0/steps/01-vision/VISION-CONSOLIDEE-1.2.0.md) (vision active) |
| [`02-construction/`](1.2.0/steps/02-construction/) | Couches A/B/C/D, `RunSpec` |
| [`03-upstream/`](1.2.0/steps/03-upstream/) | Découplage fork VS Code |
| [`04-implementation/`](1.2.0/steps/04-implementation/) | **Plan de pilotage** P0–P5 |
| [`05-spec-p0/`](1.2.0/steps/05-spec-p0/) | Specs interfaces, séquences, outils |
| [`06-flag/`](1.2.0/steps/06-flag/) | `legacy` / `v1_2` |
| [`07-roles-tools/`](1.2.0/steps/07-roles-tools/) | Cycle architecte ↔ exécuteur |
| [`08-architect-state/`](1.2.0/steps/08-architect-state/) | Gates + machine à états |
| [`09-ui/`](1.2.0/steps/09-ui/) | Fil linéaire chat |
| [`10-ide/`](1.2.0/steps/10-ide/) | Settings Nexus |
| [`11-operations/`](1.2.0/steps/11-operations/) | Smoke manuel |
| [`1.2.0/cartographie/`](1.2.0/cartographie/) | **Flux Mermaid** — branches de décision moteur |

Archive pré-1.2.0 : dossier [`0.0/`](0.0/).

---

## Version 1.3 (parallélisme & distribution)

| Dossier | Contenu |
|---------|---------|
| [`1.3/`](1.3/README.md) | Hub ligne 1.3 |
| [`1.3/1.3.0/`](1.3/1.3.0/README.md) | Moteur batch exécuteurs + release `v1.3.0` — **livré** |
| [`1.3/1.3.1/`](1.3/1.3.1/README.md) | Première release publique — **en cours** ([CLOSURE](1.3/1.3.1/finalisation/CLOSURE-1.3.1.md)) |
| [`feature-brainstorm/`](feature-brainstorm/README.md) | Idées / brainstorm (hors releases 1.3.x) |

---

## Chantiers en conception (2026-05-20)

| Document | Sujet |
|----------|--------|
| [plans/REFACTO-STRUCTURE-CODE.md](plans/REFACTO-STRUCTURE-CODE.md) | **✅ Terminé (2026-05-20)** — refactoring 4 phases + `RunPolicy` ; smoke manuel IDE optionnel |
| [plans/PLAN-MODELES-TIER.md](plans/PLAN-MODELES-TIER.md) | **Actif** — suivi tiers Low/Medium (**M0–M3 ✅**, smoke manuel) |
| [plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md](plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) | **Actif** — exosquelette Low M4+ (checkpoints, `RunContext`, **Medium gelé**) |
| [architecture/MODELES-PAR-TAILLE.md](architecture/MODELES-PAR-TAILLE.md) | Vision produit profils modèle |
| [architecture/MEMOIRE-LONG-TERME.md](architecture/MEMOIRE-LONG-TERME.md) | SQLite + FTS/embeddings, budget tokens 16k–64k |

---

## Documents par rôle

### Démarrer

| Document | Description |
|----------|-------------|
| [DROX.md](../../DROX.md) | Build, watch, Ollama, premier chat |
| [guides/GUIDE-MOTEUR-DROX.md](guides/GUIDE-MOTEUR-DROX.md) | Phases, tools, permissions, JSON-RPC — **§18 = fork Nexus** |
| [architecture/PROTOCOLE-JSONRPC.md](architecture/PROTOCOLE-JSONRPC.md) | Contrat wire NDJSON (`drox --serve`) |
| [operations/GUIDE-PUBLICATION-WIN32.md](operations/GUIDE-PUBLICATION-WIN32.md) | **Publication release** Windows + clôture branche |
| [operations/SMOKE-RPC.md](operations/SMOKE-RPC.md) | Smoke RPC manuel |
| [operations/PATCHNOTE-STABILISATION-PROFILS.md](operations/PATCHNOTE-STABILISATION-PROFILS.md) | **Actif** — carnet bugs Low → Medium (campagnes de test) |

### Piloter le chantier

| Document | Statut |
|----------|--------|
| [plans/PLAN-INTEGRATION.md](plans/PLAN-INTEGRATION.md) | **Actif** — portage extension → workbench `contrib/drox` |
| [suivi/BACKLOG-SPRINTS-POST-PHASE2.md](suivi/BACKLOG-SPRINTS-POST-PHASE2.md) | **Actif** — backlog fonctionnel détaillé |
| [plans/PLAN-MOTEUR-RUST.md](plans/PLAN-MOTEUR-RUST.md) | Historique / roadmap crates Rust |
| [plans/PLAN-IDE-DROX.md](plans/PLAN-IDE-DROX.md) | **En sommeil** (Tauri / UI immersive) |
| [plans/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md](plans/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md) | Dé-branding / garde-fous cloud |

### UI & packaging

| Document | Description |
|----------|-------------|
| [ide/UI-PHASE1-CHAT-NATIF.md](ide/UI-PHASE1-CHAT-NATIF.md) | Journal UI chat natif (barre auxiliaire) |
| [ide/CHAT-WEBVIEW-MODULES.md](ide/CHAT-WEBVIEW-MODULES.md) | Modules JS/CSS du chat (lien vers le code) |
| [../../resources/drox/README.md](../../resources/drox/README.md) | Binaire embarqué `npm run package-drox` |
| [../extension-vscode/README.md](../extension-vscode/README.md) | Extension de **référence** (F5 séparé) |

### Historique / refonte TS

| Document | Description |
|----------|-------------|
| [guides/GUIDE-REFONTE-DROX.md](guides/GUIDE-REFONTE-DROX.md) | Journal refonte (bridge, Ollama-first, vagues dé-branding) |
| [architecture/INVENTAIRE-NOYAU-MOTEUR.md](architecture/INVENTAIRE-NOYAU-MOTEUR.md) | Cartographie noyau TS → Rust |
| [architecture/REFACTO-WEB-DROX.md](architecture/REFACTO-WEB-DROX.md) | Périmètre `web/` (hors produit principal) |

---

## Code ↔ doc

| Zone code | Doc associée |
|-----------|----------------|
| `drox-engine/drox/` (Rust) | [GUIDE-MOTEUR-DROX](guides/GUIDE-MOTEUR-DROX.md), [PROTOCOLE-JSONRPC](architecture/PROTOCOLE-JSONRPC.md) |
| `drox-engine/extension-vscode/` | [extension README](../extension-vscode/README.md) |
| `src/vs/workbench/contrib/drox/` | [PLAN-INTEGRATION](plans/PLAN-INTEGRATION.md), [REFACTO](plans/REFACTO-STRUCTURE-CODE.md) §7, [UI-PHASE1](ide/UI-PHASE1-CHAT-NATIF.md) |
| `src/.../drox/browser/chat/` | Façade chat TS (post-REFACTO) |
| `src/.../drox/browser/media/droxChat/` | [CHAT-WEBVIEW-MODULES](ide/CHAT-WEBVIEW-MODULES.md) |

---

## Fichiers supprimés (nettoyage 2026-05-20)

Les dossiers `docs/` (racine fork), `how_it_work/` et les redirections `drox-engine/GUIDE-MOTEUR-DROX.md` / `scripts/smoke-rpc.md` ont été retirés. Tout le suivi vit sous `drox-engine/docs/`.

*KDDS Nexus — seule entrée hors hub : [`DROX.md`](../../DROX.md) (onboarding).*
