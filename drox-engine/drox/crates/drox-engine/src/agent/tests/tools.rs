//! Exécution outils, permissions, phases synthétiques stream, session / mémoire.

use std::sync::Arc;

use super::support::*;
use crate::agent::*;
use crate::context::ContextPolicy;
use crate::event::{AgentEvent, Phase};
use drox_context::{ContextBudget, RoughTokenCounter};
use drox_tools::{TodoWriteTool, ToolContext, ToolRegistry};
use drox_types::{Message, StopReason, StreamEvent, ToolUseId, Usage};
use futures::StreamExt;
use serde_json::json;

include!("tools_exec.inc.rs");
include!("tools_phase.inc.rs");
include!("tools_memory.inc.rs");
