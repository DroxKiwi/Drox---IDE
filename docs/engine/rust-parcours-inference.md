# Parcours Rust — une requête d’inférence (Ollama)

Scénario : l’IDE (ou la CLI) a choisi un **provider** (`ollama`) + une URL + un modèle.  
On suit le code jusqu’au `POST /api/chat` et au stream de tokens, en nommant chaque construction Rust.

## Fichiers à ouvrir (dans l’ordre)

| # | Fichier | Rôle dans le parcours |
|---|---------|----------------------|
| 1 | [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) | Construit la config et le client, crée l’`Agent` |
| 2 | [`factory.rs`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) | Point d’entrée factory |
| 3 | [`adapters/mod.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/mod.rs) | `match` sur l’id provider |
| 4 | [`adapters/ollama.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/ollama.rs) | Instancie `OllamaClient` |
| 5 | [`client.rs`](../../drox-engine/drox/crates/drox-llm/src/client.rs) | Trait `LlmClient`, `ChatOptions` |
| 6 | [`ollama/protocol.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/protocol.rs) | Structs JSON wire (serde) |
| 7 | [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) | HTTP + stream NDJSON |
| 8 | [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | Stocke le client, appelle `stream_chat`, consomme le flux |

Schéma :

```text
agent.run (JSON-RPC)
  → build_llm_config          // let mut + builders
  → create_llm_client         // Result + Arc<dyn LlmClient>
  → OllamaClient::new         // struct + impl
  → Agent::new(llm, …)        // champ Arc<dyn …>
  → drive_inner
       → let options = …
       → self.llm.stream_chat(…).await
       → POST /api/chat (reqwest)
       → BoxStream d’événements
       → consume_stream
```

---

## 1. Une config mutable — `let mut` et builders

Dans [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs), `build_llm_config` assemble l’URL, le modèle, les headers, le sampling :

```rust
let mut llm_config = LlmConfig::try_from_str(&server_url, &model)
    .map_err(|e| RpcError::new(CONFIG_ERROR, format!("invalid LLM config: {e}")))?;
if let Some(k) = api_key.or_else(|| std::env::var("DROX_API_KEY").ok()) {
    llm_config = llm_config.with_api_key(k);
}
```

| Morceau | En Rust | À quoi ça sert ici |
|---------|---------|-------------------|
| `let mut llm_config` | **Variable mutable** : on pourra la réassigner | Accumuler clé API, headers, `num_ctx`, etc. |
| `LlmConfig::try_from_str(…)` | **Fonction associée** sur une struct (comme un « constructeur ») | Parse URL + modèle → `Result` |
| `.map_err(…)?` | Transformer l’erreur puis **`?`** (early return) | Remonter une erreur RPC propre |
| `if let Some(k) = …` | **Pattern matching** sur `Option` | N’appliquer la clé que si elle existe |
| `llm_config = llm_config.with_api_key(k)` | Pattern **builder** : consomme `self`, renvoie une nouvelle valeur | Style idiomatique Rust (souvent via `mut self` dans la méthode) |

Plus bas dans `build_agent_setup` :

```rust
let llm = create_llm_client(params.provider.as_deref(), llm_config)?;
```

- `params.provider` est un `Option<String>`.
- `.as_deref()` : `Option<String>` → `Option<&str>` (emprunt sans cloner toute la String).
- `let llm` : **immutable** — une fois le client créé, on ne le remplace pas dans cette fonction ; on le **passe** à l’agent.

---

## 2. La factory — `Result`, `Arc`, `dyn Trait`

[`factory.rs`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) :

```rust
pub fn create_llm_client(
    provider: Option<&str>,
    config: LlmConfig,
) -> Result<Arc<dyn LlmClient>, LlmError> {
    adapters::create_for_provider(provider, config)
}
```

| Morceau | Sens |
|---------|------|
| `Option<&str>` | Provider optionnel (`None` → Ollama par défaut) |
| `LlmConfig` | Struct de config **prise par valeur** (moved dans la factory) |
| `Result<T, E>` | Succès `Ok(client)` ou échec `Err(LlmError)` |
| `Arc<…>` | **Atomic Reference Counted** : plusieurs owners partagés thread-safe |
| `dyn LlmClient` | **Trait object** : on ne connaît plus le type concret (`OllamaClient` vs OpenAI) au compile-time de `Agent` |

Pourquoi `Arc<dyn LlmClient>` ? L’`Agent` doit appeler `stream_chat` **sans** savoir si c’est Ollama ou vLLM. Le type concret est choisi une fois à la factory ; ensuite tout le moteur parle le **contrat** `LlmClient`.

---

## 3. Choisir l’adaptateur — `match`

[`adapters/mod.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/mod.rs) :

