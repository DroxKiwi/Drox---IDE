# Drox 1.5.3 — Diffs fil + UX chat

**Statut** : **clôture code** (juin 2026) · branche `1.5.3` — tag `v1.5.3` à poser  
**Prérequis** : [1.5.2](../1.5.2/CLOSURE-1.5.2.md) livrée (configuration moteur IDE)

---

## En une phrase

Fil agent enrichi (**diffs fichier**, **undo/redo**, **cadres shell**), **UX messages utilisateur**, **composer auto-grow**, **style TUI fil**, patch **WORK UI** et **historique sessions** — prêt pour tag **v1.5.3**. Release Linux et splash boot phosphore → [1.5.4](../1.5.4/README.md).

---

## Piliers

| Pilier | Sujet | État |
|--------|--------|------|
| **D1** | Diffs fichier dans le fil + undo/redo | ✅ |
| **U1** | Messages utilisateur (copie, style, expand, hint commit) | ✅ |
| **U2** | Composer : textarea auto-grow | ✅ |
| **T1** | Cadres commandes shell (type Cursor) | ✅ |
| **TUI-1** | Style fil rétro (VT323, phosphore) | ✅ |
| **W** | Patch WORK UI (smoke fil) | ~98 % (W5 partiel) |
| **H** | Historique sessions (liste + rejeu UI) | Phase 1+2 ✅ |
| **A1** | Splash boot phosphore TUI | reporté |
| **P2** | Polish trays (optionnel) | — |

---

## Docs

- [PLAN-1.5.3.md](PLAN-1.5.3.md)
- [CLOSURE-1.5.3.md](CLOSURE-1.5.3.md)
- [PATCH-WORK-UI-1.5.3.md](PATCH-WORK-UI-1.5.3.md) — audit smoke + correctifs W1–W6

---

## Liens

- [Hub 1.5](../README.md)
- [PLAN 1.5.2](../1.5.2/PLAN-1.5.2.md) — configuration moteur
- [PLAN 1.5.4](../1.5.4/PLAN-1.5.4.md) — release Linux + Authenticode
