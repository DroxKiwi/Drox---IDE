Rédigé à l'aide de Cursor Agent

# Comment Drox parle à Ollama — lire le Rust ligne à ligne

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le moment où le moteur envoie une question à un **serveur d’inférence** (souvent **Ollama** sur ta machine) et récupère la réponse **morceau par morceau**.

Tout au long de ce texte, nous détaillerons **petit à petit chaque idée du code** pour expliquer :

- **comment** on écrit du Rust (la syntaxe : les mots, les symboles, l’ordre) ;
- **pourquoi** on l’écrit ainsi (ce que ça change pour la machine, la sécurité, la performance) ;
- **à quoi ça sert** dans Drox (quel problème concret ça résout dans le chat).

Tu n’as pas besoin de connaître un autre langage. Quand un mot technique apparaît, on le définit **au moment où on en a besoin**, avec une image mentale simple, puis on le retrouve dans un vrai fichier du dépôt.

### L’histoire en une phrase

Quand tu envoies un message dans Drox, le moteur Rust finit par faire l’équivalent de :  
« *Cher serveur Ollama, voici l’historique et les outils ; envoie-moi la réponse en flux.* »  
Puis il lit ce flux et le transforme en événements pour l’interface.

### Fichiers que tu peux laisser ouverts

| Fichier | Rôle dans l’histoire |
|---------|----------------------|
| [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) | Prépare la config et crée l’agent |
| [`factory.rs`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) | Choisit quel « pilote » LLM utiliser |
| [`adapters/mod.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/mod.rs) | Branche Ollama / OpenAI / … |
| [`adapters/ollama.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/ollama.rs) | Construit le client Ollama |
| [`client.rs`](../../drox-engine/drox/crates/drox-llm/src/client.rs) | Contrat commun à tous les backends |
| [`ollama/protocol.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/protocol.rs) | Forme du JSON envoyé à Ollama |
| [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) | Envoi HTTP + lecture du flux |
| [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | Boucle qui appelle le client et consomme le flux |

```text
Message utilisateur
        ↓
  handlers (config + création agent)
        ↓
  create_llm_client → OllamaClient
        ↓
  Agent.drive_inner
        ↓
  stream_chat → POST http://…/api/chat
        ↓
  flux de tokens → événements UI
```

---

## Partie A — Idées de base (avant même « Rust »)

### A.1 Qu’est-ce qu’un programme ?

Un **programme**, c’est une liste d’instructions que le processeur exécute, une après l’autre (ou en parallèle plus tard).  
Drox est un gros programme. Le fichier `drox.exe` / `drox` est le **binaire** : le résultat de la compilation du code source Rust.

- **Code source** (fichiers `.rs`) : texte que *toi* tu lis et modifies.
- **Compilation** (`cargo build`) : un outil transforme ce texte en instructions machine.
- **Exécution** : le système d’exploitation charge le binaire en **mémoire RAM** et lance le processeur dessus.

Pourquoi Rust ici ? Le moteur tourne longtemps, gère beaucoup de texte et de réseau, et doit être **prévisible** (peu de plantages silencieux). Rust force le programmeur à clarifier qui *possède* les données en mémoire — on le verra concrètement avec `Arc` et les emprunts.

### A.2 Qu’est-ce que la mémoire (vision simple) ?

Imagine la RAM comme une **énorme armoire à casiers numérotés**.

- Chaque casier peut contenir un petit bout d’information (un nombre, une lettre, une adresse vers un autre casier…).
- Un **nom** dans le code (comme `model` ou `url`) est une **étiquette** collée sur un casier (ou sur une suite de casiers) : ça permet au programmeur de dire « utilise *ceci* » sans retenir le numéro du casier.

Quand le programme s’arrête, ces casiers sont libérés (sauf données volontairement sauvées sur le disque — autre sujet : les sessions JSONL).

### A.3 Qu’est-ce qu’une variable ?

Une **variable**, c’est :

1. un **nom** choisi par le programmeur ;
2. une **valeur** stockée en mémoire ;
3. (en Rust) un **type** : la forme de cette valeur (`String` = texte, `u32` = entier positif, etc.).

En Rust, on déclare souvent ainsi :

```rust
let model = String::from("qwen2.5");
```

| Mot / symbole | Signification |
|---------------|----------------|
| `let` | « Je crée une liaison nom → valeur » |
| `model` | Le nom (l’étiquette) |
| `=` | « Associe ce nom à ce qui suit » |
| `String::from("…")` | Crée une chaîne de caractères **possédée** (texte alloué en mémoire) |
| `;` | Fin de l’instruction |

Par défaut, `let` crée une variable **immuable** : tu ne peux pas changer la valeur plus tard.  
Si tu as besoin de la modifier, tu écris `let mut …` (`mut` = *mutable*).

**Côté machine** : `let` réserve (ou réutilise) de la mémoire et enregistre que ce nom pointe vers cette zone. Le compilateur vérifie que tu n’utilises pas le nom de façon incohérente (mauvais type, valeur déjà « déplacée », etc.).

### A.4 Qu’est-ce qu’une fonction ?

Une **fonction**, c’est un **bloc d’instructions réutilisable**, avec :

- un **nom** ;
- éventuellement des **paramètres** (données en entrée) ;
- éventuellement une **valeur de retour** (donnée en sortie).

Analogie : une recette. Tu lui donnes des ingrédients (paramètres), elle produit un plat (retour).

Exemple inventé pour illustrer la syntaxe :

```rust
fn addition(a: i32, b: i32) -> i32 {
    a + b
}
```

| Élément | Rôle |
|---------|------|
| `fn` | Mot-clé : « voici une fonction » |
| `addition` | Nom |
| `(a: i32, b: i32)` | Paramètres + **types** attendus |
| `-> i32` | Type de la valeur renvoyée |
| `{ … }` | Corps : les instructions |
| `a + b` | Dernière expression = valeur retournée (pas besoin de `return` ici) |

**Côté machine** : appeler une fonction prépare une petite zone de travail (la *stack frame*), y place les arguments, exécute le corps, puis rend le résultat et libère cette zone (sauf données allouées ailleurs, ex. sur le *tas*).

Dans Drox, tu verras des fonctions comme `create_llm_client`, `build_llm_config`, `stream_chat`.

### A.5 Qu’est-ce qu’un type ?

Le **type** dit *quelle forme* a une donnée :

| Type (exemples) | Idée |
|-----------------|------|
| `i32`, `u64` | Entiers |
| `f32` | Nombre à virgule |
| `bool` | Vrai / faux |
| `String` | Texte possédé, longueur variable |
| `&str` | Emprunt d’un texte (souvent « vue » temporaire) |
| `Vec<T>` | Liste dynamique d’éléments de type `T` |
| `Option<T>` | Soit « rien » (`None`), soit une valeur `T` (`Some(…)`) |
| `Result<T, E>` | Soit succès `Ok(T)`, soit erreur `Err(E)` |

Rust est **statiquement typé** : le compilateur connaît les types **avant** l’exécution. Beaucoup d’erreurs sont donc attrapées à la compilation plutôt qu’au milieu d’un chat.

### A.6 Fichiers, crates, modules (organisation du code)

- Un fichier `.rs` contient du code.
- Une **crate** est un paquet Rust (bibliothèque ou binaire). Chez Drox : `drox-llm`, `drox-engine`, `drox-cli`, …
- Un **module** (`mod foo;` ou dossier `foo/`) range le code pour ne pas tout mettre dans un seul fichier géant.

Quand tu lis `crate::client::LlmClient`, ça veut dire : « dans *cette* crate, module `client`, symbole `LlmClient` ».

---

## Partie B — Préparer la config avant d’appeler Ollama

Retour à Drox. Avant de parler au serveur, le code **rassemble des réglages** : URL du serveur, nom du modèle, clé API éventuelle, taille de contexte…

Ça se passe surtout dans `build_llm_config` ([`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs)).

