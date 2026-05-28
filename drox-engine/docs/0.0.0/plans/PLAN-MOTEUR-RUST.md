# Plan moteur Rust — Drox Engine autonome

**Document de suivi** du chantier moteur Rust + extension VS Code.

**Date de création** : 2026-05-11  
**Statut** : actif, premier sprint = cartographie du noyau.

---

## 1. Décision et contexte

Après plusieurs jours de réflexion (voir `PLAN-IDE-DROX.md` en sommeil, `REFACTO-WEB-DROX.md`, et le journal `GUIDE-REFONTE-DROX.md`), pivot stratégique acté le 2026-05-11 :

| Élément | Décision |
|---|---|
| **Moteur** | Réécriture complète en Rust comme **binaire autonome** (pas de sidecar Node, pas de couplage UI). Le moteur TypeScript actuel (`src/`) sert de spec exécutable pendant le rewrite. |
| **Premier client** | **Extension VS Code** (pas un vrai fork). Permet d'éprouver le moteur en conditions réelles, hérite gratuitement de l'éditeur / LSP / debugger / git / terminal. |
| **Interface moteur ↔ client** | **JSON-RPC sur stdio** (pattern LSP / DAP). Le contrat est public, versionné, stable. |
| **Vision immersive** | **En sommeil**. Pas de Tauri / Bevy / R3F / paradigme « moteur thermique habitable » avant d'avoir validé le moteur Rust. La vision a besoin de mûrir. |
| **De-anthropisation du moteur TS** | Continue en parallèle pendant la cartographie + sprint 1. Le moteur TS est la spec, autant qu'il soit propre. |

### Pourquoi ce séquencement

