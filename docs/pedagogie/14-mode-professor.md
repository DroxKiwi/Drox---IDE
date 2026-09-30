Rédigé à l'aide de Cursor Agent

# Mode professor — gates pédagogiques sur les écritures

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le mode **`professor`**. C’est un [mode de permission](06-permissions.md) + des **prompts** + des **gates** qui transforment le run en parcours d’apprentissage (leçon / exercice / review) plutôt qu’en agent libre de tout modifier.

Prérequis : [06](06-permissions.md), [07](07-phases-et-gates.md).

### L’histoire en une phrase

En professor, le modèle enseigne et fait travailler ; les **écritures** hors zone / hors étape d’exercice sont refusées par le moteur.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) | Gates runtime |
| [`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) | Variantes teach / exercise / review |
| [`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs) | Variant `Professor` |
| Tools | `course_plan_write`, etc. |

---

## Partie A — Permission + pédagogie

`PermissionMode::Professor` : les écritures ne sont autorisées que via les **gates** (zone de travail `workArea`, étape `exercise` / `checkpoint` active, selon implémentation).

Ce n’est pas seulement un prompt « sois gentil » : le Rust **bloque**.

---

## Partie B — Phases de cours (dans le prompt)

Le prompt professor parle de phases du genre :

| Phase | Idée |
|-------|------|
| `teach` / leçon | Expliquer, extraits commentés, **pas** de grosse mutation repo |
| `exercise` | Énoncé ancré dans le projet / `.drox/learn/…` |
| `review` | Corriger la réponse de l’apprenant |
| `done` | Attendre le prochain message humain |

Comme ailleurs : question à l’utilisateur → `done` et on attend (pas confondre un nudge moteur avec une réponse élève).

---

## Partie C — Outils de cours

`course_plan_write` et apparentés aident à structurer le parcours.  
Le détail évolue : lis `simple/course_plan_write.rs` et le prompt professor actuel.

---

## Partie D — Quand l’activer

- Ateliers, onboarding repo, enseignement.
- Pas le mode par défaut pour un chantier de prod urgent (`acceptEdits` / `default` plus adaptés).

Alias parsing : `professeur`, `teacher` → `Professor`.

---

## Récapitulatif

1. Professor = mode permission + prompt + gates.
2. But : apprendre **dans** le repo sans laisser l’agent tout réécrire.
3. S’appuie sur le même `drive_inner` que les autres modes.

Index : [README.md](README.md) · fin de la série numérotée actuelle.
