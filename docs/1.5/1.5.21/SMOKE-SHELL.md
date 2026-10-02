# Smoke — Shell discussion partagé (S3–S5)

**Parent** : [PLAN-SHARED-DISCUSSION-SHELL.md](PLAN-SHARED-DISCUSSION-SHELL.md)  
**But** : valider la parité IDE ↔ Agents avant CLOSURE 1.5.21.

## Prérequis

- `scripts/code.bat` (IDE) + fenêtre Agents  
- Connexion LLM déjà configurée (wizard)  
- Workspace ouvert

## S3 — Contrôles (IDE et Agents)

| Contrôle | IDE | Agents | OK |
|----------|-----|--------|----|
| Picker modèle | | | ☐ |
| Wizard / Server (toolbar Drox) | | | ☐ |
| Model settings (num_ctx, sampling) | | | ☐ |
| Permission mode Drox | | | ☐ |
| Status tokens / ctx | | | ☐ |
| Chip Codebase (force) | | | ☐ |
| Pas de chrome Copilot (`@ Agent`, Auto mode) | | | ☐ |

## S4 — Handoff / empty

| Cas | OK |
|-----|----|
| Empty-first IDE (placeholder Drox) | ☐ |
| Handoff session Agents → IDE (reprise fil) | ☐ |
| Nouvelle session IDE sans crash load | ☐ |

## S5 — Run

| Cas | OK |
|-----|----|
| Send message IDE → tools + stream | ☐ |
| Send message Agents → tools + stream | ☐ |
| CFG USER : changer modèle d’un côté → cohérent | ☐ |

## Done when

Toutes les cases cochées → cocher critères dans le plan shell + CLOSURE 1.5.21.
