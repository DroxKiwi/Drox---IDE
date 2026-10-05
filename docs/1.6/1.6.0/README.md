# 1.6.0 — Stabilisation agent (boucles · contexte · compaction)

**Statut** : **ouvert** · branche `1.6.0` · `droxVersion` **1.6.0**  
**Précédent** : [1.5.23](../../1.5/1.5.23/README.md) — clôturé · ship `v1.5.23` (+ hotfix Chat MS / diffs)  
**Suite** : à définir après clôture

## Cap

Trouver et corriger les causes **moteur** des symptômes dogfood :

1. **Boucles** — réponses identiques 2–3×, runs qui ne se terminent pas (tous modèles locaux / flash, pas seulement GLM).
2. **Contexte qui explose** — saut brutal de jauge (ex. ~78k → ~162k) entre deux messages.
3. **Observabilité** — pouvoir exporter / inspecter ce que le modèle reçoit vraiment (mode debug verrouillé en prod).

Sans changer le paradigme (phases, tools, MEMORY/DROX, régulation L1–L5).

## Document à suivre

→ **[ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)** — checklist complète (vagues, fichiers, tests, smokes).

## Ordre d’exécution (figé)

```text
Vague 1 — filets     : L-1 → L-2 → C-1 (+ C-3)
Vague 2 — contexte   : T-1 → L-tools → G-1 → C-2
Vague 3 — preuve     : OBS-1 → OBS-2 → L-3 (optionnel)
Clôture              : dogfood → RELEASE_NOTES → CLOSURE → ship
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

Détail : [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md).

## Avancement

| Volet | État |
|-------|------|
| Diagnostic + plan d’étapes | ✅ |
| Vague 1 — L-1 / L-2 / C-1 / C-3 | ✅ (moteur) |
| Vague 2 — T-1 / L-tools / G-1 / C-2 | ⬜ |
| Vague 3 — OBS / L-3 | ⬜ |
| Preuves dogfood | ⬜ |
| RELEASE_NOTES / CLOSURE / ship | ⬜ |

## Docs

| Fiche | Sujet |
|-------|--------|
| **[ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)** | **Checklist à appliquer** |
| [PLAN-AGENT-LOOP-CONTEXT.md](PLAN-AGENT-LOOP-CONTEXT.md) | Index lots / IDs / preuves |
| [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md) | Baseline technique + communauté |
| [`docs/engine/`](../../engine/README.md) | Réf. runtime moteur |

## Décisions

- **Vague 1 d’abord** (L-1 → L-2 → C-1) — ROI max, risque maîtrisé.  
- **Pas de nouveau paradigme** — on borne l’orchestration.  
- **OBS en Vague 3** — utile en dogfood ; pas bloquant pour démarrer les filets.  
- Industrie (Cursor / Claude Code / Cline) : hard-stop répétition + compaction **persistée** + gros results hors prompt.

## Liens

- [Hub 1.6](../README.md)
- [Clôture 1.5.23](../../1.5/1.5.23/CLOSURE-1.5.23.md)
- [01-BRANCHE](../../operations/01-BRANCHE.md)
