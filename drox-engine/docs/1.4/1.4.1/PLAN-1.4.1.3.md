# PLAN 1.4.1.3 — Context Frame

**Statut** : **implémentation complète** — Phases 2–5 · gate G-spec smoke en attente  
**Parent** : [README 1.4.1](README.md) · post [CLOSURE 1.4.1.2](finalisation/CLOSURE-1.4.1.2.md)

---

## En une phrase

Centraliser l'injection system (frames), préparer dossiers d'outils et plan interne modèle — **wrap** l'existant sans changer le comportement en Phase 2.

---

## Documents

| Doc | Rôle |
|-----|------|
| [1.4.1.3/README.md](1.4.1.3/README.md) | Hub chantier |
| [1.4.1.3/PLAN.md](1.4.1.3/PLAN.md) | Plan détaillé phases 0–5 |
| [1.4.1.3/MATRIX-ACTUAL.md](1.4.1.3/MATRIX-ACTUAL.md) | Matrice injection actuelle |
| [1.4.1.3/frames-v0.yaml](1.4.1.3/frames-v0.yaml) | Manifest frames v0 |
| [1.4.1.3/ARCHITECTURE.md](1.4.1.3/ARCHITECTURE.md) | Découpage Rust / TS |
| [1.4.1.3/INTEGRATION-internal-plan.md](1.4.1.3/INTEGRATION-internal-plan.md) | Plan L2 — intégration, transcript, roadmap B–E |

---

## Phases (résumé)

| Phase | Statut | Livrable |
|-------|--------|----------|
| 0 Plan | ☑ | PLAN.md |
| 1 Spec | ☑ matrice + YAML | MATRIX-ACTUAL, frames-v0 |
| 2 Parité | ☑ | `context_frame/` — iteration + `append_gate_nudge` |
| 3 Tool folders | ☑ | `edit_file` + READ/VERIFY dossiers |
| 4 Plan interne | ☑ | `internal_plan_write` + snapshot |
| 5 Optim | ☑ | `tool_folders_enabled` preset Normal |

**Gate G-spec** : dump transcript bit-identique (READ, ACT, nudge) — avant merge Phase 2 complet.
