# Squelette moteur 1.4.0 — recette unique

**Référence** : [FOI-REFONTE.md](FOI-REFONTE.md) (fait foi) · **Exécution** : [PLAN-ATTAQUE](PLAN-ATTAQUE.md)

Annexe recette produit — extrait de FOI § V. En cas de conflit, **FOI prime**.

---

## Principe fondateur

> Le moteur accompagne **un** modèle. La complexité est **interne** (filtrage, snapshot, bornes). Le modèle reçoit un **file conducteur simple** qu’il peut suivre sans arbitrer entre 8 systèmes parallèles.

---

## Rôles

| Rôle | Statut 1.4.0 |
|------|----------------|
| **Architect** (edit) | **Seul agent** — run rail complet |
| **ArchitectDiscussion** | Chemin **court** : lecture optionnelle + réponse, **sans** rail complet |
| **Executor** | **Supprimé** — hors contrat |
| **Standard / Professor** | **Supprimés** — REPORT post-1.4 (FOI § III.2) |

---

## Conducteur : run rail (seul paradigme)

### Séquence

```text
INTENT → READ → [PROPOSE] → PLAN → ACT → VERIFY → ANSWER
```

- **PROPOSE** : uniquement si `[depth: complex]` + hold user.
- Chemin court : `INTENT → READ → ACT → VERIFY → ANSWER` (sans PLAN obligatoire).

### Marqueurs modèle (seuls autorisés pour la conduite)

| Marqueur | Rôle |
|----------|------|
| `[gate: hold]` | Stopper la profondeur → aller vers ANSWER |
| `[gate: advance]` | Accepter la station candidate (mode A) |
| `[depth: short]` / `[depth: complex]` | Après READ |
| `[phase: answering]` | Texte user-facing |
| `[phase: done]` | Fin de run |

**Interdit comme langage de conduite** : `[phase: reading]`, `[phase: acting]`, `[phase: planning]`, `[phase: testing]` — retirés du prompt et non exigés par le moteur.

### Mode A (figé)

Le moteur propose **une** candidate = successeur linéaire. Pas de mode B en 1.4.0.

---

## Outils par station (moteur, pas le modèle)

Le moteur **filtre** `tool_specs` envoyés au LLM selon `run_rail::policy::tool_allowed` — le modèle ne voit pas les outils interdits.

| Station | Outils visibles (résumé) |
|---------|-------------------------|
| INTENT, PROPOSE, ANSWER | Aucun |
| READ | `file_read`, `grep`, `glob`, `lsp`, `workspace_map_read`, `web_*`, `memory_*` |
| PLAN | READ + `todo_write`, `architect_help` |
| ACT | READ + `file_edit`, `file_write`, `bash`, `notebook_edit`, … |
| VERIFY | `bash`, `lsp`, reads — pas de nouvelles mutations |

Référence code : `agent/run_rail/policy.rs`.

---

## System prompt (un seul bloc edit)

**Fichier cible** : `orchestration/prompts/system/blocks/edit/01_core_rail_solo.md` (à créer).

Contenu :

- Rôle architecte seul
- Séquence rail + marqueurs `gate` / `depth`
- `[phase: answering]` / `[phase: done]` uniquement pour la clôture
- Discipline ACT : « un tour = au moins un outil mutation ou `[gate: hold]` »
- Protocoles `T-*` : `todo_write`, `file_read`, **`file_write`**, **`file_edit`**, `bash` — pas `delegate_executor`

**Supprimés du boot** : `01_core.md`, `01_core_solo.md`, `parallel_slots.md`, `delegate_executor.md`.

---

## Snapshot moteur (chaque tour)

Deux blocs system max :

1. **`## Architect run (engine)`** — user request, plan/todos, **focus task**, pas de delegates
2. **`## Run rail (engine)`** — station, depth, candidate, **action attendue** (ex. « ACT · todo 1 · file_write `path` »)

Pas de nudge générique « continue » en parallèle.

---

## Mécaniques internes (invisible modèle)

| Mécanique | Rôle |
|-----------|------|
| Filtrage outils par station | Évite trial-and-error `pre_gate` |
| `pre_gate` | Filet si modèle contourne (erreur claire + action attendue) |
| Stall ACT | N tours sans mutation + todo `in_progress` → directive unique ou stop |
| `max_iterations` | Borne dure |
| Permissions / hooks | Inchangés (axe sécurité) |
| Contexte / compaction | Inchangés (axe mémoire) |

---

## Ce qui est explicitement hors squelette 1.4.0

| Élément | Statut |
|---------|--------|
| Segments ACT (option A) | **Supprimé** |
| `delegate_executor` | **Supprimé** |
| Explore `task` | **Supprimé** |
| Gates L1–L5 réactives 1.3 | **Réduites** (voir SUPPRESSIONS) |
| ~15 nudges | **Réduits** à 2–3 |
| `LoopDetector` empreinte | **Remplacé** par stall station |
| UI blocs rail polish | Reporté 1.4.2 |
| Outils d’aide avancés (index, graphe…) | Reporté post-squelette validé |

---

## Critère « squelette ancré »

- [ ] Un seul prompt edit rail solo en prod
- [ ] `run_rail_enabled` true par défaut preset normal
- [ ] Aucun chemin code actif vers Executor / segment / delegate
- [ ] Smoke site-kdds : plan + ≥1 mutation + verify + done
- [ ] `cargo test -p drox-engine` vert
- [ ] Aucun fichier `agent/**/*.rs` > 500 lignes ([STRUCTURE-CODE](STRUCTURE-CODE.md))
- [ ] [09-TEST-PLAN](09-TEST-PLAN.md) signé

Ensuite seulement : extensions (outils d’aide, UI, 1.4.1 bugs).
