# Clôture 1.5.1 — Fil chat = fil TUI + release multi-plateforme

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.1**  
**Tag** : `v1.5.1`  
**Statut** : **livré** (sources + pipeline release Windows et Linux)

---

## Périmètre livré

| # | Livrable | Statut |
|---|----------|--------|
| **P0** | Fil chronologique parité TUI (`chronology.js`, phases, outils inline) | ✅ |
| **P1** | Replay session, busy après Stop, `ask_user` markdown | ✅ |
| **P1-C** | Wizard « Connect your AI » (cloud / custom, headers HTTP) | ✅ |
| **UI** | Libellés phase en anglais natif (Reasoning, Reading, Work, …) | ✅ |
| **L3** | `droxVersion` 1.5.1 | ✅ |
| **L4** | Smoke [SMOKE-1.5.1-FIL-TUI.md](SMOKE-1.5.1-FIL-TUI.md) | ✅ validé |
| **1.5.1b** | Pipeline Linux `.deb` amd64 + merge `latest.json` | ✅ scripts + CI |

---

## Distribution (`Drox---IDE---OR`)

Même tag **`v1.5.1`** pour les deux plateformes :

| Plateforme | Artefact | Publication |
|------------|----------|-------------|
| **win32-x64** | `Drox-IDE-Setup-1.5.1-win32-x64.exe` | `npm run drox:ship` → [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md) |
| **linux-x64** | `Drox-IDE-1.5.1-linux-x64.deb` | `build-release-linux.sh` → [GUIDE-PUBLICATION-LINUX](../../operations/GUIDE-PUBLICATION-LINUX.md) |

Le manifeste `stable/latest.json` expose `platforms.win32-x64` et `platforms.linux-x64` (fusion via `scripts/lib/drox-release-manifest.mjs`).

---

## Hors scope (reporté)

| Axe | Suite |
|-----|-------|
| Polish trays P2 (B-UI-*) | 1.5.2 ou polish incrémental |
| Signature Authenticode Windows | 1.5.2 |
| macOS / Snap / Flatpak | ultérieur |
| Index / graphe | [1.5.2](../1.5.2/README.md) |
| Profils sampling | [1.5.3](../1.5.3/README.md) |

---

## Liens

- [PLAN-1.5.1.md](PLAN-1.5.1.md)
- [PLAN 1.5.1b](../1.5.1b/PLAN-1.5.1b.md)
- [Hub 1.5](../README.md)
- [CLOSURE 1.5.0](../1.5.0/CLOSURE-1.5.0.md)
