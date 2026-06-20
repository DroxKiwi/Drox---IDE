# Shim moteur TUI → contrat IDE (1.5.0)

**Rôle** : couche `drox-cli/jsonrpc` qui traduit le mono-boucle TUI vers ce que `contrib/drox` envoie / consomme déjà — **sans** modifier la webview.

**Code** : `crates/drox-cli/src/jsonrpc/ide_event_shim.rs`, `handlers.rs`, `protocol.rs`.

---

## Params `agent.run` (IDE → moteur)

| Champ IDE | Traitement moteur |
|-----------|-------------------|
| `server`, `model`, `apiKey` | `LlmConfig` |
| `numCtx` | `with_num_ctx` (prioritaire sur `DROX_NUM_CTX`) |
| `topP`, `topK`, `repeatPenalty`, `minP`, `seed`, … | RPC si présents, sinon env spawn |
| `mode` : `analyze` / `trustEdit` / `imNotCrazy` | → `plan` / `acceptEdits` / `default` |
| `orchestrationMode`, `architectInteractionMode` | Ignorés (log debug) |

---

## Events moteur → IDE

| `AgentEvent` TUI | Wire IDE |
|------------------|----------|
| `phase_enter`, `phase_close`, `text_delta`, `tool_*`, `stop`, … | Relais JSON 1:1 |
| `PhaseEnter` / `PhaseClose` / `Stop` | + synthèse `rail_station_*` (voir ci-dessous) |

### Phases TUI → stations rail IDE

| Phase TUI | Station rail (`rail_station_enter`) |
|-----------|-------------------------------------|
| `analyzing`, `reading` | `read` |
| `clarifying` | `propose` |
| `planning` | `plan` |
| `acting` | `act` |
| `testing`, `verifying` | `verify` |
| `answering`, `done` | `answer` |
| `internal_reasoning` | *(aucune station)* |

À chaque nouvelle phase mappée : `rail_station_done` sur la station ouverte, puis `rail_station_enter` sur la suivante.

---

## Hors scope shim actuel

- `run_routing`, `llm_turn_prepared` (trace orchestration 1.4) — non émis
- `context_usage` — non émis par le TUI ; `context_snip` / `stop.usage` suffisent

---

## `initialize`

| Champ IDE | Valeur moteur 1.5 |
|-----------|-------------------|
| `orchestrationPipeline` | `tui_mono` (boucle unique TUI ; plus de `role_split`) |

## Tests

`cargo test -p drox-cli ide_event_shim`
