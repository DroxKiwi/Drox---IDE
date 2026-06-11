# Drox 1.3.4 — Architecte seul

> Ligne 1.3 **archivée** — [CLOSURE-1.3](../CLOSURE-1.3.md)

**Statut** : **clôturée anticipément** (juin 2026) — branche `1.3.4` figée  
**Suite** : [archive 1.4.0 Run Rail](../../1.4/archive/1.4.0/README.md) — **pause dev** (juin 2026)  
**Clôture** : [CLOSURE-1.3.4.md](finalisation/CLOSURE-1.3.4.md)

---

## En une phrase

On a **désactivé les sub-agents** (`delegate_executor`) et recentré le moteur sur l'**Architecte** avec la **allowlist complète** — le code exécuteur reste en place pour les segments 1.4.0.

---

## Livré avant clôture

| Axe | Détail |
|-----|--------|
| **A** | `executor_delegation_enabled: false`, prompts solo, UI masquée — [RELIQUATS](RELIQUATS-ARCHITECTE-SEUL.md) |
| **S** | Partiel — tests auto verts ; TEST-PLAN solo non signé |

---

## Reporté → 1.4

| Sujet | Destination |
|-------|-------------|
| Refonte conducteur (run rail) | [1.4.0](../../1.4/archive/1.4.0/README.md) |
| Index / ContextPack | [1.4.1](../../1.4/1.4.1/README.md) (ex-1.3.5) |
| UI blocs repliables | [1.4.0 § UI](../../1.4/archive/1.4.0/06-UI-BLOCKS.md) |

---

## Réactiver les sub-agents (dev)

Preset **`custom`** + `engineTuning.executorDelegationEnabled: true`.

---

## Liens

- [CLOSURE](finalisation/CLOSURE-1.3.4.md)
- [PLAN](PLAN-1.3.4.md)
- [OPENING 1.4.0](../../1.4/archive/1.4.0/finalisation/OPENING-1.4.0.md)
- [Hub 1.3](../README.md) · [Hub 1.4](../../1.4/README.md)
