# Idée 10 — Paramétrage prompts & strictesse moteur

**Statut** : idée brute (registre initial)  
**Date** : 2026-06-03  
**Priorité** : haute — qualité UX chat + dogfooding 1.3.2  
**Liens** : [PROMPTS-REINJECTE-1.3.2.md](../1.3/1.3.2/PROMPTS-REINJECTE-1.3.2.md) · [CIRCUIT-MOTEUR-GATES-NUDGES.md](../1.3/1.3.2/CIRCUIT-MOTEUR-GATES-NUDGES.md) §13 · [07-reponses-legere-sans-plan.md](07-reponses-legere-sans-plan.md) · **Couche au-dessus** : [12-presets-globaux-benchmark-hardware.md](12-presets-globaux-benchmark-hardware.md)

---

## Résumé

Permettre à l’utilisateur final (ou à l’équipe produit via settings Drox) de **moduler la sévérité** du moteur : seuils numériques, activation de gates, et éventuellement **variantes de textes** injectés (`system` / nudges / rappels user) — sans recompiler `drox.exe` à chaque ajustement.

**Principe** : séparer ce qui est **structurel** (protocole `[gate: …]`, `[phase: …]`, allowlist par rôle) de ce qui est **réglable** (seuils, longueur min avant clôture, nombre de lectures avant délégation, etc.).  
**Hors scope** : classifier le message utilisateur par listes de mots-clés.

---

## Problème actuel

- Des constantes Rust (`gates.rs`, `architect_gates.rs`, `run_spec`, `compaction.rs`) fixent le comportement ; seuls quelques paramètres passent par l’IDE (`drox.maxIterations`, `drox.permissionMode`, modèles, parallélisme exécuteurs).
- Dogfooding « Salut ! » : le seuil **120 caractères** pour considérer une réponse « suffisante » empêchait la clôture discussion → boucles de nudges (corrigé temporairement à **12** en discuss uniquement — toujours hardcodé).
- Les **textes** system / nudges / reminder user se répètent et se cumulent ; pas de profil `relaxed` / `strict` unifié.

---

## Vision produit

1. **`drox.engine.strictness`** (enum ou preset) : `relaxed` | `normal` | `strict` — applique un **jeu de valeurs** par défaut (table ci-dessous).
2. **Surcharges fines** (optionnel, power users) : clés `drox.engine.*` par variable pour affiner sans fork le moteur.
3. **Prompts** : soit **presets** (texte court / normal / verbeux), soit édition avancée dans un panneau « Moteur » (hors MVP).
4. Toute nouvelle contrainte reste **gate structurelle ou marqueur protocolaire** — pas de NLP sur le prompt user.

---

## Registre des variables (état code — 2026-06-03)

Légende **Exposition** :

| Symbole | Signification |
|---------|-------------|
| 🔧 | Déjà réglable IDE / RPC (`agent.run`) |
| 📌 | Constante Rust uniquement — **cible paramétrage** |
| 📝 | Texte prompt / nudge injecté — **cible preset ou override** |
| 🔀 | Dérivé d’un autre paramètre (ex. strictness) |

### A — Clôture & réponse utilisateur (discussion / phases)

| ID | Variable | Valeur actuelle | Fichier | Rôle / moment | Exposition |
|----|----------|-----------------|---------|---------------|------------|
| A1 | `promotable_answer_min_chars` | **120** | `agent/gates.rs` | Architecte / Standard : texte « assez long » pour éviter nudge « écris ta réponse » ou auto-promotion `answering` | 📌 |
| A2 | `discussion_promotable_min_chars` | **12** | `agent/gates.rs` | **Discussion** : clôture après 1 tour sans outil si réponse ≥ seuil | 📌 · **demande user** |
| A3 | `discussion_auto_stop_on_reply` | `true` (logique) | `agent/loop.rs` | Discuss : `Stop` si tour vide outils + A2 satisfait | 📌 |
| A4 | `intent_max_iterations` | défaut **2**, clamp **1–3** | `orchestration_run.rs` | Tour intent gate uniquement | 📌 |
| A5 | `discussion_max_iterations` | défaut **3**, clamp **1–5** | `orchestration_run.rs` | Run discussion après gate | 📌 · partiel 🔧 via `drox.maxIterations` |
| A6 | `agent_max_iterations` (défaut) | **12** | `agent/mod.rs` `AgentConfig` | Plafond tours LLM par run | 🔧 `drox.maxIterations` |

