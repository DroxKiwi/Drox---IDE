# Clôture 1.5.8 — Polish UX chat post-1.5.7

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.8**  
**Statut** : **livré**

---

## Périmètre livré (code)

| # | Livrable | Statut |
|---|----------|--------|
| P8-1 | Vignette **Planifier** (mode Plan moteur, ex-Analyze) | ✅ |
| P8-2 | Padding questionnaire `user-ask` | ✅ |
| P8-3 | Flux **native thinking** dans blocs Reasoning + outils inline chronologie | ✅ |
| P8-4 | Warmup phrase dans le fil `#log` (pas sticky composer) | ✅ |
| — | Décalage roadmap MCP → 1.5.9, Agents Window → 1.5.10 | ✅ |

---

## Technique (webview)

- `beginLinearRunStrip` au `busy:true` — active `linearRunUi` pour `appendStreamBufferDelta`.
- `getLogMountParent` → chronologie du strip ; `flushStreamBuffer` avant chaque outil.
- Warmup : `ensureTailWarmupActivity` uniquement (footer plan réservé aux todos).

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Merge `1.5.8` → `main` | en cours |
| R2 | `npm run drox:ship` Windows | en cours |
| R3 | Release `v1.5.8` + `stable/latest.json` | en cours |
| R4 | Linux `.deb` | en cours |

---

## Liens

- [PLAN-1.5.8.md](PLAN-1.5.8.md)
- [Hub 1.5](../README.md)
