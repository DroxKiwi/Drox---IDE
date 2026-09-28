# Clôture 1.5.14 — LoopDetector, loading UI, Plan B sessions

**Date** : juillet 2026  
**Version** : `droxVersion` **1.5.14**  
**Statut** : **livré** (branche conservée, publication OR en cours)

---

## Périmètre livré

| Pilier | Livrable | Statut |
|--------|----------|--------|
| **L1** | LoopDetector après gates done + prompts LLM EN | ✅ |
| **UL** | Loading kit unifié (Agents + IDE natif) | ✅ |
| **WS** | Layout workspace per-session (vanilla) | ✅ |
| **PB** | Sessions background persistantes, template, dashboard métriques | ✅ |

### Plan B (sessions)

- Toggle persistence carte · confirmation switch · snapshot layout in-memory
- Template défaut (chat + Changes, éditeur masqué)
- Dashboard lampes + CPU / RAM / Disque / ↓ / ↑ (historique 1 h, hover sparkline)
- Correctifs cold boot (layout timers) + menus / restore cross-répertoire

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R0 | Merge `1.5.14` → `main` (branche **conservée**) | ⬜ |
| R1 | Commit branche `1.5.14` | ⬜ |
| R2 | `npm run drox:ship -- -Force` Windows | ⬜ |
| R3 | Release `v1.5.14` + `stable/latest.json` (win32 + linux) | ⬜ |

---

- [PLAN-1.5.14](PLAN-1.5.14.md) · [PLAN-B](PLAN-B.md)
- [Hub 1.5](../README.md)
