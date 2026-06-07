# Suivi nettoyage gates moteur (1.3.2+)

**Créé** : 2026-06-02  
**Contexte** : audit post-migration `GateEngine` + chaîne TOML (`probe_architect_gate_chain`).  
**Complète** : phase E de [PLAN-INTEGRATION-GATES-BACKPACK.md](../PLAN-INTEGRATION-GATES-BACKPACK.md) (débris ancienne voie `[gate:]` / intent markdown).

**Références**

| Doc | Rôle |
|-----|------|
| [README.md](README.md) | Architecture gates + bulles |
| [GATE-ROUTES.md](GATE-ROUTES.md) | Chemins MVP (dérivé du graphe) |
| [gate-graph.json](../../../drox/crates/drox-engine/assets/gates/gate-graph.json) | Arborescence canonique (validation, pas driver runtime) |
| [PLAN-INTEGRATION-GATES-BACKPACK.md](../PLAN-INTEGRATION-GATES-BACKPACK.md) | Phases A→F implémentation |
| [CIRCUIT-MOTEUR-GATES-NUDGES.md](../CIRCUIT-MOTEUR-GATES-NUDGES.md) | Circuit global (à mettre à jour après nettoyage) |

---

## Voie actuelle (ne pas casser)

```text
agent.run (role_split)
  → resolve_architect_gate
       ├─ architectInteractionMode = discussion|action → skip chaîne
       └─ auto → probe_architect_gate_chain
            → GateEngine + *.gate.toml (assets/gates/)
            → JSON {"open":…} | {"gate":…,"value":…}
            → START_RUN.* → ArchitectDiscussion | Architect (edit)
```

**Deux familles « gate » (ne pas confondre)**

| Famille | Code | Rôle |
|---------|------|------|
| **Routage** | `gate_engine/`, `orchestration_run.rs` | ENTRY → discuss/edit, `discuss.*`, `edit.has_concrete_goal` |
| **Outils (bloquantes)** | `agent/architect_gates.rs` | `todo_write`, `delegate_executor`, scope, compensation — **à conserver** |

---

## Légende statuts

| Symbole | Signification |
|---------|----------------|
| ☐ | À faire |
| 🔄 | En cours |
| ✅ | Fait (cocher date + PR/commit dans journal) |
| ⏸ | Reporté (justifier en note) |
| — | Hors scope / info seulement |

---

## Vagues de travail

### P0 — Débris code mort (faible risque)

| ID | Statut | Action | Fichiers / symboles | Vérification |
|----|--------|--------|---------------------|--------------|
| **G-N01** | ✅ | Supprimer les blocs markdown gates **non chargés** | `prompts/system/blocks/gates/auto_gate.md`, `intent.md`, `mode_choice.md` | `rg "auto_gate|intent\.md|mode_choice" drox-engine/drox/crates` → 0 `include_str!` |
| **G-N02** | ✅ | Retirer `PromptBlockId::G1Intent` + branche `wire_id` si plus utilisée | `orchestration/prompts/registry.rs` | `cargo build -p drox-engine` |
| **G-N03** | ✅ | Supprimer module / export `architect_intent_user_message` | `prompts/architect_intent.rs`, `prompts/mod.rs`, `lib.rs`, `orchestration/mod.rs` | `rg architect_intent_user_message` → docs seulement ou 0 |
| **G-N04** | ✅ | `.gitignore` ou supprimer journaux test dans le crate | `drox/.gitignore` `**/.drox/runs/` ; dossier supprimé | Pas de fichiers trackés sous `.drox/runs/` |

### P1 — Protocole legacy `[gate:]` (risque comportement)

| ID | Statut | Action | Fichiers | Vérification |
|----|--------|--------|----------|--------------|
| **G-N10** | ✅ | `loop.rs` : ne plus **terminer** le tour intent sur `extract_gate_from_text` ; JSON seul (+ nudge si absent) | `agent/loop.rs` (~749–772) | Test / export : intent sans `[gate:]` → nudge JSON ; avec JSON → chaîne continue côté CLI |
| **G-N11** | ✅ | Retirer API publique marqueurs | `architect_gate.rs` : `parse_gate_marker`, `extract_gate_from_text`, `marker_line` ; exports `lib.rs` | Tests marker supprimés ; `cargo test -p drox-engine` OK |
| **G-N12** | ✅ | Mettre à jour commentaire module `architect_gate.rs` (plus de `ARCHITECT_INTENT_SYSTEM_PROMPT`) | `orchestration/architect_gate.rs` | — |
| **G-N13** | ✅ | Aligner prompt edit : plus de routage `[gate:]` en run edit | `prompts/system/blocks/edit/01_core.md` L12 | Wording : « si hors périmètre user → `[phase: answering]` + `done` ou demander reclassement » |

