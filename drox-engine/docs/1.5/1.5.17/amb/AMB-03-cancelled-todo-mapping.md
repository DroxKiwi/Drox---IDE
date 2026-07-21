# AMB-03 — `cancelled` → affiché `not-started` (Agents)

| | |
|--|--|
| **ID** | AMB-03 |
| **Sévérité** | P2 |
| **Surface** | IDE |
| **Statut** | `fait` |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Le widget Copilot n’a que `not-started` / `in-progress` / `completed`. Un todo moteur `cancelled` tombait silencieusement en `not-started`.

## Modifications

| Fichier | Changement |
|---------|------------|
| `droxAgentsChatSink.ts` → `mapDroxTodosToAgentsChatTodoList` | Suffixe ` · cancelled` dans le titre ; statut widget `not-started` |

### Dual surface (AMB-18)

- [x] Agents
- [x] N/A webview — webview a déjà `todo-cancel` / label Cancelled

## Acceptation

- [x] Annulation visible dans le widget sans faux « completed »
