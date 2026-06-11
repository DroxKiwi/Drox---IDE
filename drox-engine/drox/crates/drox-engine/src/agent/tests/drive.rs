//! Boucle agent — done, nudges, phases, contexte.

use std::sync::Arc;

use super::support::*;
use crate::agent::*;
use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};
use drox_tools::{TodoWriteTool, ToolContext, ToolRegistry};
use drox_types::{StopReason, StreamEvent, ToolUseId, Usage};
use futures::StreamExt;
use serde_json::json;

include!("drive_main.inc.rs");
include!("drive_loop.inc.rs");