### B — Anti-boucle & nudges silencieux

| ID | Variable | Valeur actuelle | Fichier | Moment | Exposition |
|----|----------|-----------------|---------|--------|------------|
| B1 | `loop_detector_strikes_before_abort` | **2** répétitions → abort au 3e tour identique | `agent/agent_stream.rs` `LoopDetector` | Chaque tour LLM | 📌 |
| B2 | `loop_detected_nudge` | texte fixe | `nudges/standard.rs` + router | 1er strike | 📝 |
| B3 | `architect_discussion_nudge` | « already answered — stop » | `nudges/architect.rs` | Discuss, tour sans outil | 📝 |
| B4 | `architect_nudge` | cycle complet | `nudges/architect.rs` | Architect edit, tour vide | 📝 |
| B5 | `architect_intent_gate_nudge` | émettre `[gate: …]` | `nudges/intent.rs` | Intent, gate manquante | 📝 |
| B6 | `architect_run_closable_nudge` | peut fermer | `nudges/architect.rs` | Edit, plan terminé | 📝 |
| B7 | `architect_cycle_sanity_nudge` | smoke test requis | `nudges/architect.rs` | Edit, avant `done` | 📝 |
| B8 | `done_only_nudge` | par rôle | router | Edit / standard, `answering` sans `done` | 📝 |
| B9 | `max_consecutive_ask_user_question_failures` | **3** | `nudges/standard.rs` | Échecs ask_user en boucle | 📌 |

### C — Limites par rôle (`RunSpec`)

| ID | Variable | Valeur actuelle | Fichier | Rôle | Exposition |
|----|----------|-----------------|---------|------|------------|
| C1 | `max_tools_per_turn` architect | **6** | `run_spec/mod.rs` | Architect edit | 📌 |
| C2 | `max_tools_per_turn` discussion | **4** | `run_spec/mod.rs` | Architect discussion | 📌 |
| C3 | `max_tools_per_turn` intent | **0** | `run_spec/mod.rs` | Architect intent | 📌 |
| C4 | `max_tools_per_turn` executor | **2** | `run_spec/mod.rs` | Executor | 📌 |
| C5 | `architect_tool_allowlist` | liste fixe | `run_spec/mod.rs` | Outils visibles LLM | 📌 · 🔀 strictness |
| C6 | `discussion_tool_allowlist` | lecture seule | `run_spec/mod.rs` | Discuss | 📌 · 🔀 strictness |
| C7 | `executor_tool_allowlist` | bash, edit, read… | `run_spec/mod.rs` | Executor | 📌 |
| C8 | `max_parallel_tool_calls` | **8** | `tool_orchestration.rs` | Exécution parallèle read-only | 📌 |

### D — Gates architecte (structurelles, seuils numériques)

| ID | Variable | Valeur actuelle | Fichier | Effet | Exposition |
|----|----------|-----------------|---------|-------|------------|
| D1 | `architect_max_reads_before_delegate` | **4** | `architect_gates.rs` | Lectures avant de pouvoir déléguer | 📌 |
| D2 | `architect_max_delegations_per_task` | **2** | `architect_gates.rs` | Re-tentatives delegate par todo | 📌 |
| D3 | `architect_max_delegate_scope_paths` | **6** | `architect_plan_quality.rs` | Paths max dans `scope` (architecte) | 📌 |
| D4 | `delegate_scope_max_files` | **50** | `drox-tools/delegate_scope.rs` | Fichiers max comptés dans scope exécuteur | 📌 |
| D5 | `min_delegate_instructions_len` | **80** | `architect_gates.rs` | Taille min brief delegate | 📌 |
| D6 | `require_delegate_before_todo_complete` | gate active | `architect_todo_gate.rs` | Pas de `completed` sans delegate (sauf meta) | 📌 · 🔀 relaxed pour discuss-only |
| D7 | `require_workspace_map_before_plan` | nudges / prompts | `architect_edit` + gates | Carte avant plan | 📌 · 🔧 brouillon PATCHNOTES `requireWorkspaceMapBeforeExplore` |

