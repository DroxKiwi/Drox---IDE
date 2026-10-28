# Migration mentale — rail 1.4 / `role_split` → `tui_mono`

Évite de suivre de **fausses pistes** dans `docs/1.4/moteur/` ou d’anciens plans.

## Ce qui a changé

| Avant (1.4 / archives) | Maintenant (1.5+ / 1.6.1) |
|------------------------|----------------------------|
| Pipeline `role_split` (Architecte / Exécuteur) | **`tui_mono`** — une boucle |
| `agent/loop/`, `agent/rail/` | Module **[`agent/`](../../drox-engine/drox/crates/drox-engine/src/agent/)** — cœur [`run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) |
| Monolithe `agent.rs` (doc 1.5) | **Découpage** gates / phase / loop_detect / situation / … |
| Run rail **exécuté** moteur | Rail **supprimé** ; UI peut recevoir `rail_station_*` **synthétisés** ([`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs)) |
| Prompts éparpillés / `orchestration/` | Crate **[`drox-prompts`](../../drox-engine/drox/crates/drox-prompts/)** + façade [`prompts/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts/mod.rs) |
| `protocol.rs` handlers éclatés | **[`rpc_types.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs)** + **[`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs)** |
| Clôture = toujours `[phase: done]` | **`EngineProfile`** : `cloud-full` = done-driven ; **local** = clôture moteur ([agent-run-loop.md](agent-run-loop.md)) |
| Sous-agents « supprimés » | Explore via **`task`** — [mcp-and-subagents.md](mcp-and-subagents.md) |
| Loop → `LoopDetected` abort | Escalade **SyntheticDone** (souvent) — [agent-internals.md](agent-internals.md) |

## Ce qui reste utile dans `docs/1.4/moteur/`

| Page | Usage |
|------|--------|
| Permissions / hooks (05) | Concepts proches |
| Crates workspace (11) | Graphe — compléter `drox-prompts`, `drox-embed`, `drox-tui`, `drox-hooks` |
| Phases / events (10) | Idées ; chemins fichiers obsolètes |
| Rail, boucle, orchestration | **Archive** |

Hub actuel : [README.md](README.md).

## Champs RPC legacy

`orchestrationMode`, `architectInteractionMode`, … : **désérialisés**, **non routés**. Pipeline annoncé = **`tui_mono`**.

## Checklist « vieux doc / vieux grep »

1. Cherche **`drive_inner`** dans `agent/run/drive.rs` — pas `orchestration_run`.
2. **`[phase: done]`** : règle **`cloud-full`** ; profils **local** = tour sans outil ([agent-run-loop.md](agent-run-loop.md#clôture)).
3. **`ide_event_shim`** avant de conclure qu’un rail vit encore dans le moteur.
4. Prompts : **`drox-prompts`**, pas un seul `prompts.rs`.
5. Ignore **`role_split`** comme modèle mental du runtime.
