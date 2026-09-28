# Backends LLM

## Factory

`drox-llm` expose une factory `create_llm_client(provider, LlmConfig)` qui choisit l’adaptateur.

Deux familles principales :

| Famille | Usage |
|---------|--------|
| **Ollama** | Défaut local — API `/api/chat`, options `num_ctx`, think, sampling |
| **OpenAI-compatible** | Chat Completions (+ SSE) — vLLM, LM Studio, Mistral, Hugging Face, Scaleway, OVHcloud, etc. |

Les ids catalogue côté IDE / settings mappent vers ces adaptateurs.

## Paramètres de run (exemples)

Passés via `agent.run` / config :

- `server` / `baseUrl`, `model`, `apiKey`, headers custom ;
- `provider` (ollama, openai, …) ;
- sampling : temperature, top_p, … ;
- `nativeThinking` / effort (`reasoningEffort`) / budget (`thinkingBudget`) — utiles pour Qwen / LiteLLM ;
- images multimodales si le modèle et le client les supportent.

Le moteur **normalise** certains détails de protocole (ex. ordre des messages `system` pour des backends stricts type LiteLLM/Qwen) — voir `drox-llm` (`openai/request.rs`, etc.).

## Streaming

- Le client LLM streame tokens + éventuels tool_calls structurés.
- `drive_inner` consomme le stream, émet des `AgentEvent` texte / thinking / tool vers le client UI.

## Indépendance cloud

Aucun compte cloud Drox n’est requis pour le cœur local : tu pointes vers **ton** Ollama ou **ton** endpoint compatible. Les clés API éventuelles restent dans la config utilisateur / env (jamais committer).

## Fichiers

- `drox-engine/drox/crates/drox-llm/src/factory.rs`
- `…/adapters/`
- `…/openai/`, client Ollama
- Setup env : `drox-engine/DROX-ENV-SETUP.txt`
