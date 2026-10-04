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

## Hypothèses de départ (classées)

| # | Hypothèse | Priorité |
|---|-----------|----------|
| H1 | Compaction live **non persistée** sur le chemin IDE JSON-RPC → reload du JSONL complet au message suivant | ★★★ |
| H2 | Protocole `[phase: done]` + nudges relancent le modèle sans nouveau user turn ; certains nudges **reset** le LoopDetector | ★★★ |
| H3 | Nudges mid-run convertis en faux messages **user** (`[System reminder]`) → le modèle régénère | ★★ |
| H4 | Jauge UI mélange estimation `bytes/4` et `input_tokens` fournisseur → saut d’affichage trompeur | ★★ |
| H5 | Gros résultats tools / Explore non microcompactables + historique intégral | ★★ |
| H6 | Sensibilité des modèles locaux aux protocoles de fin (amplificateur, pas cause racine seule) | ★ |

Détail figé : [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md).

## Ordre d’exécution (proposé)

1. **OBS** — dump / export du `messages[]` exact par itération (token unlock prod)  
2. **COMPACT** — persister compaction live IDE comme le TUI (summary + tail sur disque)  
3. **LOOP** — ne plus reset le LoopDetector sur nudges `done` / answering ; hard-stop après N réponses textuelles identiques  
4. **GAUGE** — séparer `estimated_ctx` vs `provider_input_tokens` dans l’UI  
5. **TOOLS** — plafonds / microcompact sur `task` / gros `file_read`  
6. **DOC + ship** — CLOSURE · RELEASE_NOTES · win/linux

## Avancement

| Volet | État |
|-------|------|
| Diagnostic initial (statique) | ✅ documenté |
| OBS — export prompt / unlock debug | ⬜ |
| COMPACT — persistance JSON-RPC | ⬜ |
| LOOP — gates + detector | ⬜ |
| GAUGE — compteurs tokens | ⬜ |
| TOOLS — plafonds résultats | ⬜ |
| Preuves dogfood (transcripts avant/après) | ⬜ |
| RELEASE_NOTES / CLOSURE / ship | ⬜ |

## Docs

| Fiche | Sujet |
|-------|--------|
| [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md) | Constats code + communauté (baseline) |
| [PLAN-AGENT-LOOP-CONTEXT.md](PLAN-AGENT-LOOP-CONTEXT.md) | Plan d’exécution · preuves · non-objectifs |
| [`docs/engine/`](../../engine/README.md) | Réf. runtime moteur |

## Décisions

- **Pas de nouveau paradigme** — on corrige l’orchestration, on ne remplace pas les phases.  
- **Preuve avant patch large** — OBS d’abord si un dump prod est accessible ; sinon patches COMPACT/LOOP avec tests moteur.  
- **Communauté** : Infinite Agentic Loops (IAL) = classe de bugs connue ; compaction doit être **persistée** (Pi / OpenClaw / Praison).

## Liens

- [Hub 1.6](../README.md)
- [Clôture 1.5.23](../../1.5/1.5.23/CLOSURE-1.5.23.md)
- [01-BRANCHE](../../operations/01-BRANCHE.md)
