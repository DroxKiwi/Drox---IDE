# Reliquats sub-agents — matrice architecte seul (1.3.4)

**Objectif** : documenter ce qui est **désactivé**, **dormant** ou **réactivable** quand `executor_delegation_enabled = false` (chemin produit 1.3.4).

---

## Drapeaux produit

| Couche | Flag | Défaut 1.3.4 |
|--------|------|----------------|
| Moteur | `EngineTuning.executor_delegation_enabled` | `false` (tous presets sauf override `custom`) |
| Moteur | `RunSpec.executor_delegation_enabled` | hérité du tuning |
| IDE | `DROX_EXECUTOR_DELEGATION_UI_ENABLED` (`droxOrchestrationUi.ts`) | `false` |

---

## Désactivé (ne s'exécute pas / invisible)

| Zone | Comportement solo |
|------|-------------------|
| Outil `delegate_executor` | Masqué (`RunSpec::tool_visible`) |
| Wire orchestration | Pas de `OrchestrationDelegateWireInput` |
| Prompt boot edit | `01_core_solo.md` — pas de `parallel_slots` ni bloc `delegate_executor.md` |
| Blocs outils `T-*` | Variantes `*_solo.md` via `tool_block_dual` |
| Nudges délégation | `ARCHITECT_DELEGATE_AFTER_*` ignorés (`architect_gates.rs`) |
| Nudges sanity / no-work | Variantes solo (`architect_cycle_sanity_*`, `architect_no_work_*`) |
| `architect_help` | Topics `delegate` / `verify` → `general` ; guidance solo |
| Snapshot run | Section « Last delegate » masquée ; plan sans dossier `.drox/agent-output/` |
| Checkpoint cycle | `cycle_checkpoint_block_solo` — pas de mention sub-agents |
| Sanity pending | Recommande `bash` direct, pas `delegate_executor` |
| Sanity résolution | `bash` avec `exit_code` enregistre passed/failed |
| UI chat | Vignette Executor absente |
| Settings IDE | `drox.executor.*`, `drox.subagents.*`, tuning délégation non enregistrés |
| RPC run | `subagentsModel` / `subagentsNumCtx` omis ; `orchestrationMaxParallelExecutors: 1` (ne pas envoyer `false` — bug corrigé juin 2026) |

---

## Dormant (code conservé, inactif par défaut)

| Zone | Fichiers / notes |
|------|------------------|
| Crate exécuteur, gates délégation | `orchestration/delegate_*`, `architect_gates.rs` |
| Prompts délégation | `delegate_executor.md`, `01_core.md`, variantes outils non-solo |
| Nudges délégation | `ARCHITECT_DELEGATE_AFTER_*`, `ARCHITECT_NUDGE_PROMPT` |
| `architect_help` délégation | `guidance_delegate`, `guidance_verify` |
| Checkpoint délégation | Branche complète `cycle_checkpoint_block` (flag `true`) |
| Settings masqués | Schémas toujours dans le repo ; filtrés à l'enregistrement |
| Tests délégation | Conservés derrière `executor_delegation_enabled: true` |

---

## Réactivation (dev / dogfood)

### Moteur

Preset **`custom`** + RPC :

```json
{
  "engineStrictness": "custom",
  "engineTuning": {
    "executorDelegationEnabled": true
  }
}
```

### IDE

1. `DROX_EXECUTOR_DELEGATION_UI_ENABLED = true` dans `droxOrchestrationUi.ts`
2. Rebuild workbench — vignette Executor + réglages délégation réapparaissent
3. `subagentsModel` / `orchestrationMaxParallelExecutors` repassent dans `buildAgentRunParams`

---

## Vérification rapide

```powershell
cd drox-engine\drox
cargo test -p drox-engine
cargo test -p drox-tools
```

Rechercher les fuites texte :

```powershell
rg "delegate_executor" drox-engine/drox/crates/drox-engine/src/orchestration/prompts/system/blocks/tools/*_solo.md
# → aucune occurrence attendue
```

---

## Liens

- [PLAN-1.3.4.md](PLAN-1.3.4.md)
- [CLOSURE-1.3.4.md](finalisation/CLOSURE-1.3.4.md)
