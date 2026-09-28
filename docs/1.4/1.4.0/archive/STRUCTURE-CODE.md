# Structure code — séparation des responsabilités (1.4.0)

**Référence** : [FOI-REFONTE.md](FOI-REFONTE.md) (fait foi) · **Exécution** : [PLAN-ATTAQUE](PLAN-ATTAQUE.md)

Annexe arborescence — extrait FOI § VI + règle D6.

Règle transversale de la **deuxième édition 1.4.0** : le moteur doit rester **navigable visuellement** — dossiers = responsabilités, fichiers courts.

---

## Règle D6 — 500 lignes max

| Règle | Détail |
|-------|--------|
| **Plafond** | **≤ 500 lignes** par fichier `.rs` (hors lignes vides en fin de fichier — compter avec `wc -l` / CI) |
| **Responsabilité** | **Un fichier = une raison de changer** (SRP) |
| **Arborescence** | Dossiers et sous-dossiers nommés par **domaine**, pas par type technique seul |
| **`mod.rs`** | Ré-export + wiring uniquement ; **≤ 80 lignes** cible |
| **`impl Agent`** | Autorisé sur plusieurs fichiers via sous-module `loop/drive/` (pas un seul `drive.rs` monolithique) |
| **Tests** | `tests/mod.rs` = déclarations `mod foo;` seulement ; corps dans `tests/<domaine>.rs` |
| **Exceptions** | Aucune en prod. Si un fichier dépasse 500 après refonte → **split obligatoire** avant merge phase |

**Pourquoi** : vision globale du moteur ; éviter que `drive.rs` + `architect_state.rs` cachent toute la logique guide.

---

## État actuel — violations (> 500 lignes)

Mesure juin 2026, `drox-engine/src/` :

| Lignes | Fichier | Action 1.4.0 |
|--------|---------|----------------|
| 2889 | `agent/tests/mod.rs` | Split par domaine (`drive`, `gates`, `rail`, …) |
| 1717 | `agent/loop/drive.rs` | Split `loop/drive/*` (priorité 1) |
| 1434 | `agent/architect_state.rs` | Split `state/*` + retirer champs delegate (Phase 2) |
| 811 | `compaction.rs` | Split `compaction/` si touché ; sinon report post-squelette |
| 648 | `orchestration/tuning/mod.rs` | Split presets / flags par fichier |
| 618 | `agent/agent_stream.rs` | Split `stream/consume` + `stream/loop_detect` |
| 610 | `agent/gates.rs` | Split `gates/done`, `gates/tool_pre`, … |
| 521 | `orchestration_delegate.rs` | **DEL** Phase 2 (pas split) |

Fichiers 400–500 (surveiller) : `phases.rs` (451), `architect_gates.rs` (357 → DEL ou fusion).

---

## Arborescence cible — `agent/`

```text
agent/
├── mod.rs                          # exports publics, ~60 lignes
│
├── core/                           # Agent, config, stream handle
│   ├── mod.rs
│   ├── agent.rs
│   └── config.rs
│
├── loop/                           # boucle tour par tour
│   ├── mod.rs                      # wiring, pas include! monolith
│   ├── drive/
│   │   ├── mod.rs                  # drive_inner : for-loop + dispatch
│   │   ├── boot.rs                 # init messages, tool_specs, professor
│   │   ├── iteration_start.rs      # début tour : rail hook, compaction cursor
│   │   ├── llm_turn.rs             # stream_chat, consume_stream
│   │   ├── post_assistant.rs       # sans tool_call : nudges, done gate
│   │   └── segment.rs              # SUPPRIMÉ Phase 2 (option A)
│   ├── tools/
│   │   ├── mod.rs
│   │   ├── execution.rs            # exéc tool_calls
│   │   ├── batch.rs                # partition, permissions
│   │   └── mirror.rs               # workspace_map, tool result format
│   ├── context/
│   │   ├── mod.rs
│   │   ├── inject.rs               # blocs system par tour
│   │   └── transcript.rs
│   ├── closure.rs                  # fin run, persist
│   └── todo_gate.rs
│
├── state/                          # ex-architect_state
│   ├── mod.rs                      # ArchitectRunState + re-exports
│   ├── fields.rs                   # struct + Default + tuning
│   ├── snapshot.rs                 # refresh / inject snapshot
│   ├── todos.rs                    # todo_statuses, focus, plan
│   ├── workspace.rs                # paths, scope, map loaded
│   └── rail_wire.rs                # pont vers RunRailState (mince)
│
├── rail/                           # ex-run_rail (nom court, même spec)
│   ├── mod.rs
│   ├── state.rs
│   ├── policy.rs                   # tool_allowed par station
│   ├── transition.rs
│   ├── pre_gate.rs
│   ├── infer.rs
│   ├── snapshot_block.rs
│   ├── boot.rs
│   ├── nudges.rs                   # nudges rail-only (stall ACT)
│   └── …                           # fichiers existants < 300 lignes conservés
│
├── gates/
│   ├── mod.rs
│   ├── done.rs                     # answering, todos, professor
│   ├── tool_pre.rs                 # pre_gate mutation / explore
│   └── record.rs                   # orchestration_record_successful_tool
│
├── nudges/
│   ├── mod.rs
│   ├── stall_act.rs
│   ├── done_only.rs
│   └── schema_error.rs
│
├── stream/
│   ├── mod.rs
│   ├── consume.rs                  # consume_stream, phase markers
│   └── loop_detect.rs              # LoopDetector (réduit ou supprimé)
│
├── phases.rs                       # UI legacy stream — < 200 lignes cible
├── edit_start.rs
├── final_answer_guard.rs
│
└── tests/
    ├── mod.rs                      # mod drive; mod gates; …
    ├── drive.rs
    ├── gates.rs
    ├── rail.rs
    ├── state.rs
    └── tools.rs
```

