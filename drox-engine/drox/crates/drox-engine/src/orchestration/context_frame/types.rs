//! Context Frame — types spec (miroir `frames-v0.yaml`).

/// Stable frame identifier (logging + future metrics).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameId {
    ArchitectBoot,
    ArchitectIterationStart,
    ArchitectPostCheckpoint,
    ArchitectGateNudge,
}

impl FrameId {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ArchitectBoot => "architect.boot",
            Self::ArchitectIterationStart => "architect.*.iteration_start",
            Self::ArchitectPostCheckpoint => "architect.*.post_checkpoint",
            Self::ArchitectGateNudge => "architect.*.gate_nudge",
        }
    }
}

/// When a frame is applied in the agent loop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameTrigger {
    Boot,
    IterationStart,
    PostCompaction,
    GateNudge,
}

/// How a layer mutates the message list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InjectMode {
    BootAppend,
    ReplaceMarked,
    InsertAfterCheckpoint,
    Append,
    StateOnly,
}

/// Ordered layer within a frame manifest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayerId {
    CtxRunSnapshot,
    InternalPlanSnapshot,
    ToolProtocols,
    RailTurnHooks,
    RailSnapshot,
}

/// Declarative layer entry (v0 — iteration_start only wired).
#[derive(Debug, Clone, Copy)]
pub struct FrameLayerSpec {
    pub id: LayerId,
    pub mode: InjectMode,
    /// Skip layer when `run_rail_active` is false.
    pub requires_rail: bool,
}

/// Stable nudge identifier — appended via `architect.*.gate_nudge` frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NudgeId {
    DoneMissingMutation,
    DoneMissingAnswering,
    DoneUnfinishedTodos,
    DoneVerifyNotPassed,
    DoneOnlyMarker,
    PostTodosAnswering,
    ActStall,
    SchemaErrorContinue,
    ActMutationSuccess,
    ActToolFailureContinue,
    ActToolFailureStop,
    AskUserQuestionLoop,
    InternalPlanStale,
    InternalPlanPreAnswering,
    InternalPlanActFocus,
}

impl NudgeId {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::DoneMissingMutation => "done.missing_mutation",
            Self::DoneMissingAnswering => "done.missing_answering",
            Self::DoneUnfinishedTodos => "done.unfinished_todos",
            Self::DoneVerifyNotPassed => "done.verify_not_passed",
            Self::DoneOnlyMarker => "done.only_marker",
            Self::PostTodosAnswering => "rail.post_todos_answering",
            Self::ActStall => "rail.act_stall",
            Self::SchemaErrorContinue => "schema_error.continue",
            Self::ActMutationSuccess => "rail.act_mutation_success",
            Self::ActToolFailureContinue => "rail.act_tool_failure_continue",
            Self::ActToolFailureStop => "rail.act_tool_failure_stop",
            Self::AskUserQuestionLoop => "ask_user_question.loop",
            Self::InternalPlanStale => "internal_plan.stale",
            Self::InternalPlanPreAnswering => "internal_plan.pre_answering",
            Self::InternalPlanActFocus => "internal_plan.act_focus",
        }
    }
}
