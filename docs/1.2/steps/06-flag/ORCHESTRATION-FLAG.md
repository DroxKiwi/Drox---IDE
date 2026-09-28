# Orchestration 1.2.0 — feature flag (P2)

**Statut** : actif — `v1_2` exécute le pipeline **Architecte → exécutants → synthèse** (MVP P3).

---

## Modes

| Mode | Comportement |
|------|----------------|
| `legacy` | **Défaut** — boucle agent unique, `modelTier` low/medium (`RunSpec` legacy). |
| `v1_2` | Multi-rôles MVP : run **Architecte** (plan JSON) → N× **Exécutant** (séquentiel) → **synthèse** texte ; événements `RoleEnter`. |

---

## Configuration

**Priorité** (la plus forte gagne) :

1. Param JSON-RPC `orchestrationMode` sur `agent.run`
2. Variable d'environnement `DROX_ORCHESTRATION`
3. `legacy`

### Exemples

```powershell
# CLI / serveur moteur
$env:DROX_ORCHESTRATION = 'v1_2'
drox --serve
```

```json
{
  "method": "agent.run",
  "params": {
    "prompt": "…",
    "orchestrationMode": "v1_2"
  }
}
```

Valeurs acceptées pour `v1_2` : `v1_2`, `v1.2`, `v12`, `1.2`, `1.2.0`.

---

## Code

| Élément | Emplacement |
|---------|-------------|
| `OrchestrationMode`, `OrchestrationConfig`, plan/prompts | `drox-engine/src/orchestration/` |
| Wire `orchestrationMode` | `drox-cli/.../protocol.rs` → `AgentRunParams` |
| Branchement run | `drox-cli/.../handlers/agent_run.rs` (`legacy`) |
| Pipeline `v1_2` | `drox-cli/.../handlers/orchestration_run.rs` |

---

## IDE Nexus

Sans `orchestrationMode` dans `buildAgentRunParams`, le moteur reste en **legacy** (régression zéro).

Piste **PI** : `nexus.drox.orchestration.mode` → voir [PLAN-IDE-1.2.0.md](../10-ide/PLAN-IDE-1.2.0.md).

---

## Modèles par rôle (recyclage settings existants)

En `v1_2`, le moteur lit la **même config** que le chat legacy :

| Rôle | Setting Nexus (canonique) | Ancien nom | RPC `agent.run` |
|------|---------------------------|------------|-----------------|
| **Architecte** | `nexus.drox.architect.model` | `nexus.drox.model` | `model` |
| **Exécutant** | `nexus.drox.executor.model` | `nexus.drox.subagents.model` | `subagentsModel` |

**Exécutant vide** → même modèle que l’architecte (comportement historique sous-agents).

Repli moteur si tout est vide : `DROX_MODEL`, puis défauts `qwen3.5:9b` / repli architecte pour exécutant.

---

## Liens

- [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md) §5–6 (P2–P3)
- [VISION-ORCHESTRATION-MULTI-ROLES.md](../01-vision/VISION-ORCHESTRATION-MULTI-ROLES.md)
