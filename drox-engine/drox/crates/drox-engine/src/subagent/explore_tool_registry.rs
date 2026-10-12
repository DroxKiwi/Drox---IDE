//! Registre tools de l'Explore enfant (lecture seule, pas de `task` / bash / écriture).

use std::sync::Arc;

use drox_tools::{
	DynTool, ExploreCommitTool, FileReadTool, GlobTool, GrepTool, LspTool, ToolRegistry,
	WebFetchTool, WebSearchTool, WorkspaceMapReadTool,
};

fn coerce_tool<T: drox_tools::Tool + Sized + 'static>(tool: T) -> DynTool {
	Arc::new(tool)
}

/// Registre minimal pour un sous-agent Explore (+ `explore_commit` Option A).
#[must_use]
pub fn explore_tool_registry() -> ToolRegistry {
	let mut reg = ToolRegistry::new();
	reg.register(coerce_tool(FileReadTool));
	reg.register(coerce_tool(GlobTool));
	reg.register(coerce_tool(GrepTool));
	reg.register(coerce_tool(LspTool));
	reg.register(coerce_tool(WebFetchTool));
	reg.register(coerce_tool(WebSearchTool));
	reg.register(coerce_tool(WorkspaceMapReadTool));
	reg.register(coerce_tool(ExploreCommitTool));
	reg
}
