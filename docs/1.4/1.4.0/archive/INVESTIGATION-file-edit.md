# Investigation — `file_edit` payload vide (C9)

**Parent** : [README](README.md) · **Statut** : en cours (Phase 0)

---

## Symptôme (dogfood `chat.txt`)

Le modèle émet `file_edit` ; l’UI affiche « → Edited » ; le client répond :

```text
file_edit: input requires `path` or `file_path` (string) and `edits` (array)
```

Erreur produite par `parseFileEditInput` (`droxFileEdit.ts`) — le payload RPC est vide ou incomplet.

---

## Chaîne d’exécution

```text
LLM stream → PendingToolCall.arguments (drox-engine agent_stream)
  → Tool::execute (RemoteTool)
  → JSON-RPC tool/exec → IDE normalizeClientToolInput → parseFileEditInput
```

---

## Hypothèses

| # | Cause possible | Vérification |
|---|----------------|--------------|
| H1 | Modèle envoie `tool_call` sans `arguments` / `{}` | Log moteur `RemoteTool` (livré Phase 0) |
| H2 | Arguments tronqués en streaming (gros `new_string`) | Comparer `ToolStart` event vs `tool/exec` input |
| H3 | Normalisation IDE insuffisante | Log si `normalizeFileEditToolInput` ne produit pas `path`+`edits` |
| H4 | Modèle place le patch dans le texte, pas dans le JSON tool | Transcript UI step sans JSON visible |

---

## Instrumentation Phase 0

| Zone | Fichier | Action |
|------|---------|--------|
| Moteur | `drox-cli/.../remote_tool.rs` | `warn!` si `file_edit` sans path/edits |
| IDE | `droxClientTools.ts` | (Phase 0b) log Output channel si parse échoue avec input brut |

---

## Prochaines étapes

1. Reproduire sur modèle dogfood avec logs **Output → Drox Engine** activés `debug`.
2. Si H1 confirmé : pre-gate moteur avant `tool/exec` + nudge schéma (Phase 1 rail).
3. Si H2 : limite taille patch / segment ACT (Phase 3).
