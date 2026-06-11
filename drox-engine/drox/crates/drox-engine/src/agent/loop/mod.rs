//! Boucle principale agent — `drive_inner` et exécution des tools.
//!
//! Les sources sont `include!` dans ce module pour que tous les `impl Agent`
//! partagent la même visibilité (champs privés, appels entre méthodes).

use drox_hooks::{PostHookOutcome, PreHookOutcome, ToolHookContext};
use drox_permissions::PermissionDecision;
use drox_types::{Content, Message, Role, StopReason, Usage};
use futures::{stream, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::agent::stream::{run_has_promotable_user_facing_text, PendingToolCall};
use crate::agent::state::{
    inject_architect_run_snapshot_after_checkpoint, ArchitectRunState,
};
use crate::agent::final_answer_guard::FinalAnswerGuard;
use crate::agent::gates::{
    architect_orchestration_record_successful_tool,
    architect_record_read_only_tool_success, done_gate_missing_answering,
    done_gate_unfinished_todos,
    parse_hallucinated_phase_from_tool_call,
    tool_pre_gate_block,
};
use crate::agent::nudges::{done_only_nudge_prompt, schema_error_continue_nudge};
use crate::agent::rail;
use crate::agent::{
    confirm_with_user, first_user_text, format_tool_result_for_llm,
    mirror_workspace_map_from_tool, push_tool_error_tracked, Agent,
};
use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};
use crate::long_memory::ContextChunkSummaryV1;
use crate::memory::{MemoryTracker, persist_compaction_result, persist_run};
use crate::orchestration::{
    architect_run_context_block_compaction, extract_discussion_done_from_text,
};
use crate::run_spec::RoleId;
use crate::tool_orchestration::{ToolCallBatch, partition_tool_calls};
use drox_tools::ToolContext;

include!("todo_gate.rs");
include!("closure.rs");
include!("transcript.rs");
include!("context.rs");
include!("tool_execution.rs");
include!("drive/mod.rs");
include!("drive/outcome.rs");
include!("drive/tools.rs");
