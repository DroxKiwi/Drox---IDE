# SPEC — interfaces Run (couches B ↔ C)

**Version** : 1.2.0  
**Statut** : **P1 en cours** — types de base implémentés dans `drox-engine/src/run_spec/`  
**Parent** : [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md) · P0-1

---

## 1. Objectif

Définir le contrat stable entre :

- **C** (`FlowCoordinator`) — produit un `RunPlan`, consomme des `RunResult`, synthétise.
- **B** (`RunExecutor`) — exécute **un** `RunUnit` via la boucle `Agent` existante.

---

## 2. Types (à implémenter)

### 2.1 `RunSpec` (entrée B)

| Champ | Type | Notes |
|-------|------|-------|
| `spec_version` | `u32` | Commence à `1` |
| `run_id` | `String` | UUID |
| `parent_run_id` | `Option<String>` | Annulation cascade |
| `role_id` | `RoleId` | Voir §3 |
| `model_id` | `String` | Résolu par C |
| `system_prompt` | `String` | Assemblé par C |
| `user_prompt` | `String` | Mission du run (exécuteur : payload `delegate_executor` + `context`, jamais le chat parent) |
| `tool_allowlist` | `Option<Vec<String>>` | `None` = registre complet autorisé par permissions |
| `limits` | `RunLimits` | Voir §2.2 |

### 2.2 `RunLimits`

| Champ | Type |
|-------|------|
| `max_iterations` | `Option<u32>` |
| `max_tools_per_turn` | `Option<u32>` |
| `memory_budget_tokens` | `Option<u32>` |
| `max_subagent_depth` | `Option<u32>` |

### 2.3 `RunResult` (sortie B)

| Champ | Type |
|-------|------|
| `run_id` | `String` |
| `status` | `completed` \| `failed` \| `cancelled` |
| `summary` | `String` | Pour parent C — pas le transcript intégral |
| `error` | `Option<String>` |
| `stats` | `RunStats` | tokens, iterations, tools |

### 2.4 `RunPlan` (sortie C)

| Champ | Type |
|-------|------|
| `plan_id` | `String` |
| `units` | `Vec<RunUnit>` | Ordre ou parallèle — voir SPEC séquences |
| `parallel_groups` | `Option<Vec<Vec<usize>>>` | Indices dans `units` |

---

## 3. `RoleId`

```text
architect | conductor | executor
```

Extensible ; **B** ne branche pas sur ces valeurs sauf logging.

---

## 4. Traits (Rust)

```rust
// B — drox-engine
pub trait RunExecutor {
    fn run_unit(&self, spec: RunSpec) -> impl Stream<Item = AgentEvent>;
}

// C — drox-orchestration ou drox-engine/src/orchestration
pub trait FlowCoordinator {
    fn handle_user_turn(&self, turn: UserTurn) -> impl Stream<Item = AgentEvent>;
}
```

---

## 5. Mapping legacy (P1)

| `RunPolicy` | `RunSpec` |
|-------------|-----------|
| `RunPolicy::medium()` | `RunSpec::from_legacy_medium()` |
| `RunPolicy::low()` | `RunSpec::from_legacy_low()` |

Test obligatoire : champs limits + allowlist + prompts équivalents.

---

## 6. Exemple JSON `RunPlan` (illustratif)

```json
{
  "plan_id": "plan-uuid",
  "units": [
    {
      "role_id": "executor",
      "model_id": "qwen3:2b",
      "description": "Corriger typo recieve → receive dans README.md",
      "deliverable": "README corrigé",
      "instructions": "Ouvrir README.md à la racine, remplacer recieve par receive.",
      "scope": ["README.md"],
      "tool_allowlist": ["file_read", "file_edit"]
    }
  ]
}
```

---

## 7. Implémentation (P1)

| Élément | Fichier | Statut |
|---------|---------|--------|
| `RunSpec`, `RunLimits`, `RoleId` | `drox-engine/src/run_spec/mod.rs` | ✅ |
| `from_run_policy` / `to_run_policy` | idem | ✅ |
| `AgentConfig.run_spec` | `agent/mod.rs` | ✅ |

## 8. À compléter

- [ ] Signatures `RunExecutor` / `FlowCoordinator` (P2+)
- [ ] `model_id`, `system_prompt` dans `RunSpec` (orchestration)
- [ ] Sérialisation RPC debug
