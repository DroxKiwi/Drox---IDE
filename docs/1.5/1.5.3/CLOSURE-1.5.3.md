# Clôture 1.5.3 — Diffs fil + UX chat

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.3**  
**Statut** : **livré** (juin 2026)

---

## Périmètre livré (code)

| # | Livrable | Statut |
|---|----------|--------|
| **D1** | Diffs fichier fil + undo/redo carte | ✅ |
| **U1** | Messages user (copie, expand, hint commit) | ✅ |
| **U2** | Composer auto-grow 2–12 lignes | ✅ |
| **T1** | Cartes shell UX agent compacte | ✅ |
| **TUI-1** | Style fil rétro VT323 + alignement sash | ✅ |
| **W** | Patch WORK UI (W1–W4, W6 + hotfixes) | ~98 % |
| **H** | Historique sessions Phase 1+2 + reset workspace | ✅ |
| **U1** | Popup nouveautés 1.5.3 (splash mise à jour) | ✅ |
| **L3** | `droxVersion` 1.5.3 | ✅ |

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Merge `1.5.3` → `main` (squash publish) | ✅ |
| R2 | Intégration VS Code branche `integrate/vscode-*` sur `main` | ✅ |
| R3 | `npm run drox:ship` Windows | ✅ |
| R4 | Release `v1.5.3` + `stable/latest.json` | ✅ |
| R5 | Tag sources `v1.5.3` sur `main` | ✅ |

**Statut global** : **livré** (juin 2026).

---

## Reporté

| Sujet | Version |
|-------|---------|
| Splash boot phosphore TUI (A1) | 1.5.4+ |
| Titres historique archives (H1), polish trays (P2) | 1.5.4+ |
| Release Linux `.deb` + Authenticode | [1.5.4](../1.5.4/PLAN-1.5.4.md) |

---

## Liens

- [PLAN-1.5.3.md](PLAN-1.5.3.md)
- [PATCH-WORK-UI-1.5.3.md](PATCH-WORK-UI-1.5.3.md)
- [Hub 1.5](../README.md)
