# 1.6.0 — Stabilisation agent (boucles · contexte · compaction)

**Statut** : **freeze code** (2026-10-20) · lots ✅ · dogfood / qualité **non gate** · **pas de ship** · branche `1.6.0` · `droxVersion` **1.6.0**  
**Précédent** : [1.5.23](../../1.5/1.5.23/README.md) — clôturé · ship `v1.5.23` (+ hotfix Chat MS / diffs)  
**Suite** : [1.6.1](../1.6.1/README.md) — profils moteur · presets · canari 9B  

**Passation (autre modèle)** : [PASSATION-1.6.0.md](PASSATION-1.6.0.md) — intention feature + obstacles chrono  
**Clôture** : [CLOSURE-1.6.0.md](CLOSURE-1.6.0.md) (freeze, pas brouillon)  
**Journal post-Vague 4** : [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md) · **Approche contrats** : [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md) · **Anti-loop** : [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md) · **Explore contrats** : [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md) · **Concentration / volume** : [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md)

## Cap

Trouver et corriger les causes **moteur** des symptômes dogfood :

1. **Boucles** — réponses identiques 2–3×, runs qui ne se terminent pas (tous modèles locaux / flash, pas seulement GLM).
2. **Contexte qui explose** — saut brutal de jauge (ex. ~78k → ~162k) entre deux messages.
3. **Observabilité** — pouvoir exporter / inspecter ce que le modèle reçoit vraiment (mode debug verrouillé en prod).
4. **Curation du prompt** — situation card + snip chaud + CORE plus léger (Vague 4), sans vectoriel sur le transcript.

Sans changer le paradigme (phases, tools, MEMORY/DROX, régulation L1–L5).

## Documents à suivre

1. **[ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)** — Vagues 1–3 (checklist).  
2. **[PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md)** — **Vague 4** contexte sérieux.  
3. **[PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)** — P0–P2 terminal + durcissement Explore (validé dogfood).

## Ordre d’exécution (figé)

```text
Vague 1 — filets     : L-1 → L-2 → C-1 (+ C-3)     ✅
Vague 2 — contexte   : T-1 → L-tools → G-1 → C-2  ✅
Vague 3 — preuve     : L-3 ✅ · OBS reporté
Dogfood FX-B+        : chunk write + UI            ✅ code
Vague 4 — curation   : S-1 → S-2 → S-3 → S-4 → S-5  ✅
Clôture              : freeze code 2026-10-20 (pas ship) → suite [1.6.1](../1.6.1/README.md)
```

## Hypothèses (rappel)

| # | Hypothèse | Priorité |
|---|-----------|----------|
| H1 | Compaction live **non persistée** IDE → reload JSONL complet | ★★★ |
| H2 | Nudges `done` + **reset** LoopDetector | ★★★ |
| H3 | Nudges → faux `user` `[System reminder]` | ★★ |
| H4 | Jauge `bytes/4` vs `input_tokens` provider | ★★ |
| H5 | Gros tool results / Explore inline | ★★ |
| H6 | Sensibilité modèles locaux (ampli) | ★ |

Détail boucles : [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md).  
Détail curation : [DIAGNOSTIC-CONTEXTE-SERIEUX.md](DIAGNOSTIC-CONTEXTE-SERIEUX.md).

## Avancement