```rust
pub fn create_for_provider(
    provider: Option<&str>,
    config: LlmConfig,
) -> Result<Arc<dyn LlmClient>, LlmError> {
    let p = provider.unwrap_or("ollama").trim().to_ascii_lowercase();
    match p.as_str() {
        "" | "ollama" => ollama::create(config),
        "vllm" => vllm::create(config),
        // …
        _ => openai_compatible::create(config),
    }
}
```

| Morceau | Sens |
|---------|------|
| `unwrap_or("ollama")` | Si `None`, valeur par défaut |
| `let p = …` | Nouvelle binding immutable (String après `to_ascii_lowercase`) |
| `match` | Branchement exhaustif sur des motifs (`"" \| "ollama"`, `_` catch-all) |
| `ollama::create(config)` | **Move** de `config` dans la branche choisie |

Chaque branche renvoie le **même type** : `Result<Arc<dyn LlmClient>, LlmError>` — c’est ce qui permet au `match` de typer.

---

## 4. Instancier le client concret — `struct` + `Arc::new`

[`adapters/ollama.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/ollama.rs) :

```rust
pub fn create(config: LlmConfig) -> Result<Arc<dyn LlmClient>, LlmError> {
    Ok(Arc::new(OllamaClient::new(config)?) as Arc<dyn LlmClient>)
}
```

Enchaînement :

1. `OllamaClient::new(config)?` — construit la struct concrète (voir §5).
2. `Arc::new(…)` — place l’instance sur le tas, compteur de références = 1.
3. `as Arc<dyn LlmClient>` — **coercion** vers trait object (oublie le type `OllamaClient` pour le reste du programme).

C’est l’**instance** dont parlera tout le parcours : un `OllamaClient` vivant derrière un `Arc<dyn LlmClient>`.

---

## 5. Anatomie de `OllamaClient` — champs et `impl`

Dans [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) :

```rust
pub struct OllamaClient {
    http: Client,           // reqwest::Client — pool HTTP réutilisable
    base_url: Url,          // ex. http://127.0.0.1:11434
    model: String,          // ex. "qwen2.5"
    defaults: OllamaSamplingDefaults,
    keep_alive: Option<String>,
}
```

En Rust, une **`struct`** est un agrégat de champs (proche d’une « classe » sans héritage).  
Les méthodes vivent dans un bloc **`impl OllamaClient { … }`** :

```rust
impl OllamaClient {
    pub fn new(config: LlmConfig) -> Result<Self, LlmError> {
        let mut builder = Client::builder().timeout(config.timeout());
        // … headers optionnels …
        let http = builder.build()?;
        Ok(Self {
            http,
            base_url: config.base_url,
            model: config.model,
            defaults: OllamaSamplingDefaults { /* … */ },
            keep_alive: config.keep_alive,
        })
    }

    fn chat_endpoint(&self) -> Result<Url, LlmError> {
        self.api_url("api/chat")
    }
}
```

| Syntaxe | Sens |
|---------|------|
| `Self` | Alias du type qu’on implémente (`OllamaClient`) |
| `&self` | Emprunt **immutable** de l’instance (lire `base_url` sans la prendre) |
| `&mut self` | Emprunt **mutable** (pas ici dans `new`) |
| `let mut builder` | Le builder HTTP est modifié puis consommé par `.build()` |
| `Ok(Self { http, base_url, … })` | **Struct update** / construction par champs (noms = variables locales) |

La lib **reqwest** fournit `Client` : une fois créé, on le clone / réutilise pour chaque `POST` (connexion keep-alive).

---

## 6. Le contrat — `trait` + `async_trait`

[`client.rs`](../../drox-engine/drox/crates/drox-llm/src/client.rs) :

```rust
#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn stream_chat(
        &self,
        messages: Vec<Message>,
        options: ChatOptions,
    ) -> Result<StreamHandle, LlmError>;
}
```

| Morceau | Sens |
|---------|------|
| `trait LlmClient` | Contrat : « tout backend doit savoir streamer un chat » |
| `: Send + Sync` | **Supertraits** : safe à envoyer entre threads / partager |
| `async fn` | La méthode est asynchrone (renvoie un Future) |
| `#[async_trait]` | Macro qui rend le trait **object-safe** avec `async` (nécessaire pour `dyn LlmClient`) |
| `Vec<Message>` | Liste owned de messages (historique + prompt) |
| `ChatOptions` | Struct d’options (température, tools, think…) |

Juste au-dessus, `ChatOptions` montre **`Option<T>`** et le pattern builder :

