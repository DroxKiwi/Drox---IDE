# 03 — Stations (outils, règles, depth)

**Parent** : [README](README.md) · **Prérequis** : [02-RAIL-PROTOCOL.md](02-RAIL-PROTOCOL.md) · **Suite** : [04-SEGMENTS.md](04-SEGMENTS.md)

---

## Tableau synthèse

| Station | Outils principaux | `todo_write` | Mutations | Segment ? |
|---------|-------------------|--------------|-----------|-----------|
| `INTENT` | aucun (réflexion) | non | non | non |
| `READ` | read, grep, glob, lsp, map | non | non | non |
| `PROPOSE` | aucun mutation ; texte user | non | non | non |
| `PLAN` | `todo_write`, `architect_help` | **oui** | non | non |
| `ACT` | `file_edit`, `file_write`, `bash`, … | mise à jour todos | **oui** | **oui** si tâche lourde |
| `VERIFY` | bash, lsp, read ciblé | non | non* | optionnel |
| `ANSWER` | aucun (texte final) | non | non | non |

\* Pas de réécriture complète en VERIFY sauf rollback explicite (Phase 3).

Allowlist exacte : `run_rail/policy.rs` (source de vérité code). Ce tableau est le **contrat produit**.

---

## Détail par station

### INTENT

- **But** : qualifier la demande ; premier `hold` ou `advance`.
- **Candidate (A)** : `READ`.
- **Outils** : aucun (aligné discussion reply-only si hold immédiat).
- **Gate** : si hold → saut `ANSWER` ; pas de `todo_write` possible.

### READ

- **But** : faits repo, pas d’opinion longue sans synthèse.
- **Candidate (A)** : `ACT` si depth `short` ; `PROPOSE` si depth `complex` (voir [10-DECISIONS-PRODUIT.md](10-DECISIONS-PRODUIT.md) C1/C5).
- **Outils** : allowlist lecture architecte actuelle.
- **Compteur** : relecture même fichier → strike (réutiliser pattern `loop_intervention`, compteur dans `RunRailState`).

### PROPOSE

- **But** : proposition visible user (palette, architecture, options).
- **Candidate (A)** : `PLAN` si depth `complex` ; sinon `ACT`.
- **Outils** : **aucune mutation**.
- **Hold complex** : si texte contient question explicite (« tu valides ? ») → moteur refuse `advance` vers `PLAN`/`ACT` jusqu’au **prochain message user** (pas `ask_user_question` obligatoire).

### PLAN

- **But** : engagement — `todo_write` active gates sanity / testing existantes.
- **Candidate (A)** : `ACT`.
- **Outils** : `todo_write`, `architect_help`, lecture si besoin d’affiner le plan.
- **Gate** : forme payload (`architect_todo_gate` existant).

### ACT

- **But** : livrer les mutations.
- **Candidate (A)** : `VERIFY` (obligatoire si mutation code — gate testing existante).
- **Outils** : allowlist mutation architecte solo.
- **Segment** : si todo item lourd ou fichier > seuil → spawn segment ([04](04-SEGMENTS.md)).
- **Circuit breaker** : 2× échec même path ou 2× `file_write` même path → hold forcé + message user.

### VERIFY

- **But** : preuve que le livrable tient.
- **Candidate (A)** : `ANSWER`.
- **Outils** : bash, lsp, read ; `cycle_sanity` attaché ici (pas READ).
- **Gate** : `testing_after_code_mutation` existant conservé.

### ANSWER

- **But** : clôture user-facing.
- **Candidate** : aucune.
- **Gates** : `done_requires_answering`, todos, etc. (existants).

---

## Depth : short vs complex

| | `short` | `complex` |
|---|---------|-----------|
| **Défaut** | oui | non |
| **Déclencheurs complex** | — | modèle **`[depth: complex]`** uniquement (pas d’heuristique mots-clés moteur) |
| **Chemin typique** | INTENT → READ → ACT → VERIFY → ANSWER | … → PROPOSE → PLAN → ACT → … |
| **Hold PROPOSE** | rare | si question ouverte au user |

Déclaration modèle (optionnelle, une fois par run) :

```text
[depth: complex]
```

Parser : `run_rail/state.rs` (même pattern que `ArchitectWorkMode`).

---

## Chemin court vs long (exemples mode A)

### « Salut »

```text
INTENT --hold--> ANSWER
```

### « Prends connaissance du repo »

```text
INTENT --advance--> READ --hold--> ANSWER
```

### « Fix typo README »

```text
INTENT --advance--> READ --advance--> ACT --advance--> VERIFY --advance--> ANSWER
(PROPOSE et PLAN sautés via hold à READ ou advance direct selon depth short)
```

Note mode A strict : après READ, candidate = PROPOSE. Pour typo, le modèle fait `hold` à READ si assez d’info, ou `advance` en PROPOSE puis hold immédiat — **affiner en dogfood**. Alternative Phase 2 : candidate `READ` → `ACT` si depth short **sans** passer PROPOSE (ajustement policy, pas mode B).

**Décision provisoire** : si `depth: short`, candidate après `READ` = `ACT` (pas `PROPOSE`). Si `complex`, candidate = `PROPOSE`. Logique dans `transition.rs::next_candidate(station, depth)`.

### « Charte CSS abyss » (chat.txt)

```text
INTENT --advance--> READ --advance--> PROPOSE --hold(user)--> PLAN --advance-->
  ACT (segment globals.css) --advance--> VERIFY --advance--> ANSWER
```

---

## Station vs rôle RunSpec

| Existant | 1.4 |
|----------|-----|
| `RoleId::ArchitectDiscussion` | Rail raccourci (INTENT→ANSWER, reads optionnels) |
| `RoleId::Architect` | Rail complet |
| `RoleId::Executor` | Inchangé — utilisé **à l’intérieur** d’un segment ACT |

Le rail vit **au-dessus** du `RoleId` pour les runs architecte.
