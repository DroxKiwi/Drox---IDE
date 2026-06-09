# Ligne de version 1.4

**Branche git cible** : `1.4.0`  
**Prérequis** : [1.3.4](../1.3/1.3.4/README.md) clôturée (arrêt anticipé juin 2026)

---

## Sous-versions (juin 2026)

| Dossier | Périmètre | Statut |
|---------|-----------|--------|
| [**1.4.0/**](1.4.0/README.md) | **Run Rail** — moteur conducteur, segments | **Ouvert** — bloqué B-RAIL-01 |
| [**1.4.1/**](1.4.1/README.md) | **Stabilisation** — bugs dogfood moteur/session | Planifié |
| [**1.4.2/**](1.4.2/README.md) | **UI chat** — fil, replay, ask_user, blocs | Planifié |
| [**1.4.3/**](1.4.3/README.md) | Index local, graphe, fast path (ex-plan 1.4.1) | Planifié |

---

## En une phrase

**1.4.0** = moteur rail · **1.4.1** = bugs smoke · **1.4.2** = polish UI · **1.4.3** = index/graphe.

---

## Entrées rapides

**1.4.0 — Run Rail**

- [README](1.4.0/README.md) · [CLOSURE](1.4.0/finalisation/CLOSURE-1.4.0.md) · [SMOKE-BACKLOG](1.4.0/SMOKE-BACKLOG.md)
- [07-IMPLEMENTATION-PHASES](1.4.0/07-IMPLEMENTATION-PHASES.md) · [09-TEST-PLAN](1.4.0/09-TEST-PLAN.md)

**1.4.1 — Stabilisation** · [README](1.4.1/README.md) · [PLAN](1.4.1/PLAN-1.4.1.md)

**1.4.2 — UI chat** · [README](1.4.2/README.md)

**1.4.3 — Index & graphe** · [README](1.4.3/README.md) · [PLAN](1.4.3/PLAN-1.4.3.md)

---

## Séquence release

```text
1.3.4 clôturée
    → 1.4.0 tag (moteur rail validé)
        → 1.4.1 (bugs dogfood)
            → 1.4.2 (UI chat)
                → 1.4.3 (index/graphe)
```

---

## Liens transverses

- [1.3 — hub](../1.3/README.md)
- [chat dogfood](../1.3/chat_qwen27b.txt)
