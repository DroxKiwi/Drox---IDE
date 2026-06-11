//! État orchestration architecte (1.2.0) — une struct par run, pas des champs éparpillés.

use std::collections::{HashMap, HashSet};

use drox_tools::{ArchitectHelpSnapshot, ArchitectHelpTodoItem};
use drox_types::{Content, Message, Role};
use serde_json::Value;

use crate::compaction::is_context_checkpoint_message;
use crate::orchestration::is_meta_synthesis_task;

use super::rail::RunRailState;

include!("fields.rs");
include!("todos.rs");
include!("workspace.rs");
include!("snapshot.rs");
include!("rail_wire.rs");