### E — Orchestration & exécuteur

| ID | Variable | Valeur actuelle | Fichier | Exposition |
|----|----------|-----------------|---------|------------|
| E1 | `max_parallel_executors` | **1–100** (cap) | `parallel_batch.rs` + config | 🔧 `drox.orchestration.maxParallelExecutors` |
| E2 | `min_deliverable_bytes` | **64** | `executor_deliverable.rs` | 📌 |
| E3 | `executor_deliverable_excerpt_max_chars` | **600** | `executor_deliverable.rs` | 📌 |

### F — Compaction & ancre cycle

| ID | Variable | Valeur actuelle | Fichier | Exposition |
|----|----------|-----------------|---------|------------|
| F1 | `live_compact_tail_keep_messages` | **4** | `compaction.rs` | 📌 |
| F2 | `live_compact_max_tail_ratio` | **0.20** | `compaction.rs` | 📌 |
| F3 | `live_compact_min_prefix_tokens` | **3000** | `compaction.rs` | 📌 |
| F4 | `live_compact_max_passes` | **3** | `compaction.rs` | 📌 |
| F5 | `checkpoint_max_chars` | **3000** | `compaction.rs` | 📌 |
| F6 | `anchor_user_request_max_chars` | **900** | `architect_state.rs` | 📌 |
| F7 | `anchor_plan_max_items` | **24** | `architect_state.rs` | 📌 |
| F8 | `compaction_prompt` | texte LLM résumé | `drox-cli/prompts.rs` | 📝 |

### G — Blocs system prompts (texte complet)

| ID | Bloc | Fichier | Quand injecté | Exposition |
|----|------|---------|---------------|------------|
| G1 | `ARCHITECT_INTENT_SYSTEM_PROMPT` | `prompts/architect_intent.rs` | Tour intent | 📝 preset |
| G2 | `ARCHITECT_DISCUSSION_SYSTEM_PROMPT` | `prompts/architect_discussion.rs` | Run discuss | 📝 preset |
| G3 | `ARCHITECT_SYSTEM_PROMPT` | `prompts/architect_edit.rs` | Run edit | 📝 preset |
| G4 | `architect_parallel_slots_supplement` | `architect_edit.rs` | Si parallèle > 1 | 📝 |
| G5 | `EXECUTOR_SYSTEM_PROMPT` + suppléments | `prompts/executor.rs` | Sous-run executor | 📝 preset |
| G6 | `CORE_SYSTEM_PROMPT` | `prompts/core_standard.rs` | CLI / Standard | 📝 preset |
| G7 | `PROFESSOR_MODE_SUPPLEMENT` | `core_standard.rs` | Professor | 📝 |
| G8 | `EXPLORATION_INTERNAL_ENGLISH_RULE` | `prompts.rs` | Standard assemble | 📝 |
| G9 | `NATIVE_THINKING_REASONING_SUPPLEMENT` | `prompts.rs` | Si native thinking | 📝 · 🔧 `drox.nativeThinking` |
| G10 | `SUBAGENTS_ORCHESTRATION_SUPPLEMENT` | `prompts.rs` | Subagents on | 📝 · 🔧 `drox.subagents.enabled` |
| G11 | `workspace_map_block` | moteur format | Presque tous les runs | 🔀 (données, pas texte) |
| G12 | `droxignore_block` | moteur format | Presque tous | 🔀 |
| G13 | `language` merge | `language.rs` | Langue réponse user | 🔧 `drox.primaryLanguage` |
| G14 | `disabled_tools_notice` | assemble | Outils masqués IDE | 🔧 `drox.tools.disabled` |

