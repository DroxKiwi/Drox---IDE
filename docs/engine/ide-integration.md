# Intégration IDE ↔ moteur

## Process

Sur le **process main** Electron :

1. Résoudre le binaire `drox` (packagé sous `resources/drox/…` ou build debug).
2. Spawn `drox --serve` (stdio).
3. `DroxRpcClientMain` parle NDJSON.
4. Le renderer / workbench passe par des services Electron (`DroxEngineService`) et le bridge agent.

## Chemin chat → run

```text
UI chat / Agents
  → droxAgentRunBridge (common)
  → DroxEngineService (electron-browser)
  → main : RPC client
  → initialize({ executableTools, interactiveAsk, … })
  → agent.run(params)
  ← agent/event  (texte, tools, phases, …)
  ← agent/done
```

Quand le moteur demande `tool/exec`, l’IDE exécute via `droxClientTools` / hosts fichier & shell, puis répond.

## Shim d’événements

`ide_event_shim` (côté CLI) adapte certains événements moteur pour l’UI historique (phases → `rail_station_*`, etc.). L’UI Agents / chat natif consomme le flux pour :

- streaming markdown / thinking ;
- widgets outils ;
- Changes / diffs ;
- états busy / cancel.

## Surfaces UI Drox

Sous `src/vs/workbench/contrib/drox/` :

- chat natif / Agents ;
- settings modèles & mute params LLM ;
- Changes / git composer ;
- bridge sessions.

Le **webview legacy** et le chat natif convergent progressivement ; le contrat moteur reste le même RPC.

## Fichiers pivots

| Rôle | Chemin |
|------|--------|
| Bridge run | `…/contrib/drox/common/droxAgentRunBridge.ts` |
| Service renderer | `…/electron-browser/droxEngineService.ts` |
| Client RPC main | `…/electron-main/droxRpcClientMain.ts` |
| Outils client | `…/common/droxClientTools.ts` |
| Doc shim historique | `docs/1.5/1.5.0/SHIM-MOTEUR-IDE.md` |
