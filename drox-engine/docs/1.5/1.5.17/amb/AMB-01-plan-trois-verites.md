# AMB-01 — Plan : trois vérités (moteur / transcript / widget)

| | |
|--|--|
| **ID** | AMB-01 |
| **Sévérité** | P0 (UI) · P1 (transcript) |
| **Surface** | IDE |
| **Statut** | **fait** (UI P0 + note system P1 + widget pendant run) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Trois sources de vérité : gates reset, vieux `todo_write` transcript, widget sticky.  
Sur Agents : le plan pouvait aussi rester **invisible pendant le run** (update `todoList` trop tard pour `setTodos` Copilot).

## Décision produit

- **P0** : force clear widget à `agent/done`.
- **P0bis** : `setTodos` à chaque `todo_write` réussi **pendant** le run.
- **P1** : note system one-shot au **prochain** `agent.run`.

---

## Modifications

### P0 UI Agents — fait

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `droxAgentsChatSink.ts` | `onAgentRunEnded` | callback fin de run |
| `droxAgentsChatSink.ts` | `onTodosUpdated` | alimente le widget à chaque `todo_write` |
| `droxAgentsSessionHandler.ts` | `setTodos` / clear | live + clear à done |
| `droxTodoExtract.ts` | `normalizeTodoId` | ids numériques (GLM) |

### P1 transcript — fait

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `common/droxPlanArchiveNote.ts` | **nouveau** | mark / consume one-shot |
| `droxAgentsSessionHandler.ts` | `onAgentRunEnded` | `markDroxPlanArchivedForNextRun` |
| `droxChatAgentEvents.ts` | `dispatchAgentDone` | mark session webview |
| `droxAgentRunBridge.ts` | `startDroxAgentRun` | préfixe `system` |

### Tests

- [x] Unit sink / plan archive / bridge / `onTodosUpdated` / ids numériques
- [ ] Smoke : plan visible pendant le run Agents
- [ ] Smoke : plan 5/6 → done → widget vide au tour suivant

### Hors scope

- Soft-clear Copilot global
- Snip transcript JSONL (plus lourd)

---

## Acceptation

- [x] Clear UI à done
- [x] Note system one-shot code
- [x] `setTodos` pendant run (code)
- [ ] Smoke manuel

## Notes

- Voir [PLAN-1.5.17.md](../PLAN-1.5.17.md).