1. **Le moteur Rust est utile dans tous les scénarios futurs** (extension VS Code aujourd'hui, fork VS Code plus tard, IDE immersif un jour, voire juste CLI). On construit la fondation sans s'engager sur la finalité visuelle.
2. **L'extension VS Code force la discipline architecturale** : le moteur doit exposer une interface stable, indépendante de toute UI. Cette interface devient le pont vers n'importe quel futur client.
3. **VS Code donne gratuitement** ce que le moteur ne fournit pas (éditeur, coloration, LSP, debugger, git, terminal, marketplace, distribution). Économie massive vs construire un IDE complet.
4. **La vision immersive aura un substrat sur lequel se construire** quand elle aura cristallisé : un moteur Rust solide avec une interface bien définie.

---

## 2. Périmètre exact du moteur

### Ce que le moteur Rust FAIT

| Capacité | Détail |
|---|---|
| Boucle agentique | LLM → tool calls → exécution → re-prompt → boucle |
| Client LLM | Streaming SSE, retry, abstraction provider (Ollama d'abord, OpenAI-compatible, Anthropic Messages API shim si activé) |
| Tools | FileRead, FileWrite, FileEdit (mode `propose` + `apply`), Grep, Glob, Bash, WebFetch, AskUserQuestion, EnterPlanMode/ExitPlanMode, Agent (sub-agents), MCP wrappers |
| Bash classifier | tree-sitter-bash + classification safety / readonly / destructive |
| Permissions | Modèle allow/ask/deny, plan mode, sandbox |
| MCP | Wrapper autour de `rmcp` (SDK Rust officiel) |
| Compaction | Token estimation, microcompact, snip, post-compact cleanup |
| Session | Storage JSONL, transcript, resume |
| Settings | Lecture/écriture des settings projet + global |
| Configuration | Input minimal : `--server <URL>` + `--model <NAME>` + options |

### Ce que le moteur NE FAIT PAS

- Pas d'éditeur de texte (Monaco / CodeMirror) — c'est VS Code.
- Pas de LSP / autocomplétion / go-to-def — c'est VS Code + extensions de langage.
- Pas de debugger / breakpoints — c'est VS Code + extensions de langage.
- Pas d'UI de diff / preview de modifications — c'est l'extension VS Code via `vscode.diff()` et `WorkspaceEdit`.
- Pas de résolution de conflits visuelle — c'est VS Code Source Control.
- Pas d'arborescence de fichiers persistante — c'est VS Code Explorer.
- Pas de terminal intégré — c'est VS Code Terminal.
- Pas de gestion git (status, stage, commit, branch, merge) — c'est VS Code Source Control. Le moteur peut appeler `git` via Bash.

### Décision d'architecture forte : `propose` vs `apply`

Les tools qui modifient le filesystem (`FileWriteTool`, `FileEditTool`) doivent exposer **deux modes** :
- **`apply`** : le moteur applique directement (utile en CLI / CI / headless).
- **`propose`** : le moteur retourne un patch structuré (`WorkspaceEdit`-like) et laisse le client décider d'appliquer ou non.

Le mode `propose` est essentiel pour l'extension VS Code (preview de diff avec accept/reject par hunk, à la Cursor / Continue / Cline) et pour le futur IDE immersif (qui consommera le même format de patch).

---

## 3. Structure du workspace cargo

```
drox/
├── Cargo.toml                  ← workspace
├── crates/
│   ├── drox-types/             ← types partagés (messages LLM, tool schemas, patches, sessions)
│   ├── drox-llm/               ← client LLM streaming + providers (Ollama-first)
│   ├── drox-tools/             ← implémentations des tools (sans I/O bloquant côté UI)
│   ├── drox-mcp/               ← wrapper rmcp
│   ├── drox-bash/              ← bash classifier (tree-sitter-bash + safety rules)
│   ├── drox-permissions/       ← modèle de permissions, plan mode, sandbox
│   ├── drox-context/           ← compaction, token estimation, snip
│   ├── drox-session/           ← storage JSONL, transcript, resume
│   ├── drox-engine/            ← boucle agent + orchestration (consomme les autres)
│   └── drox-cli/               ← binaire `drox` (REPL CLI + serveur JSON-RPC sur stdio)
├── extension-vscode/           ← extension VS Code (Phase 2.1 : chat + client JSON-RPC stdio)
├── docs/                       ← ce dossier
└── src/                        ← (TS legacy, gardé comme spec exécutable pendant Phase 1)
```

---

## 4. Roadmap des sprints

### Phase 1 — Moteur Rust autonome (8-12 semaines)

| Sprint | Crate / livrable | Durée | Dépendances |
|---|---|---|---|
| **1.0** Cartographie | `docs/INVENTAIRE-NOYAU-MOTEUR.md` | 3-5j | — |
| **1.1** Setup workspace | Cargo workspace, CI rustfmt/clippy, hello world | 1-2j | 1.0 |
| **1.2** LLM client | `drox-llm` streaming SSE + retry + Ollama provider | 1 sem | 1.1 |
| **1.3** Tools simples | `drox-tools` partie 1 : FileRead, FileWrite, Grep, Glob | 1 sem | 1.1 |
| **1.4** Agent loop | `drox-engine` boucle agentique + premier end-to-end CLI fonctionnel | 1-2 sem | 1.2, 1.3 |
| **1.5** Tools moyens | FileEdit (avec `propose`/`apply`), WebFetch, AskUserQuestion, PlanMode | 1 sem | 1.4 |
| **1.6** MCP | `drox-mcp` wrapper rmcp + connexion serveurs | 1 sem | 1.4 |
| **1.7** Permissions | `drox-permissions` modèle complet, plan mode | 1 sem | 1.4 |
| **1.8** Bash | `drox-bash` classifier complet (tree-sitter-bash + safety) | 2 sem | 1.4 |
| **1.9** Context | `drox-context` compaction + token estimation | 1 sem | 1.4 |
| **1.10** Session | `drox-session` storage + transcript + resume | 1 sem | 1.4 |
| **1.11** JSON-RPC | Exposer le moteur en JSON-RPC sur stdio (interface stable) | 3-5j | tous |

**Critère de fin Phase 1** : `drox-cli` est fonctionnellement équivalent au CLI TS actuel sur les use cases principaux (prompt → boucle → tools → réponse) **et** expose une interface JSON-RPC propre sur stdio.

### Phase 2 — Extension VS Code (3-6 semaines)

| Sprint | Livrable | Détail |
|---|---|---|
| **2.1** Bootstrap extension | Skeleton TypeScript, spawn du binaire `drox`, JSON-RPC client | Webview de chat + spawn process |
| **2.2** Tool routing | Quand le moteur émet un tool call, l'extension l'exécute via les API VS Code (`vscode.workspace.fs`, `vscode.diff`, etc.) | FileRead → `fs.readFile`, FileEdit → `WorkspaceEdit` + preview, Bash → terminal intégré, Grep → `findFiles` |
| **2.3** UI de chat | Panneau webview avec input, streaming, historique, commands palette | À soigner UX |
| **2.4** Preview de modifications | Mode `propose` du moteur → diff VS Code natif → accept/reject par hunk | Pattern Cursor / Continue / Cline |
| **2.5** Permissions UI | Quand le moteur demande une permission, dialogue VS Code natif | Confirme/refuse/always |
| **2.6** Polish & publication | Packaging `.vsix`, test sur projets variés, eventual publication Marketplace | Optionnel |

**Critère de fin Phase 2** : on peut ouvrir un projet dans VS Code, lancer Drox, lui demander de modifier du code, voir la diff, accepter, et le moteur se comporte comme attendu.

### Phase 3 — Vision visuelle immersive (en sommeil)

Reprise dès que :
- La Phase 1 est terminée (moteur Rust stable).
- La Phase 2 a permis de valider le moteur en conditions réelles.
- La vision « moteur thermique habitable » a mûri (production d'un `docs/VISION-IDE-DROX.md` formalisé).

À ce moment, on tranchera Bevy vs R3F en connaissance de cause et on construira un client UI immersif consommant la même interface JSON-RPC du moteur.

---

## 5. Décisions techniques actées

| Sujet | Décision | Référence |
|---|---|---|
| Langage du moteur | Rust | Conversation 2026-05-11 (Option B) |
| Interface moteur ↔ clients | JSON-RPC sur stdio (custom maison au début, ACP à évaluer plus tard) | Conversation 2026-05-11 |
| Format des modifications fichier | Mode `propose` (patch structuré retourné) + mode `apply` | Conversation 2026-05-11 |
| Premier provider LLM | Ollama (HTTP local) | Continuité avec la de-anthropisation |
| MCP | Wrapper autour de `rmcp` (SDK Rust officiel) | — |
| Bash classifier | tree-sitter-bash + classifier custom | — |
| Sort du dossier `src/` TS | Décidé à la fin de Phase 1 (archive vs supprime vs garde) | Conversation 2026-05-11 |
| Cible OS pour le moteur | Windows d'abord (machine de dev), portable trivialement après | — |

## 6. Décisions techniques différées

- **JSON-RPC custom vs ACP (Agent Client Protocol)** : tranché en Sprint 1.11.
- **Extension VS Code vs vrai fork** : tranché en début de Phase 2 (par défaut : extension).
- **Sort du `src/` legacy** : tranché en fin de Phase 1.
- **Stratégie de tests** : tranchée en Sprint 1.4 (premier end-to-end).

---

## 7. Liens vers les autres documents

- `PLAN-IDE-DROX.md` — plan précédent **en sommeil** (Tauri + R3F + sidecar Node). Contient toute la réflexion sur la vision immersive, à reprendre en Phase 3.
- `REFACTO-WEB-DROX.md` — analyse du dossier `web/` legacy. Reste informatif, **hors scope** de ce plan.
- `PLAN-SUPPRESSION-REFERENCES-EXTERNES.md` — chantier de-anthropisation du moteur TS. Continue en parallèle de la cartographie / sprint 1.1.
- `GUIDE-REFONTE-DROX.md` — journal chronologique. Ajouter une entrée datée à chaque sprint terminé.
- `INVENTAIRE-NOYAU-MOTEUR.md` *(à créer Sprint 1.0)* — cartographie des ~120-200 fichiers TS à porter, regroupés par crate Rust cible.

---

## 8. TL;DR

```
Objectif Phase 1  : un binaire drox Rust autonome, équivalent fonctionnel du CLI TS actuel,
                    exposant une interface JSON-RPC stable sur stdio.

Objectif Phase 2  : une extension VS Code qui parle au binaire drox et orchestre les API VS Code
                    pour offrir une expérience d'agent IA dans l'éditeur.

Objectif Phase 3  : (en sommeil) un client UI immersif consommant la même interface JSON-RPC,
                    incarnant la vision "moteur thermique habitable" quand elle aura mûri.

Première action  : produire docs/INVENTAIRE-NOYAU-MOTEUR.md (cartographie du noyau TS à porter).
```
