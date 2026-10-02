# Auto-regulation (`contrib/drox/.../regulation`)

Découplé du moteur : **sonde** (notes) · **history** (prompts) · **surface** (modules L1–L5) · console UI · wrappers aux bords.

Spec : [`docs/1.5/1.5.22/PLAN-MODEL-AUTO-REGULATION.md`](../../../../../../docs/1.5/1.5.22/PLAN-MODEL-AUTO-REGULATION.md)

## Principe

On n’adapte **pas** les capacités du moteur. On adapte **ce qu’on expose au modèle** (contexte, tools, directivité, protocole, retrieval).

## Layout

```text
common/regulation/
  README.md
  droxRegulationTypes.ts      # L1–L5, modules, scores, history entry
  droxRegulationProbe.ts      # IDroxRegulationProbe (notes)
  droxRegulationHistory.ts    # IDroxRegulationHistory (histo runs)
  droxRegulationSurface.ts    # IDroxRegulationSurface (modules effectifs)
  droxRegulationPaths.ts
  droxRegulationHistoryStore.ts  # `.drox/regulation/history.json`
  droxRegulationRunSignals.ts # extract signals (done + trace + transcript)
  droxRegulationScorer.ts     # formules v0 L1–L5
  droxRegulationScoreAggregate.ts
  droxRegulationScoreBand.ts
  droxRegulationSurfaceStore.ts # `.drox/regulation/surface.json`
  droxRegulationCharts.ts      # séries + sparkline points (R4)
  droxRegulationL1Budget.ts   # R6 L1 context budget tables + apply helpers
  droxRegulationL2Surface.ts  # R7 L2 tool surface allowlists + apply helpers
  droxRegulationL3Directive.ts # R8 L3 directive density annexes
  droxRegulationL4Protocol.ts # R9 L4 protocol strictness annexes
  droxRegulationServiceContract.ts  # IDroxRegulationService (DI unique)
  droxRegulationService.ts    # probe + history R2

electron-browser/
  droxRegulationProbeContribution.ts  # agent/done → recordRun

browser/regulation/           # console UI (R3+)
  droxRegulationConsole.ts
  media/droxRegulationConsole.css
```

## Roadmap (package)

| Étape | Contenu |
|-------|---------|
| **R0** | Types + contrats + stub — **aucun effet run** |
| **R1** | Scorer + sonde `agent/done` (scores in-memory, pas d’UI) |
| **R2** | History store `.drox/regulation/history.json` |
| **R3** | Console observatoire (onglet Regulation) — sans Auto |
| **R4** | Graphiques (sparkline globale + barre issues) |
| **R5** | Overrides UI (module + Auto) — state persisté, pas encore de wrap |
| **R6** | Wrapper L1 Context budget — **inject Codebase + session notes** |
| **R7** | Wrapper L2 Tool surface — **allowlist tools → disabledTools / executable** |
| **R8** | Wrapper L3 Directive density — **annex system guided/assertive** |
| **R9** | Wrapper L4 Protocol strictness — **annex todo/phase soft/normal/strict** |
| **R10** | Wrapper L5 Retrieval posture |
| **R11** | Policy Auto |
| **R12** | Pass docs fin de maj |

## Règles

1. Pas de scoring dans `agent.rs` / index / chat unrelated.  
2. Wrappers lisent uniquement `IDroxRegulationSurface.getModule`.  
3. Producteurs d’events restent ignorants de ce package.
