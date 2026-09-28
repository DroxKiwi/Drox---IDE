# AMB-04 — Noms modes IDE ≠ vocabulaire TUI / prompts

| | |
|--|--|
| **ID** | AMB-04 |
| **Sévérité** | P1 |
| **Surface** | IDE (labels/docs) |
| **Statut** | `fait` (labels) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

RPC déjà mappé (`analyze`→plan, `trustEdit`→acceptEdits, `imNotCrazy`→default) mais les descriptions IDE ne citaient pas le lexique TUI (`--plan` / `--apply` / default).

## Modifications

| Fichier | Changement |
|---------|------------|
| `droxAgentsPermissionModePicker.ts` | Descriptions avec équivalent TUI |
| `droxChatWebview.ts` | Mêmes clés `localize` (vignettes) |

Noms courts inchangés (Planifier / Trust Edit / I'm Not Crazy) — identité produit IDE.

### Dual surface (AMB-18)

- [x] Agents
- [x] Webview

## Acceptation

- [x] User voit le lien TUI dans l’aide du mode
