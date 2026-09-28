# 02 — Boucle agent (cœur du moteur)

**Question** : que se passe-t-il **tour par tour** entre le LLM et les outils ?

**Cible 1.4.0** : arborescence découpée ≤ 500 lignes/fichier → [STRUCTURE-CODE](../../1.4.0/STRUCTURE-CODE.md).

---

## Rôle

Cœur runtime : construire les messages, appeler le LLM en stream, exécuter les tools, injecter nudges, décider de la clôture. **Tout** passe par `drive_inner`.

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `drox-engine/src/agent/core/agent.rs` | `Agent::run()` → lance la boucle |
| `drox-engine/src/agent/core/config.rs` | `AgentConfig` (prompt, tuning, rail, memory…) |
| `drox-engine/src/agent/loop/drive/` | **Boucle principale** (`mod`, `outcome`, `tools`) |
| `drox-engine/src/agent/loop/tool_execution.rs` | Exécution tools, pre/post gates |
| `drox-engine/src/agent/loop/context.rs` | Snip, compaction live, usage tokens |
| `drox-engine/src/agent/loop/transcript.rs` | Persistance messages |
| `drox-engine/src/agent/loop/closure.rs` | Fin run : summarize, persist |
| `drox-engine/src/agent/loop/todo_gate.rs` | Helpers todos |
| `drox-engine/src/agent/stream/` | `consume_stream`, phases stream, promotion UI |
| `drox-engine/src/agent/helpers/` | Specs tools, messages, erreurs |

---

## Un tour (simplifié)

```text
1. Injecter snapshots (architect, run_rail si actif — « Current action » + focus todo)
2. maybe_snip / compact si budget dépassé
3. Filtrer tool_specs par station rail (si actif) → llm.stream_chat
4. consume_stream → TurnOutcome { text, tool_calls, phases }
5. run_rail::after_assistant_turn (si rail)
6. Si [phase: done] + gates OK → closure
7. Si tool_calls vide → stall ACT / nudge → continue
8. Sinon → permissions → pre_gate → execute tools → tool_result → goto 1
```

---

## Règle de clôture

Fin **propre** = le modèle émet `[phase: answering]` puis `[phase: done]`.  
Les **gates** ([08-gates-nudges-etat](../08-gates-nudges-etat/README.md)) peuvent bloquer un `done` prématuré.

---

## Structure `agent/loop/`

Refactor récent : l’ancien `loop.rs` monolithique est découpé en modules liés par `include!` dans `loop/mod.rs` (visibilité `impl Agent` partagée).

---

## Liens

- [GUIDE-MOTEUR-DROX §phases](../../../0.0/guides/GUIDE-MOTEUR-DROX.md)
- [CONDUCTEUR-CODE](../../../1.3/1.3.2/CONDUCTEUR-CODE.md)
- Amont : [01-entree-wire](../01-entree-wire/README.md)
- Gates : [08-gates-nudges-etat](../08-gates-nudges-etat/README.md)
