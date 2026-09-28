# Clôture 1.3.0 — Moteur & première release

**Date** : 2026-05-29  
**Suite** : distribution polish + MAJ in-app → [**1.3.1**](../../1.3.1/finalisation/CLOSURE-1.3.1.md)

---

## Moteur (lot 1.3.0)

| Livrable | Statut |
|----------|--------|
| Batch `delegate_executor` + `tasks[]` / `results[]` | ✅ |
| `maxParallelExecutors`, gate scopes disjoints | ✅ |
| `FailurePacket`, truth check post-délégation | ✅ |
| UI cartes exécuteur parallèles | ✅ |
| Guidance architecte `todo_write` | ✅ [MISE-A-JOUR-ARCHITECTE-TODO.md](./MISE-A-JOUR-ARCHITECTE-TODO.md) |

Réf. : [PLAN-IMPLEMENTATION-1.3.0.md](../steps/02-implementation/PLAN-IMPLEMENTATION-1.3.0.md).

---

## Distribution (partie 1.3.0)

| Phase | Statut | Notes |
|-------|--------|-------|
| F1 Build packagé | ✅ | Smoke chat, moteur embarqué |
| F3 Canal releases | ✅ | `v1.3.0` publiée, install testée depuis GitHub |
| F2 Installeur | 🟡 | Première build fonctionnelle — polish reporté **1.3.1** |
| F4–F5 MAJ in-app | ⬜ | Reporté **1.3.1** |

Réf. plan : [PLAN-DISTRIBUTION-LAUNCHER.md](./PLAN-DISTRIBUTION-LAUNCHER.md).

---

## Liens

- [RULES.md](../../../../RULES.md)
- [PATCHES-UPSTREAM-BUILD.md](./PATCHES-UPSTREAM-BUILD.md)
- Repo releases : `Drox---IDE---releases`
