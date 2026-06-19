# 11 — Convergence phase / rail (plan d’exécution)

**Parent** : [README](README.md) · **Décisions** : [10-DECISIONS-PRODUIT.md](10-DECISIONS-PRODUIT.md) (C11–C15) · **Migration** : [08-MIGRATION.md](08-MIGRATION.md)

**Statut** : **code livré** (juin 2026) — G1–G3 validés dogfood README · **G4–G6 → Phase 5b** [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md).

---

## Contexte

Les phases 0–4 ont livré le module `run_rail/` (stations, `pre_gate`, segments, UI). En dogfood, le modèle continue d’émettre `[phase: reading]` etc. et ignore `[gate: advance]` → **B-RAIL-01** : rail invisible, double timeline UI.

La doc `08-MIGRATION` disait « `[phase: …]` orthogonal au rail » sans préciser le partage des responsabilités. Ce plan fige le contrat et l’ordre d’implémentation.

---

## Contrat C11 — qui fait quoi

Quand `run_rail_active` (`run_rail_enabled` + rôle **Architect** edit) :

| Couche | Responsable | Marqueurs / signaux |
|--------|-------------|---------------------|
| **Progression** | Run Rail | `[gate: hold]` / `[gate: advance]` ; **auto-advance** moteur si absent (C12) |
| **Profondeur** | Run Rail | `[depth: short]` / `[depth: complex]` (modèle seul — C5) |
| **Outils** | Run Rail | `pre_gate` par station |
| **UI structure** | Run Rail | Events `railStation*` / `railSegment*` |
| **Texte utilisateur** | Phase (legacy) | `[phase: answering]` |
| **Clôture run** | Phase (legacy) | `[phase: done]` — signal `loop.rs` inchangé en v1 (C13) |
| **Pensée native** | Phase | `internal_reasoning` (Ollama) — inchangé |

**Phases intermédiaires dépréciées** (rail on) : `reading`, `analyzing`, `planning`, `acting`, `testing`, `verifying`, `clarifying`.

- Le parseur les **reconnaît encore** (transcript, flags internes).
- Elles ne produisent **plus** de `PhaseEnter` UI (consommées silencieusement, comme `reasoning` / `next-move`).

**Hors périmètre** (C2) : discuss, analyze, executor, professor — protocole phase ou `[discussion:]` actuel, `run_rail_enabled` sans effet.

---

## Décisions liées (résumé)

| ID | Décision |
|----|----------|
| **C11** | Partition phase / rail ci-dessus |
| **C12** | **Auto-advance heuristique** : le moteur avance la station depuis outils / type de tour si pas de `[gate:]` ; `[gate:]` / `[depth:]` l’emportent toujours |
| **C13** | Clôture run = `[phase: done]` conservé jusqu’à event `railRunComplete` (reporté post-1.4.0) |
| **C14** | Gate L2 testing (`[phase: testing]` avant done) remplacée par **visite VERIFY** rail quand rail actif |
| **C15** | Prompts discuss : pas de `[phase:]` dans `literal_user_message` — `[discussion: reply/done]` seulement |

---

## Les trois piliers (indissociables)

Réduire l’impact des phases **sans** casser le rail exige **trois** livrables dans l’ordre logique ci-dessous :

```text
B — Filtrage UI phases intermédiaires (phases.rs + agent_stream.rs)
C — Auto-advance rail (run_rail/infer.rs + hooks)
D — Gardes loop branchées sur état rail (loop.rs)
```

| Pilier seul | Effet |
|-------------|-------|
| B sans C | UI plus propre, rail toujours mort |
| C sans B | Rail avance, double timeline phase + station |
| D sans C | Clôtures / nudges incohérents (testing sans VERIFY rail) |

---

## Étapes d’implémentation

Chaque étape = **une PR reviewable**. Pas de big-bang sur `loop.rs`.

### Étape A — Documentation ✅

