# Clôture 1.4.1.3 — Plan interne L2 + protocole outil + dogfood

**Version** : branche `1.4.1` · juin 2026  
**Statut** : **code livré** · smoke Phase E **partiel** (run 1 OK, session multi-runs KO — voir [`SMOKE-ses_733093c6-SESSION.md`](../SMOKE-ses_733093c6-SESSION.md))  
**Prérequis** : [INTEGRATION-internal-plan.md](../1.4.1.3/INTEGRATION-internal-plan.md) · [PLAN-PROTO-FIXES.md](../1.4.1.3/PLAN-PROTO-FIXES.md)

---

## Verdict

Chantier **1.4.1.3** livré côté code : plan interne L2 (A–C), correctifs protocole F1–F4, stamp dev IDE, layout chat par fenêtre. Smoke run 1 [`ses_733093c6`](../SMOKE-ses_733093c6.md) (~3 min, mutation + `done`) valide le protocole folders sur tâche simple. La **session complète** (runs 2–3, Qwen 3.6 27B) révèle des failles multi-tours — voir [`SMOKE-ses_733093c6-SESSION.md`](../SMOKE-ses_733093c6-SESSION.md).

---

## Livrables

| Phase | Contenu | Statut |
|-------|---------|--------|
| **A** | Gate `internal_plan_write` obligatoire | ✅ |
| **B** | Nudges L2, merge, meta, touch | ✅ |
| **C** | Export transcript + engine trace L2 | ✅ |
| **F1** | Nudge `[tool_use]` texte + schema_error conditionnel + streak | ✅ |
| **F2** | Answering prématuré + thinking strip | ✅ |
| **F3** | Observabilité export + `RunSummary` trace | ✅ |
| **F4** | Tool folders × rail (`policy.rs`, boot prompt) | ✅ |
| **IDE** | Stamp dev epoch + git · layout chat par fenêtre | ✅ |
| **E** | Smoke run 1 [`ses_733093c6`](../SMOKE-ses_733093c6.md) · session [`SESSION`](../SMOKE-ses_733093c6-SESSION.md) | ⚠️ partiel |
| **D** | Session work log inter-runs | ☐ P2 (hors chemin critique) |

---

## Smoke Phase E — critères R1–R7

| ID | Critère | `ses_733093c6` |
|----|---------|----------------|
| R1 | 1er tool structuré ≤ 3 tours | ✅ (index 6) |
| R2 | `[tool_use]` texte | ✅ 0 |
| R3 | Thinking simulation lecture | ✅ |
| R4 | Plan interne avant reads | ✅ |
| R5 | Tokens in < 25k | ⚠️ 25 760 |
| R6 | `done` + mutation | ✅ |
| R7 | Export archivé | ✅ |

Référence échec pré-fix folders : [SMOKE-ses_3948a285.md](../SMOKE-ses_3948a285.md).

---

## Tests

- `cargo test -p drox-engine --lib` — **300** tests verts (dont virtual folders + rail)
- `cargo build --release -p drox-cli` — sans warning
- Tests TS : `droxProductVersion`, `droxChatLayoutStore`

---

## Sign-off

- [x] Phases A–C + F1–F3 code
- [x] Réalignement protocole tool folders (F4)
- [x] Smoke run 1 documenté
- [x] Session multi-runs documentée ([`SMOKE-ses_733093c6-SESSION.md`](../SMOKE-ses_733093c6-SESSION.md))
- [x] `cargo test -p drox-engine --lib` vert
- [ ] Fix `mutation_count` par run user (M1) — backlog
- [ ] Re-smoke session fraîche Qwen 3.6 27B — après fixes
- [ ] Push `origin/1.4.1` — sur demande

---

## Liens

- [PLAN-PROTO-FIXES.md](../1.4.1.3/PLAN-PROTO-FIXES.md)
- [SMOKE-ses_733093c6.md](../SMOKE-ses_733093c6.md) (run 1)
- [SMOKE-ses_733093c6-SESSION.md](../SMOKE-ses_733093c6-SESSION.md) (session complète)
- [SMOKE-ses_3948a285.md](../SMOKE-ses_3948a285.md)
- [SMOKE-ses_7d5db0f1.md](../SMOKE-ses_7d5db0f1.md)
- [CLOSURE-1.4.1.2.md](CLOSURE-1.4.1.2.md)