### P2 — Docs & double source de vérité

| ID | Statut | Action | Fichiers | Vérification |
|----|--------|--------|----------|--------------|
| **G-N20** | ✅ | Remplacer copie `docs/.../gates/gates/*.toml` par **lien** vers `assets/gates/` | `docs/1.3/1.3.2/gates/gates/README.md` | Plus de `*.gate.toml` dupliqués sous docs |
| **G-N21** | 🔄 | Bannière « remplacé par gate_engine » sur docs obsolètes | `CIRCUIT-MOTEUR-GATES-NUDGES.md` ✅ ; PATCHNOTES / brainstorm restent | Lecture : tour intent = TOML `entry`, pas `[gate:]` ligne 1 |
| **G-N22** | ✅ | Mettre à jour `gates/README.md` § « Lien code actuel » | `gates/README.md` L30 | Plus « probe_architect_gate » sans `GateEngine` |
| **G-N23** | ✅ | Mettre à jour `PROMPTS-REINJECTE-1.3.2.md` (retirer G1 intent / `architect_intent_user_message`) | `PROMPTS-REINJECTE-1.3.2.md` | — |
| **G-N24** | ✅ | Corriger en-tête `nudges/mod.rs` (protocole actif = JSON gates + phases, pas `[gate:]`) | `agent/nudges/mod.rs` | — |

### P3 — Heuristiques & asymétries (design)

| ID | Statut | Action | Fichiers | Vérification |
|----|--------|--------|----------|--------------|
| **G-N30** | ✅ | Remplacer heuristiques salutation / méta EN par marqueurs `[discussion: reply]` … `[discussion: done]` + repli structurel | `architect_gate.rs`, prompts discuss, `protocol_markers.rs` | Tests `architect_gate::` ; event `UserFacingReply` inchangé |
| **G-N31** | ☐ | Documenter ou unifier override RPC `discussion` → `DiscussWithReads` (saute `discuss.*`) | `gate_engine/mod.rs` `from_rpc_override`, doc RPC | Tableau dans GATE-ROUTES ou ici |
| **G-N32** | ☐ | Lister alias RPC legacy (`light`, `chat`, …) — garder ou réduire | `ArchitectGate::parse_param` | Breaking change noté dans PATCHNOTES si retrait |
| **G-N33** | ✅ | Renommer doc « tool gates » pour éviter confusion avec `gate_engine` | `architect_gates.rs` module doc, [CONDUCTEUR-CODE.md](../CONDUCTEUR-CODE.md) | — |

### P5 — Simplification conducteur (2026-06)

| ID | Statut | Action | Fichiers | Vérification |
|----|--------|--------|----------|--------------|
| **G-N40** | ✅ | Supprimer monolithe prompt edit + exports legacy | `blocks/edit/mod.rs`, `gates/edit.rs`, `architect_edit.rs`, `lib.rs` | Prod = `core_for_run` seulement |
| **G-N41** | ✅ | Source unique `E_NONE_BLOCKED_TOOLS` (C2 prompt + C3 blocage) | `blocks/tools/mod.rs` | Test `e_none_blocks_orchestration_tools_not_shown_in_prompt` |
| **G-N42** | ✅ | Carte code conducteur | [CONDUCTEUR-CODE.md](../CONDUCTEUR-CODE.md) | — |
| **G-N43** | ✅ | Allowlist API LLM = `tools_for_tier` par tour edit | `filter_tool_specs_for_edit_tier`, `is_tool_allowed_for_tier` | 290 tests |
| **G-N44** | ✅ | C3 palier unifié : `architect_tier_tool_pre_gate` + `architect_edit_tier_hint` | `blocks/tools/mod.rs`, `architect_gates.rs`, `loop.rs` | `cargo test -p drox-engine` |
| **G-N45** | ✅ | Archive G3 `02–19` → `01_core` + `e_*.md` ; suppression 18 `.md` orphelins | `blocks/edit/`, `supplements/edit/` | Pas de `include_str!` vers `02`–`19` |
| **G-N46** | ✅ | Retrait backpack (outils, store, bulle, prompt) | `drox-tools`, `drox-session`, `loop.rs`, allowlist | `cargo test -p drox-engine` |

### P6 — Nudges (rappels soft, ne pas confondre avec gates)

