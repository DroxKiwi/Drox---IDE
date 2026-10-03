//! Exécution de l'agent : struct [`Agent`], API, boucle et cycle de vie.
//!
//! - [`api`] — `new` / `run` / historique
//! - [`drive`] — boucle principale `drive_inner`
//! - [`lifecycle`] — transcript, snip, permissions, pré-gates

mod api;
mod drive;
mod lifecycle;

use std::sync::Arc;

use drox_llm::LlmClient;
use drox_tools::{ToolContext, ToolRegistry};
use futures::stream::BoxStream;

use crate::error::EngineError;
use crate::event::AgentEvent;

use super::config::AgentConfig;

/// Stream typé d'événements agent.
pub type AgentStream = BoxStream<'static, Result<AgentEvent, EngineError>>;

/// Agent : boucle LLM streaming + dispatch de tool calls.
///
/// Cheap-to-clone : toutes les ressources lourdes sont derrière `Arc`.
#[derive(Clone)]
pub struct Agent {
    llm: Arc<dyn LlmClient>,
    registry: Arc<ToolRegistry>,
    ctx: ToolContext,
    config: AgentConfig,
}