### B.1 Créer une variable qu’on va enrichir

Idée du code (forme simplifiée pour la lecture) :

```rust
let mut llm_config = LlmConfig::try_from_str(&server_url, &model)
    .map_err(|e| RpcError::new(CONFIG_ERROR, format!("invalid LLM config: {e}")))?;
```

Lis ça comme une phrase :

1. **`LlmConfig::try_from_str(...)`** — appelle une **fonction associée** à la structure `LlmConfig` (le `::` veut dire « méthode liée au *type*, pas encore à une instance »). Elle essaie de construire une config à partir d’une URL et d’un nom de modèle.
2. **`.map_err(|e| …)`** — si ça échoue, transforme l’erreur technique en erreur compréhensible pour le protocole IDE.
3. **`?`** — raccourci Rust : « si c’est une erreur, **quitte tout de suite** la fonction en renvoyant cette erreur ; sinon continue avec la valeur OK ».
4. **`let mut llm_config = …`** — range le résultat dans une variable **mutable** nommée `llm_config`.

**Pourquoi `mut` ?** Parce que les lignes suivantes vont *modifier* cette config (ajouter une clé API, des headers…). Avec un simple `let` sans `mut`, le compilateur refuserait ces modifications.

**Côté machine** : `llm_config` occupe de la mémoire avec plusieurs champs (URL, modèle, nombres…). `mut` autorise d’écrire à nouveau dans ces casiers.

