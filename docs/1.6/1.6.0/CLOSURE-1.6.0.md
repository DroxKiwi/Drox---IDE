# Clôture 1.6.0 (brouillon — avant dogfood / ship)

**Branche** : `1.6.0`  
**Version** : `droxVersion` **1.6.0**  
**Statut** : Vagues 1–4 + post-V4 + **Option A Explore** **en code** · inventaire prompts ✅ · recovery D1–D3 ⬜ · dogfood **en cours** · ship **pas encore**

## Livré (moteur + UI)

| Lot | Contenu |
|-----|---------|
| **L-1 / L-2** | Plus de reset detector sur DONE_ONLY ; hard-stop text_only |
| **L-tools** | Hash tools global progress-aware |
| **L-3** | Nudges system foldés (pas de faux user reminder) |
| **C-1 / C-3 / C-2** | Compaction / snip → rewrite JSONL ; compact manuel aligné |
| **T-1** | Spill gros tool results |
| **G-1** | Jauge `estim.` / `provider` |
| **Vague 4** | Situation card / snip / CORE curation (voir PLAN-CONTEXT-SITUATION) |
| **Post-V4** | `drox-prompts` · soft work/plan/Explore · hors-WS · fix UTF-8 Explore · **post-merge** · **anti-rotation** — [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) |
| **Explore contrats** | `return_kinds` · artefacts / manifest · index · tags UI — [PLAN](PLAN-EXPLORE-RETURN-CONTRACTS.md) |
| **Explore Option A** | `explore_commit` · L0 · mono-kind · no `conclusion.md` · `artifacts_inline` |
| **Inventaire prompts** | `inventory-instructions.md` · example `inventory` · cadre [APPROCHE](APPROCHE-CONTRATS-ETAPE.md) |

## Ouvert (dogfood 2026-10-09 / 10)

| Sujet | Note |
|-------|------|
| **D3** C2 si truncated | Explore incomplete → parent re-lit librement |
| **D1** Spill « re-read » | Double incentive vs Preview dropped |
| **D2** Explore 0 commit | Abort / split / partial |
| Désempilage CORE / `tools.task` | Inventaire ✅ · coupe ⬜ |
| Revalider dogfood post-D* | Brief pédagogie → site-kdds |

## Reporté

| Sujet | Cible |
|-------|--------|
| OBS-1 / OBS-2 (export messages[] prod) | post-1.6.0 si dogfood l’exige |
| D5 bash IDE O/N | backlog plateforme |
| MCP lazy discovery | backlog |

## Docs

- [README.md](README.md)
- [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md)
- [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md)
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)
- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md)
- [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md)
- [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)
- [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)
- [`stable/1.6.0/RELEASE_NOTES.md`](../../../stable/1.6.0/RELEASE_NOTES.md)

## Checklist avant ship

- [ ] Dogfood S1–S4 (voir DIAGNOSTIC §8)
- [ ] Push `1.6.0` + merge / tag selon process
- [ ] Popup nouveautés (`droxReleaseNotes.ts` case `1.6.0`)
- [ ] Ship win32 + linux `v1.6.0`
- [ ] Finaliser ce fichier (retirer « brouillon »)

## Suite

Après ship : OBS si besoin · merge `main` · ouvrir la prochaine ligne produit.
