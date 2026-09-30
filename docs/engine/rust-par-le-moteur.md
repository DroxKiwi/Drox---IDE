# Apprendre Rust avec le moteur Drox

Ce pan de doc n’est **pas** un cours Rust générique. Il lit le **vrai code** du moteur et nomme chaque construction du langage au moment où elle apparaît.

Fil conducteur recommandé : **une requête vers le moteur d’inférence** (Ollama), de la config jusqu’au stream de tokens.

| Document | Contenu |
|----------|---------|
| **[rust-parcours-inference.md](rust-parcours-inference.md)** | Parcours pas à pas : variables, structs, traits, `async`, `Arc<dyn …>`, streams… sur le chemin LLM |
| [llm-backends.md](llm-backends.md) | Référence produit des backends (sans pédagogie langage) |
| [architecture-overview.md](architecture-overview.md) | Crates et libs du workspace |

## Comment lire

1. Ouvre les fichiers listés dans le parcours (ordre donné).
2. Lis le tutoriel **en parallèle** : chaque section pointe un extrait et dit à quoi il sert dans le run.
3. Compile / cherche les symboles dans l’IDE pour vérifier les numéros de ligne (ils peuvent bouger légèrement).

## Carte des concepts Rust ↔ endroit dans Drox

| Concept Rust | Où le voir d’abord (chemin inférence) |
|--------------|----------------------------------------|
| `let` / `let mut` | `build_llm_config`, `drive_inner` (`options`, `messages`) |
| `struct` + champs | `OllamaClient`, `Agent`, `ChatOptions` |
| `impl` (méthodes) | `OllamaClient::new`, `ChatOptions::with_tools` |
| `trait` + `async fn` | `LlmClient::stream_chat` |
| `impl Trait for Type` | `impl LlmClient for OllamaClient` |
| `Option` / `Result` / `?` | config, HTTP, factory |
| `match` / `if let` / `while let` | choix provider, appel `stream_chat`, lecture du stream |
| `Arc` + `dyn Trait` | `Arc<dyn LlmClient>` dans `Agent` |
| `async` / `.await` | `stream_chat`, `drive_inner`, `consume_stream` |
| `Clone` sur config | `chat_options.clone().with_tools(…)` |
| Types alias | `StreamHandle = BoxStream<…>` |
| Génériques + `impl Stream` | `events_from_ndjson<S>(…)` |
| `serde` Serialize/Deserialize | `ChatRequest`, `ChatOptions` |
| `#[async_trait]` | objet trait async dyn-compatible |

## Prérequis minimaux hors Drox

- Savoir ouvrir un fichier Rust et lancer `cargo test -p drox-llm` / `cargo test -p drox-engine` (voir [developer-guide.md](developer-guide.md)).
- Pas besoin d’avoir fini *The Rust Book* : le parcours introduit les idées **dans le contexte**.

Ensuite : **[rust-parcours-inference.md](rust-parcours-inference.md)**.