### B.2 Modifier seulement si une valeur existe — `Option` et `if let`

```rust
if let Some(k) = api_key.or_else(|| std::env::var("DROX_API_KEY").ok()) {
    llm_config = llm_config.with_api_key(k);
}
```

| Morceau | Explication |
|---------|-------------|
| `api_key` | Souvent un `Option<String>` : soit le client a fourni une clé, soit non |
| `Option` | Type à deux cas : `None` (pas de valeur) ou `Some(valeur)` |
| `.or_else(|| …)` | Si c’était `None`, essaie une autre source (ici une variable d’environnement) |
| `if let Some(k) = …` | « Si on a réussi à obtenir une clé, appelle-la `k` et entre dans le bloc » |
| `with_api_key(k)` | Méthode qui **prend** la config, y met la clé, et **renvoie** une nouvelle config |
| `llm_config = …` | On **réassigne** la variable mutable |

**Pourquoi ce style ?** En Rust, on évite souvent les pointeurs nuls. `Option` force à traiter le cas « pas de clé » explicitement — pas de plantage mystérieux plus tard.

### B.3 Passer la config à la factory

```rust
let llm = create_llm_client(params.provider.as_deref(), llm_config)?;
```

- `let llm` — nouvelle variable **immuable** : le client LLM, une fois créé, ne sera pas remplacé dans cette fonction.
- `params.provider.as_deref()` — convertit un éventuel `String` en `&str` emprunté (voir plus bas), pour la factory.
- `llm_config` est **déplacé** (moved) dans `create_llm_client` : après cet appel, tu ne peux plus utiliser `llm_config` sous ce nom. La possession a changé de mains. C’est voulu : une seule « vraie » config alimente le client.

**Possession (ownership)** — idée centrale de Rust : chaque valeur a **un** propriétaire à un instant donné. Quand tu passes une `String` ou une struct par valeur à une fonction, en général tu **donnes** la possession. Pour seulement *lire* sans donner, on passe une référence `&…`.

---

## Partie C — Choisir le bon pilote (`create_llm_client`)

### C.1 Une fonction qui renvoie un résultat

[`factory.rs`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) :

```rust
pub fn create_llm_client(
    provider: Option<&str>,
    config: LlmConfig,
) -> Result<Arc<dyn LlmClient>, LlmError> {
    adapters::create_for_provider(provider, config)
}
```

Décomposons la **signature** (la première ligne, le « contrat » de la fonction) :

| Élément | Lecture humaine |
|---------|-----------------|
| `pub fn` | Fonction **publique** (visible hors du module) |
| `create_llm_client` | Nom |
| `provider: Option<&str>` | Entrée : nom du provider, optionnel ; `&str` = emprunt de texte |
| `config: LlmConfig` | Entrée : la config **possédée** |
| `-> Result<…>` | Sortie : succès ou erreur |
| `Arc<dyn LlmClient>` | En cas de succès : un client partagé, derrière un contrat commun |
| `LlmError` | Type d’erreur de cette crate |

Le corps se contente d’appeler une autre fonction : la factory est une **porte d’entrée** claire.

### C.2 Le `match` : plusieurs chemins selon une valeur

