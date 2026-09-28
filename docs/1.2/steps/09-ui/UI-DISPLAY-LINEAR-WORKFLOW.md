# UI — fil linéaire (thinking → work → answer)

**Statut** : en cours (Nexus webview)

## Problème

L’UI actuelle mélange plusieurs chemins (`Exploring`, promotion a posteriori, fil principal) : blocs qui apparaissent **après coup**, réflexion hors zone dédiée, gros dump dans la carte exécuteur.

## Modèle cible (une bande par run)

Ordre **strict** dans `#log` :

```text
… historique …
┌─ message utilisateur (bulle verte) ─────────────┐
└────────────────────────────────────────────────┘
┌─ drox-run-strip (réponse agent du tour) ───────┐
│ banner → plan → work → thinking → answer       │
└────────────────────────────────────────────────┘
```

Le strip est **inséré juste après** le message user du tour (`anchorRunStripAfterUser`). Les features sticky (`userPromptSticky`, objectif, etc.) ne changent pas.

**Multi-tours** : un strip par message user. À la fin du tour (`sealRunStrip`), le plan quitte le bandeau sticky et est archivé sous la réponse ; le strip suivant a son propre sticky. La réponse finale reste dans `.drox-run-answer` (pas de `ensureFinalAnswerIsLastOnLog` global).

| Section | Contenu | Source moteur |
|---------|---------|----------------|
| **plan** | `todo_write` + **verify architecte** (`file_read`, `grep`, …) | `todoUpdate`, outils read-only architecte |
| **work** | cartes exécuteur, mutations, `delegate_executor` | `subagentStart/Done`, tools exécuteur |
| **thinking** | deltas hors `[phase: answering]` | `text_delta`, phases lecture |
| **answer** | `[phase: answering]` uniquement | `phase: answering` |

## Carte Executor (dans `work`)

```text
Executor · t1  [Running|done]
  description (1 ligne)
  ├─ executor-stream-tools   ← file_edit, bash, … (ordre chronologique)
  ├─ executor-stream-thinking ← details replié, stream live
  └─ executor-stream-report   ← résumé court au done (pas le dump complet)
```

## Règles moteur (contrôle du modèle)

1. `todo_write` **avant** tout `delegate_executor`.
2. Architecte : exploration → `[phase: answering]` → `[phase: done]` — pas de prose méta dans answering.
3. Exécuteur (**Contrat A**) : `file_write` du livrable `.md` sous `.drox/agent-output/<task_id>/` → le moteur **auto-clôture** ; template stream `## Executor report` optionnel (voir [ARCHITECT-STATE-MACHINE.md](../08-architect-state/ARCHITECT-STATE-MACHINE.md)).

## Implémentation Nexus

| Fichier | Rôle |
|---------|------|
| `droxChat/07b-runTimeline.js` | Bande linéaire, désactive Exploring + promote |
| `droxChat/07-log.js` | Capture exécuteur tools / thinking / report |
| `droxChat/12-fileChange.js` | Diffs après le tool parent |
| `agent/gates.rs` | Gate `todo_write` avant `delegate_executor` |

## Hors scope (prochaine itération)

- Rejouer l’historique session sur le même modèle (replay).
- Mode `legacy` avec ancien bundle Exploring (flag explicite).
