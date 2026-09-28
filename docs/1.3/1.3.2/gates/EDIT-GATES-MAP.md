# Cartographie — Phase edit ↔ Gates TOML

**Statut** : design d’alignement (implémentation des gates in-run **incrémentale**).  
**But** : chaque palier `EditTier` (`e_*`) correspond à un **checkpoint gate** nommé ; le moteur sait **quand** appeler `GateEngine::evaluate` sans dupliquer la logique de palier.

Specs : [GATE-SPEC.md](GATE-SPEC.md) · code : `drox-engine::gate_engine::edit_checkpoint`.

---

## 1. Deux familles de gates (inchangé)

| Famille | Quand | Rôle |
|---------|-------|------|
| **Routage** (`entry`, `discuss.*`, `edit.has_concrete_goal`) | Avant `agent.run` edit | Choisir discuss vs edit, reads, `START_RUN.*` |
| **Checkpoint edit** (`edit.*` in-run) | Pendant le run edit | Décision LLM courte aux **frontières** de palier ; journal + bulles ciblées |

Les **tool gates** (`architect_gates.rs`) restent la vérité dure sur les outils. Un checkpoint edit ne remplace pas `EditTier` : il **autorise ou retarde** une progression quand l’état seul est ambigu.

---

## 2. Alignement `StartRunKind` ↔ premier palier

| `StartRunKind` | Gate routage typique | Palier edit attendu au démarrage |
|----------------|----------------------|----------------------------------|
| `edit_e_none` | `edit.has_concrete_goal` → `false` | `EditTier::None` (`e_none`) |
| `edit` | `edit.has_concrete_goal` → `true` (ou chaîne future) | `e_plan` ou `e_none` selon `ArchitectRunState` |

Le moteur **ne force pas** le palier depuis le JSON gate seul après le premier tour : `architect_edit_tier()` recalcule à chaque itération. Le `StartRunKind` est un **hint initial** (objectif pas verrouillé vs travail concret).

---

## 3. Table `EditTier` ↔ checkpoint gate (cible)

| Palier | `wire_id` | Checkpoint gate (id TOML) | Statut | Trigger moteur (cible) |
|--------|-----------|---------------------------|--------|-------------------------|
| None | `e_none` | `edit.user_intent_clear` | **prod (LLM)** | Entrée palier `None` ou message user sans `run_objective_anchor` |
| Plan | `e_plan` | `edit.requires_visible_plan` | **prod (moteur)** | Sortie `None→Plan` ou map chargée sans `todo_write` |
| Discovery | `e_discovery` | `edit.ready_for_discovery` | planifié | `work_mode_anchor = Discovery` et todos pending |
| Delegate | `e_delegate` | `edit.ready_to_delegate` | **prod (moteur)** | Palier `Delegate` + plan visible dans journal |
| Verify | `e_verify` | `edit.verify_deliverable` | **prod (moteur)** | `has_unverified_work_delegate` |
| Sanity | `e_sanity` | — (optionnel) | — | Palier court ; tool gates suffisent souvent |
| Close | `e_close` | `edit.ready_to_close` | **prod (moteur)** | `run_fully_closable` |

Gate **déjà en prod (routage)** : `edit.has_concrete_goal` — booléen pré-run, aligné conceptuellement sur « suis-je en `e_none` ? ».

---

## 4. Règles d’or (implémentation future)

1. **Un checkpoint = un tour gate max** par transition de palier (pas à chaque itération LLM).
2. **`GateStep::NextGate` / booléen `false`** sur intention floue → rester en `e_none`, pas de `workspace_map_read` / mutation (déjà tool gates).
3. **Bulles par gate** dans le TOML (`context.bubbles`) — ex. `edit.user_intent_clear` : `last_user_message`, `historic` ; `edit.ready_to_delegate` : `run_snapshot`.
4. **Journal** : même format `gate_pass` ; le gate path UI montre routage + checkpoints in-run.
5. **Pas d’heuristique NLP** : déclencher sur `EditTier` + flags `ArchitectRunState`, pas sur regex du message user.

---

## 5. Exemple : intention utilisateur (`edit.user_intent_clear`)

```toml
# gates/edit.user_intent_clear.gate.toml (futur)
id = "edit.user_intent_clear"
kind = "boolean"

[question]
en = """
Is the user's intent clear enough to lock a work objective and continue planning?
If false: ask clarifying questions via ask_user_question — do not scan the repo yet.
Reply: {"gate":"edit.user_intent_clear","value":true|false}
"""

[context]
bubbles = ["last_user_message", "historic", "last_gate"]

[transition]
on_value.true = "CHECKPOINT.edit.plan_allowed"
on_value.false = "CHECKPOINT.edit.stay_none"

[engine]
default_value = false
```

**Moteur (futur)** : si `false`, ne pas avancer le « consentement » plan tant que l’utilisateur n’a pas répondu ; `EditTier::None` reste tant que `run_objective_anchor` absent.

---

## 6. Arbre cible (routage + in-run)

```text
[ROUTAGE — avant run]
entry → … → edit.has_concrete_goal → START_RUN.edit | edit_e_none

[IN-RUN — checkpoints, ajout petit à petit]
e_none     → edit.user_intent_clear (bool) → stay | plan_allowed
e_plan     → edit.requires_visible_plan (bool)
e_discovery→ edit.ready_for_discovery (bool)
e_delegate → edit.ready_to_delegate (bool) + run_snapshot
e_verify   → edit.verify_deliverable (bool)
e_close    → edit.ready_to_close (bool)
```

Les tokens `CHECKPOINT.*` sont des **cibles moteur** (pas des tours LLM) : le Rust applique l’effet ; seuls les nœuds `edit.*` sont des tours gate.

---

## 7. Code — points d’accroche

| Élément | Fichier |
|---------|---------|
| Ids checkpoint stables | `gate_engine/edit_checkpoint.rs` |
| Résolution palier | `orchestration/prompts/edit_tier.rs` |
| Hint démarrage edit | `StartRunKind::edit_tier_hint_at_run_start()` |
| Évaluation (futur) | `loop.rs` : `on_tier_changed(from, to)` → `GateEngine::evaluate_if_registered` |
| Registre TOML | `assets/gates/*.gate.toml` + copie `docs/.../gates/gates/` |

Ordre d’implémentation recommandé : `edit.user_intent_clear` → `edit.requires_visible_plan` → delegate / verify.
