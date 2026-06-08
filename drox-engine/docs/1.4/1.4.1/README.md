# Drox 1.4.1 — Index, graphe, fast path

**Statut** : **planifié** (après [1.4.0](../1.4.0/README.md))  
**Ancienne numérotation** : 1.4.1 (déplacée juin 2026)  
**Prérequis** : [1.4.0 Run Rail](../1.4.0/README.md) livré · package fiable [1.3.3](../../1.3/1.3.3/README.md)

---

## En une phrase

Trois piliers contexte & latence : **index local** au curseur, **graphe** typé injecté au boot READ, **fast path** complétion hors boucle architecte.

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

- [Plan détaillé](PLAN-1.4.1.md)
- [1.4.0 — Run Rail](../1.4.0/README.md)
- [Hub 1.4](../README.md)
- [Conducteur moteur (base)](../../1.3/1.3.2/CONDUCTEUR-CODE.md)
