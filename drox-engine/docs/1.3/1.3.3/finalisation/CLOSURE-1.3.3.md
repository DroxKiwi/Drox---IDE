# Clôture 1.3.3 — release fiable (pipeline & package)

**Version** : `droxVersion` **1.3.3**  
**Statut** : **livré** — installeur OR publié, `latest.json` → 1.3.3 (juin 2026)

---

## Périmètre inclus

| # | Livrable | Statut |
|---|----------|--------|
| **R1** | Garde-fous `drox-bundle-readiness` (build + publish) | ✅ |
| **R2** | Installeur win32 **1.3.3** rebuild `-Force` (UI 1.3.2+ dans le package) | ✅ |
| **R3** | `drox.exe` embarqué MODERN vérifié | ✅ |
| **R4** | Chaîne MAJ (`latest.json` + Release OR) testée | ✅ |
| **R5** | Smoke install S1–S5 ([PLAN](../PLAN-1.3.3.md)) | ✅ |

---

## Hors scope 1.3.3

- TEST-PLAN T1–T10, presets P8–P13 → [1.3.4](../../1.3.4/PLAN-1.3.4.md)
- Index / graphe / fast path → [1.4.4](../../../1.4/1.4.4/PLAN-1.4.4.md) (ex-1.3.5)
- Agents Window KDDS

---

## Contexte

Release **1.3.2** OR = bundle `out-vscode-min` obsolète (installeur ≠ code source). **1.3.3** corrige le pipeline (`drox-release`, sentinelles bundle, build TS/NLS) et republie un binaire fidèle.

**Release GitHub** : [v1.3.3](https://github.com/DroxKiwi/Drox---IDE---OR/releases/tag/v1.3.3)

---

## Liens

- [README 1.3.3](../README.md)
- [PLAN](../PLAN-1.3.3.md)
- [CLOSURE 1.3.2](../../1.3.2/finalisation/CLOSURE-1.3.2.md)
