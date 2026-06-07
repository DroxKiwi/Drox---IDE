# Drox 1.3.5 — Index, graphe, fast path

**Statut** : **planifié** (après [1.3.4](../1.3.4/README.md))  
**Prérequis** : package fiable ([1.3.3](../1.3.3/README.md)), moteur testé ([1.3.4](../1.3.4/README.md))

---

## En une phrase

Trois piliers contexte & latence : **index local** au curseur, **graphe** typé injecté au boot, **fast path** complétion hors boucle architecte.

---

## Piliers

| Pilier | Résumé |
|--------|--------|
| **P1** | Index / ContextPack (~5 fichiers pertinents) |
| **P2** | GraphContext (imports, callers, tests) |
| **P3** | Fast path complétion (`completion.run`) |
| **P4** | Benchmark hardware & presets par modèle |

---

## Liens

- [Plan détaillé](PLAN-1.3.5.md)
- [1.3.4 — stabilisation](../1.3.4/README.md)
- [1.3.3 — release fiable](../1.3.3/README.md)
- [Conducteur moteur (base)](../1.3.2/CONDUCTEUR-CODE.md)
- [Hub 1.3](../README.md)
