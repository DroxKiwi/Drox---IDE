# Plan — Brancher correctement toutes les options de connexion LLM

**Version** : **1.5.17**  
**Statut** : **implémenté** — wire `provider` · `OpenAiCompatibleClient` · test list+chat · adaptateurs séparés  
**Contexte** : wizard connexion OK pour **lister** les modèles ; chat runtime était 404 sur serveurs OpenAI-compatible (toujours `OllamaClient`)  
**Lié** : `llmProviders/*`, `drox-llm` (`adapters/` + `ollama/` + `openai/`)

---

## 0. Exigence produit (non négociable)

> **Toute option de connexion exposée dans l’UI Drox doit être une vraie implémentation runtime.**  
> Si l’utilisateur sélectionne un provider, list **et** chat agent (stream + tools) doivent fonctionner — pas un catalogue décoratif.

| Interdit | Obligatoire |
|----------|-------------|
| Provider visible mais chat toujours `/api/chat` Ollama | Dispatch runtime selon le provider choisi |
| « Test and save » = list only présenté comme connexion complète | Test qui valide le chemin réellement utilisé au chat (ou échec explicite) |
| Stub / half-wire / « on verra plus tard pour Mistral » | **Chaque** id du wizard livré = client + smoke OK |
| Retirer un provider de l’UI sans décision écrite | Si un provider n’est pas prêt : **ne pas l’afficher** (ou le marquer disabled avec raison) |

### Catalogue exposé → implémentation

**Self-hosted** (`DROX_PERSONAL_CONNECTION_PROVIDERS`) :

| id | Label UI | Runtime |
|----|----------|---------|
| `ollama` | Ollama | `OllamaClient` |
| `vllm` | vLLM | `OpenAiCompatibleClient` |
| `lmstudio` | LM Studio | `OpenAiCompatibleClient` |
| `openai_compatible` | API OpenAI-compatible | `OpenAiCompatibleClient` |

**Cloud** (`DROX_CLOUD_PROVIDER_SPECS`) :

| id | Label UI | Runtime |
|----|----------|---------|
| `ollama` | Ollama Cloud | `OllamaClient` + Bearer (déjà câblé IDE) |
| `huggingface` | Hugging Face | `OpenAiCompatibleClient` + Bearer |
| `mistral` | Mistral AI | `OpenAiCompatibleClient` + Bearer |
| `scaleway` | Scaleway | `OpenAiCompatibleClient` + Bearer |
| `ovhcloud` | OVHcloud AI Endpoints | `OpenAiCompatibleClient` + Bearer |

**Definition of Done globale** : pour **chaque** ligne ci-dessus, checklist §6. Pas de ship « openai_compatible seul » en laissant les cloud sur le mauvais client.

---

## 1. Diagnostic (repro utilisateur) — figé

| Étape | Comportement (avant fix) |
|-------|----------------|
| Wizard « API OpenAI-compatible » | URL `http://192.168.92.141:4000` + headers `Authorization` |
| Test connexion | **OK** — `GET …/v1/models` |
| Message chat « Salut » | **KO** — `LLM API error (status 404): {"detail":"Not Found"}` |

### Cause racine

| Couche | Provider | Endpoint |
|--------|----------|----------|
| **IDE catalogue** | non-ollama | `GET {base}/v1/models` |
| **Moteur runtime** | **tous** (`provider` absent du wire) | `POST {base}/api/chat` |

---

## 2. Matrice cible (livrée)

1. **`ollama`** (local + **Ollama Cloud**) → `/api/tags` + `/api/chat` (NDJSON) — famille Ollama  
2. **Tous les autres ids exposés** → `/v1/models` + `/v1/chat/completions` (SSE OpenAI, tools)

### Ollama Cloud (décision figée)

- Id catalogue : `ollama` (même famille que local).
- Auth : Bearer via headers IDE quand le serveur est cloud (`ollama.com`).
- Protocole : **Ollama** (`/api/chat`), pas OpenAI — aligné sur la doc cloud Ollama + headers déjà câblés.

---

## 3. Écart actuel vs cible

