# AMB-08 — Propose / cancel = soft success (`isError: false`)

| | |
|--|--|
| **ID** | AMB-08 |
| **Sévérité** | P0 |
| **Surface** | both |
| **Statut** | **fait** (cancel → `isError: true`) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Le modèle reçoit un tool result « OK » alors que rien n’est écrit (cancel user) → avance le plan / boucle.

## Contrat TUI (cible)

Un write non appliqué (cancel) doit être un **échec outil** pour le modèle.

## Décision produit

- **Cancel** → `isError: true` + message `NOT applied to disk`.
- **Propose** (`applyFsWrites: false`) → inchangé (pas d’`isError` ; contrat propose volontaire).

---

## Modifications

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `electron-browser/tools/droxFileWriteTool.ts` | cancel branch | `isError: true` + `error: … NOT applied` |
| `electron-browser/tools/droxFileEditTool.ts` | cancel branch | idem |
| `electron-browser/tools/droxNotebookEditTool.ts` | cancel branch | idem |

### Tests

- [ ] Unit handler cancel (pas de harness host isolé) — smoke manuel
- [x] Propagation RemoteTool `isError` déjà couverte côté moteur

### Hors scope / non touché

- Chemin propose (`proposed: true`)
- Deny permission moteur (déjà `is_error: true`)

---

## Acceptation

- [x] Cancel confirm → tool error pour le modèle
- [ ] Smoke : refuse write → modèle ne complete pas le todo comme fait

## Notes

- Surfaces : Agents + webview (même handlers electron-browser).
