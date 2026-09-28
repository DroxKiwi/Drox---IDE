<a id="intention"></a>

# Drox IDE

Éditeur local + moteur agent Rust. Tu codes dans ton repo ; **Ollama** (ou un endpoint compatible) fait tourner le modèle ; **`drox.exe`** enchaîne tours LLM et outils.

## Intention

Le peu que je peux transmettre en tant que développeur — outils, sources, notes de conception — reste **public et gratuit**. Pas de mur payant sur le cœur local. Les forks et les contributions sont les bienvenus.

The little I can share as a developer — tools, sources, design notes — stays **public and free**. No paywall on the local core. Forks and contributions welcome.

| | |
|---|---|
| **Licence** | **MIT** — Code OSS (Microsoft) + portions Drox (KDDS). Détail : [`NOTICE.md`](NOTICE.md) |
| **Version produit** | **1.5.20** (`droxVersion`) · base VS Code **1.127.0** |
| **Binaires** | [Releases](https://github.com/DroxKiwi/Drox---IDE/releases) |
| **Issues** | [Drox---IDE/issues](https://github.com/DroxKiwi/Drox---IDE/issues) |
| **État** | Dogfood / expérimental — bugs et cassures possibles sans préavis |

## Build rapide (sources)

```powershell
npm install
npm run watch
.\scripts\code.bat
```

Moteur Rust : workspace sous `drox-engine/drox/` (voir `drox-engine/drox/README.md`). Variables utiles : `drox-engine/DROX-ENV-SETUP.txt`.

## Documentation

Hub : [`docs/`](docs/README.md) · **référence moteur** : [`docs/engine/`](docs/engine/README.md)

| Partie | En bref | Doc |
|--------|---------|-----|
| **Architecture** | Workspace crates (`drox-types` → `drox-tools` → `drox-engine` → `drox-cli`), clients IDE / TUI / CLI, pipeline **`tui_mono`**. | [architecture-overview.md](docs/engine/architecture-overview.md) |
| **JSON-RPC** | `drox --serve`, NDJSON stdio : `initialize`, `agent.run`, `agent/event`, `tool/exec`, sessions. | [jsonrpc-protocol.md](docs/engine/jsonrpc-protocol.md) |
| **Boucle agent** | `drive_inner` : contexte → stream LLM → tools / nudges → phases `[phase: done]` → `agent/done`. | [agent-run-loop.md](docs/engine/agent-run-loop.md) |
| **Outils & permissions** | Palette locale + **RemoteTool** IDE ; modes `default` / `plan` / `acceptEdits` / … ; hooks `.drox/hooks.json`. | [tools-and-permissions.md](docs/engine/tools-and-permissions.md) |
| **Sessions & mémoire** | Transcripts JSONL, `session.*`, compaction, notes / memdir locaux. | [sessions-and-memory.md](docs/engine/sessions-and-memory.md) |
| **Backends LLM** | Ollama-first + OpenAI-compat ; sampling, thinking / budget, pas de cloud imposé. | [llm-backends.md](docs/engine/llm-backends.md) |
| **Intégration IDE** | Spawn Electron main, bridge chat Agents, shim événements UI. | [ide-integration.md](docs/engine/ide-integration.md) |
| **Glossaire** | `tui_mono`, `AgentEvent`, RemoteTool, phases — sans jargon mort (`role_split`). | [glossary.md](docs/engine/glossary.md) |

Ops release / build : [`docs/operations/`](docs/operations/README.md). Historique plans : [`docs/1.5/`](docs/1.5/README.md).

## Suite de ce README

Ci-dessous : **chronologie moteur** (schémas, invariants) — conventions [RULES.md §5](RULES.md#5-readmemd-racine--front-matter-projet--doc-moteur). Le rail **1.4.2** y figure comme archive ; le produit courant est documenté dans [`docs/engine/`](docs/engine/README.md) (`tui_mono`).

___

<a id="statut-produit"></a>

## Archive — note 1.4.2 (historique)

La section chronologie plus bas documente encore le rail observateur **1.4.2**. Ce n’est **pas** le moteur shippé aujourd’hui. Produit courant : **1.5.20** / pipeline **`tui_mono`** — voir [`docs/engine/`](docs/engine/README.md).

___

## Sommaire

[Intention](#intention) · [Documentation](#documentation) · [Archive 1.4.2](#statut-produit) · [Product status EN](#en-product-status)

[Vue globale](#vue-globale) · [Overview](#overview) · [Schéma 1.4 — run rail](#schema-rail)

**FR**

[Moteur Drox](#fr) · [Invariants](#fr-invariants) · [Chronologie](#fr-chronologie)

[2025-12](#fr-2025-12) · [2026-02](#fr-2026-02) · [2026-02-fin](#fr-2026-02-fin) · [2026-03](#fr-2026-03) · [2026-04](#fr-2026-04) · [2026-05 v1_2](#fr-2026-05-v12) · [2026-05 v1_3](#fr-2026-05-v13) · [2026-06 v1_4](#fr-2026-06-v14) · [2026-06 v1_4_2](#fr-2026-06-v142) · [2026-06 v1_5](#fr-2026-06-v15)

**EN**

[Drox Engine](#en) · [Invariants](#en-invariants) · [Timeline](#en-timeline)

[2025-12](#en-2025-12) · [2026-02](#en-2026-02) · [2026-02-end](#en-2026-02-end) · [2026-03](#en-2026-03) · [2026-04](#en-2026-04) · [2026-05 v1_2](#en-2026-05-v12) · [2026-05 v1_3](#en-2026-05-v13) · [2026-06 v1_4](#en-2026-06-v14) · [2026-06 v1_4_2](#en-2026-06-v142) · [2026-06 v1_5](#en-2026-06-v15)

___

<a id="vue-globale"></a>

## Vue globale

Tu codes dans un repo. **Drox IDE** est l’éditeur. **Ollama** fait tourner le modèle en local (Qwen, Gemma, etc. — celui que tu choisis dans les réglages). Entre les deux : **`drox.exe`**, le moteur Rust : il enchaîne les tours LLM, décide quels outils appeler, et demande à l’IDE ce qu’il ne peut pas faire seul (LSP, diff, questions).

**La pile (grossier)**

```mermaid
flowchart LR
  DEV(["Toi + ton repo"])
  IDE(["Drox IDE"])
  MOT(["drox.exe"])
  OLL(["Ollama"])
  MDL(["Ton modele"])

  DEV <-->|fichiers terminal| IDE
  IDE <-->|stdio NDJSON| MOT
  MOT <-->|HTTP localhost| OLL
  OLL --- MDL
```

**Un message dans le chat (grossier)**

```mermaid
flowchart TB
  U(["Tu envoies un message"])
  I(["Drox IDE"])
  M(["Moteur Drox"])
  L(["LLM via Ollama"])
  O(["Outils : lire ecrire bash grep..."])

  U --> I
  I -->|agent.run| M
  M -->|prompt + historique| L
  L -->|texte + appels outil| M
  M -->|file_read bash...| O
  O -->|resultats| I
  I -->|tool/exec| M
  M -->|reponse finale| I
  I --> U
```

**Qui fait quoi**

| Brique | Rôle |
|--------|------|
| **Ollama** | Inférence : un modèle, ta machine, pas de compte cloud imposé |
| **drox.exe** | Boucle agent, run rail observateur, permissions, session, palette outils stable |
| **Drox IDE** | UI chat, éditeur, exécution LSP/diff/bash côté workspace |
| **Toi** | Repo, modèle choisi, mode permission (default / plan / acceptEdits…) |

Le détail du conducteur (stations, marqueurs, prompts) est dans [Schéma 1.4 — run rail](#schema-rail) plus bas.

___

<a id="overview"></a>

## Overview

You work in a repo. **Drox IDE** is the editor. **Ollama** runs the model locally (Qwen, Gemma, etc. — whichever you pick in settings). In between: **`drox.exe`**, the Rust engine: it runs LLM turns, decides which tools to call, and asks the IDE for what it cannot do itself (LSP, diff, prompts).

**The stack (coarse)**

```mermaid
flowchart LR
  DEV(["You + your repo"])
  IDE(["Drox IDE"])
  MOT(["drox.exe"])
  OLL(["Ollama"])
  MDL(["Your model"])

  DEV <-->|files terminal| IDE
  IDE <-->|stdio NDJSON| MOT
  MOT <-->|HTTP localhost| OLL
  OLL --- MDL
```

**One chat message (coarse)**

```mermaid
flowchart TB
  U(["You send a message"])
  I(["Drox IDE"])
  M(["Drox engine"])
  L(["LLM via Ollama"])
  O(["Tools: read write bash grep..."])

  U --> I
  I -->|agent.run| M
  M -->|prompt + history| L
  L -->|text + tool calls| M
  M -->|file_read bash...| O
  O -->|results| I
  I -->|tool/exec| M
  M -->|final reply| I
  I --> U
```

**Who does what**

| Piece | Role |
|-------|------|
| **Ollama** | Inference: one model, your machine, no mandated cloud account |
| **drox.exe** | Agent loop, observer run rail, permissions, session, stable tool palette |
| **Drox IDE** | Chat UI, editor, LSP/diff/bash execution in the workspace |
| **You** | Repo, chosen model, permission mode (default / plan / acceptEdits…) |

Conductor detail (stations, markers, prompts) is in [Schema 1.4 — run rail](#schema-rail) below.

___

<a id="schema-rail"></a>

## Schéma — 1.4.2 (rail observateur)

Run `agent.run` · **deux chemins IDE** : **edit** (Architect + run rail) et **discuss** (ArchitectDiscussion, court) · lot **1.4.2** : rail **observateur**, outils **stables** tout le run, contexte **4 couches**, plus d’ACL par station ni `tool_folders` · routage `discuss` / `analyze` / `edit` **statique** (plus d’intent probe LLM).

**Vue d’ensemble**

```mermaid
flowchart LR
  IDE(["Client IDE"])
  MOT(("Moteur Rust 1.4.2"))
  ARC[["Architecte solo"]]
  RAIL[["Run rail observateur"]]
  DISC[["Discuss court"]]
  CTX[["4 couches contexte"]]

  IDE <-->|NDJSON stdio| MOT
  MOT --- ARC
  ARC -->|edit| RAIL
  ARC -->|discuss| DISC
  RAIL --- CTX
```

**Stations edit (inférées, pas bloquantes)**

```mermaid
flowchart LR
  I[INTENT] --> R[READ]
  R -->|depth complex| P[PROPOSE]
  R --> PL[PLAN]
  P --> PL
  PL --> A[ACT]
  R -->|chemin court| A
  A --> V[VERIFY]
  V --> AN[ANSWER]
```

**Tour LLM sur le rail**

```mermaid
sequenceDiagram
  autonumber
  participant IDE as Client
  participant DRV as loop/drive
  participant RAIL as rail/infer
  participant LLM as LLM

  IDE->>DRV: agent.run
  DRV->>RAIL: inférence station + snapshot hint
  Note over RAIL: palette outils stable — pas de filtre ACL
  DRV->>LLM: boot 01_core_rail_solo + 4 couches contexte
  Note over LLM: phase answering done — sans forcing mutation
  LLM-->>DRV: tool_calls et/ou marqueurs
  opt outil client
    DRV->>IDE: tool/exec lsp diff
    IDE-->>DRV: resultat
  end
  LLM-->>DRV: phase answering puis done
  DRV-->>IDE: agent/done
```

| Identifiant | Fonction |
|-------------|----------|
| `run_rail_enabled` | Active le rail sur le chemin edit |
| `rail/infer.rs` | Inférence station depuis outils + marqueurs — **observation** |
| `rail_snapshot_block` | Hint informatif dans le snapshot — pas prescriptif |
| `01_core_rail_solo.md` | Boot edit observateur ; marqueurs `[phase:]` `[depth:]` |
| `routing.rs` | Routage statique discuss / analyze / edit |
| `internal_plan_write` | Plan interne moteur — remplace `todo_write` |
| `tool_supplements_architect_compact` | Protocole outil unique tout le run |
| `ArchitectDiscussion` | Réponse légère sans rail complet |

___

<a id="fr"></a>

# Moteur Drox

Binaire Rust (`drox-engine/drox/`) qui fait tourner une boucle LLM + outils en local. Le client (IDE) lance `drox --serve`, lit du NDJSON sur stdio, et exécute ce qui ne peut pas tourner dans le moteur (LSP, diff, questions UI). Inférence via Ollama ou API compatible. Produit KDDS — pas de cloud propriétaire imposé.

___

<a id="fr-invariants"></a>

## Invariants

`moteur_seul` — orchestration, gates souples et injection contexte vivent dans Rust ; le client stream et exécute LSP/diff, il ne conduit pas le run.
`rail_observateur` — chemin edit : le **run rail** infère et affiche la station ; **pas** d’ACL outils par station, **pas** de `tool_folders`, **pas** de nudges coercitifs (`stall_read`, `stall_act`, `force_act`).
`architecte_solo` — un seul agent edit ; pas de `delegate_executor`, pas de `RoleId::Executor` ; mutations **inline**.
`deux_chemins` — **edit** (rail complet) vs **discuss** (`ArchitectDiscussion`, court) ; routage **statique** (`routing.rs`), plus d’intent probe LLM au boot.
`outils_stables` — palette `tool_specs` **plate** tout le run EDIT ; protocole compact unique `tool_supplements_architect_compact`.
`contexte_4_couches` — cadre boot + hint rail · outils wire · snapshot run + `internal_plan_write` · transcript + compaction checkpoint.
`plan_interne` — `internal_plan_write` remplace `todo_write` ; pas de gate todo sur `done`.
`memoire_drox_seule` — `DROX.md` seul pour la mémoire projet ; boot sans listing skills/sessions.
`done_souple` — fin sur `[phase: done]` ; verify et mutation **non** forcés par défaut (preset strict optionnel).
`obsolete_142` — **1.4.2 clôturée** sur `main` mais le moteur **va changer entièrement** — ne pas bâtir dessus.

___

<a id="fr-chronologie"></a>

## Chronologie

<a id="fr-2025-12"></a>

### 2025-12 — amorçage

`drox_cli` — binaire `drox`.
`serve_stdio` — mode `drox --serve`, JSON-RPC NDJSON.
`rpc_base` — `initialize`, `agent.run`, `agent.cancel`, `session.list`, `session.read`, `session.compact`, `shutdown`.
`rpc_client` — `tool/exec`, `user/ask` (serveur → client).
`agent_loop` — tours LLM, `tool_calls`, events `agent/event`, transcript JSONL.
`drox_llm` — client Ollama, stream, retry, tool calls, reprise sur `MaxTokens`.
`tools_fichiers` — `file_read`, `file_write`, `file_edit`, `grep`, `glob`, `bash`, `web_fetch`.
`plan_mode` — `plan_mode`, `exit_plan_mode`, `ask_user_question`.
`drox_permissions` — allow / ask / deny, modes permission.
`drox_session` — sessions, transcript, `MEMORY.md`, `DROX.md`.
`drox_context` — comptage tokens, snip `tool_result`.
`session_compact_rpc` — compaction manuelle `session.compact` / `summarize_run`.
`mcp_stubs` — `drox-mcp`, outils `mcp__*`.

___

<a id="fr-2026-02"></a>

### 2026-02

`multimodal` — images utilisateur → `Content::Image`, champ Ollama `images`.
`web_search` — recherche DuckDuckGo HTML, read-only.
`lsp_remote` — tool `lsp` ; exécution IDE.
`ollama_defaults` — `num_ctx`, `num_predict`, sampling, `keep_alive` top-level.

___

<a id="fr-2026-02-fin"></a>

### 2026-02-fin

`todo_write` — liste `{ id, content, status }`.
`phase_protocol` — `[phase: …]`, `PhaseEnter`, inférence, alias.
`nudge_tour_vide` — relance si tour sans outil ni `done`.
`gate_todo_ouverte` — `done` bloqué si pending/in_progress.
`glob_dirs` — `glob` renvoie fichiers et répertoires.
`loop_detector` — deux tours identiques → `LoopDetected`.
`todo_recreation_block` — second plan interdit après plan 100 % completed.
`memory_sessions` — `.drox/memory/sessions/*.md`, `memory_read`, `memory_list`, `session_note`, `MemoryPersisted`.
`compaction_live_v1` — microcompact, tail bornée, `compact_until_budget`, events snip/compact.
`paste_inject` — bloc `[Smart paste]` dans le prompt (côté client).
`user_ask` — `ask_user_question` multi + RPC `user/ask`.
`msg_queue` — file messages pendant run (client).
`ctx_policy_num_ctx` — autocompact calé sur fenêtre Ollama réelle.

___

<a id="fr-2026-03"></a>

### 2026-03

`long_memory_v1` — index compaction, `session_search`, `/session_end` → `session_closure` (pas de tool `session_end` LLM).
`compaction_live_v2` — boucle jusqu’au budget.
`hooks_json` — `.drox/hooks.json`, Pre/Post tool shell.
`parallel_read_tools` — reads concurrency-safe, `max_parallel_tool_calls`.
`bash_classifier` — segments bash auto-allow / auto-deny.
`file_rules` — permissions chemins, `settings.local.json`.
`copy_path`, `delete_path` — outils dédiés.
`notebook_edit` — cellules ipynb replace/insert/delete.

___

<a id="fr-2026-04"></a>

### 2026-04

`skills` — `.drox/skills/`, `skill_read`, `skill_list`.
`git_worktree` — `git_worktree_enter`, `git_worktree_exit`.
`mcp_hub` — registre MCP, resources, `mcp_call` fallback.
`professor_mode` — `course_plan_write`, gates, `.drox/course-cycles/`.
`tools_toggle` — `drox.tools.disabled`, MCP on/off.
`phase_analyzing` — phase + nudge exploration.
`phase_testing` — gate `done` après mutation code.
`workspace_map` — `.drox/workspace-map.json`, read/note, miroir outils.
`droxignore` — chemins exclus agent.
`run_objective` — objectif verrouillé, `scope_defer`.
`subagent_task` — tool `task` Explore, off par défaut.
`image_paths_prompt` — chemins images dans le prompt.
`agent_split` — modules `agent/` (gates, phases, nudges, stream).
`run_policy` — couche `RunPolicy` (transitoire, avant abandon tiers).
`tiers_low_medium_abandon` — expérience avril, retirée au profit `v1_2`.

___

<a id="fr-2026-05-v12"></a>

### 2026-05 — `v1_2`

`orchestration_v1_2` — `DROX_ORCHESTRATION=v1_2` remplace `legacy` mono-agent.
`run_spec` — rôle, limites, registre outils par `RunSpec`.
`role_architect` — `workspace_map_read`, `todo_write`, `delegate_executor`, verify, synthèse.
`role_executor` — mutations dans `scope` ; statut `completed` / `partial` / `failed`.
`delegate_executor` — sous-run sync ; sorties `.drox/agent-output/<plan>/<task>/`.
`architect_gates` — pas de compensation échec ; scope validé.
`architect_help` — tool rappel protocole.
`role_enter` — event `RoleEnter` ; `agent/done` fin cycle.

___

<a id="fr-2026-05-v13"></a>

### 2026-05 — `v1_3`

`failure_absorption` — truth check post-délégation, `FailurePacket`.
`parallel_batch` — `parallel_with[]`, réponse `{ results: [...] }`.
`scope_disjoint_gate` — refus batch si chemins qui se chevauchent.
`retry_per_task` — re-délégation ciblée après échec partiel.
`architect_todo_guidance` — anti-boucle clôture plan.

___

<a id="fr-2026-06-v14"></a>

### 2026-06 — `v1_4` (run rail)

`run_rail_solo` — refonte 1.4.0 : un conducteur edit, reliquats 1.3 retirés du chemin IDE.
`stations_rail` — INTENT → READ → [PROPOSE] → PLAN → ACT → VERIFY → ANSWER ; chemin court sans PLAN/PROPOSE.
`01_core_rail_solo` — seul prompt boot edit ; suppression `01_core.md`, `parallel_slots`, `delegate_executor` prompts.
`rail_policy` — filtre outils par station dans `rail/policy.rs` avant LLM.
`segment_act_del` — plus de shards Executor ; `file_edit` / `file_write` / `bash` en station ACT.
`delegate_executor_del` — Executor, `FailurePacket`, batch parallèle hors contrat runtime.
`professor_standard_del` — modes Professor et Standard CLI coupés du `drive`.
`discuss_path` — `ArchitectDiscussion` : réponse légère, pas rail complet.
`nudges_rail` — `stall_act`, `schema_error`, `done_only` ; fin nudges 1.3 (`cycle_sanity`, `step_by_step`, etc.).
`final_answer_guard` — une promotion `[phase: answering]` ; anti double réponse finale.
`agent_split_v2` — `loop/drive/`, `state/`, `gates/`, `rail/`, `nudges/` ; plafond ~500 L/fichier.
`ui_2d` — retrait UI multi-modèle / executor côté IDE (settings, webview) ; polish conducteur → 1.4.2.

___

<a id="fr-2026-06-v142"></a>

### 2026-06 — `v1_4_2` (rail observateur — **clôture, moteur obsolète**)

`v1_4_1_stable` — session, UI busy, discuss, VERIFY Windows ; base avant refonte contexte.
`rail_observateur` — fin ACL station, `pre_gate`, `read_stall`, `act_stall`, `force_act`, gates mutation sur `done`.
`tool_folders_del` — module `orchestration/tool_folders/` supprimé ; palette plate (`file_read`, `file_edit`, …).
`intent_probe_del` — plus de probe LLM au boot ; `routing.rs` statique discuss / analyze / edit.
`todo_write_del` — `internal_plan_write` seul ; gates todo retirées.
`memoire_unifiee` — `DROX.md` seul ; boot teaser ; checkpoint compaction → snapshot `## Run context (engine)`.
`contexte_4_couches` — boot + hint rail · outils stables · snapshot run · transcript + compaction.
`prompt_observateur` — `01_core_rail_solo.md` réécrit sans `[gate:]` prescriptif.
`obsolete_annonce` — branche **1.4.2** mergée sur `main` ; **refonte moteur complète** annoncée — phase expérimentale agressive, test optionnel pour curieux.

___

<a id="fr-2026-06-v15"></a>

### 2026-06 — `v1_5` (moteur TUI + produit IDE)

`v1_5_0` — remplacement rail 1.4 par boucle **`tui_mono`** + shim RPC `drox-cli` ; `role_split` / intent probe / ACL station **retirés**.
`v1_5_1` — fil chat aligné TUI ; wizard connexion IA.
`v1_5_2` — `LlmConfig` / sampling depuis vignettes IDE.
`v1_5_3` — diffs fil, cartes shell, style VT323, rejeu session (webview).
`v1_5_4` — release Linux `.deb` + Open VSX ; pipeline build isolé WSL.
`v1_5_5` — fil linéaire multi-tours ; layout superposition corrigé (webview).
`v1_5_6` — correctifs post-1.5.5 : bulle user optimiste, scroll diffs, warmup run, bouton envoyer TUI — **livré** win + linux.
`v1_5_7` — correctifs post-1.5.6 : smart paste, rejeu session, recovery LLM — **livré** win + linux.
`v1_5_8` — polish fil Reasoning/Work (native thinking, outils inline, Planifier, warmup fil) — **livré** win + linux.
`v1_5_9` — scroll stick-to-bottom, reset `MEMORY.md` + `.drox/`, composer épuré — **livré** win + linux.
`v1_5_10` — **branche dev courante** — périmètre à définir (MCP → `1.5.11/`, Agents → `1.5.12/`).

___

<a id="en-product-status"></a>

# ⚠️ PRODUCT STATUS — READ FIRST

> **Drox engine 1.4.2 is obsolete — it will change completely.**  
> Branch **1.4.2** closed and merged to `main` (June 2026). This is **not** a stable foundation: a **checkpoint** before a major engine rewrite.

| | |
|---|---|
| **Current product code** | **1.5.10** (dev) · release **1.5.9** — **`tui_mono`** engine + IDE shim |
| **Code on `main` (archive)** | **1.4.2** — **observer** rail (historical section below) |
| **Production-ready?** | **No.** **Aggressive experimental** phase — dogfood only. |
| **Still want to try?** | **Optional for the curious**: build `drox.exe`, hook up Ollama, expect bugs / regressions / breaking changes without notice. |
| **Next engine work** | **Deep rewrite** (not a 1.4.3 polish) — current architecture will **not** be extended as-is. |

**1.4.2** cleans the 1.4.x experience (less forcing, free tools, unified memory) but **does not** freeze final design. What ships on `main` today is mainly a **lab** and a record of what we are moving away from.

___

<a id="en"></a>

# Drox Engine

Rust binary (`drox-engine/drox/`) that runs a local LLM + tools loop. The client (IDE) starts `drox --serve`, reads NDJSON on stdio, and runs what cannot live in the engine (LSP, diff, UI prompts). Inference via Ollama or compatible API. KDDS product — no mandated proprietary cloud.

___

<a id="en-invariants"></a>

## Invariants

`moteur_seul` — orchestration, soft gates, and context injection live in Rust; the client streams and runs LSP/diff, it does not drive the run.
`rail_observateur` — edit path: **run rail** infers and surfaces station; **no** per-station tool ACL, **no** `tool_folders`, **no** coercive nudges (`stall_read`, `stall_act`, `force_act`).
`architecte_solo` — single edit agent; no `delegate_executor`, no `RoleId::Executor`; mutations **inline**.
`deux_chemins` — **edit** (full rail) vs **discuss** (`ArchitectDiscussion`, short); **static** routing (`routing.rs`), no LLM intent probe at boot.
`outils_stables` — flat `tool_specs` palette for the whole EDIT run; single compact protocol `tool_supplements_architect_compact`.
`contexte_4_couches` — boot frame + rail hint · wire tools · run snapshot + `internal_plan_write` · transcript + compaction checkpoint.
`plan_interne` — `internal_plan_write` replaces `todo_write`; no todo gate on `done`.
`memoire_drox_seule` — `DROX.md` only for project memory; boot without skills/sessions listing.
`done_souple` — ends on `[phase: done]`; verify and mutation **not** forced by default (strict preset optional).
`obsolete_142` — **1.4.2 closed** on `main` but engine **will change entirely** — do not build on this stack.

___

<a id="en-timeline"></a>

## Timeline

<a id="en-2025-12"></a>

### 2025-12 — bootstrap

`drox_cli` — `drox` binary.
`serve_stdio` — `drox --serve` mode, JSON-RPC NDJSON.
`rpc_base` — `initialize`, `agent.run`, `agent.cancel`, `session.list`, `session.read`, `session.compact`, `shutdown`.
`rpc_client` — `tool/exec`, `user/ask` (server → client).
`agent_loop` — LLM turns, `tool_calls`, `agent/event` stream, JSONL transcript.
`drox_llm` — Ollama client, stream, retry, tool calls, resume on `MaxTokens`.
`tools_fichiers` — `file_read`, `file_write`, `file_edit`, `grep`, `glob`, `bash`, `web_fetch`.
`plan_mode` — `plan_mode`, `exit_plan_mode`, `ask_user_question`.
`drox_permissions` — allow / ask / deny, permission modes.
`drox_session` — sessions, transcript, `MEMORY.md`, `DROX.md`.
`drox_context` — token counting, `tool_result` snip.
`session_compact_rpc` — manual compaction `session.compact` / `summarize_run`.
`mcp_stubs` — `drox-mcp`, `mcp__*` tools.

___

<a id="en-2026-02"></a>

### 2026-02

`multimodal` — user images → `Content::Image`, Ollama `images` field.
`web_search` — DuckDuckGo HTML search, read-only.
`lsp_remote` — `lsp` tool; IDE-side execution.
`ollama_defaults` — `num_ctx`, `num_predict`, sampling, top-level `keep_alive`.

___

<a id="en-2026-02-end"></a>

### 2026-02-end

`todo_write` — `{ id, content, status }` list.
`phase_protocol` — `[phase: …]`, `PhaseEnter`, inference, aliases.
`nudge_tour_vide` — nudge on turn with no tool and no `done`.
`gate_todo_ouverte` — `done` blocked while pending/in_progress.
`glob_dirs` — `glob` returns files and directories.
`loop_detector` — two identical turns → `LoopDetected`.
`todo_recreation_block` — second plan forbidden after 100 % completed plan.
`memory_sessions` — `.drox/memory/sessions/*.md`, `memory_read`, `memory_list`, `session_note`, `MemoryPersisted`.
`compaction_live_v1` — microcompact, bounded tail, `compact_until_budget`, snip/compact events.
`paste_inject` — `[Smart paste]` block in prompt (client-side).
`user_ask` — multi `ask_user_question` + RPC `user/ask`.
`msg_queue` — message queue during run (client).
`ctx_policy_num_ctx` — autocompact tied to real Ollama context window.

___

<a id="en-2026-03"></a>

### 2026-03

`long_memory_v1` — compaction index, `session_search`, `/session_end` → `session_closure` (no LLM `session_end` tool).
`compaction_live_v2` — loop until context budget.
`hooks_json` — `.drox/hooks.json`, Pre/Post tool shell.
`parallel_read_tools` — concurrency-safe reads, `max_parallel_tool_calls`.
`bash_classifier` — bash segments auto-allow / auto-deny.
`file_rules` — path permissions, `settings.local.json`.
`copy_path`, `delete_path` — dedicated tools.
`notebook_edit` — ipynb cells replace/insert/delete.

___

<a id="en-2026-04"></a>

### 2026-04

`skills` — `.drox/skills/`, `skill_read`, `skill_list`.
`git_worktree` — `git_worktree_enter`, `git_worktree_exit`.
`mcp_hub` — MCP registry, resources, `mcp_call` fallback.
`professor_mode` — `course_plan_write`, gates, `.drox/course-cycles/`.
`tools_toggle` — `drox.tools.disabled`, MCP on/off.
`phase_analyzing` — phase + exploration nudge.
`phase_testing` — `done` gate after code mutation.
`workspace_map` — `.drox/workspace-map.json`, read/note, post-tool mirror.
`droxignore` — paths excluded from agent.
`run_objective` — locked objective, `scope_defer`.
`subagent_task` — `task` Explore tool, off by default.
`image_paths_prompt` — image paths in prompt.
`agent_split` — `agent/` modules (gates, phases, nudges, stream).
`run_policy` — `RunPolicy` layer (transitional, before tier drop).
`tiers_low_medium_abandon` — April experiment, removed for `v1_2`.

___

<a id="en-2026-05-v12"></a>

### 2026-05 — `v1_2`

`orchestration_v1_2` — `DROX_ORCHESTRATION=v1_2` replaces `legacy` mono-agent.
`run_spec` — role, limits, tool registry per `RunSpec`.
`role_architect` — `workspace_map_read`, `todo_write`, `delegate_executor`, verify, synthesis.
`role_executor` — mutations within `scope`; status `completed` / `partial` / `failed`.
`delegate_executor` — sync sub-run; output under `.drox/agent-output/<plan>/<task>/`.
`architect_gates` — no failure compensation; validated scope.
`architect_help` — protocol reminder tool.
`role_enter` — `RoleEnter` event; `agent/done` end of cycle.

___

<a id="en-2026-05-v13"></a>

### 2026-05 — `v1_3`

`failure_absorption` — post-delegation truth check, `FailurePacket`.
`parallel_batch` — `parallel_with[]`, response `{ results: [...] }`.
`scope_disjoint_gate` — batch rejected if paths overlap.
`retry_per_task` — targeted re-delegation after partial failure.
`architect_todo_guidance` — anti-loop plan closure.

___

<a id="en-2026-06-v14"></a>

### 2026-06 — `v1_4` (run rail)

`run_rail_solo` — 1.4.0 refactor: single edit conductor; 1.3 relics removed from IDE path.
`stations_rail` — INTENT → READ → [PROPOSE] → PLAN → ACT → VERIFY → ANSWER; short path skips PLAN/PROPOSE.
`01_core_rail_solo` — sole edit boot prompt; dropped `01_core.md`, `parallel_slots`, `delegate_executor` prompts.
`rail_policy` — per-station tool filter in `rail/policy.rs` before LLM.
`segment_act_del` — no Executor shards; `file_edit` / `file_write` / `bash` in ACT station.
`delegate_executor_del` — Executor, `FailurePacket`, parallel batch out of runtime contract.
`professor_standard_del` — Professor and Standard CLI modes cut from `drive`.
`discuss_path` — `ArchitectDiscussion`: light reply, no full rail.
`nudges_rail` — `stall_act`, `schema_error`, `done_only`; end of 1.3 nudges (`cycle_sanity`, `step_by_step`, etc.).
`final_answer_guard` — single `[phase: answering]` promotion; no double final reply.
`agent_split_v2` — `loop/drive/`, `state/`, `gates/`, `rail/`, `nudges/`; ~500 L/file cap.
`ui_2d` — multi-model / executor UI removed on IDE side (settings, webview); conductor polish → 1.4.2.

___

<a id="en-2026-06-v142"></a>

### 2026-06 — `v1_4_2` (observer rail — **closed, engine obsolete**)

`v1_4_1_stable` — session, busy UI, discuss, Windows VERIFY; base before context refactor.
`rail_observateur` — end of per-station ACL, `pre_gate`, `read_stall`, `act_stall`, `force_act`, mutation gates on `done`.
`tool_folders_del` — `orchestration/tool_folders/` removed; flat palette (`file_read`, `file_edit`, …).
`intent_probe_del` — no LLM probe at boot; static `routing.rs` discuss / analyze / edit.
`todo_write_del` — `internal_plan_write` only; todo gates removed.
`memoire_unifiee` — `DROX.md` only; boot teaser; compaction checkpoint → `## Run context (engine)` snapshot.
`contexte_4_couches` — boot + rail hint · stable tools · run snapshot · transcript + compaction.
`prompt_observateur` — `01_core_rail_solo.md` rewritten without prescriptive `[gate:]`.
`obsolete_annonce` — branch **1.4.2** merged to `main`; **full engine rewrite** announced — aggressive experimental phase, testing optional for the curious.

___

<a id="en-2026-06-v15"></a>

### 2026-06 — `v1_5` (TUI engine + IDE product)

`v1_5_0` — 1.4 rail replaced by **`tui_mono`** loop + `drox-cli` RPC shim; `role_split` / intent probe / per-station ACL **removed**.
`v1_5_1` — chat thread aligned with TUI; AI connection wizard.
`v1_5_2` — `LlmConfig` / sampling from IDE vignettes.
`v1_5_3` — thread diffs, shell cards, VT323 styling, session replay (webview).
`v1_5_4` — Linux `.deb` release + Open VSX; isolated WSL build pipeline.
`v1_5_5` — linear multi-turn thread; layout overlap fix (webview).
`v1_5_6` — post-1.5.5 fixes: optimistic user bubble, diff scroll, run warmup, TUI send button — **released** win + linux.
`v1_5_7` — post-1.5.6 fixes: smart paste, session replay, LLM recovery — **released** win + linux.
`v1_5_8` — Reasoning/Work thread polish (native thinking, inline tools, Plan vignette, warmup in log) — **released** win + linux.
`v1_5_9` — stick-to-bottom scroll, `MEMORY.md` + `.drox/` reset, lean composer — **released** win + linux.
`v1_5_10` — **current dev branch** — scope TBD (MCP → `1.5.11/`, Agents → `1.5.12/`).
