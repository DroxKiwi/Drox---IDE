# Drox 1.4.1 — Stabilisation dogfood

**Statut** : **chantier actif** — au-dessus du squelette **[1.4.0](../1.4.0/archive/finalisation/CLOSURE-1.4.0.md)** clôturé  
**Branche** : `1.4.1`  
**Prérequis** : [OPENING-1.4.1](finalisation/OPENING-1.4.1.md) · [README racine](../../../../README.md#statut-produit)

---

## En une phrase

Stabiliser le moteur et la session après la refonte rail **1.4.0** : surface prod (`droxSurface`), discuss, busy, mutations ACT, boucles, VERIFY Windows, replay — **sans** polish UI chat (→ 1.4.2).

---

## Plan

→ **[PLAN-1.4.1.md](PLAN-1.4.1.md)** — contexte post-1.4.0 + **[tableau d’exécution § XIV](PLAN-1.4.1.md#xiv--tableau-dexécution-ordonné)** (phases 0→8)

L’ancien plan **index / graphe** est en **[1.4.3](../1.4.3/PLAN-1.4.3.md)**.

---

## Périmètre (backlog smoke)

| ID | Sujet | Phase |
|----|-------|-------|
| **B-REL-01** | `droxSurface` + features dev ; version prod sans suffixe | P1 |
| **M-DISC-01** | Salut discuss → outils interdits | P2 |
| **B-UI-07** | Run `busy` stale | P3 |
| **B-MOTOR-04** | Edit sans `file_edit` / clôture sans mutation | P4 |
| **B-MOTOR-01** | Préambules thinking en boucle | P4 |
| **B-MOTOR-03** | Double answering | P4 |
| **B-MOTOR-02** | Bash VERIFY Windows | P5 |
| **B-UI-06** | Replay session lent | P6 |
| **G-DEBT-01** | Split `loop/drive/tools.rs` (> 500 L) | P7 |

**1.4.2** : B-UI-01 à 05 · **reporté** : B-RAIL-01 résidu (`[gate:]` modèle)

Détail : [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md)

---

## Ordre d’attaque

```text
P1 droxSurface → P2 discuss → P3 busy → P4 boucles/ACT
  → P5 VERIFY → P6 replay → P7 dette → P8 smoke + clôture
```

---

## Suite

- [1.4.2 — UI chat](../1.4.2/README.md)
- [1.4.3 — Index & graphe](../1.4.3/README.md)
- [Hub 1.4](../README.md)
