# Test plan — squelette 1.4.0

**Parent** : [SQUELETTE](SQUELETTE.md) · **Phases** : [PLAN-ATTAQUE](PLAN-ATTAQUE.md)

Plan de validation **après table rase**. Ancien plan : [archive/09-TEST-PLAN.md](archive/09-TEST-PLAN.md).

---

## Prérequis exécution

- Build : `cargo build -p drox-cli` → `drox.exe`
- IDE : Reload Window après binaire
- Preset : **normal** (`run_rail_enabled: true`)
- Modèle référence : Qwen 27B (ou équivalent dogfood)
- Workspace : `site-kdds`

---

## T0 — Automatisé (chaque phase)

| # | Commande | Attendu | OK |
|---|----------|---------|-----|
| T0.1 | `cargo test -p drox-engine` | Vert (199 tests) | ☑ 2026-06-05 |
| T0.2 | `cargo test -p drox-tools` | Vert (128 tests) | ☑ 2026-06-05 |
| T0.3 | `cargo build -p drox-cli` | OK | ☑ 2026-06-05 |
| T0.4 | Audit lignes `agent/**/*.rs` | Aucun fichier prod > 500 L | ⚠ voir note |

**T0.4 — exceptions connues (report 1.4.1)** : `loop/drive/tools.rs` (~530 L), `tests/drive.rs` / `tests/drive_loop.rs` (fichiers de tests). `tests/mod.rs` = 6 L.

**T0 IDE** : `npm run compile-check-ts-native` — ☑ 2026-06-05

---

## T1 — Discuss (chemin court, sans rail complet)

| # | Scénario | Attendu | OK |
|---|----------|---------|-----|
| T1.1 | « Bonjour » | Réponse sans tools, clôture propre | ☐ manuel |
| T1.2 | « Où est le README ? » (with_reads) | `file_read` ou map, pas de `todo_write` | ☐ manuel |

---

## T2 — Rail stations (edit minimal)

| # | Scénario | Attendu | OK |
|---|----------|---------|-----|
| T2.1 | Edit trivial (commentaire dans un fichier) | Stations visibles · mutation · done | ☐ manuel |
| T2.2 | `skill_list` en ACT | **Outil non visible** (filtrage amont) ou jamais appelé | ☐ manuel |
| T2.3 | Erreur schéma `file_edit` | Recovery ≤3 tours avec `file_write` | ☐ manuel |

---

## T3 — Smoke feature (critère CLOSURE)

Rejeu demande [chat_qwen27b](../../1.3/chat_qwen27b.txt) :

| # | Critère | OK |
|---|---------|-----|
| T3.1 | Rail `intent → read → plan → act` (ou skip plan si short) | ☐ |
| T3.2 | Plan todos si utilisé — progression visible | ☐ |
| T3.3 | ≥1 mutation réelle (`home-content.tsx` ou équivalent) | ☐ |
| T3.4 | VERIFY (bash/lsp) | ☐ |
| T3.5 | Pas de boucle thinking >10 tours sans outil en ACT | ☐ |
| T3.6 | `[phase: answering]` + `[phase: done]` | ☐ |
| T3.7 | Durée < 30 min (manuel) | ☐ |

---

## T4 — Absences (régression multi-modèle)

| # | Vérification | Attendu | OK |
|---|--------------|---------|-----|
| T4.1 | grep codebase `segment_spawn` actif | Aucun chemin prod | ☑ 2026-06-05 |
| T4.2 | `delegate_executor` dans allowlist architect | Absent (`tool_visible` false) | ☑ 2026-06-05 |
| T4.3 | Run `RoleId::Executor` depuis IDE | Impossible | ☐ manuel IDE |

**G-contrat** (FOI § III.5) — grep `agent/` : ☑ 0 reliquat guide (2026-06-05)

---

## Sign-off squelette

| Rôle | Date | Phase validée |
|------|------|---------------|
| Dev (T0 + T4 auto + G-contrat) | 2026-06-05 | Phases 1–4 code · Phase 5 partiel |
| Smoke T1–T3 | | |

Quand T0–T4 verts → [CLOSURE](finalisation/CLOSURE-1.4.0.md) (à créer en Phase 6).