| # | Écart | Statut |
|---|--------|--------|
| C1 | `agent.run` n’envoie pas `provider` | **fait** — `buildAgentRunParams` |
| C2 | Runtime toujours `OllamaClient` | **fait** — `create_llm_client` |
| C3 | Pas de client OpenAI stream+tools | **fait** — `drox-llm/src/openai/` |
| C4 | Test connexion = list only | **fait** — list + mini POST chat |
| C5 | Normalisation base URL list vs chat | **fait** — `buildLlmChatUrl` / `openai_chat_completions_url` |
| C6–C8 | Auth / tools / catalogue | **fait** (factory + headers) |

---

## 4. Plan d’implémentation — statut

### Phase A — Contrat wire — **fait**

1. Champ `provider` sur `AgentRunParams` + `SessionCompactParams`.
2. IDE : `buildAgentRunParams` / compact envoient `llmProvider`.
3. Rust : `create_llm_client(provider, config)` — défaut `ollama`.
4. CLI TUI : `--provider` / `DROX_PROVIDER`.

### Phase B — Client OpenAI-compatible — **fait**

`OpenAiCompatibleClient` : URL join, SSE, tools, erreurs avec URL.

### Phase C — Test connexion honnête — **fait**

`buildLlmChatUrl` + `probeLlmChat` ; échec explicite si list OK / chat KO.

### Phase D — Validation providers — **doc + unitaires**

Ordre smoke (manuel hors CI si pas de clé) :

| # | Provider | Notes |
|---|----------|-------|
| 1 | `openai_compatible` | repro 404 → doit passer chat |
| 2 | `vllm` | local |
| 3 | `lmstudio` | local |
| 4–7 | mistral / scaleway / ovhcloud / huggingface | Bearer + `/v1` |
| 8–9 | `ollama` local + cloud | régression |

Tests unitaires : `cargo test -p drox-llm` (URL, SSE, tools, factory).

---

## 5. Fichiers / symboles

| Zone | Fichier |
|------|---------|
| IDE wire | `droxRunSettings.ts`, `droxSessionCompactService.ts` |
| IDE list/test | `llmProviders/*`, `droxLlmCatalog.ts`, `droxChatConnectionTest.ts`, `droxLocalHttp.ts` |
| RPC | `protocol.rs`, `handlers.rs` |
| LLM protocole | `drox-llm/src/ollama/*`, `openai/{client,request,sse,url,protocol}` |
| LLM adaptateurs | `drox-llm/src/adapters/{ollama,vllm,lmstudio,…}.rs` |
| CLI | `drox-cli/src/main.rs` `--provider` |
| Docs | ce fichier |

---

## 6. Critères d’acceptation

### Global

- [x] **Aucun** provider du wizard n’utilise le mauvais protocole au chat (factory)
- [x] Test connexion valide list **et** chat
- [x] 404 / auth : message avec URL tentée (`LlmError::Api` + probe UI)
- [x] Tests unitaires URL + stream + tools OpenAI
- [ ] Régression `ollama` local — **smoke manuel**

### Par provider exposé

| Provider | Unitaire / factory | Smoke manuel |
|----------|--------------------|--------------|
| `ollama` (personal) | [x] | [ ] |
| `vllm` | [x] | [ ] |
| `lmstudio` | [x] | [ ] |
| `openai_compatible` | [x] | [ ] repro utilisateur |
| `ollama` (cloud) | [x] (même client) | [ ] |
| `huggingface` | [x] | [ ] |
| `mistral` | [x] | [ ] |
| `scaleway` | [x] | [ ] |
| `ovhcloud` | [x] | [ ] |

Sans clé CI : cocher smoke manuel au fur et à mesure ; **jamais** laisser un id sur le mauvais client.

---

## 7. Effort estimé (rétrospectif)

Phases A–C livrées en **1.5.17** ; D = smoke manuel documenté.

---

## 8. Décisions

1. **Ollama Cloud** : famille **Ollama** + Bearer — **figé** (§2).
2. Champ RPC : string alignée `DroxLlmProviderId` ; défaut `ollama`.
3. Livraison : **1.5.17** (même ligne produit).

---

## Références

- IDE list : `buildLlmModelListUrl` · chat : `buildLlmChatUrl`
- Runtime : `create_llm_client` → `OllamaClient` | `OpenAiCompatibleClient`
- Catalogues : `droxConnectionCatalog.ts`, `droxCloudConnectionRegistry.ts`
