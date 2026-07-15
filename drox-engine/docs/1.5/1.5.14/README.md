# Drox 1.5.14 — Clôture plan sans boucle

**Statut** : **ouvert** (`droxVersion` **1.5.14**)  
**Prérequis** : [1.5.13](../1.5.13/README.md) livrée · OR [`v1.5.13`](https://github.com/DroxKiwi/Drox---IDE---OR/releases/tag/v1.5.13)

---

## En une phrase

Corriger l’**abort systématique `loop detected`** quand le modèle tente de **clôturer le dernier item** d’un plan `todo_write` — sans régression sur les autres garde-fous anti-boucle.

---

## Périmètre

| # | Item | Priorité |
|---|------|----------|
| **L1** | Diagnostic + correctif moteur (`LoopDetector` × gates clôture) | **P0** |
| **L2** | Smokes repro + non-régression anti-boucle | **P0** |
| **L3** | Ajustement prompt / nudges clôture plan (si nécessaire) | P1 |
| *Reports 1.5.13* | MCP au run, perf, purge Copilot, nettoyage Tier A | P2+ |

Détail : **[PLAN-1.5.14.md](PLAN-1.5.14.md)** · **Implémentation L1** : [IMPLEMENTATION-L1-LOOP-DETECTOR.md](IMPLEMENTATION-L1-LOOP-DETECTOR.md)

---

## Symptôme prod (1.5.13)

Run avec plan **Todos (1/2)** : le modèle livre le correctif (ex. `file_edit`), résume en `[phase: answering]`, puis le run s’arrête avec :

```text
loop detected: model repeated the same both for 3 consecutive turns
```

Typiquement quand il reste **un seul item** `pending` / `in_progress` à cocher avant `[phase: done]`.

---

## Liens

- [PLAN 1.5.13](../1.5.13/PLAN-1.5.13.md) — reports S5–S16
- [CLOSURE 1.5.13](../1.5.13/CLOSURE-1.5.13.md)
- [Circuit gates / nudges](../../1.3/1.3.2/CIRCUIT-MOTEUR-GATES-NUDGES.md)
- [Hub 1.5](../README.md)