```rust
pub struct ChatOptions {
    pub temperature: Option<f32>,  // None = ne pas forcer
    pub max_tokens: Option<u32>,
    pub tools: Vec<ToolSpec>,
    pub think: Option<bool>,
}

impl ChatOptions {
    pub fn with_tools(mut self, tools: Vec<ToolSpec>) -> Self {
        self.tools = tools;
        self
    }
}
```

`mut self` ici : la méthode **prend possession** de la struct, modifie un champ, la rend. D’où dans l’agent :

```rust
let options = self.config.chat_options.clone().with_tools(tool_specs.clone());
```

- `.clone()` : `ChatOptions` dérive `Clone` — on duplique la config du run pour ce tour.
- `.with_tools(…)` : produit une **nouvelle** `ChatOptions` avec la liste d’outils du tour.

Alias de type pour le flux :

```rust
pub type StreamHandle = BoxStream<'static, Result<StreamEvent, LlmError>>;
```

`BoxStream` (crate **futures**) = stream alloué sur le tas, lifetime `'static` (peut vivre aussi longtemps que le process).

---

## 7. Brancher le trait sur la struct — `impl LlmClient for OllamaClient`

Toujours dans [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) :

```rust
#[async_trait]
impl LlmClient for OllamaClient {
    async fn stream_chat(
        &self,
        messages: Vec<Message>,
        options: ChatOptions,
    ) -> Result<StreamHandle, LlmError> {
        let url = self.chat_endpoint()?;
        let payload = build_request(
            &self.model,
            &messages,
            &options,
            self.defaults,
            self.keep_alive.as_deref(),
        );

        let response = self.http.post(url.clone()).json(&payload).send().await?;
        // … gestion status HTTP …

        let bytes_stream = response.bytes_stream();
        Ok(events_from_ndjson(bytes_stream).boxed())
    }
}
```

Lecture ligne à ligne :

| Ligne | Concept | Effet |
|-------|---------|--------|
| `impl LlmClient for OllamaClient` | **Implémentation de trait** | Relie le contrat au type concret |
| `let url = self.chat_endpoint()?` | `let` + `?` | URL `…/api/chat` ou erreur |
| `let payload = build_request(…)` | Appel de fonction libre | Construit le JSON Ollama (voir §8) |
| `&self.model`, `&messages` | **Emprunts** | On lit sans move |
| `self.http.post(…).json(&payload)` | API **reqwest** | Prépare POST + body JSON (serde) |
| `.send().await?` | **async/await** + `?` | Attend la réponse HTTP |
| `let bytes_stream = response.bytes_stream()` | Stream de `Bytes` | Corps HTTP en chunks |
| `.boxed()` | Transforme en `BoxStream` | Type unique = `StreamHandle` |

C’est **ici** que la « classe » instanciée au §4 **utilise** ses champs (`http`, `model`, `defaults`) pour parler au serveur d’inférence.

---

## 8. Le JSON wire — `serde` et lifetimes

[`ollama/protocol.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/protocol.rs) :

```rust
#[derive(Debug, Clone, Serialize)]
pub(super) struct ChatRequest<'a> {
    pub model: &'a str,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<ChatRequestOptions>,
    // …
}
```

| Morceau | Sens |
|---------|------|
| `#[derive(Serialize)]` | Génère le code pour transformer la struct en JSON |
| `ChatRequest<'a>` | Struct **paramétrée par un lifetime** `'a` |
| `model: &'a str` | Emprunt d’une string qui doit vivre au moins aussi longtemps que la requête |
| `pub(super)` | Visible seulement dans le module parent `ollama` |
| `skip_serializing_if` | N’émet pas la clé JSON si `None` / vec vide |

`build_request` (dans `stream.rs`) remplit cette struct à partir des `Message` Drox + `ChatOptions`.  
Au moment du `.json(&payload)`, **serde_json** sérialise → body HTTP.

---

## 9. Stocker le client dans l’agent — champ `Arc<dyn …>`

[`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) :

```rust
pub struct Agent {
    llm: Arc<dyn LlmClient>,
    registry: Arc<ToolRegistry>,
    ctx: ToolContext,
    config: AgentConfig,
}

impl Agent {
    pub fn new(
        llm: Arc<dyn LlmClient>,
        registry: Arc<ToolRegistry>,
        ctx: ToolContext,
        config: AgentConfig,
    ) -> Self {
        Self { llm, registry, ctx, config }
    }
}
```

Dans `handlers.rs`, après la factory :

```rust
let agent = Agent::new(llm, registry, ctx, agent_config);
```

Le `llm` du §2 **devient** le champ `agent.llm`.  
`Agent` dérive `Clone` : cloner l’agent **incrémente** les `Arc` (pas de copie du client HTTP).

---

## 10. Appeler l’inférence dans la boucle — `match` + `.await`

Toujours dans `drive_inner` ([`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs)) :

