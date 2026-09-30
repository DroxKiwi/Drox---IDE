# Intégration IDE ↔ moteur

> Contrat technique IDE → moteur. Pour **apprendre l’interface** (où cliquer) : [tutoriel navigation IDE](../tutorials/ide-navigation.md).

## Process

Sur le **process main** Electron :

1. Résoudre le binaire `drox` (packagé sous `resources/drox/…` ou build debug).
2. Spawn `drox --serve` (stdio).
3. Client RPC NDJSON (`DroxRpcClientMain`).
4. Le renderer / workbench passe par `DroxEngineService` et le bridge agent.

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
Quand `user/ask` : dialogue permission / question.

## Shim d’événements

[`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) adapte certains événements moteur pour l’UI historique (phases → `rail_station_*`, etc.). L’UI Agents / chat natif consomme le flux pour :

- streaming markdown / thinking ;
- widgets outils ;
- Changes / diffs ;
- états busy / cancel.

## Surfaces UI Drox (hors moteur)

Sous [`src/vs/workbench/contrib/drox/`](../../src/vs/workbench/contrib/drox/) :

- chat natif / Agents ;
- settings modèles & mute params LLM ;
- Changes / git composer ;
- bridge sessions.

Le **webview legacy** et le chat natif convergent progressivement ; le contrat moteur reste le même RPC.

## Fichiers pivots

| Rôle | Chemin |
|------|--------|
| Bridge run | [`droxAgentRunBridge.ts`](../../src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts) |
| Service renderer | [`droxEngineService.ts`](../../src/vs/workbench/contrib/drox/electron-browser/droxEngineService.ts) |
| Client RPC main | [`droxRpcClientMain.ts`](../../src/vs/workbench/contrib/drox/electron-main/droxRpcClientMain.ts) (chemin exact à confirmer si renommé) |
| Outils client | [`droxClientTools.ts`](../../src/vs/workbench/contrib/drox/common/droxClientTools.ts) |
| Doc shim historique | [`docs/1.5/1.5.0/SHIM-MOTEUR-IDE.md`](../1.5/1.5.0/SHIM-MOTEUR-IDE.md) |

Voir aussi [clients-tui-vs-rpc.md](clients-tui-vs-rpc.md).
