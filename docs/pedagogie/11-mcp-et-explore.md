Rédigé à l'aide de Cursor Agent

# MCP et sous-agents Explore — étendre et déléguer

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **deux extensions** du moteur :

1. **MCP** — brancher des serveurs d’outils externes (`mcp__…`) ;
2. **Explore (`task`)** — lancer un **sous-agent** en lecture seule pour cartographier un large périmètre.

Prérequis : [05-outils.md](05-outils.md), [02-boucle-agent.md](02-boucle-agent.md).

### L’histoire en une phrase

MCP ajoute des outils au registry comme s’ils étaient natifs ; Explore crée un **petit Agent** séparé, avec une palette réduite, qui renvoie un **rapport** au parent.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`drox-mcp`](../../drox-engine/drox/crates/drox-mcp/) | Hub **rmcp** (stdio / HTTP) |
| [`simple/mcp.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/mcp.rs) | `register_mcp_tools` |
| [`simple/task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) | Tool `task` |
| [`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs) | `EngineSubagentExecutor` |
| Réf. | [mcp-and-subagents.md](../engine/mcp-and-subagents.md) |

---

## Partie A — MCP en image

**MCP** (Model Context Protocol) = un serveur (souvent un autre process) qui expose des tools (browser, DB, …).

```text
Config MCP → McpHub démarre / connecte
  → découverte des tools
  → register sous noms mcp__serveur__outil
  → visibles du LLM comme les tools Drox
```

Lib Rust : **rmcp**.  
Permissions / hooks s’appliquent aussi (selon matcher).

Flag run typique : `mcp_tools_enabled`.

---

## Partie B — Pourquoi un préfixe `mcp__` ?

Éviter les collisions de noms avec `file_read` / `bash`.  
Un coup d’œil au nom suffit pour savoir « cet outil vient de MCP ».

---

## Partie C — Sous-agent Explore

Le parent ne veut pas toujours faire 40 `glob` lui-même. Il appelle :

```text
task { subagent_type: "explore", description: "…", thoroughness: … }
```

Conditions :

- settings sous-agents **activés** ;
- `register_subagent_task()` au setup ;
- V1 : seulement `"explore"`.

`is_concurrency_safe` = **false** → pas de parallèle hasardeux avec d’autres tools du même tour ([10](10-parallelisme-outils.md)).

### Exemple concret — tool `task`

[`task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) :

```rust
fn is_read_only(&self) -> bool {
    true
}

fn is_concurrency_safe(&self) -> bool {
    false
}

async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
    let settings = ctx.subagent_settings.as_ref().cloned().unwrap_or_default();
    if !settings.enabled {
        return Err(ToolError::invalid_args(
            "Sub-agents disabled. Enable `drox.subagents.enabled` …",
        ));
    }
    let executor = ctx.subagent_executor.as_ref().ok_or_else(|| {
        ToolError::invalid_args("Sub-agents not configured …")
    })?;
    let args: TaskInput = serde_json::from_value(input)?;
    // …
    if kind != "explore" {
        return Err(ToolError::invalid_args(format!(
            "unknown subagent_type `{kind}` — V1 only supports `explore`"
        )));
    }
    let report = executor.run_explore(args.description, args.thoroughness, ctx).await?;
    Ok(json!({ "subagent_type": "explore", "report": report }))
}
```

| Morceau | Détail |
|---------|--------|
| `is_read_only = true` mais `is_concurrency_safe = false` | Lecture seule **et** pourtant sérialisé (sous-agent lourd) |
| `unwrap_or_default()` | Si pas de settings → valeur `Default` |
| `ok_or_else(\|\| …)?` | `Option` → `Result` avec message d’erreur |
| `serde_json::from_value(input)?` | JSON libre → struct `TaskInput` typée |
| `json!({ … })` | Macro serde_json : construit le `Value` de retour |

---

## Partie D — Ce que fait l’exécuteur Explore

Dans `subagent.rs` (idée) :

| Propriété | Valeur |
|-----------|--------|
| Écritures | Interdites (`apply_fs_writes: false`, plan) |
| Outils | `file_read`, `glob`, `grep`, `lsp`, `web_*`, `workspace_map_read` — **pas** bash mutateur |
| Boucle | Un `Agent` dédié, sessions de phases jusqu’à `done` |
| Sortie | Rapport texte / JSON `{ subagent_type, report }` pour le parent |
| Concurrence | Semaphore `max_concurrent` ; parallèle tools interne souvent plafonné à 4 |

Le parent **reçoit le rapport** comme résultat d’outil, puis continue sa propre boucle.

### Exemple concret — registry Explore + démarrage agent enfant

[`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs) :

```rust
pub fn explore_tool_registry() -> ToolRegistry {
    let mut reg = ToolRegistry::new();
    reg.register(coerce_tool(FileReadTool));
    reg.register(coerce_tool(GlobTool));
    reg.register(coerce_tool(GrepTool));
    reg.register(coerce_tool(LspTool));
    reg.register(coerce_tool(WebFetchTool));
    reg.register(coerce_tool(WebSearchTool));
    reg.register(coerce_tool(WorkspaceMapReadTool));
    reg
}
```

Puis dans `run_explore` :

```rust
let explore_ctx = ToolContext {
    workspace_root: parent_ctx.effective_workspace(),
    apply_fs_writes: false,
    plan_mode: true,
    // … pas de sous-agent imbriqué …
    subagent_executor: None,
    ..
};

let agent = Agent::new(
    self.llm.clone(),
    Arc::new(explore_tool_registry()),
    explore_ctx,
    AgentConfig {
        max_parallel_tool_calls: 4,
        // …
        ..
    },
);
```

| Morceau | Détail |
|---------|--------|
| Pas de `BashTool` / `FileWriteTool` | Explore ne peut pas muter via ces tools |
| `apply_fs_writes: false` | Même les tools d’écriture éventuels seraient bridés au contexte |
| `self.llm.clone()` | Même client LLM (`Arc`) que le parent — pas un second process HTTP |
| `max_parallel_tool_calls: 4` | Plafond local plus bas que le défaut 8 |

---

## Partie E — Doc 1.4 « sous-agents supprimés »

Cette archive est **périmée** pour Explore.  
Le guide de migration : [migration-from-1.4.md](../engine/migration-from-1.4.md).

---

## Récapitulatif

1. MCP = tools externes dans le même registry.
2. Explore = mini-agent read-only, tool `task`.
3. Les deux s’insèrent dans la boucle parent comme des tools « normaux » une fois enregistrés.
4. Activer explicitement (flags / settings).

## Suite

[12-hooks.md](12-hooks.md). Index : [README.md](README.md).