[`adapters/mod.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/mod.rs) :

```rust
let p = provider.unwrap_or("ollama").trim().to_ascii_lowercase();
match p.as_str() {
    "" | "ollama" => ollama::create(config),
    "vllm" => vllm::create(config),
    // …
    _ => openai_compatible::create(config),
}
```

| Élément | Rôle |
|---------|------|
| `unwrap_or("ollama")` | Si `provider` était `None`, utilise `"ollama"` |
| `.trim()` | Enlève les espaces autour |
| `.to_ascii_lowercase()` | Uniformise la casse (`Ollama` → `ollama`) |
| `match` | Regarde la valeur et choisit une **branche** |
| `"\" \| \"ollama\"` | Deux motifs possibles pour la même branche |
| `_` | « Tout le reste » (fallback) |

**Côté machine** : un `match` bien écrit se compile souvent en tests efficaces (comparaisons / table de sauts). Pour toi, c’est surtout un **aiguillage lisible** : un id → une fonction `create`.

### C.3 Créer l’instance Ollama et la « mettre en boîte »

[`adapters/ollama.rs`](../../drox-engine/drox/crates/drox-llm/src/adapters/ollama.rs) :

```rust
pub fn create(config: LlmConfig) -> Result<Arc<dyn LlmClient>, LlmError> {
    Ok(Arc::new(OllamaClient::new(config)?) as Arc<dyn LlmClient>)
}
```

Étapes mentales :

1. `OllamaClient::new(config)?` — **construit** l’objet concret (voir partie D). Le `?` propage l’erreur si la construction échoue (URL invalide, etc.).
2. `Arc::new(...)` — place cet objet dans un **compteur de références atomique**. Plusieurs parties du programme peuvent alors « tenir » le même client sans le copier entièrement.
3. `as Arc<dyn LlmClient>` — **oublie le nom exact** `OllamaClient` pour ne garder que la promesse : « ceci sait faire `stream_chat` ».

**Analogie** : tu fabriques une voiture précise (Tesla, Renault…), puis tu la ranges dans un garage étiqueté seulement « véhicule capable de rouler ». Le reste de Drox conduit le véhicule sans se soucier de la marque — tant que le contrat `LlmClient` est respecté.

**Pourquoi `Arc` ?** L’`Agent` (et parfois des clones de l’agent) doivent partager le même client HTTP. `Arc` = *Atomic Reference Counted* : chaque clone incrémente un compteur ; quand le dernier disparaît, la mémoire est libérée.

---

## Partie D — La structure `OllamaClient` (données + comportement)

### D.1 Qu’est-ce qu’une `struct` ?

Une **`struct`** (structure) regroupe plusieurs variables sous un **seul nom de type**.  
C’est la façon Rust de dire : « ces informations vont **ensemble** ».

Dans [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) :

```rust
pub struct OllamaClient {
    http: Client,              // client HTTP (bibliothèque reqwest)
    base_url: Url,             // ex. http://127.0.0.1:11434
    model: String,             // nom du modèle
    defaults: OllamaSamplingDefaults,
    keep_alive: Option<String>,
}
```

Chaque ligne dans les `{ }` est un **champ** : un nom + un type.

**Côté machine** : une instance d’`OllamaClient`, c’est un bloc de mémoire qui contient (ou pointe vers) ces champs. Créer `OllamaClient { … }` alloue / remplit ce bloc.

Ce n’est pas une « classe » au sens Java/C# (pas d’héritage de classes). Le comportement s’ajoute avec `impl`.

### D.2 `impl` : attacher des fonctions à la structure

```rust
impl OllamaClient {
    pub fn new(config: LlmConfig) -> Result<Self, LlmError> {
        let mut builder = Client::builder().timeout(config.timeout());
        // … éventuellement des headers …
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
| `impl OllamaClient` | « Voici les méthodes de ce type » |
| `fn new(...)` | Constructeur par convention (rien de magique : juste un nom fréquent) |
| `-> Result<Self, …>` | Renvoie soit une instance (`Self` = `OllamaClient`), soit une erreur |
| `let mut builder` | Variable locale pour construire le client HTTP étape par étape |
| `Ok(Self { http, base_url, … })` | Succès : fabrique la struct. `http,` seul veut dire `http: http` |
| `&self` | La méthode **emprunte** l’instance sans la prendre : elle peut lire `self.base_url` |

**`&self` vs possession** :  
- `&self` = « je te laisse lire mon objet, je le récupère après ».  
- `self` sans `&` = « je **prends** l’objet ; l’appelant ne l’a plus ».

`chat_endpoint` a besoin seulement de lire l’URL de base → `&self`.

### D.3 Le client HTTP (`reqwest`)

Le champ `http: Client` vient de la bibliothèque **reqwest**.  
Une fois construit, il sert à envoyer des requêtes réseau (`get`, `post`, …). Le garder dans la struct évite de recréer un client à chaque message (réutilisation des connexions).

---

## Partie E — Le contrat `LlmClient` (ce que *tous* les backends doivent savoir faire)

### E.1 Qu’est-ce qu’un `trait` ?

Un **trait** décrit un **comportement** : un ensemble de fonctions qu’un type s’engage à fournir.

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

Lecture :

- « Tout `LlmClient` doit exposer `stream_chat`. »
- `async fn` : la fonction peut **attendre** le réseau sans bloquer tout le programme (voir partie G).
- `messages: Vec<Message>` : une **liste** (`Vec`) de messages de conversation.
- `options: ChatOptions` : une struct d’options (température, tools…).
- `StreamHandle` : le type du **flux** d’événements renvoyé.

`Send + Sync` signifie : ce client peut être utilisé en toute sécurité avec le runtime multi-thread de Tokio.

`#[async_trait]` est une **macro** (code qui génère du code) : elle aide à utiliser `async` dans un trait object `dyn LlmClient`.

### E.2 `ChatOptions` : une autre struct + méthodes en chaîne

```rust
pub struct ChatOptions {
    pub temperature: Option<f32>,
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

`with_tools` prend la struct **par valeur** (`mut self`), change le champ `tools`, et **renvoie** la struct.  
On peut alors écrire des chaînes lisibles :

```rust
options.clone().with_tools(tool_specs.clone())
```

`.clone()` duplique la valeur (ici volontairement, pour garder l’original dans `config`).

---

## Partie F — Brancher Ollama sur le contrat + envoyer le HTTP

### F.1 `impl LlmClient for OllamaClient`

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

        let bytes_stream = response.bytes_stream();
        Ok(events_from_ndjson(bytes_stream).boxed())
    }
}
```

C’est **le cœur** de « Drox parle à Ollama ». Ligne par ligne :

| Ligne | Que se passe-t-il ? |
|-------|---------------------|
| `impl LlmClient for OllamaClient` | On **remplit** le contrat pour ce type |
| `let url = self.chat_endpoint()?` | Calcule l’URL `…/api/chat` ; erreur → on sort |
| `let payload = build_request(...)` | Prépare le corps JSON (modèle, messages, options) |
| `&self.model` | Emprunt du nom du modèle (pas de copie obligatoire du `String`) |
| `self.http.post(url.clone())` | Démarre une requête HTTP POST |
| `.json(&payload)` | Sérialise `payload` en JSON (grâce à **serde**) et le met dans le body |
| `.send().await?` | **Envoie** sur le réseau et **attend** la réponse |
| `response.bytes_stream()` | Au lieu de tout lire d’un coup, on obtient un **flux d’octets** |
| `events_from_ndjson(...).boxed()` | Transforme les octets en événements Drox, rangés dans une boîte de stream |

**Pourquoi streamer ?** Une réponse de modèle peut être longue. Recevoir token après token permet à l’UI d’afficher le texte **au fur et à mesure**, sans attendre la fin.

### F.2 Le JSON : `serde` et `ChatRequest`

Dans [`ollama/protocol.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/protocol.rs) :

```rust
#[derive(Debug, Clone, Serialize)]
pub(super) struct ChatRequest<'a> {
    pub model: &'a str,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    // …
}
```

| Élément | Sens |
|---------|------|
| `#[derive(Serialize)]` | Demande au compilateur de générer le code « transformer cette struct en JSON » |
| `ChatRequest<'a>` | La struct **emprunte** parfois des textes qui vivent ailleurs (lifetime `'a`) |
| `model: &'a str` | Référence vers le nom du modèle, sans le recopier |
| `stream: bool` | `true` → Ollama envoie une réponse en flux |

**Côté machine** : au moment du `.json(&payload)`, la mémoire de la struct est parcourue et convertie en une suite d’octets UTF-8 formattée comme JSON, placée dans la requête HTTP.

---

## Partie G — L’agent appelle le client (`async`, `match`, flux)

### G.1 Stocker le client dans l’`Agent`

[`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) :

```rust
pub struct Agent {
    llm: Arc<dyn LlmClient>,
    registry: Arc<ToolRegistry>,
    ctx: ToolContext,
    config: AgentConfig,
}
```

Le champ `llm` est **exactement** ce que la factory a renvoyé.  
Quand `handlers.rs` fait `Agent::new(llm, …)`, il **place** cette instance partagée dans l’agent.

### G.2 Dans la boucle : préparer les options et appeler

Extrait de `drive_inner` :

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

let Ok(mut outcome) = consume_stream(stream, &tx, native_thinking_ui).await else {
    return;
};
```

| Élément | Explication accessible |
|---------|------------------------|
| `self.config.chat_options` | Options de chat mémorisées pour ce run |
| `.clone()` | Copie : on ne détruit pas la config originale |
| `.with_tools(...)` | Ajoute la liste d’outils autorisés pour ce tour |
| `self.llm.stream_chat(...)` | Appel **polymorphe** : on ne sait pas ici si c’est Ollama ou autre — on appelle le trait |
| `.await` | « Suspend cette tâche jusqu’à ce que le Future soit prêt » (réponse HTTP démarrée / stream prêt) |
| `match … Ok / Err` | Deux issues possibles ; on gère les deux |
| `messages.clone()` | L’historique est cloné parce que `stream_chat` prend une `Vec` owned, et on doit garder `messages` pour la suite du run |
| `consume_stream(...)` | Lit le flux et pousse des événements vers l’UI (`tx` = canal d’envoi) |
| `let Ok(mut outcome) = … else { return }` | Si la lecture échoue « doucement » (UI fermée), on arrête sans paniquer |
| `mut outcome` | Le résultat du tour pourra encore être enrichi ensuite |

### G.3 `async` / `.await` — pourquoi ça existe

Sans async, attendre le réseau **bloquerait** tout le processus : plus d’autres tools, plus d’autre travail.  
Avec **Tokio** (runtime async de Drox) :

- une tâche qui `.await` **rend la main** pendant l’attente ;
- d’autres tâches peuvent avancer ;
- quand les données arrivent, la tâche reprend.

Tu n’as pas besoin de maîtriser les détails internes des futures pour suivre Drox : retiens « `.await` = attendre une opération longue sans geler tout le moteur ».

### G.4 Lire le flux : `while let` (dans `consume_stream`)

L’idée (forme typique) :

```rust
while let Some(event) = stream.next().await {
    // traiter event : texte, tool call, fin, …
}
```

- `stream.next().await` — « donne-moi le prochain événement, ou rien si c’est fini ».
- `while let Some(event) = …` — tant qu’il y a un événement, on entre dans la boucle avec ce nom `event`.

Chaque événement devient un `AgentEvent` visible dans le chat.

---

## Partie H — Un cran plus avancé (toujours le même chemin)

### H.1 Fonction générique qui accepte « n’importe quel stream d’octets »

```rust
fn events_from_ndjson<S>(
    bytes_stream: S,
) -> impl Stream<Item = Result<StreamEvent, LlmError>> + Send + 'static
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
```

| Élément | Idée simple |
|---------|-------------|
| `<S>` | « Cette fonction marche pour un type `S` encore inconnu » |
| `where S: Stream<…>` | « …à condition que `S` se comporte comme un flux d’octets » |
| `-> impl Stream<…>` | « Je renvoie *un* stream ; mon appelant n’a pas besoin du nom exact du type interne » |

C’est plus abstrait, mais le **but** reste simple : convertir le tuyau HTTP Ollama en tuyau d’événements Drox.

### H.2 Si le provider n’est pas Ollama

Même histoire, autre fichier : adaptateur OpenAI-compatible, URL `/v1/chat/completions`, format SSE au lieu du NDJSON Ollama.  
Les mots Rust (`trait`, `async`, `Arc`, `Result`) sont les **mêmes** — seul le « dialecte » réseau change.

---

## Récapitulatif — de l’idée humaine au câble réseau

1. **Variable** `llm_config` : on assemble les réglages (`let mut`, `Option`, builders).
2. **Fonction** `create_llm_client` : on choisit le pilote (`match`) et on obtient `Arc<dyn LlmClient>`.
3. **Struct** `OllamaClient` : on stocke URL, modèle, client HTTP ; **`impl`** ajoute `new` et `stream_chat`.
4. **Trait** `LlmClient` : promesse commune « je sais streamer un chat ».
5. **Appel** dans `Agent` : `stream_chat(...).await` envoie le **POST**, reçoit un **flux**.
6. **Consommation** : chaque morceau devient un événement pour l’interface.

Si tu relis ce parcours une deuxième fois en n’ouvrant que [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) et le morceau `stream_chat` dans [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs), tu dois pouvoir raconter l’histoire à voix haute sans regarder ce tutoriel.

## Pour aller plus loin (même méthode)

Ce guide est le **socle** de la série pédagogique. La suite, dans le même esprit :

| Suite | Sujet |
|-------|--------|
| [02-boucle-agent.md](02-boucle-agent.md) | Comment le moteur **répète** les tours LLM ↔ outils |
| [03-gestion-erreurs.md](03-gestion-erreurs.md) | `Result`, `?`, que se passe-t-il quand ça casse |
| [04-moteur-et-affichage.md](04-moteur-et-affichage.md) | Du flux Rust aux bulles dans l’IDE |

Index de la série : [README.md](README.md).
