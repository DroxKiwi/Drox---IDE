Rédigé à l'aide de Cursor Agent

# Migration mentale — rail 1.4 / `role_split` → `tui_mono`

Cette page évite de suivre de **fausses pistes** dans `docs/1.4/moteur/` ou d’anciens plans.

## Ce qui a changé

| Avant (1.4 / archives) | Maintenant (1.5+) |
|------------------------|-------------------|
| Pipeline `role_split` (Architecte / Exécuteur) | **`tui_mono`** — une boucle |
| Arborescence `agent/loop/`, `agent/rail/` | Fichier unique [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) + modules plats |
| Run rail **exécuté** dans le moteur | Rail **supprimé** côté moteur ; UI peut recevoir des `rail_station_*` **synthétisés** par [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |
| `orchestration/` / RoleId routing | Prompts centralisés [`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) |
| Handlers éclatés `handlers/agent_run.rs` | [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) monolithique |
| Doc « sous-agents supprimés » | Explore **réintroduit** via `task` — [mcp-and-subagents.md](mcp-and-subagents.md) |

## Ce qui reste utile dans `docs/1.4/moteur/`

| Page | Usage |
|------|--------|
| Permissions / hooks (05) | Concepts encore proches |
| Crates workspace (11) | Graphe proche — compléter avec `drox-tui` / `drox-hooks` |
| Idée des phases / events (10) | Concepts ; chemins fichiers obsolètes |
| Reste (rail, boucle, orchestration) | **Archive** seulement |

Hub actuel : [`docs/engine/README.md`](README.md).

## Champs RPC legacy

L’IDE peut encore envoyer `orchestrationMode` / `architectInteractionMode`. Le serveur les **désérialise** mais **n’en fait pas** le routage — l’orchestration est `tui_mono`.

## Checklist « je lis du vieux code / vieux doc »

1. Cherche `tui_mono` / `drive_inner` — pas `orchestration_run`.
2. Cherche `[phase: done]` — pas « no tools ⇒ end ».
3. Cherche `ide_event_shim` avant de conclure qu’un rail existe encore dans le moteur.
4. Ignore `role_split` comme modèle mental du runtime actuel.
