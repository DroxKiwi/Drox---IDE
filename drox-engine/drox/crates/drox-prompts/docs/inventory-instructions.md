# Inventaire des instructions LLM (catalogue)

Généré / mesuré via `cargo run -p drox-prompts --example inventory` (2026-10-10, post **P1+P2+P3**).  
Tokens ≈ `chars/4` (naïf). **Hors scope** : `params.system` IDE (rules, codebase, MEMORY plein texte).

Voir aussi [`injection-map.md`](injection-map.md) (canaux A–E).

## Volumes catalogue

| Audience | Entrées | Chars | ~tok |
|----------|---------|-------|------|
| Parent | 42 | 44 419 | ~11 100 |
| ToolSchema | 37 | 12 706 | ~3 180 |
| ExploreChild | 4 | 2 672 | ~670 |
| Compaction | 1 | 2 556 | ~640 |
| ModelQuestion | 1 | 943 | ~235 |
| **Total** | **85** | | |

### Blobs session (canal A) — toujours / toggles

| Id | Chars | ~tok | when |
|----|------:|-----:|------|
| `session.core` | **24 871** | **~6 220** | always |
| `session.subagents.explore` | 2 817 | ~700 | explore_enabled |
| `session.professor` | 2 583 | ~645 | professor |
| `session.native_thinking` | 1 387 | ~350 | native_thinking |
| `session.outside_ws.read` | 659 | ~165 | toggle |
| `session.outside_ws.write` | 480 | ~120 | toggle |

**Somme session.\*** (tous toggles on) ≈ **32 800 chars / ~8 200 tok**.

### Boot S2 typique (Explore + think + OWS read + **tous** tool descs)

≈ **42 440 chars / ~10 610 tok** catalogue seul — **avant** host IDE et historique.

### Top ToolSchema

| Id | Chars | ~tok |
|----|------:|-----:|
| `tools.task.description` | **1 773** | **~440** |
| `tools.todo_write.description` | 794 | ~200 |
| `tools.bash.description` | 629 | ~160 |
| `tools.explore_commit.description` | 611 | ~150 |
| … | | |

### Runtime / gates (canal B) — **pas tous à la fois**

Somme bodies `runtime.*` + `gates.*` ≈ **8 186 chars / ~2 050 tok** (catalogue).  
One-shot Prefer empilés sur un long run = dose perçue élevée — **P3** = delta situationnel seulement.

## Delta coupes 2026-10-10

| Blob / agrégat | Avant | Après | Δ chars |
|----------------|------:|------:|--------:|
| `session.core` (P2) | 25 671 | 24 871 | **−800** |
| `tools.task.description` (P1) | 2 442 | 1 773 | **−669** |
| `runtime.*`+`gates.*` (P3) | ~10 150 | **8 186** | **~−1 960** |
| dont `runtime.doc_ingestion` | 766 | 467 | **−299** |
| Boot S2 catalogue (A+C) | ~43 900 | ~42 440 | **~−1 460** |

## Canaux (rappel)

| Canal | Contenu |
|-------|---------|
| **A** | CORE + supplements session + index 1-ligne + **host IDE** |
| **B** | Situation card + frames turn-0 + rescues Prefer/MustText |
| **C** | Descriptions tools (toujours présentes si tool registered) |
| **D** | Classif boot one-shot |
| **E** | Explore enfant (`explore.system` + contrat kinds) |

## Concurrences / contradictions

| Thème | Qui dit quoi | Statut |
|-------|----------------|--------|
| **Plan→Assign→Merge** | Canon = `session.subagents.explore` ; CORE / `tools.task` / frames B = **pointeurs / delta** | ✅ P1+P2+P3 |
| **Après Explore** | merge via `artifacts_inline` / Prefer covered | ✅ **D3** C2 armé si truncated |
| **Spill** | Stub anti re-read spill | ✅ **D1** |
| **Lecture parent** | CORE / Explore : Prefer Explore | Soft heavy-read / rotating / covered = one-shot Prefer |
| **Acting** | FX-B hard sur `acting` sans tools | Post-`ask_user` : **aucun** frein « mutate now » (**D4**) |
| **Force text** | Beaucoup de `MustText` dans rescues | Tools restent libres (sauf blocks) |

## Cibles restantes

1. **P4** — découpe structurelle CORE (arbo n+1) si besoin lisibilité (pas prioritaire volume).
2. **Host IDE** — inventaire séparé (rules + codebase).
3. Recovery moteur **D2** (Explore fail) — hors volume prompts.

## Mesure

```bash
cd drox-engine/drox
cargo run -p drox-prompts --example inventory
```

Relancer après toute coupe de fiche ; mettre à jour ce fichier + `injection-map.md`.
