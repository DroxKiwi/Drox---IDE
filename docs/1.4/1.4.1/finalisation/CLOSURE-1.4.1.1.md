# Clôture 1.4.1.1 — Intent probes & English engine

**Version** : patch moteur sur branche `1.4.1`  
**Statut** : **clôturé — juin 2026**  
**Suite** : [PLAN-1.4.1.2a](../PLAN-1.4.1.2a.md) (context diet) → [PLAN-1.4.1.2](../PLAN-1.4.1.2.md) (rail)

---

## Verdict

La couche **Intent Probe** remplace les heuristiques `looks_like_*` sur le message utilisateur. Les prompts système, gates et nudges moteur sont en **anglais**. Le smoke **R1c** (`ses_31b9a209`, Qwen 3.6:27b) valide le boot Edit sur brief plan+mutation FR.

---

## Livrables code

| ID | Sujet | Statut |
|----|-------|--------|
| B-INTENT-01 | Module `intent_probe/` (parse, runner, boot hook) | ✅ |
| B-INTENT-02/03 | Flags branchés ; `looks_like_*` retirés | ✅ |
| B-INTENT-04 | Gate `done` structurel (`mutation_expected`) | ✅ |
| B-INTENT-05 | Briefs composés dans `run_intent_probe.md` | ✅ |
| B-INTENT-06 | Garde `no_work_edit` / pas de `NO_WORK_PROMPT` sur Edit | ✅ |
| B-I18N-01…04 | Prompts EN + clarification `file_write` vs `web_fetch` | ✅ |

**Tests** : `cargo test -p drox-engine` — 237 tests verts (juin 2026).

---

## Smoke R1c — `ses_31b9a209`

| Critère | Résultat |
|---------|----------|
| Pas de nudge « light message » au boot | ✅ |
| `workspace_map_read` / exploration dès le 1er tour utile | ✅ |
| Plan structuré avant mutations (`[phase: answering]`) | ✅ |
| Validation user avant ACT (*« Oui applique ce plan »*) | ✅ |
| App fonctionnelle post-run | ✅ (user) |
| Logs `intent_probe=*` dans export UI | ⚠️ non exportés — boot validé par comportement |
| SVG transition finalisé | ⚠️ hors scope intent — modèle / qualité livrable |

**Transcript** : [`chat_qwen27b.txt`](../../../chat_qwen27b.txt)

---

## Reporté (ne pas bloquer 1.4.1.1)

| ID | Plan |
|----|------|
| B-CTX-02 / F11 (~116k tokens in) | [PLAN-1.4.1.2a](../PLAN-1.4.1.2a.md) |
| B-RAIL-02, B-MOTOR-05…08, B-PROPOSE-01, B-CYCLE-01 | [PLAN-1.4.1.2](../PLAN-1.4.1.2.md) |

---

## Sign-off

- [x] Intent probe boot-only + fallback documenté
- [x] **G-smoke-edit** R1c vert (boot + plan → user → act)
- [x] **G-smoke-discuss** non régressé (historique 1.4.1)
- [x] `cargo test -p drox-engine` vert
- [x] Plans 1.4.1.2 / 1.4.1.2a alignés

---

## Liens

- [PLAN-1.4.1.1](../PLAN-1.4.1.1.md)
- [PLAN-1.4.1](../PLAN-1.4.1.md)
- [OPENING-1.4.1](OPENING-1.4.1.md)
