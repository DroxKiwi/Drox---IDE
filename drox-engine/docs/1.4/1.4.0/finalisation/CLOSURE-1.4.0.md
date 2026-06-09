# Clôture 1.4.0 — Run Rail

**Version** : `droxVersion` **1.4.0**  
**Statut** : **ouvert — bloqué moteur** (code phases 0–4 livré, dogfood non signé)

**Règle produit (juin 2026)** : clôturer **uniquement quand le moteur rail est correct en usage réel**. Bugs IDE / session → [1.4.1](../../1.4.1/README.md). Polish UI chat → [1.4.2](../../1.4.2/README.md).

---

## Livrables code (phases 0–4)

| # | Livrable | Statut |
|---|----------|--------|
| **R2** | Squelette `run_rail/` | ✅ |
| **R3** | hold/advance + pre_gate + snapshot | ✅ code |
| **R4** | depth complex + PROPOSE hold | ✅ code |
| **R5** | Segments ACT + events | ✅ code |
| **R6** | `cargo test -p drox-engine` vert | ✅ |
| **U1–U2** | Events + blocs UI + export transcript | ✅ code |

---

## Bloquants clôture (moteur — à corriger avant tag)

| ID | Problème | Preuve dogfood |
|----|----------|----------------|
| **B-RAIL-01** | Rail invisible : zéro `[gate:]`, zéro event `railStation*` ; `pre_gate` non observable | `chat_qwen27b.txt` charte + exploration |
| **M-RAIL-01** | Stations ne bougent pas si le modèle ignore les marqueurs mode A | même transcripts |
| **M-RAIL-02** | À trancher : **auto-advance** heuristique (phase/outil → station) ou nudges + prompt renforcé | décision produit requise |

**Critère go moteur** : run edit charte sur qwen27b → events `railStation*` dans export UI + `pre_gate` visible si outil hors station + PROPOSE sans mutation tour 1 (R5).

---

## Dogfood — résultats smoke (juin 2026)

Transcripts : [`docs/1.3/chat_qwen27b.txt`](../../../1.3/chat_qwen27b.txt), `chat_qwen9b.txt`, `chat_gemma426b.txt`.

| ID | Résultat | Note |
|----|----------|------|
| **R1** « Salut » | ⚠️ | Discuss OK ; **2 outils** (`file_read`, `memory_list`) — échec règle greeting-only |
| **R5–R7** charte | ⚠️ produit | Tour 1 proposition sans mutation ✅ ; tour 2 livrable ✅ ; **pas de rail** |
| **R8–R15** rail | ❌ | Non testable tant que B-RAIL-01 |
| **R17** discuss | ✅ | Routage `architect_discussion` sur salut |
| **D1** | ⚠️ partiel | Charte rejouée ; run > 100 steps ; boucles |
| **D3** | ⚠️ | Qwen 27b OK ; Gemma 26b friction discuss |

---

## Reporté hors 1.4.0

| Version | Périmètre |
|---------|-----------|
| **[1.4.1](../../1.4.1/README.md)** | Bugs dogfood : session replay, busy stale, discuss salut outils, boucles moteur, bench modèles |
| **[1.4.2](../../1.4.2/README.md)** | UI chat : plan par run, ask_user markdown, ordre thinking, trays Ran, blocs rail polish |
| **[1.4.3](../../1.4.3/PLAN-1.4.3.md)** | Index local, graphe, fast path — ex-plan 1.4.1 |

---

## Sign-off (à cocher avant tag)

- [ ] B-RAIL-01 résolu + smoke charte avec events station
- [ ] R1–R7 repassés sur binaire release
- [ ] R8–R12 au moins un scénario pre_gate / segment / breaker
- [ ] R16 (`runRailEnabled: false` relaxed/strict)
- [ ] `cargo test -p drox-engine` vert
- [ ] [09-TEST-PLAN](../09-TEST-PLAN.md) signé

---

## Liens

- [SMOKE-BACKLOG](../SMOKE-BACKLOG.md)
- [07-IMPLEMENTATION-PHASES](../07-IMPLEMENTATION-PHASES.md)
- [OPENING](OPENING-1.4.0.md)