- C11–C15 dans [10-DECISIONS-PRODUIT.md](10-DECISIONS-PRODUIT.md)
- Amendement [08-MIGRATION.md](08-MIGRATION.md)
- Phase 5 dans [07-IMPLEMENTATION-PHASES.md](07-IMPLEMENTATION-PHASES.md)

### Étape B — Filtrage stream (`phases.rs` + `agent_stream.rs`) ✅

**But** : une seule timeline UI côté phase (thinking + answering) ; le reste passe par le rail.

| Fichier | Modification |
|---------|--------------|
| `agent/phases.rs` | `phase_visible_in_ui(phase, rail_active) -> bool` — vrai pour `InternalReasoning`, `Answering`, `Done` seulement si rail actif |
| `agent/agent_stream.rs` | Paramètre `rail_active` sur `consume_stream` ; avant `PhaseEnter`, appeler le filtre ; désactiver `needs_synthetic_phase_enter` / `phase_for_tool` → `PhaseEnter` si rail actif |
| `agent/loop.rs` | Passer `run_rail::run_rail_active(...)` à `consume_stream` |

**Tests** : rail on + `[phase: reading]` → pas de `PhaseEnter(Reading)` ; `final_phase` / `saw_answering` inchangés.

### Étape C — Auto-advance (`run_rail/infer.rs`) ✅

**But** : résoudre B-RAIL-01 / M-RAIL-01 sans dépendre de l’obéissance modèle aux `[gate:]`.

| Fichier | Modification |
|---------|--------------|
| `run_rail/infer.rs` | **Nouveau** — table signal → station cible ; ne pas régresser si `[gate:]` présent |
| `run_rail/transition.rs` | Appeler infer après parse si `parsed.gate == None` |
| `run_rail/loop_hooks.rs` | `on_tool_success(state, tool_name)` — avance après outil réussi ; émettre `station_events` |
| `agent/loop.rs` | Hook après exécution outil réussi (zone tool result existante) |

**Table heuristique v1** (indicative — affiner en dogfood) :

| Signal | Station inférée |
|--------|-----------------|
| Premier tour user greeting-only | hold → ANSWER (boot existant) |
| `file_read`, `grep`, `glob`, `lsp`, `workspace_map_read`, `web_*`, `memory_*` | READ (ou maintien READ) |
| `todo_write` | PLAN |
| `file_edit`, `file_write`, `delete_path`, `notebook_edit` | ACT |
| `bash`, `lsp` après mutation dans le run | VERIFY |
| Texte proposition + `?` sans mutation, depth complex | PROPOSE (+ hold user C4) |
| `[gate: hold]` explicite | priorité absolue |

**Tests** : tour sans `[gate:]` + `file_read` → station READ + `railStationEnter` ; `[gate: advance]` explicite → pas d’écrasement par infer.

### Étape D — Gardes `loop.rs` (rail-aware) ✅ partiel

**But** : clôture fiable sans `[phase: testing]` quand VERIFY rail a eu lieu.

| Zone `loop.rs` | Changement |
|----------------|------------|
| `saw_testing_phase_in_run` + `done_gate_testing_required` (~l.735) | Si rail actif : `architect_state.rail` a visité **VERIFY** ou `cycle_sanity` résolu en VERIFY |
| Nudges « continue `[phase: reading]` » | Variante rail via helper `nudge_for_run` |
| Bloc done-driven (~l.542–760) | **Conservé** — `[phase: done]` + answering-before-done |
| `cycle_sanity` | Déjà rail-aware — ne pas dupliquer |

| Fichier | Modification |
|---------|--------------|
| `agent/nudges/mod.rs` | `nudge_for_run(ctx)` — template rail vs legacy |
| `agent/nudges/architect.rs`, `standard.rs`, `exploration.rs` | Templates rail : `[gate:]` + `[phase: answering/done]` uniquement |
| `run_rail/policy.rs` | Helper `rail_visited_verify(state) -> bool` si utile |

### Étape E — Prompts ✅