```rust
let options = self
    .config
    .chat_options
    .clone()
    .with_tools(tool_specs.clone());

let stream = match self.llm.stream_chat(messages.clone(), options).await {
    Ok(s) => s,
    Err(err) => {
        let _ = tx.send(Err(err.into())).await;
        return;
    }
};

let native_thinking_ui = self.config.chat_options.think == Some(true);

let Ok(mut outcome) = consume_stream(stream, &tx, native_thinking_ui).await else {
    return;
};
```

| Binding / expression | Concept | Rôle |
|----------------------|---------|------|
| `let options = …` | Immutable pour ce tour | Options + tools injectés |
| `self.llm` | Accès au champ `Arc<dyn LlmClient>` | Dispatch dynamique vers Ollama (ou autre) |
| `.stream_chat(…).await` | Appel async du trait | Lance le POST (§7) |
| `match … { Ok(s) => s, Err(err) => … }` | Gestion explicite du `Result` | Erreur → event + `return` |
| `messages.clone()` | Clone de l’historique | `stream_chat` prend `Vec` owned ; on garde `messages` pour le tour suivant |
| `let native_thinking_ui = … == Some(true)` | Comparaison sur `Option` | Active l’UI thinking si demandé |
| `let Ok(mut outcome) = … else { return }` | **let-else** (Rust moderne) | Échec soft si le canal UI est fermé |
| `mut outcome` | Mutable | `consume_stream` / suite du tour peuvent enrichir l’outcome |

`consume_stream` lit ensuite le flux avec un motif du genre `while let Some(event) = stream.next().await` : chaque `StreamEvent` devient un `AgentEvent` poussé vers l’IDE.

---

## 11. Le stream générique — un cran plus « complexe »

Toujours dans `ollama/stream.rs` :

```rust
fn events_from_ndjson<S>(
    bytes_stream: S,
) -> impl Stream<Item = Result<StreamEvent, LlmError>> + Send + 'static
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
```

| Morceau | Sens |
|---------|------|
| `<S>` | **Paramètre de type** (générique) |
| `where S: Stream<…>` | Contraintes : `S` doit être un stream de chunks HTTP |
| `-> impl Stream<…>` | Le type de retour est **opaque** (le compilateur connaît le type concret, l’appelant non) |
| `+ Send + 'static` | Envoyable entre tâches Tokio, pas de lifetime emprunté court |

Puis `.boxed()` fige ça en `BoxStream` = `StreamHandle`.

À l’intérieur (résumé) : `StreamReader` + `FramedRead` + `LinesCodec` (tokio-util) découpent le NDJSON Ollama ligne par ligne ; chaque ligne est désérialisée (`serde_json::from_str`) en chunk, puis mappée en `StreamEvent`.

---

## 12. Variante OpenAI-compatible (même Rust, autre wire)

Même trait `LlmClient`, même `Arc<dyn …>` dans `Agent`.  
Fichiers jumeaux : [`adapters/openai_compatible.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/openai_compatible.rs), [`openai/client.rs`](../../drox-engine/drox/crates/drox-llm/src/openai/client.rs).

Différence principale : corps en **SSE** (`eventsource-stream`) vers `/v1/chat/completions`, pas NDJSON Ollama.  
Les concepts Rust (`impl LlmClient for …`, `async`, `Result`, `.boxed()`) sont **identiques**.

---

## Checklist « j’ai compris ce parcours »

- [ ] Je sais où naît `let mut llm_config` et pourquoi elle est mutable.
- [ ] Je peux expliquer pourquoi le type exposé est `Arc<dyn LlmClient>` et pas `OllamaClient`.
- [ ] Je trouve l’`impl LlmClient for OllamaClient` et le `POST` reqwest.
- [ ] Je relie `ChatRequest` (serde) au body HTTP.
- [ ] Je vois dans `drive_inner` le `match` sur `stream_chat(…).await` et le `let mut outcome`.
- [ ] Je distingue **config** (`LlmConfig` / `ChatOptions`), **client** (`OllamaClient`), **contrat** (`LlmClient`), **consommateur** (`Agent` / `consume_stream`).

## Suite possible (autres parcours)

Sur le même modèle pédagogique :

- **Exécution d’un tool** : `Tool` trait → `ToolRegistry` → `partition_tool_calls` → `RemoteTool` / local.
- **JSON-RPC stdio** : lire une ligne, `serde_json::from_str`, `match` sur `method`.

Index Rust : [rust-par-le-moteur.md](rust-par-le-moteur.md).
