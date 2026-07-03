# Clôture 1.5.13 — Stabilisation fenêtre Agents

**Date** : juillet 2026  
**Version** : `droxVersion` **1.5.13**  
**Statut** : **livré** (smokes T1–T3 + layout validés)

---

## Périmètre livré

| Pilier | Livrable | Statut |
|--------|----------|--------|
| **S1–S4** | Fil visible au switch session / dossier | ✅ |
| **S5-bis** | Boucle git observables (boot idle) | ✅ |
| **Sessions** | Send non bloquant, New sans héritage dossier | ✅ |
| **Layout** | Boot New Session + arborescence projets | ✅ |

---

## Smokes

| # | Scénario | Statut |
|---|----------|--------|
| T1 | Switch A → B → A + ProjectBar | ✅ |
| T2 | Nouveau dossier → discussion → fin réponse | ✅ |
| T3 | Relance app idle 2 min | ✅ |
| T-layout | Centre + sidebar au boot | ✅ |

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Commit branche `1.5.13` | ✅ |
| R2 | `npm run drox:ship -- -Force` Windows | ⏳ |
| R3 | Release `v1.5.13` + `stable/latest.json` | ⏳ |

---

## Liens

- [PLAN-1.5.13.md](PLAN-1.5.13.md)
- [SMOKE-1.5.13.md](SMOKE-1.5.13.md)
- [README 1.5.13](README.md)
- [Hub 1.5](../README.md)
