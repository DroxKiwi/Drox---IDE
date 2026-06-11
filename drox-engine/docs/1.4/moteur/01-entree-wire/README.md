# 01 — Entrée & wire (CLI, JSON-RPC)

**Question** : comment une demande utilisateur devient un run moteur ?

---

## Rôle

Couche **transport** entre l’IDE (ou le terminal) et `drox-engine`. Pas de logique agent ici — assemblage de config, permissions, registry, puis appel `Agent::run`.

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `drox-cli/src/main.rs` | Binaire `drox`, modes CLI vs `--serve` |
| `drox-cli/src/jsonrpc/server.rs` | Serveur NDJSON |
| `drox-cli/src/jsonrpc/mod.rs` | Méthodes RPC exposées |
| `drox-cli/src/jsonrpc/handlers/agent_run.rs` | **`agent.run`** — construit `Agent` |
| `drox-cli/src/jsonrpc/handlers/orchestration_run.rs` | **`role_split`** discuss / edit |
| `drox-cli/src/jsonrpc/handlers/session.rs` | `session.list`, `session.read`, compact |
| `drox-cli/src/jsonrpc/remote_tool.rs` | Requête **`tool/exec`** vers l’IDE |
| `drox-cli/src/jsonrpc/handlers/initialize.rs` | Handshake, capacités |

---

## Flux `agent.run` (IDE)

```text
VS Code droxChatBridge
  → stdio NDJSON
  → agent.run { prompt, orchestrationMode, architectInteractionMode, … }
  → agent_run.rs : permissions, MCP, memory, ToolRegistry
  → si role_split : orchestration_run.rs
  → Agent::run() → stream AgentEvent
  → notifications : agent/event, agent/done
```

---

## Méthodes RPC principales

| Méthode | Handler |
|---------|---------|
| `initialize` | Capacités client/serveur |
| `agent.run` | Démarre un run |
| `agent.cancel` | Annule run en cours |
| `session.*` | Persistance transcript |
| `shutdown` | Arrêt propre |

---

## Remote tools

Les mutations fichier (`file_edit`, `file_write`, …) s’exécutent souvent **côté IDE** : le moteur envoie `tool/exec`, le client répond avec le résultat. Voir [04-tools](../04-tools/README.md).

---

## Liens

- [PROTOCOLE-JSONRPC](../../../0.0/architecture/PROTOCOLE-JSONRPC.md)
- [SMOKE-RPC](../../../0.0/operations/SMOKE-RPC.md)
- Suite : [02-boucle-agent](../02-boucle-agent/README.md)
