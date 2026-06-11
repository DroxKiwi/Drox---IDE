# 05 — Architecture code (maintenable)

**Parent** : [README](README.md) · **Suite** : [07-IMPLEMENTATION-PHASES.md](07-IMPLEMENTATION-PHASES.md)

---

## Objectifs structure

1. **Fichiers courts** — cible **< 250 lignes** par fichier Rust rail ; extraire dès dépassement.
2. **Un module, une responsabilité** — pas de logique rail dans `loop.rs` au-delà de 3 appels publics.
3. **Commentaires** — en-tête de module obligatoire ; fonctions publiques documentées ; renvoi vers doc `docs/1.4/archive/1.4.0/`.
4. **Patchabilité** — changer une station = éditer `policy.rs` + test associé, pas `loop.rs`.

---

## Arborescence Rust proposée

```text
drox-engine/src/agent/
├── run_rail/
│   ├── mod.rs              # exports, //! doc module + lien README 1.4.0
│   ├── station.rs          # enum RunStation, ordre, Display
│   ├── transition.rs       # hold/advance, next_candidate(mode A), depth
│   ├── policy.rs           # tools_allowed(station) → HashSet<&str>
│   ├── state.rs            # RunRailState { station, depth, strikes, ... }
│   ├── pre_gate.rs         # tool_pre_gate_rail(...) → Option<String>
│   ├── markers.rs          # parse [gate: hold|advance], [depth: complex]
│   ├── snapshot_block.rs   # texte injecté "## Run rail (engine)"
│   └── segment.rs          # spawn_segment, intégration orchestration_delegate
├── loop.rs                 # appels : rail_state.apply_turn(), rail_pre_gate()
├── gates.rs                # done gates — appelle rail pour station ANSWER
├── architect_state.rs      # conserve état orchestration ; rail_state séparé ou imbriqué
└── architect_gates.rs      # gates forme todo — inchangé Phase 1
```

### Taille estimée (Phase 2 complète)

| Fichier | Lignes max |
|---------|------------|
| `mod.rs` | 40 |
| `station.rs` | 80 |
| `transition.rs` | 120 |
| `policy.rs` | 150 |
| `state.rs` | 180 |
| `pre_gate.rs` | 100 |
| `markers.rs` | 80 |
| `snapshot_block.rs` | 60 |
| `segment.rs` | 200 |

---

## API publique `run_rail` (contrat interne)

```rust
// run_rail/mod.rs — signatures indicatives

/// État rail d'un run architecte (séparé de ArchitectRunState orchestration).
pub struct RunRailState { ... }

impl RunRailState {
    pub fn new_boot(station: RunStation, depth: RunDepth) -> Self;
    pub fn current_station(&self) -> RunStation;
    pub fn next_candidate_mode_a(&self) -> Option<RunStation>;
    pub fn apply_gate_marker(&mut self, marker: GateMarker) -> TransitionResult;
    pub fn tools_allowed(&self) -> &'static [&'static str];
    pub fn snapshot_block(&self) -> String;
}

/// Bloque un tool hors station — message erreur pour le modèle.
pub fn tool_pre_gate_rail(
    state: &RunRailState,
    tool_name: &str,
) -> Option<String>;

/// Parse marqueurs assistant (tour courant).
pub fn parse_rail_markers(text: &str) -> ParsedRailMarkers;
```

`loop.rs` n’importe que ces symboles + `RunRailState` dans la config agent ou `ArchitectRunState` wrapper.

---

## Intégration `loop.rs` (mince)

```text
// Pseudo-flow — pas de copier-coller massif

début tour:
  inject snapshot_block si station a changé

fin texte assistant (avant tools):
  parse gate markers → apply_transition

avant chaque tool:
  if let Some(err) = tool_pre_gate_rail(&rail, tool) { ... }

après mutation réussie:
  rail.record_mutation(path)

strike / circuit breaker:
  rail.strikes.on_tool_failure(tool, path) → maybe force hold
```

**Interdit** : `if tool == "file_write" && station == ...` dans `loop.rs` — tout dans `pre_gate.rs` / `state.rs`.

---

## Prompts

```text
orchestration/prompts/
├── system/blocks/edit/
│   └── 01_core_rail.md          # remplace progressivement 01_core_solo pour 1.4
└── segments/
    ├── execute.md               # brief segment ACT
    ├── verify.md
    └── README.md                # index 3 lignes
```

Règle : un bloc prompt = une station ou un chapeau ; **< 100 lignes**.

---

## Tests

```text
drox-engine/src/agent/run_rail/
├── transition.rs   # #[cfg(test)] mod tests
├── policy.rs
├── markers.rs
└── mod.rs          # tests intégration hold/advance séquence
```

Chaque fichier avec logique non triviale = tests unitaires colocalisés.

Commande CI : `cargo test -p drox-engine run_rail::`

---

## Commentaires code (norme)

### En-tête module (obligatoire)

```rust
//! Run rail — stations linéaires et transitions hold/advance.
//!
//! Design: `drox-engine/docs/1.4/archive/1.4.0/README.md`
//! Ne pas ajouter de gates ad hoc ici ; étendre `policy.rs` ou `transition.rs`.
```

### Fonctions publiques

```rust
/// Prochaine station candidate en mode A (successeur linéaire modifié par depth).
///
/// Retourne `None` en station `ANSWER`.
pub fn next_candidate_mode_a(station: RunStation, depth: RunDepth) -> Option<RunStation>
```

### Ce qu’on ne commente pas

- Code évident (getter, match enum simple).
- Historique de bug dans les commentaires — utiliser le commit / doc 08.

---

## Éviter la dérive (checklist PR)

- [ ] Aucun fichier `run_rail/*.rs` > 300 lignes ?
- [ ] `loop.rs` diff < 50 lignes hors tests ?
- [ ] Nouvelle règle outil → `policy.rs` + test ?
- [ ] Doc `03-STATIONS.md` mise à jour si tableau change ?
- [ ] Pas de duplication avec `architect_gates` — qui fait quoi documenté en tête de `pre_gate.rs` ?

### Séparation `architect_gates` vs `run_rail`

| Module | Rôle |
|--------|------|
| `run_rail/pre_gate.rs` | Station courante → outil autorisé ou non |
| `architect_gates.rs` | Forme payload `todo_write`, caps delegate legacy |
| `gates.rs` | Clôture `[phase: done]`, testing, professor |

---

## IDE (hors moteur, même release)

```text
src/vs/workbench/contrib/drox/
├── common/railSegmentTypes.ts      # types events
└── browser/chat/railSegmentBlock.ts  # bloc repliable
```

Détail : [06-UI-BLOCKS.md](06-UI-BLOCKS.md). Fichiers TS **< 200 lignes** ; logique rendu séparée des types.