**Hors `agent/` (chantier limité 1.4.0)** :

| Fichier | Action |
|---------|--------|
| `orchestration_delegate.rs` | DEL |
| `orchestration/tuning/mod.rs` | Split si flags rail/delegate nettoyés |
| `compaction.rs` | Report 1.4.1 sauf si bloquant |

---

## Découpage `drive.rs` (1717 → ~6 fichiers)

Ordre de lecture du flux :

```text
drive/mod.rs          → for iteration { … }
  boot.rs             → une fois au démarrage
  iteration_start.rs  → rail pre-tour, snapshot, specs filtrés
  llm_turn.rs         → appel LLM + stream
  post_assistant.rs   → pas de tools : gates, nudges, done
  tools/execution.rs  → tool_calls (déjà extrait partiellement)
```

Chaque fichier **ne connaît** que les helpers du même dossier ou `state/`, `rail/`, `gates/`, `nudges/`.

---

## Découpage `architect_state.rs` (1434 → ~5 fichiers)

| Module | Contenu |
|--------|---------|
| `fields.rs` | `ArchitectRunState`, `Default`, constructeurs |
| `snapshot.rs` | `refresh_architect_run_snapshot`, `inject_*`, format bloc |
| `todos.rs` | statuts todo, focus, labels plan |
| `workspace.rs` | `normalize_workspace_path`, `path_matches_scope` |
| `rail_wire.rs` | accesseurs `state.rail` pour drive |

Champs **delegate / segment / deliverable** : supprimés Phase 2 — ne pas migrer vers de nouveaux fichiers.

---

## Convention de nommage

| Élément | Convention |
|---------|------------|
| Dossier | `snake_case`, singulier ou pluriel selon domaine (`gates`, `state`, `loop`) |
| Fichier | verbe ou nom domaine : `boot.rs`, `done.rs`, `stall_act.rs` |
| `pub` | Minimiser — `mod.rs` ré-exporte ce que `drive` / wire ont besoin |
| Commentaire module | 3–5 lignes en tête : responsabilité + lien `SQUELETTE.md` si guide |

---

## Intégration au plan d’attaque

| Phase | Travail structure |
|-------|-------------------|
| **1** Prompt | Pas de split (prompts MD) |
| **2** Multi-modèle | Supprimer fichiers entiers ; **ne pas** split ce qui part |
| **3** Guide 1.3 | **Split drive + gates + state** en même temps que l’élagage |
| **4** Rail interne | Logique dans `rail/` + `loop/drive/iteration_start.rs` (filtre specs) |
| **5** Validation | **T0.4** : audit lignes (voir [09-TEST-PLAN](09-TEST-PLAN.md)) |

**Ordre recommandé Phase 3** :

1. Créer arborescence vide + `mod.rs`
2. Déplacer code **sans** changer comportement (tests verts)
3. Couper branches mortes (delegate, nudges)
4. Re-mesurer lignes

---

## Critère done structure

- [ ] Aucun `.rs` sous `agent/` > 500 lignes
- [ ] `tests/mod.rs` < 80 lignes
- [ ] `cargo test -p drox-engine` vert après chaque split
- [ ] [moteur/02-boucle-agent](../moteur/02-boucle-agent/README.md) mis à jour avec nouvelle arborescence

---

## Anti-patterns à éviter

| ❌ | ✅ |
|----|-----|
| `utils.rs` fourre-tout 800 lignes | `gates/done.rs` + `gates/tool_pre.rs` |
| `include!("drive.rs")` 1700 lignes | sous-module `loop/drive/` |
| Nouveau fichier `misc.rs` | nommer par responsabilité |
| Split avant suppression delegate | DEL d’abord, split ensuite sur code restant |
