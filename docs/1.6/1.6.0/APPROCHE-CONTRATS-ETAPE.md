# Approche renforcée — contrats d’étape & recovery (1.6.0)

**Statut** : cadre validé 2026-10-10 · **D1–D4 + P1–P3** ✅ · **E1+E2** (soft anti-spirale) ✅ · **F1+F2** (livraison Explore) ✅ · inventaire prompts ✅  
**Parent** : [README](README.md) · [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) · [PLAN-CONCENTRATION](PLAN-CONCENTRATION-CONTEXTE.md) · [PLAN-EXPLORE](PLAN-EXPLORE-RETURN-CONTRACTS.md)  
**Mesure prompts** : [`drox-prompts/docs/inventory-instructions.md`](../../../drox-engine/drox/crates/drox-prompts/docs/inventory-instructions.md)

---

## 1. Pourquoi changer de méthode

Dogfood `site-kdds` / pédagogie (2026-10-09, `ses_bd54123b…`) : **~3,5 M tokens in**, Explore inventaire **vide** (`artifacts_inline: {}`, `truncated`), C2 **désarmé**, parent re-`file_read` + spill/snip, soft Prefer brûlés, peu/pas d’acting.

Constat croisé (agent aveugle + analyse interne) : le run meurt côté **lecture / contexte / merge soft**, pas côté hard gates mutation/`done`.

**Refuse** : continuer à chercher un « juste milieu » Prefer soft/hard pour que le modèle « comprenne » le protocole.

**Adopté** (recherche + industrie — Anthropic workflows, SagaLLM/ALAS, recovery outil) :

1. **Contrats d’étape** — prédicat testable (inventaire utilisable / fichier touché / réponse user-facing).
2. **Recovery moteur** — taxonomie d’erreur → transition bornée (retry / split / partial / escalate), pas un nouveau sermon Prefer.
3. **Désempilage instructions** — une source de vérité par thème ; mesurer le volume.

---

## 2. Fragilités nommées (dogfood)

| Id | Point | Action |
|----|--------|--------|
| **D1** | Spill / hot-snip : stub « re-read » vs Preview dropped + anti-loop same-path | Policy spill : ne plus inciter re-read après drop ; pas de re-spill en boucle |
| **D2** | Explore phase 1 sans commit / L0 utile | Abort early ou auto-split 1× puis `partial` |
| **D3** | C2 (`explore_covered`) seulement si `truncated=false` | **Armer C2 aussi si truncated** dès qu’il y a des paths / artefacts |
| **D4** | Post-`ask_user` : pas de frein acting | Transition « skeleton / mutate » (gate douce ou prédicat step) |
| **D5** | Bash IDE O/N / succès vides | Chantier **séparé** (plateforme) |
| **D6** | Orphan tool_finish | Hygiène fin de run |

Chaîne : **D2 → D3 → D1 → Prefer brûlés → D4 → (D5) → D6**.

---

## 3. Ordre de livraison (moteur)

| # | Lot | Dépend | Statut |
|---|-----|--------|--------|
| 1 | **D3** — C2 armé malgré `truncated` / kinds_incomplete | C2 existant | ✅ |
| 2 | **D1** — spill sans double incentive | C1 | ✅ |
| 3 | **D2** — Explore fail → abort early / `partial` / pas step-complete faux | Option A | ✅ |
| 4 | Désempiler prompts (CORE / `tools.task` / frames B) | inventaire | ✅ **P1+P2+P3** |
| 5 | D4 post-ask_user acting | D3 idéalement | ✅ soft `runtime.post_ask_acting` |
| — | D5 bash IDE | — | backlog séparé |

Pas de nouveau Prefer « merge mieux » tant que 1–3 ne sont pas là.

---

## 3bis. Suite dogfood 2026-10-12 — spirale malgré Explore OK

Dogfood `ses_d4220fc4…` (docs site ← `docs/engine`) : **2 Explore OK**, kinds riches, **~9,2 M tokens in**, **~271 `file_read`**, **0 write**. Cause primaire : **merge / `explore_artifact_read` spillés** (seuil read-heavy 8 KiB) + parent qui re-vérifie les sources ; pas des rapports trop vagues.

| Id | Point | Action | Statut |
|----|--------|--------|--------|
| **F1** | `explore_artifact_read` / `task` traités comme dumps → spill annule Explore | Seuil **64 KiB** livraison Explore ; n+1 `agent/tool_result_spill/` | ✅ |
| **F2** | Hot snip → stub 512 B sur merge | Compact `EXPLORE MERGE PRESERVED` (summary + paths kind + extrait) | ✅ |
| **E1** | Relecture blobs kind `.drox/subagents/…` hors `paths_read` | Tracker `artifacts.*` dans `explore_covered` | ✅ |
| **E2** | Lectures post-Explore sans mutation | Soft Prefer `runtime.post_explore_stall_act` (**seuil 1**) | ✅ |
| **A** | Après fail/`orphan` `explore_artifact_read`, parent `file_read` le kind | Recovery erreur + Prefer `runtime.explore_artifact_read_fail` | ✅ |
| **E2b** | Range-read kinds malgré covered | Hit `CoveredHit::Kind` → Prefer act immédiat | ✅ |
| **R4** | Même path `file_read` ×N (spirale docs, `ses_45a84a19`) | Stub `[already_read]` dès seuil 3 (plus de re-IO) | ✅ |
| **R1** | Prefer rotating one-shot ignoré | Ré-inject tous les 4 reads tant que fenêtre tourne | ✅ |

Dogfood `ses_0ce29dd7…` : F1 gagnant (~1,2 M tok, 0 spill immédiat) mais **0 write** + ×20 `file_read` kind après orphan tool.  
Dogfood `ses_45a84a19…` : 0 Explore, ×20 same docs paths, ~984k in — motive **R4/R1**.

**Refuse** : hard gate « interdit `file_read` si covered » ; allonger les kinds narratifs.  
**Ordre** : F1/F2 → A/E2b → **R4/R1** → dogfood ; `rewrite_plan` optionnel ensuite.

Détail code / marqueurs : [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md) §9–§10 · [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md).

---

## 4. Inventaire instructions (constats)

Mesure `cargo run -p drox-prompts --example inventory` (2026-10-10) :

| Blob | ~tok |
|------|-----:|
| `session.core` | ~6 220 (était ~6 420) |
| `tools.task.description` | ~440 (était ~610) |
| Boot S2 catalogue (core+explore+think+ows+all tools) | ~10 610 (était ~11 000) |
| Host IDE `params.system` | non mesuré (en plus) |

Canon Plan→Assign→Merge : `session.subagents.explore` seul. CORE / `tools.task` = pointeurs (**P1+P2**). Suite : **P3** frames B delta-only.

---

## 5. Déjà livré qui prépare cette approche (2026-10-09)

| Lot | Rôle |
|-----|------|
| **Option A** `explore_commit` + L0 `paths_read` | Canal tools pour kinds (plus de fill prose nominal) |
| Gate **mono-kind** body | Refuse CoT / `## <autre_kind>` / openers |
| **Plus de `conclusion.md`** | Artefacts = `<kind>.md` + manifest |
| **`artifacts_inline`** | Inject merge borné dans slim `task` |
| Inventaire prompts + example | Base désempilage |

---

## 6. Liens

- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md) — Option A / artefacts  
- [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md) — C1–C5 · V2 merge · F1/F2 · E1/E2  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)  
- `drox-prompts/docs/injection-map.md` · `inventory-instructions.md` · `journal.md`  
- Code spill : `drox-engine/.../agent/tool_result_spill/` (`thresholds` · `format` · `hot_snip` · `slim_task`)