### H — Messages user injectés (rappels tour 0)

| ID | Bloc | Fichier | Redondance avec | Exposition |
|----|------|---------|-----------------|------------|
| H1 | `architect_intent_user_message` | `architect_intent.rs` | G1 | 📝 court / off |
| H2 | `architect_discussion_user_message` | `architect_discussion.rs` | G2 | 📝 court / off |
| H3 | `architect_user_message` (edit) | `architect_messages.rs` | G3 | 📝 **souvent redondant** |
| H4 | `executor_delegated_task_block` | `executor.rs` | G5 | 📝 |
| H5 | `cycle_anchor_block` | `architect_state.rs` | réinjecté en boucle | 📝 · tailles F6–F7 |
| H6 | `delegate_checkpoint` / recovery | `architect_state.rs` | après delegate | 📝 |

### I — Déjà exposé IDE (ne pas dupliquer)

| Setting Drox | Lieu moteur |
|--------------|-------------|
| `drox.maxIterations` | `AgentRunParams.max_iterations` |
| `drox.permissionMode` | `PermissionPolicy` / plan vs acceptEdits |
| `drox.architect.interactionMode` | gate forcée (`auto` / `discussion` / `action`) |
| `drox.orchestration.maxParallelExecutors` | `OrchestrationConfig` |
| `drox.primaryLanguage` | merge system |
| `drox.nativeThinking` | supplément thinking |
| `drox.tools.disabled` | allowlist effective |
| `drox.subagents.*` | explore legacy |
| Modèles architect / executor | `OrchestrationConfig` |

---

## Presets `strictness` (proposition — non implémenté)

| Variable (extrait) | relaxed | normal (actuel) | strict |
|--------------------|---------|-----------------|--------|
| A1 promotable_answer_min_chars | 60 | 120 | 200 |
| A2 discussion_promotable_min_chars | 8 | 12 | 24 |
| D1 architect_max_reads_before_delegate | 8 | 4 | 2 |
| D3 architect_max_delegate_scope_paths | 10 | 6 | 4 |
| D4 delegate_scope_max_files | 80 | 50 | 30 |
| D6 require_delegate_before_todo_complete | off meta only | on | on + sanity obligatoire |
| B1 loop strikes | 3 | 2 | 1 |
| H3 architect_user_reminder | off | short | full |

---

## Liste de travail MVP (feature 10)

1. [ ] Struct `EngineStrictness` + passage RPC `agent.run` (ou lecture settings côté CLI).
2. [ ] Remplacer **A1, A2, D1–D5, B1, C1–C2, E1** par valeurs résolues depuis preset + override.
3. [ ] Profil `relaxed` : désactiver rappels user **H3** ; raccourcir nudges **B3–B4**.
4. [ ] Panneau settings « Sévérité moteur » (IDE) — lien vers [PROMPTS-REINJECTE](../1.3/1.3.2/PROMPTS-REINJECTE-1.3.2.md).
5. [ ] (Plus tard) Édition texte prompts G* — stockage workspace ou `.drox/engine.toml`.

---

## Questions ouvertes

- Un seul knob `strictness` suffit-il pour la v1, ou exposer A2 / A1 dès le MVP ?
- Les nudges **B*** doivent-ils devenir des **codes** (`nudge:discussion_stop`) avec texte i18n côté IDE ?
- Discussion : faut-il un paramètre **`discussion_allow_read_tools`** bool (false = zéro outil même en discuss) ?
- Comment versionner les presets quand `ARCHITECT_SYSTEM_PROMPT` change entre releases 1.3.x ?

---

## Liens

- [07 — Réponses légères](07-reponses-legere-sans-plan.md) — premier bénéficiaire (A2, G2, H2, B3)
- [PATCHNOTES 1.3.2](../1.3/1.3.2/PATCHNOTES-1.3.2.md) — brouillon `drox.engine.strictness`
- [PLAN alignement prompts](../1.3/1.3.2/PLAN-ALIGNEMENT-PROMPTS-ORCHESTRATION.md) §3.4
