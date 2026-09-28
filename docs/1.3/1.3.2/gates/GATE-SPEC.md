# Spécification — Gate (format fichier + API moteur)

## 1. Qu’est-ce qu’une gate ?

Une **gate** est un nœud de décision dans un arbre. L’**Architecte** (tour LLM court, sans outils métier) reçoit :

- la **question** de la gate ;
- les **branches** possibles (chacune avec critère + impact) ;
- les **bulles de contexte** autorisées pour ce tour (`context.bubbles`).

Le moteur parse la réponse, enregistre le passage dans le **journal**, et exécute la **transition** (`switch` version IA).

> Les gates **bloquantes** actuelles (`tool_pre_gate`, `e_none`, …) restent : elles verrouillent l’exécution **après** ouverture d’une branche.

---

## 2. Fichier gate — `*.gate.toml`

Un gate = un fichier dans `gates/` (ou `workspace/.drox/gates/` plus tard).

```toml
# gates/entry.discuss_edit.gate.toml
id = "entry"
version = 1
role = "architect_gate"   # tour LLM dédié ; pas de tools sauf si listés
kind = "exclusive"        # exclusive | boolean | sequential

[question]
en = """
Given the user message below, which run mode must open?
Reply with JSON only — no markdown, no tools.
"""

[[branch]]
id = "architect_discuss"
label.en = "Discussion — no repository mutations"
open_when.en = "User expects reflection, greeting, design chat, or facts without applying changes."
impact.en = "Opens discuss run: read-only tools only if a later gate allows; no todo_write or delegate_executor."
response = { open = "architect_discuss" }   # attendu dans le JSON modèle

[[branch]]
id = "architect_edit"
label.en = "Edit — repository work"
open_when.en = "User expects files, config, commands, or deliverables changed in the workspace."
impact.en = "Opens edit run: plan, delegate_executor, phases."
response = { open = "architect_edit" }

[response_schema]
type = "exclusive_open"   # voir §3
required_field = "open"
allowed_values = ["architect_discuss", "architect_edit"]

[context]
# Bulles injectées dans le prompt gate (ordre = assemble)
bubbles = ["last_user_message", "gate_menu"]  # gate_menu = branches ci-dessus rendues

[engine]
default_branch = "architect_discuss"   # JSON invalide / retry épuisé
max_attempts = 2
skip_when.rpc_mode = ["discussion", "action"]  # Auto uniquement
```

### Champs

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| `id` | oui | Identifiant stable (`entry`, `discuss.needs_repo_facts`, …) |
| `kind` | oui | `exclusive` (un `open`), `boolean` (`true`/`false`), `sequential` (enchaînement moteur) |
| `branch[]` | si exclusive | Branches avec `id`, texte, `response` attendu |
| `response_schema` | oui | Validateur moteur |
| `context.bubbles` | oui | Liste d’ids de bulles (registre) |
| `engine.default_branch` | non | Repli |
| `engine.max_attempts` | non | Retries parse |

---

## 3. Schémas de réponse JSON

### `exclusive_open` (ENTRY)

```json
{ "open": "architect_discuss" }
```

### `boolean` (sous-gate)

```json
{ "gate": "discuss.needs_repo_facts", "value": false }
```

### Validation moteur

1. Extraire JSON (premier objet `{…}` dans la réponse).
2. Valider contre `response_schema`.
3. Écrire journal : `{ "type": "gate_pass", "gate_id", "branch", "raw", "ts" }`.
4. `transition(branch)` → prochain gate id ou `start_run(discuss|edit)`.

---

## 4. API code (cible Rust)

```text
GateRegistry::load(dir) -> Registry
Registry::get(id) -> GateDef

GateEngine::evaluate(ctx, gate_id) -> GateOutcome
  ctx: GateContext { run_id, journal, bubble_resolver, llm, user_message_sanitized }

GateOutcome::Branch(branch_id)   // enchaîner gate.transition.next
GateOutcome::StartRun(RunKind)   // discuss | edit
GateOutcome::Retry(reason)       // re-prompt gate
```

**`switch` IA** dans le code métier :

```rust
match gate_engine.evaluate(ctx, "entry")? {
    GateOutcome::StartRun(RunKind::Discuss) => drive_discuss(...),
    GateOutcome::StartRun(RunKind::Edit) => drive_edit(...),
    GateOutcome::Branch(next) => gate_engine.evaluate(ctx, &next)?,
    ...
}
```

Les fichiers TOML sont la **source de vérité produit** ; le code ne duplique pas les questions en chaînes Rust (sauf tests).

---

## 5. Arbre MVP (v1)

```text
entry (exclusive)
├── architect_discuss → discuss.needs_repo_facts (boolean)
│                      → [discuss.needs_history] (boolean, optionnel)
│                      → START discuss
└── architect_edit → edit.has_concrete_goal (boolean)
                     → edit.requires_visible_plan (boolean)
                     → … (gates futures)
                     → START edit
```

Chaque nœud = un fichier `*.gate.toml` + champ `transition.next` optionnel :

```toml
[transition]
on_branch.architect_discuss = "discuss.needs_repo_facts"
on_branch.architect_edit = "edit.has_concrete_goal"
```

---

## 6. Relation UI « ctx » coin inférieur droit

La jauge affiche le **budget du tour en cours** (bulles réellement injectées + messages tour), pas le stock journalisé.

Le journal + bulles `historic()` comptent dans la catégorie **narrative** du budget global (voir CONTEXT-BUBBLES.md).

---

## 7. Gates edit in-run (checkpoints ↔ `EditTier`)

La **phase edit** est alignée sur des gates TOML **ajoutables une par une** après le routage pré-run.

| Concept | Détail |
|---------|--------|
| Palier | `EditTier` (`e_none`, `e_plan`, …) — résolu par `architect_edit_tier()` + `ArchitectRunState` |
| Checkpoint | Gate `edit.<name>` — tour LLM court aux **frontières** de palier |
| Cartographie | [EDIT-GATES-MAP.md](EDIT-GATES-MAP.md) |
| Code | `EditGateCheckpoint`, `EditGateTrigger`, `StartRunKind::edit_tier_hint_at_run_start()` |

**Transitions TOML in-run** : en plus de `START_RUN.*`, le moteur pourra interpréter des cibles `CHECKPOINT.edit.*` (effet Rust, pas un second arbre LLM) — voir EDIT-GATES-MAP §5–6.

L’implémentation dans `loop.rs` (`OnTierEnter`, registre gate optionnel) est **phase suivante** ; les ids et triggers sont figés dans `gate_engine/edit_checkpoint.rs` pour éviter la dérive des noms.
