# Clôture 1.5.2 — Configuration moteur depuis l’IDE

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.2**  
**Statut** : **livré**

---

## Périmètre livré (code)

| # | Livrable | Statut |
|---|----------|--------|
| **M1** | Wire complet `agent.run` (sampling, `keepAlive`), panneaux Architecte / Général | ✅ |
| **M1** | Purge legacy 1.4 (`engine.tuning.*`, strictness, interaction mode) | ✅ |
| **M1** | Synchro live Settings ↔ vignettes chat | ✅ |
| **U1** | Popup nouveautés workbench + version chat cliquable | ✅ |
| **L3** | `droxVersion` 1.5.2 | ✅ |

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | `npm run drox:ship` Windows | ✅ |
| R2 | [Release `v1.5.2`](https://github.com/DroxKiwi/Drox---IDE---OR/releases/tag/v1.5.2) | ✅ |
| R3 | Manifeste `stable/latest.json` + `RELEASE_NOTES.md` | ✅ |
| R4 | Tag sources `v1.5.2` sur `main` | ✅ |
| R5 | PR [#2](https://github.com/DroxKiwi/Drox---IDE/pull/2) mergée (`main`) | ✅ |

**Installeur** : `Drox-IDE-Setup-1.5.2-win32-x64.exe` (~269 Mo)

---

## Reporté

| Sujet | Version |
|-------|---------|
| Diffs fil, UX user, composer, splash phosphore | [1.5.3](../1.5.3/PLAN-1.5.3.md) |
| Release Linux `.deb` + Authenticode | [1.5.4](../1.5.4/PLAN-1.5.4.md) |

---

## Liens

- [PLAN-1.5.2.md](PLAN-1.5.2.md)
- [SMOKE-1.5.2-CONFIG-MOTEUR.md](SMOKE-1.5.2-CONFIG-MOTEUR.md)
- [Hub 1.5](../README.md)
