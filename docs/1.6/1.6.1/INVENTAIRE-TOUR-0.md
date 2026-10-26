# Inventaire tour 0 — parent vs child (catalogue)

**Date** : 2026-10-20 · branche `1.6.1`  
**Méthode** : `cargo run -p drox-prompts --example inventory` depuis `drox-engine/drox`  
**Tokens** : `chars/4` (naïf). **Hors** `params.system` IDE (rules, MEMORY plein texte, map) — ça s’**ajoute**.  
**Carte canaux** : [`drox-prompts/docs/injection-map.md`](../../../drox-engine/drox/crates/drox-prompts/docs/injection-map.md)

Tour 0 = **premier appel LLM** d’un run, **avant** tout tool result.

## Photo (catalogue)

| Audience | Entrées | ~tok |
|----------|--------:|-----:|
| Parent (tout le catalogue, pas tout injecté d’un coup) | 46 | ~11 610 |
| ToolSchema (si **tous** les tools registered) | 37 | ~3 276 |
| ExploreChild (4 fiches, pas toutes au tour 0 child) | 4 | ~668 |
| Compaction (autre tour) | 1 | ~639 |
| ModelQuestion (canal D, RTT séparé) | 1 | ~235 |

### Blob parent toujours / souvent au boot (canal A)

| Id | ~tok | when |
|----|-----:|------|
| `session.core` | **~6 257** | always |
| `session.subagents.explore` | ~704 | Explore on |
| `session.native_thinking` | ~426 | think on |
| `session.outside_ws.read` | ~164 | toggle |
| `session.professor` | ~645 | professeur seulement |

**S2-ish** (work + Explore + think + hors-WS read + **toutes** les descs tools) : **~10 829 tok** catalogue, avant IDE et avant le message user.

Canal **B tour 0** (en plus, si classif work/docs) :

| Id | ~tok |
|----|-----:|
| situation card | petite, réécrite chaque tour |
| `runtime.work_plan_frame` | ~78 |
| `runtime.doc_ingestion` | ~116 (si docs) |

Canal **D** : ~235 tok classif, **tools off**, pas dans le fil agent.

### Child Explore — son propre tour 0 (canal E)

| Id | ~tok |
|----|-----:|
| `explore.system` | **~427** |
| Brief `description` | plafonné ~900 car. (~225 tok) |

L’enfant **ne voit pas** le CORE parent ni le chat. Il a `explore_commit` + inventory RO. Les 3 autres fiches ExploreChild (`report_synthesis`, fill kind, …) sont des **tours suivants** (cascade), pas le tour 0 d’exécution.

Schémas tools enfant : **sous-ensemble** (pas les 37) — non mesuré ici (JSON provider, pas le catalogue `tools.*` parent).

## Lecture (pourquoi le 9B parent souffre)

```text
Parent tour 0  ≈  11k tok règlement+tools  +  IDE  +  « fais le site »
Child tour 0   ≈  0,4k tok métier          +  brief étroit
```

Le **sous-run est déjà cheap**. Le **parent** paie ~15× plus de protocole **avant** d’avoir le droit de déléguer — et le gros morceau (`session.core` + `session.subagents.explore` + `tools.task`) **explique comment orchestrer**, ce qu’on veut que le moteur porte.

Top 3 parent always-on / S2 :

1. CORE MustText ~6,3k — phases, todo, testing, micro-cycle, MEMORY, skills, worktrees…  
2. **Toutes** les tool descs ~3,3k — y compris `task` (~443), bash, ask_user, session_*, course_plan…  
3. Supplement Explore Prefer ~704 — Plan→Assign→Merge **dans** le system parent

Le child n’a **pas** ce problème de volume. Le dogfood 1.6.0 (Explore OK, parent qui relit) est cohérent avec cette photo : l’enfant peut travailler ; le parent est saturé **dès le tour 0**.

## Hors photo (à ne pas oublier)

- Host IDE `params.system` : **non mesuré** — souvent le 2ᵉ plus gros après CORE.  
- JSON schemas tools réels (types, properties) > descriptions catalogue.  
- Historique : 0 au tout premier message d’une discussion ; >0 en continue.

## Implications 1.6.1 (pas encore des lots)

Aligné [CADRAGE](CADRAGE.md) : preset 9B ≠ éteindre Explore.

| Levier | Effet tour 0 parent | Effet child |
|--------|---------------------|-------------|
| Moteur porte Plan→Assign | Moins besoin du supplement + `tools.task` roman | Inchangé / encore plus étroit |
| Moins de tools **exposés au parent** | Coupe ~3k si on retire session_*/course/web… | Enfant garde grep/glob/read/commit |
| CORE allégé **parent only** | Coupe le 6k | Child a déjà son system |
| Preset cloud | Garde S2-ish ~11k | Optionnel |

**Ne pas** gonfler `explore.system` pour « aider » le 9B child — il est déjà le bon gabarit.

## Repro

```powershell
cd drox-engine/drox
cargo run -p drox-prompts --example inventory
```
