# Plan 1.5.8 — Polish UX post-release 1.5.7

**Version** : juin 2026  
**Base** : [1.5.7](../1.5.7/PLAN-1.5.7.md) livrée  
**Branche** : `1.5.8` · tag **`v1.5.8`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **P1** Backlog & repro | fait | — |
| **P2** Correctifs webview / libellés | fait | — |
| **P3** Smoke + release win + linux | en cours | oui |

---

## Périmètre

| In | Hors scope |
|----|------------|
| Correctifs UX chat (fil, phases, questionnaire, vignettes) | Connexions MCP → [1.5.9](../1.5.9/README.md) |
| Alignement libellés modes (**Planifier**, etc.) | Modes Ask / Analyse moteur → [1.5.9](../1.5.9/PLAN-1.5.9.md) M6 |
| Release OR `v1.5.8` | Agents Window → [1.5.10](../1.5.10/README.md) |

---

## Backlog

| ID | Symptôme | Statut |
|----|----------|--------|
| P8-1 | Vignette « Analyze » trompeuse (mode Plan moteur) | **fait** — libellé **Planifier** |
| P8-2 | Padding questionnaire `user-ask` (texte collé au bord) | **fait** — `droxChatThreadTui.css` |
| P8-3 | Blocs **Reasoning** vides / outils hors fil WORK | **fait** — `beginLinearRunStrip` + routage chronologie |
| P8-4 | *(autres items dogfood post-1.5.7)* | ouvert |

---

## Critères d'acceptation

- [ ] Backlog P8 documenté et traité ou reporté explicitement
- [ ] Smoke chat : envoi, fil Work/Reasoning, questionnaire, modes vignettes
- [ ] `droxVersion` **1.5.8** · ship win puis linux

---

## Décalage roadmap (juin 2026)

| Ancien | Nouveau |
|--------|---------|
| 1.5.8 MCP + modes | **1.5.9** |
| 1.5.9 Agents Window | **1.5.10** |
| — | **1.5.8** ce slot polish post-1.5.7 |

---

## Liens

- [README 1.5.8](README.md)
- [PLAN 1.5.9 MCP](../1.5.9/PLAN-1.5.9.md)
- [PLAN 1.5.10 Agents](../1.5.10/PLAN-1.5.10.md)
