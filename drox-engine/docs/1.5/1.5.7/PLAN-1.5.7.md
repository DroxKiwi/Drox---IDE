# Plan 1.5.7 — Correctifs post-release 1.5.6

**Version** : juin 2026  
**Base** : [1.5.6](../1.5.6/PLAN-1.5.6.md) livrée  
**Branche** : `1.5.7` · tag **`v1.5.7`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **F1** Backlog & repro | en cours | oui |
| **F2** Correctif(s) | en cours | oui |
| **F3** Smoke + release win + linux | 0 % | oui |

---

## Périmètre

| In | Hors scope |
|----|------------|
| Bugs bloquants ou gênants sur **1.5.6** (chat, fil, UI, install) | Connexions MCP → [1.5.8](../1.5.8/README.md) |
| Correctifs webview / host `contrib/drox` | Agents Window → [1.5.9](../1.5.9/README.md) |
| Release OR `v1.5.7` | Refonte moteur |

---

## Backlog (à compléter au fil de l'eau)

| ID | Symptôme | Statut |
|----|----------|--------|
| — | *(petits correctifs identifiés en dogfood post-1.5.6)* | ouvert |

---

## Critères d'acceptation

- [ ] Backlog priorisé documenté
- [ ] Correctifs validés en dev (`npm run watch` / build packagé)
- [ ] Smoke chat : envoi, fil, reprise session, diffs
- [ ] `droxVersion` **1.5.7** · ship win puis linux

---

## Décalage roadmap (juin 2026)

| Ancien | Nouveau |
|--------|---------|
| 1.5.7 MCP | **1.5.8** |
| 1.5.8 Agents Window | **1.5.9** |
| — | **1.5.7** ce slot correctifs post-1.5.6 |

---

## Liens

- [README 1.5.7](README.md)
- [PLAN 1.5.8 MCP](../1.5.8/PLAN-1.5.8.md)
- [PLAN 1.5.9 Agents](../1.5.9/PLAN-1.5.9.md)