| ID | Statut | Action | Fichiers | Vérification |
|----|--------|--------|----------|--------------|
| **N-N01** | ✅ | Audit symboles `nudges/` — tout référencé | `agent/nudges/*` | `cargo test -p drox-engine` |
| **N-N02** | ✅ | Retirer `explore_legacy.rs` : gate explore → `gates.rs`, nudges explore → `helpers.rs` | `explore_legacy.rs` supprimé | Comportement M5c inchangé (CLI `subagents_enabled`) |
| **N-N03** | ☐ | Fusion optionnelle nudges clôture D* (`gates.rs` → `nudges/`) | `gates.rs` § clôture | Hors scope tant que gates conducteur en refactor |

**Ne pas supprimer** (actifs prod) : anti-boucle `loop_intervention`, nudges rôle (`router`), Standard CLI, explore pending si sous-agents activés.

---

| ID | Statut | Action | Référence |
|----|--------|--------|-----------|
| **G-F01a** | ✅ | Effets `START_RUN.edit` / `edit_e_none` + journal checkpoint | `agent/edit_start.rs`, `run_journal`, `orchestration_run.rs` |
| **G-F01b** | ✅ | Gate in-run `edit.user_intent_clear` (P-D4) | `gate_engine/in_run.rs`, `agent/in_run_gate.rs`, TOML |
| **G-F01c** | ✅ | `edit.requires_visible_plan` (plafond moteur + journal) | `edit_start.rs`, TOML engine_effect |
| **G-F01d** | ✅ | Checkpoints moteur delegate / verify / close | `edit_start.rs`, TOML, `loop.rs` |
| **G-F01** | ☐ | `edit.ready_for_discovery` (discovery tier) | [EDIT-GATES-MAP.md](EDIT-GATES-MAP.md) |
| **G-F02** | ☐ | Bulles TOML doc → handlers complets | [CONTEXT-BUBBLES.md](CONTEXT-BUBBLES.md), `context_bubble/` |
| **G-F03** | ❌ | Backpack — **annulé** (complexité inutile) | — | — |
| **G-F04** | ☐ | Retirer `post_process_gate_step` si tous TOML passent par `discuss.open_user_reply` | `gate_engine/mod.rs` | Tests discuss true/false |

---

## Checklist grep (avant tag / release)

Exécuter depuis la racine du repo :

```bash
rg "auto_gate\.md|ARCHITECT_INTENT_SYSTEM|architect_intent_user_message" drox-engine/drox/crates src/vs/workbench/contrib/drox
rg "include_str!.*blocks/gates/(auto_gate|intent|mode_choice)" drox-engine
rg "\[gate: architect_" drox-engine/drox/crates --glob "!*.md"
```

**Attendu après P0–P1** : plus de `include_str` vers les 3 md ; plus de branche active `[gate:]` dans `loop.rs` ; marqueurs limités à tests dépréciation ou 0.

**Validation gates (inchangé)**

```bash
node scripts/validate-gate-graph.mjs
cargo test -p drox-engine graph::
cargo test -p drox-engine gate_engine::
```

---

## Journal des traitements

| Date | IDs | Résumé | Commit / PR |
|------|-----|--------|-------------|
| 2026-06-02 | — | Création fiche suivi (audit initial) | — |
| 2026-06-02 | G-N01–04, G-N10–13, G-N20–24 (partiel G-N21) | Nettoyage P0–P1 + doc ; `cargo test -p drox-engine` 263 passed | — |
| 2026-06-02 | G-N30 | Protocole discussion structuré + extraction sans heuristique langue | — |
| 2026-06-05 | G-N46 | Backpack retiré (outils, store session, injection loop) | — |

---

## Notes d’audit (référence rapide)

<details>
<summary>Liste originale (2026-06-02)</summary>

**Reliquats** : md orphelins (auto_gate, intent, mode_choice), G1Intent enum, architect_intent_user_message, API `[gate:]`, loop intent legacy, 01_core.md, docs CIRCUIT/PATCHNOTES/brainstorm.

**Dérive** : `docs/gates/gates/` vs `assets/gates/` (entry DIFFERS), `gate-graph.json` validation-only, `planned_chain_from_entry`, `post_process_gate_step`, `.drox/runs/*.jsonl`.

**Heuristiques** : `extract_discussion_user_facing_reply`, `from_rpc_override`, alias RPC.

**Nommage** : `architect_gates.rs` ≠ `gate_engine`, wire `architect_intent`.

**Futur** : `edit_checkpoint`, bulles restantes.

</details>
