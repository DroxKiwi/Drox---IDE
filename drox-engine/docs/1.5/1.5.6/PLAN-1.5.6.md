# Plan 1.5.6 — Correctifs post-release 1.5.5

**Version** : juin 2026  
**Base** : [1.5.5](../1.5.5/PLAN-1.5.5.md) livrée  
**Branche** : `1.5.6` · tag **`v1.5.6`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **F1** Repro & diagnostic | 0 % | oui |
| **F2** Correctif(s) | 0 % | oui |
| **F3** Smoke + release win + linux | 0 % | oui |

---

## Périmètre

| In | Hors scope |
|----|------------|
| Bugs bloquants ou gênants sur **1.5.5** (chat, fil, UI, install) | Connexions MCP → [1.5.7](../1.5.7/README.md) |
| Correctifs webview / host `contrib/drox` | Agents Window → [1.5.8](../1.5.8/README.md) |
| Release OR `v1.5.6` | Refonte moteur |

---

## Symptômes (à compléter)

_Décrire ici le ou les problèmes constatés après ship 1.5.5._

---

## Critères d'acceptation

- [ ] Repro documentée + correctif validé en dev (`npm run watch` / build packagé)
- [ ] Smoke chat : envoi, fil, reprise session, scroll
- [ ] `droxVersion` **1.5.6** · ship win puis linux

---

## Décalage roadmap (juin 2026)

| Ancien | Nouveau |
|--------|---------|
| 1.5.6 MCP | **1.5.7** |
| 1.5.7 Agents Window | **1.5.8** |
| — | **1.5.6** ce slot correctifs post-1.5.5 |

---

## Liens

- [README 1.5.6](README.md)
- [PLAN 1.5.7 MCP](../1.5.7/PLAN-1.5.7.md)
- [PLAN 1.5.8 Agents](../1.5.8/PLAN-1.5.8.md)
