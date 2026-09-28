# Matrice d'injection actuelle — 1.4.2 culture unique

**Version** : juin 2026 — **rail observateur** + protocole compact  
**Référence** : `context_frame/apply/iteration.rs` + `boot.rs`

> L'IDE TypeScript n'injecte pas de blocs system moteur (G-CTX-01 : troncature user prompt uniquement).

---

## Légende

| Colonne | Signification |
|---------|---------------|
| **Mode** | `boot` · `replace` · `append` · `insert_ckpt` |
| **Marqueur** | Sous-chaîne identifiant le bloc |
| **Source** | Fichier / fonction producteur |

---

## 1. Boot architect edit

| Ordre | Bloc | Mode | Source |
|-------|------|------|--------|
| 1 | G3 core rail solo (observateur) | boot | `01_core_rail_solo.md` |
| 2 | Native thinking supplement | boot si `think=true` | `nudges/thinking.rs` |
| 3 | Historique + user | boot | `drive/boot.rs` |

Protocoles outil **pas** au boot — `iteration_start` uniquement.

---

## 2. Chaque tour LLM — `architect.*.iteration_start`

| # | Layer ID | Mode | Marqueur | Source |
|---|----------|------|----------|--------|
| 1 | `ctx_run_snapshot` | replace | `## Architect run snapshot (engine)` | `architect_run_context_block_per_turn` (+ station inférée si rail) |
| 2 | `internal_plan_snapshot` | replace | `## Internal work plan (engine only)` | si plan présent — **optionnel** |
| 3 | `tool_protocols` | replace | `## Architect tool protocols (engine)` | **`tool_supplements_architect_compact`** (fixe) |
| 4a | `rail_turn_hooks` | état | — | `rail::on_turn_start` |
| 4b | `rail_snapshot` | replace | `## Run rail (engine)` | hint informatif — si rail actif |

**Specs LLM** : palette **complète** allowlist — **pas** de filtre par station (`llm_turn`).

**Protocoles** : `ARCHITECT_EDIT_CORE_BLOCKS` (~9 blocs T-*) — identiques à chaque station.

---

## 3. Post-compaction

| Déclencheur | Source |
|-------------|--------|
| Live compaction | `architect_run_context_block_compaction` |
| `todo_write` succès | idem |

---

## 4. Nudges événementiels

Voir `frames-v0.yaml` § `gate_nudge`. Ajout 1.4.2 : `schema_error.forced_answering` (plafond 3 tours stériles).

---

## 5. Invariants 1.4.2

| Invariant | Statut |
|-----------|--------|
| 0× `read_workspace` / `edit_file` / `verify_project` dans API LLM | ✅ |
| Protocole compact stable 2 tours (`skip=unchanged`) | ✅ |
| ACL outils par station | ❌ supprimé |
| `tool_folders` | ❌ supprimé |

---

## 6. Frontière moteur / IDE

| Responsabilité | Couche |
|----------------|--------|
| Frames, snapshots, nudges, rail inférence | **Rust** |
| Exécution outils wire, UI chat | **TS** |
