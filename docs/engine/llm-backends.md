# Backends LLM

## Idée centrale

Le moteur ne parle jamais « Ollama » ou « OpenAI » dans `drive_inner` : il parle le trait **`LlmClient`** (`stream_chat`, options, tool specs). Les adaptateurs traduisent vers le protocole HTTP du serveur d’inférence.

- HTTP : **`reqwest`** (TLS **rustls**, JSON, stream).
- SSE OpenAI-compat : **`eventsource-stream`** (+ parsing dans `openai/`).
- Erreurs / retry : typées côté `drox-llm` ; l’orchestration (quand relancer un tour) reste dans `drox-engine`.

Pourquoi deux familles ? Ollama expose une API `/api/chat` et des options (`num_ctx`, think) spécifiques ; la majorité des endpoints cloud/self-host parlent **Chat Completions** OpenAI. Une factory unique évite de forker la boucle agent.

## Factory

[`create_llm_client`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) choisit l’adaptateur selon `provider` + `LlmConfig`.

| Famille | Usage | Code |
|---------|--------|------|
| **Ollama** | Défaut local — `/api/chat`, `num_ctx`, think, sampling | [`adapters/ollama.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/ollama.rs), [`ollama/`](../../drox-engine/drox/crates/drox-llm/src/ollama/) |
| **OpenAI-compatible** | Chat Completions + SSE — vLLM, LM Studio, Mistral, HF, Scaleway, OVH, … | [`openai/`](../../drox-engine/drox/crates/drox-llm/src/openai/), [`adapters/openai_compatible.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/openai_compatible.rs) |

Trait : [`LlmClient`](../../drox-engine/drox/crates/drox-llm/src/client.rs) — `stream_chat`, `ToolSpec`, retry.

Les ids catalogue côté IDE / settings mappent vers ces adaptateurs (hors scope moteur pur).

## Paramètres de run

Passés via `agent.run` / config CLI :

| Groupe | Exemples |
|--------|----------|
| Endpoint | `server` / base URL, `model`, `api_key`, `headers`, `provider` |
| Sampling | `temperature`, `top_p`, `max_tokens`, options Ollama |
| Contexte | `num_ctx` |
| Thinking | `native_thinking`, `reasoning_effort`, `thinking_budget` (Qwen / LiteLLM, …) |
| Multimodal | `images[]` (`mime` + base64) si modèle + client supportent |

Le moteur **normalise** certains détails (ex. ordre des messages `system` pour backends stricts) — voir [`openai/request.rs`](../../drox-engine/drox/crates/drox-llm/src/openai/request.rs).

## Streaming

1. `LlmClient` streame tokens + éventuels `tool_calls` structurés.
2. `drive_inner` → `consume_stream` produit `TextDelta`, phases, tool calls.
3. Le thinking natif (si activé) est séparé de la prose `[phase: answering]` — l’UI IDE le plie souvent en « Native reasoning ».

## Indépendance cloud

Aucun compte cloud Drox n’est requis pour le cœur local : tu pointes vers **ton** Ollama ou **ton** endpoint compatible. Les clés API restent dans la config utilisateur / env — **jamais** committer.

Setup env documenté : [`drox-engine/DROX-ENV-SETUP.txt`](../../drox-engine/DROX-ENV-SETUP.txt) (si présent).

## Pièges fréquents

| Symptôme | Piste |
|----------|--------|
| Timeouts / 404 | Mauvaise `baseUrl` / modèle non pull Ollama |
| Tool calls ignorés | Backend qui ne renvoie pas le format tools attendu |
| Thinking invisible | `native_thinking` off ou modèle sans think |
| Doublons system | Normalisation OpenAI-compat — lire `request.rs` |

## Fichiers

| Rôle | Chemin |
|------|--------|
| Factory | [`factory.rs`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) |
| Adaptateurs | [`adapters/`](../../drox-engine/drox/crates/drox-llm/src/adapters/) |
| Schémas | [`schema.rs`](../../drox-engine/drox/crates/drox-llm/src/schema.rs) |
