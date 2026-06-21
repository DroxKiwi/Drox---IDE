# Drox 1.5.1 — Fil chat = fil TUI

**Statut** : **clôture en cours** (juin 2026) — sources taguées `v1.5.1` · ship Windows restant  
**Prérequis** : [1.5.0](../1.5.0/CLOSURE-1.5.0.md) livrée · moteur `tui_mono` · shim RPC

---

## En une phrase

Faire en sorte que **Drox Chat** affiche un run **dans le même ordre** que le **TUI** (`drox-tui`) : fil chronologique, phases, outils, réponse — sans reprendre le conducteur rail **1.4**.

---

## Pourquoi réécrire le plan

L’ancien plan 1.5.1 visait encore la **1.4** (routage Auto/discuss, blocs station rail, B-UI-* liés à l’orchestration abandonnée). Depuis **1.5.0** :

- le moteur est la **mono-boucle TUI** ;
- les events passent par le **shim** (`phase_enter`, `tool_*`, `text_delta`, …) ;
- release, upstream et git sont documentés dans [RULES.md](../../../../RULES.md) et [CLOSURE 1.5.0](../1.5.0/CLOSURE-1.5.0.md).

Il ne reste plus qu’à aligner **l’UI discussion** sur ce que le TUI fait déjà bien.

---

## Périmètre 1.5.1

| In | Hors scope (plus tard) |
|----|----------------------|
| Fil de discussion chronologique (parité TUI) | Refonte globale du workbench VS Code |
| Replay session / réouverture app | Diffs fil + undo → [1.5.2](../1.5.2/README.md) |
| **Wizard connexion IA** (cloud / perso, headers) | Paramètres moteur sampling → [1.5.2](../1.5.2/README.md) |
| `ask_user`, busy, trays outils (polish) | Routage 1.4 (discuss/edit, intent probe) |
| Signature Authenticode Windows | |

---

## Référence vérité

| Couche | Où regarder |
|--------|-------------|
| **Ordre des events** | `drox-engine/.../engine/bootstrap.rs` — `apply_agent_event` |
| **Lignes affichées** | `drox-tui/.../view/log_entry.rs` — `LogEntry` |
| **Wire IDE** | [SHIM-MOTEUR-IDE.md](../1.5.0/SHIM-MOTEUR-IDE.md) |
| **Webview actuelle** | `contrib/drox/browser/media/droxChat/stream/` |

---

## Docs

- [PLAN-1.5.1.md](PLAN-1.5.1.md) — chantier détaillé
- [CLOSURE-1.5.1.md](CLOSURE-1.5.1.md) — clôture (ship Windows en cours)
- [PLAN 1.5.2](../1.5.2/PLAN-1.5.2.md) — diffs, UX, paramètres moteur
- [PLAN 1.5.3](../1.5.3/PLAN-1.5.3.md) — release Linux

---

## Liens

- [Hub 1.5](../README.md)
- [06-UI-BLOCKS](../../1.4/1.4.0/archive/06-UI-BLOCKS.md) — archive rail 1.4 (ne pas prolonger)
