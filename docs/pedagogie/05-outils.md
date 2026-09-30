Rédigé à l'aide de Cursor Agent

# Les outils — quand le modèle agit sur le monde

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : les **outils** (`file_read`, `bash`, `grep`, …). C’est le moment où le modèle ne se contente plus d’écrire du texte : il **demande** une action, et le moteur (ou l’IDE) l’exécute.

Tout au long de ce texte :

- **ce qu’est** un outil côté code (trait `Tool`) ;
- **comment** le registre les range et les expose au LLM ;
- **pourquoi** certains tournent **dans** `drox`, d’autres **dans** l’IDE (`tool/exec`) ;
- le lien avec la [boucle](02-boucle-agent.md) et l’[affichage](04-moteur-et-affichage.md).

Socle : [01-contact-ollama.md](01-contact-ollama.md).

### L’histoire en une phrase

Le modèle répond parfois avec un **tool call** structuré (« appelle `grep` avec ce motif »). Le moteur vérifie, exécute, renvoie un **résultat** dans l’historique, puis rappelle le modèle — un nouveau tour de boucle.

### Fichiers à ouvrir

| Fichier | Rôle |
|---------|------|
| [`tool.rs`](../../drox-engine/drox/crates/drox-tools/src/tool.rs) | Trait `Tool` |
| [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) | Catalogue `with_simple_tools` |
| [`context.rs`](../../drox-engine/drox/crates/drox-tools/src/context.rs) | `ToolContext` (workspace, flags…) |
| [`remote_tool.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs) | Délégation IDE |
| [`simple/`](../../drox-engine/drox/crates/drox-tools/src/simple/) | Implémentations concrètes |
| Réf. | [tools-and-permissions.md](../engine/tools-and-permissions.md) |

---

## Partie A — Qu’est-ce qu’un « outil » dans la tête du modèle ?

Pour le LLM, un outil est une **fiche** :

- un **nom** (`file_read`) ;
- une **description** (texte pour savoir quand s’en servir) ;
- un **schéma** d’arguments (JSON Schema : quels champs, quels types).

Le modèle ne « lance » pas le code lui-même : il **propose** un appel. C’est le runtime Drox qui décide si l’appel a lieu.

---

## Partie B — Le trait `Tool` (contrat Rust)

Dans [`tool.rs`](../../drox-engine/drox/crates/drox-tools/src/tool.rs) :

```rust
#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> Value;
    fn is_read_only(&self) -> bool { false }
    fn is_concurrency_safe(&self) -> bool { self.is_read_only() }
    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError>;
}
```

| Méthode | Idée simple |
|---------|-------------|
| `name` / `description` / `input_schema` | Ce qu’on montre au modèle |
| `is_read_only` | « Est-ce que ça change le disque / le système ? » |
| `is_concurrency_safe` | « Peut-on en lancer plusieurs en même temps ? » (voir [10](10-parallelisme-outils.md)) |
| `execute` | Le vrai travail : lit `input` JSON, agit, renvoie un JSON résultat |

`DynTool = Arc<dyn Tool>` : comme pour `LlmClient`, on range des outils de types différents derrière **un** contrat.

---

## Partie C — Le registre : une boîte à outils nommée

`ToolRegistry` est une **map** nom → outil.

`with_simple_tools()` enregistre la palette de base (`file_read`, `file_edit`, `bash`, `todo_write`, …).  
Cherche la liste exacte dans [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) ou la [référence](../engine/tools-and-permissions.md).

**Côté machine** : une table de hachage en mémoire ; `get("grep")` retrouve l’`Arc` vers l’implémentation.

Avant chaque tour LLM, le moteur construit des `ToolSpec` (nom + description + schéma) à partir du registry — c’est ce que reçoit `stream_chat` dans les `ChatOptions.tools`.

---

## Partie D — `ToolContext` : l’environnement d’exécution

`execute` reçoit un `&ToolContext` : workspace courant, droits d’écriture, mode plan, notes de session, etc.

Sans contexte, `file_read` ne saurait pas *où* est la racine du projet.  
Le contexte est préparé au setup du run (`handlers` / bootstrap TUI), puis passé à chaque outil.

---

## Partie E — Local vs remote

| Mode | Qui exécute | Exemple |
|------|-------------|---------|
| **Local** | Processus `drox` | `file_read` sur le disque vu par le moteur |
| **Remote** | IDE via `tool/exec` | `lsp` qui a besoin des language servers VS Code |

Au `initialize`, l’IDE envoie `executableTools`. Pour chaque nom listé, le serveur enregistre un **`RemoteTool`** à la place (ou en plus) de l’impl locale : même trait `Tool`, mais `execute` envoie une requête JSON-RPC et **attend** la réponse UI.

Si l’IDE ne répond pas → la [boucle](02-boucle-agent.md) attend. Lien avec [04](04-moteur-et-affichage.md).

---

## Partie F — Dans un tour de `drive_inner`

1. Le flux LLM contient des tool calls → `PendingToolCall`.
2. Pre-gates + [permissions](06-permissions.md).
3. [Hooks](12-hooks.md) pre.
4. `execute` (local ou remote) → `ToolStart` / `ToolFinish` vers l’UI.
5. Hooks post.
6. Résultat injecté dans `messages` → prochain `stream_chat`.

Le modèle **lit** le résultat comme un nouveau message « tool » — d’où l’importance d’erreurs claires ([03](03-gestion-erreurs.md)).

---

## Récapitulatif

1. Un outil = trait `Tool` + entrée dans le **registry**.
2. Le LLM ne fait que **proposer** ; le runtime **exécute**.
3. Local = dans `drox` ; remote = `tool/exec` IDE.
4. Les résultats nourrissent le **prochain** tour de boucle.

## Suite

[06-permissions.md](06-permissions.md) — qui a le droit d’exécuter quoi.  
Index : [README.md](README.md).