| Volet | État |
|-------|------|
| Diagnostic + plan d’étapes V1–3 | ✅ |
| Vague 1 — L-1 / L-2 / C-1 / C-3 | ✅ (moteur) |
| Vague 2 — T-1 / L-tools / G-1 / C-2 | ✅ (moteur + UI) |
| Vague 3 — L-3 (OBS reporté) | ✅ L-3 · OBS ⬜ |
| Dogfood FX-B+ (chunk write / UI) | ✅ code · smokes S1–S4 **reportés** (pas gate freeze) |
| Vague 4 — S-1…S-5 contexte sérieux | ✅ code |
| **Post-V4** — prompts + soft Plan/Explore + hors-WS + orphan UTF-8 + post-merge + anti-rotation | ✅ code · voir [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) |
| Preuves dogfood | ⏸ non gate freeze · reprendre en [1.6.1](../1.6.1/README.md) si besoin |
| **Explore return contracts** (kinds + index + tags UI) | ✅ E1–E4b · P-safe… · **Option A** `explore_commit` + mono-kind + no `conclusion` + `artifacts_inline` ✅ · dogfood 2026-10-09 🟡 · [PLAN](PLAN-EXPLORE-RETURN-CONTRACTS.md) |
| **Inventaire instructions** | ✅ `inventory-instructions.md` + example · CORE ~6.4k tok · boot S2 ~11k tok catalogue |
| **Approche contrats d’étape / recovery** | 📐 cadre ✅ · **D1–D4** ✅ · P1–P3 ✅ · [APPROCHE](APPROCHE-CONTRATS-ETAPE.md) |
| **Anti-spirale post-Explore** (covered kinds + stall-act) | ✅ **E1+E2+E2b** soft Prefer · [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) · [CONCENTRATION](PLAN-CONCENTRATION-CONTEXTE.md) |
| **Livraison Explore survivante** (spill / hot-snip) | ✅ **F1+F2** · `agent/tool_result_spill/` n+1 · seuil 64 KiB · merge préservé |
| **Recovery artifact_read** | ✅ **A** — erreur → Prefer anti-`file_read` kind |
| RELEASE_NOTES / popup `1.6.0` | ✅ présents · rafraîchir **si** tag un jour |
| CLOSURE freeze | ✅ [CLOSURE](CLOSURE-1.6.0.md) |
| Ship win32 + linux | ⬜ volontaire (pas cette clôture) |

## Docs

| Fiche | Sujet |
|-------|--------|
| **[PASSATION-1.6.0.md](PASSATION-1.6.0.md)** | Handover : feature visée + historique des obstacles |
| **[ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)** | Checklist Vagues 1–3 |
| **[PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md)** | **Vague 4** situation card / snip / CORE |
| **[JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md)** | Historique post-V4 (prompts, soft Explore, hors-WS, dogfood) |
| **[ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)** | Comment l’anti-loop s’identifie / se déclenche (M1–M4 + soft) |
| **[PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md)** | Contrats retour typés Explore + index navigable (scope discussion) |
| **[PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md)** | Attention / règles : volume vs ordre · solutions V1–V6 · lots C1–C6 |
| **[APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md)** | Cadre post-dogfood : D1–D6 · recovery moteur · désempilage prompts |
| **[DIAG-RUN-STOP.md](DIAG-RUN-STOP.md)** | Arrêt soudain : buckets kill/orphan/done · `scripts/diag-drox-run-stop.ps1` |
| [DIAGNOSTIC-CONTEXTE-SERIEUX.md](DIAGNOSTIC-CONTEXTE-SERIEUX.md) | Écarts apps sérieuses · anti-vectoriel |
| [PLAN-AGENT-LOOP-CONTEXT.md](PLAN-AGENT-LOOP-CONTEXT.md) | Index lots / IDs / preuves |
| [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md) | Baseline boucles + dogfood FX-B |
| [CLOSURE-1.6.0.md](CLOSURE-1.6.0.md) | Freeze code (pas ship) |
| [`stable/1.6.0/RELEASE_NOTES.md`](../../../stable/1.6.0/RELEASE_NOTES.md) | Notes release |
| [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md) | Terminal + Explore + session master |
| [`.drox/rules/README.md`](../../../.drox/rules/README.md) | Project rules + `drox.rules.enabled` |
| [`docs/engine/`](../../engine/README.md) | Réf. runtime moteur |

## Décisions

- **Vague 1 d’abord** (L-1 → L-2 → C-1) — ROI max, risque maîtrisé.  
- **Pas de nouveau paradigme** — on borne l’orchestration.  
- **OBS en Vague 3** — utile en dogfood ; pas bloquant pour démarrer les filets.  
- **Vague 4 dans 1.6.0** — situation card + curation prompt avant ship (pas de 1.6.1 dédié).  
- Industrie (Cursor / Claude Code / Cline) : hard-stop répétition + compaction **persistée** + gros results hors prompt + état de run explicite.

## Liens

- [Hub 1.6](../README.md)
- [1.6.1](../1.6.1/README.md) — profils / presets
- [Clôture 1.5.23](../../1.5/1.5.23/CLOSURE-1.5.23.md)
- [01-BRANCHE](../../release/01-BRANCHE.md)
