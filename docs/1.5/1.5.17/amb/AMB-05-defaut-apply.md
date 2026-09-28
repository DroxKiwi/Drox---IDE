# AMB-05 — Défaut apply : TUI opt-in vs IDE opt-out

| | |
|--|--|
| **ID** | AMB-05 |
| **Sévérité** | P0 |
| **Surface** | both (clarifier produit) |
| **Statut** | **fait** (clarté labels — défauts wire inchangés) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Défauts IDE (`applyEdits: true` sauf analyze) ≠ TUI `--apply` opt-in ; labels modes ne disaient pas « propose » vs « apply ».

## Décision produit

**Ne pas** changer `applyEdits: wireMode !== 'analyze'` en 1.5.17.  
Clarifier les descriptions mode (webview + Agents, mêmes clés nls).

---

## Modifications

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `browser/droxChatWebview.ts` | `droxChatMode*Desc` | Propose / Applies / Applies after confirm |
| `browser/agents/droxAgentsPermissionModePicker.ts` | mêmes clés | idem |

### Tests

- [ ] Smoke : vignettes / picker lisent apply vs propose

### Hors scope

- Aligner défaut numérique sur TUI opt-in

---

## Acceptation

- [x] Copy mode explicite apply vs propose
- [ ] Smoke manuel

## Notes

- Wire : `buildAgentRunParams` inchangé.
