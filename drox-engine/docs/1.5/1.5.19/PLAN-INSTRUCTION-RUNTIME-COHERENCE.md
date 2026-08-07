# 1.5.19 — Cohérence instructions ↔ runtime (priorité)

**Statut** : **en cours** (1ʳᵉ vague de mensonges corrigée) · **Date** : 2026-07-26  
**Version** : on reste en **1.5.19** jusqu’à indication contraire.  
**Hors scope pour l’instant** : `run_complete`, soft-todo structurel, refonte des gates — **pas jugés**.

## Objectif

> À chaque moment du run, ce que le **modèle lit** doit décrire **exactement** ce que le **moteur applique**.

Déjà fait avant cette fiche : **E13**, **E14**.  
Vague cohérence (cette session) : **C-03 / C-04 / C-05 / C-06** traités côté texte + routage nudge.

---

## Les 3 canaux

| # | Canal | Quand |
|---|--------|-------|
| **A** | Contrat initial | `CORE_SYSTEM_PROMPT` + descriptions outils |
| **B** | Refus synchrone | `Blocked:…` au tool call |
| **C** | Nudge / relance | Fin de tour LLM → nouveau tour |

---

## Table d’audit canal C (déclencheurs exacts)

Ordre d’évaluation dans `drive_inner` après un tour LLM (simplifié) :

```text
si final_phase == Done:
  → MISSING_ANSWERING / professor / unfinished_todos / CODE_MUTATION_TESTING / run_objective
  → sinon Stop
sinon si pas de tool_calls et intent-write:
  → INTENT_ONLY_WRITE_*
sinon LoopDetector Warn/Abort
sinon si pas de tool_calls:
  → si answering + todos fermés + testing DÛ → CODE_MUTATION_TESTING   ← corrigé
  → si answering + todos fermés + testing OK → DONE_ONLY
  → sinon NUDGE_PROMPT
sinon (il y a des tools) …
  → éventuellement ANALYZING / ask_user loop / step_by_step_todo
```

| ID | Constante | Déclencheur code | Relance | Cohérent A/B ? |
|----|-----------|------------------|---------|----------------|
| C-N1 | `MISSING_ANSWERING_PROMPT` | `done` sans aucun answering dans le run | oui | OK |
| C-N2 | `unfinished_todos_prompt` | `done` + todos pending/in_progress | oui | OK (texte clair) |
| C-N3 | `CODE_MUTATION_TESTING_NUDGE` | `done` **ou** answering sans done, si mutation code sans phase testing | oui | **Corrigé** : plus de DONE_ONLY qui mentait |
| C-N4 | `DONE_ONLY_NUDGE_PROMPT` | answering sans done + todos fermés + testing **pas** dû | oui | **Corrigé** : texte dit « gates déjà OK » |
| C-N5 | `NUDGE_PROMPT` | tour sans tools / sans done (cas générique) | oui | **Corrigé** : checklist ordonnée = ordre réel des gates |
| C-N6 | `step_by_step_todo_nudge` | ≥2 mutateurs depuis dernier todo + plan ouvert | oui soft | **Corrigé** : « mutating bash » + inspect-only ne compte pas |
| C-N7 | `INTENT_ONLY_WRITE_*` | prose d’écriture sans tool_calls | oui → abort | OK |
| C-N8 | `LOOP_DETECTED_NUDGE` | fingerprint répété (Warn) | oui | OK |
| C-N9 | `ANALYZING_PHASE_NUDGE` | analyse user + ≥2 exploration tools sans phase analyzing | oui | OK |
| C-N10 | `MUTATING_TOOL_BEFORE_TODO…` (**B**) | mutateur avant todo | non | OK post-E14 |
| C-N11 | `TODO_RECREATION_BLOCKED` (**B**) | recreate plan from scratch | non | OK |
| C-N12 | `PHASE_MARKER_MUST_BE_TEXT…` (**B**) | tool nommé done/phase | non | OK |

### Canal A — écarts

| ID | Sujet | Statut |
|----|-------|--------|
| C-01 / C-02 | inspect bash vs gate | ✅ E13 / E14 |
| C-06 | MEMORY « obligatoire » alors que le moteur ne refuse pas `done` | ✅ 7quater → *recommended, not engine-gated* |
| C-04 | « question → ONLY done » sans mentionner todos/testing | ✅ prompt aligné sur checklist |

---

## Correctifs livrés (cohérence, pas allègement)

| Fichier | Changement |
|---------|------------|
| `agent.rs` | Après answering sans `done` : si testing dû → `CODE_MUTATION_TESTING_NUDGE`, sinon `DONE_ONLY` |
| `agent.rs` | `NUDGE_PROMPT` = ordre réel des gates (answering → todos → testing → done) |
| `agent.rs` | `DONE_ONLY` précise que todos+testing sont déjà OK |
| `agent.rs` | `step_by_step_todo_nudge` : mutating bash + note inspect-only |
| `prompts.rs` | 7quater MEMORY non-gated ; question→done conditionné aux gates |

**Non changé** : sévérité des gates (todo avant mutate, testing sur mutation code, unfinished todos bloquent encore `done`).

---

## Smoke de validation

1. Rebuild `drox.exe` + reload.  
2. Tâche delete fichiers `.js` → answering sans done : le system reminder doit parler de **testing** (ou done seul si pas de mutation code), **pas** « ONLY done » puis surprise.  
3. Thinking du modèle : plus de « le système dit only done mais… ».  
4. MEMORY : le modèle peut skip sans que le moteur refuse `done`.

---

## Parking (toujours)

- `run_complete` outil  
- Soft-gate todo  
- Retirer testing / MEMORY hard  

---

## Historique

| Date | Note |
|------|------|
| 2026-07-26 | Fiche créée — priorité cohérence |
| 2026-07-26 | Audit + correctifs C-03…C-06 (routage nudge + textes) |
