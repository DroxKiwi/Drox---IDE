# 10 — Événements & phases (UI)

**Question** : qu’est-ce que le moteur **émet** vers l’IDE, et comment la trace UI est structurée ?

---

## Rôle

Contrat **sortant** : stream d’`AgentEvent` consommé par le chat Drox pour afficher phases, tools, thinking, rail, erreurs.

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `drox-engine/src/event.rs` | `AgentEvent`, `Phase`, `StopReason` |
| `drox-engine/src/agent/agent_stream.rs` | Relais stream → events |
| `drox-engine/src/agent/phases.rs` | Marqueurs `[phase: …]`, visibilité UI rail |
| `drox-types/` | `Message`, `Role`, IDs tools |

---

## `AgentEvent` (extraits)

| Event | Usage UI |
|-------|----------|
| `PhaseEnter` / `PhaseClose` | Blocs repliables (reading, acting, …) |
| `TextDelta` | Stream assistant / thinking |
| `ToolStart` / `ToolFinish` | Lignes outil + résultat |
| `Stop` | Fin tour ou fin run |
| `LoopIntervention` | Bandeau anti-boucle |
| `ContextUsage` / `ContextCompacted` | Jauge #ctx |
| `RailStationEnter` / `RailStationDone` | Blocs rail 1.4.0 |
| `LoopIntervention` | Recentrage |

---

## Phases

| Phase | Visible user (typique) |
|-------|------------------------|
| `internal_reasoning` | Thinking replié (Ollama native) |
| `reading`, `acting`, `planning` | Trace exploration |
| `answering` | **Bulle principale** user-facing |
| `done` | Clôture run |

Avec **rail actif** : phases intermédiaires souvent **masquées** UI ; stations rail les remplacent partiellement.

---

## Chaîne jusqu’à l’IDE

```text
drive_inner
  → mpsc AgentEvent
  → drox-cli jsonrpc notifications agent/event
  → droxChatBridge (TypeScript)
  → droxChat media modules
```

---

## Liens

- [UI-PHASE1-CHAT-NATIF](../../../0.0/ide/UI-PHASE1-CHAT-NATIF.md)
- [CHAT-WEBVIEW-MODULES](../../../0.0/ide/CHAT-WEBVIEW-MODULES.md)
- [06-UI-BLOCKS](../archive/1.4.0/06-UI-BLOCKS.md) (spec rail UI)
- Entrée wire : [01-entree-wire](../01-entree-wire/README.md)