| Fichier | Changement |
|---------|------------|
| `01_core_rail.md` | Section protocole unique : rail + answering/done |
| `common/literal_user_message.md` | Split : variante **edit** (answering/done) vs **discuss** (sans `[phase:]`) |
| `gates/discuss.rs` | Injecter `literal_user_message_discuss.md` |

Pas de changement `01_core.md` / `01_core_solo.md` tant que `run_rail_enabled = false`.

### Étape F — UI (si nécessaire après B)

Si dogfood montre encore double timeline malgré B :

| Fichier | Changement |
|---------|------------|
| `host-message.js` | Si run rail actif, ignorer montage bloc phase hors `internal_reasoning` / `answering` |
| `run-rail-stations.js` | Rattacher outils sous carte station courante |

**Critère** : optionnel si B suffit côté moteur.

### Étape G — Validation dogfood → CLOSURE

Rejouer scénarios [01-VISION.md](01-VISION.md) + [09-TEST-PLAN.md](09-TEST-PLAN.md) :

| # | Critère |
|---|---------|
| G1 | Export edit charte : `railStationEnter/Done` présents |
| G2 | Export : pas de `PHASE · reading/planning/acting` (sauf `internal_reasoning` / `answering`) |
| G3 | `[phase: done]` clôture le run |
| G4 | `pre_gate` bloque mutation hors ACT/VERIFY |
| G5 | Discuss salut : prompts cohérents, pas de mélange `[phase:]` / `[discussion:]` |
| G6 | `cargo test -p drox-engine` vert ; presets relaxed/strict = régression zéro (rail off) |

Mettre à jour [CLOSURE-1.4.0.md](finalisation/CLOSURE-1.4.0.md) et [SMOKE-BACKLOG.md](SMOKE-BACKLOG.md) (B-RAIL-01 résolu, M-RAIL-02 tranché).

---

## Ce qu’on ne touche pas

| Élément | Raison |
|---------|--------|
| `parse_phase_marker` / `PhaseLineBuffer` | Toujours requis pour answering/done |
| `strip_phase_protocol_lines` | Affichage user |
| Rôles discuss / analyze / executor | C2 |
| Presets relaxed/strict (rail off) | Régression |
| Module `run_rail/` existant (pre_gate, segments, PROPOSE hold, ACT breaker) | On étend, on ne refond pas |
| `GateEngine` / TOML | Archivé — ne pas ressusciter |

---

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Infer avance trop tôt (mutation en READ) | `pre_gate` reste la barrière dure ; infer ne bypass pas |
| Désalignement station affichée / comportement modèle | Accepté v1 ; logs `state.rail.station` ; affiner table en dogfood |
| Régression tests phase legacy | Tous les tests existants passent avec `run_rail_enabled: false` |
| `loop.rs` gonfle | Hooks dans `run_rail/loop_hooks.rs` uniquement |
| Clôture cassée | C13 : garder `[phase: done]` jusqu’à migration explicite |

---

## Dépendances

```text
Phases 0–4 (livré)
    └── Étape B (filtrage UI)
            └── Étape C (auto-advance)  ← peut démarrer en parallèle partiel si interfaces claires
                    └── Étape D (gardes loop)
                            └── Étape E (prompts)
                                    └── Étape G (dogfood parent — partiel)
                                            └── Phase 5b [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md) → CLOSURE 1.4.0
                                                    └── 1.4.1 stabilisation · 1.4.3 UI · 1.4.4 index
```

**Étape F** (UI) : seulement si G2 échoue après B.

---

## Liens

- [B-RAIL-01](SMOKE-BACKLOG.md) (partiel) · [B-RAIL-02](SMOKE-BACKLOG.md) · [B-SEG-01](SMOKE-BACKLOG.md) · [M-RAIL-02](SMOKE-BACKLOG.md) (tranché → C12)
- [05-CODE-ARCHITECTURE.md](05-CODE-ARCHITECTURE.md)
- [06-UI-BLOCKS.md](06-UI-BLOCKS.md)
