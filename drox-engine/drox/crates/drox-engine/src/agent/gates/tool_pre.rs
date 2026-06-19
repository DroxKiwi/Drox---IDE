/// Gates pré-exécution architecte : payload `internal_plan_write` malformé seulement.
#[must_use]
pub(crate) fn architect_orchestration_pre_gate(
    spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    state: &ArchitectRunState,
    _workspace: Option<&camino::Utf8Path>,
    _drox_ignore: Option<&drox_session::DroxIgnoreMatcher>,
    _tuning: &EngineTuning,
) -> Option<String> {
    if spec.role_id != RoleId::Architect {
        return None;
    }
    if call_name == crate::orchestration::internal_plan_tool::TOOL_INTERNAL_PLAN_WRITE {
        return crate::agent::internal_plan_shape_guard(
            state.internal_plan.as_ref(),
            call_arguments,
        );
    }
    None
}

pub(crate) const PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL: &str = "You tried to invoke a tool named \
    `phase` (or similar) with JSON arguments like `{ \"done\": … }`. That is a \
    misunderstanding: **phase markers are NOT tools**. They MUST appear as \
    **plain text lines** in your assistant message — e.g. `[phase: done]` alone \
    on its own line after your final Markdown answer. Do NOT use `tool_calls` to \
    simulate the protocol. In your NEXT reply, output the literal text line \
    `[phase: done]` (no function call for it). Do NOT rewrite your whole answer \
    unless you still have real work left.";

pub(crate) const SESSION_END_FORBIDDEN_FOR_MODEL: &str =
    "session_end: this tool is not available from the model. Session closure \
     (new chat thread + long memory on the client) is reserved for the user-triggered \
     `/session_end` command. To archive work: finish the plan then `[phase: answering]` + \
     `[phase: done]` — the engine already writes `.drox/memory/sessions/` automatically.";

/// Infère la phase visée quand le modèle appelle un pseudo-outil `phase` / `reading` / etc.
#[must_use]
pub(crate) fn parse_hallucinated_phase_from_tool_call(
    name: &str,
    arguments: &Value,
) -> Option<Phase> {
    let raw = name.trim().to_ascii_lowercase();
    let core = raw.trim_end_matches(':').trim();
    if let Some(phase) = phase_from_name_token(core) {
        return Some(phase);
    }
    if core == "phase" || core.starts_with("phase_") {
        if let Some(obj) = arguments.as_object() {
            for key in obj.keys() {
                if let Some(phase) = phase_from_name_token(key) {
                    return Some(phase);
                }
            }
        }
    }
    if core == "set_phase" {
        return arguments
            .get("phase")
            .or_else(|| arguments.get("name"))
            .and_then(|v| v.as_str())
            .and_then(phase_from_name_token);
    }
    None
}

/// Détecte les `tool_calls` qui mimiquent le protocole `[phase: …]`.
#[must_use]
pub(crate) fn is_hallucinated_phase_tool_call(name: &str, arguments: &Value) -> bool {
    if parse_hallucinated_phase_from_tool_call(name, arguments).is_some() {
        return true;
    }
    let raw = name.trim().to_ascii_lowercase();
    let core = raw.trim_end_matches(':').trim();
    if let Some((head, _rest)) = core.split_once(':') {
        if head == "phase" {
            return true;
        }
    }
    if core == "phase" {
        return true;
    }
    if core == "set_phase" || core.starts_with("phase_") {
        return true;
    }
    if core == "done"
        && arguments
            .as_object()
            .is_some_and(|m| m.len() == 1 && m.contains_key("done"))
    {
        return true;
    }
    false
}

pub(crate) const DISCUSSION_REPLY_ONLY_NO_TOOLS: &str =
    "Blocked: discussion reply-only run — no tools on greeting-only turns. \
     Reply with `[discussion: reply]`, your short answer, then `[discussion: done]` — then stop.";

/// Gates pré-exécution (hors permissions). `Some(msg)` = bloquer avec erreur.
#[must_use]
pub(crate) fn tool_pre_gate_block(
    spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    architect_state: Option<&ArchitectRunState>,
    workspace: Option<&camino::Utf8Path>,
    drox_ignore: Option<&drox_session::DroxIgnoreMatcher>,
    tuning: &EngineTuning,
) -> Option<String> {
    let resolved_name =
        crate::orchestration::tool_aliases::resolve_tool_name_alias(call_name, call_arguments);
    if spec.role_id == RoleId::ArchitectDiscussion && !spec.discussion_allow_reads {
        return Some(DISCUSSION_REPLY_ONLY_NO_TOOLS.to_string());
    }
    if let Some(state) = architect_state {
        if let Some(msg) = architect_orchestration_pre_gate(
            spec,
            resolved_name,
            call_arguments,
            state,
            workspace,
            drox_ignore,
            tuning,
        ) {
            return Some(msg);
        }
    }
    if is_hallucinated_phase_tool_call(resolved_name, call_arguments)
        && parse_hallucinated_phase_from_tool_call(resolved_name, call_arguments).is_none()
    {
        let msg = PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL;
        return Some(msg.to_string());
    }
    if resolved_name == "session_end" {
        return Some(SESSION_END_FORBIDDEN_FOR_MODEL.to_string());
    }
    if resolved_name == "bash" {
        if let Some(cmd) = call_arguments.get("command").and_then(|v| v.as_str()) {
            if let Some(msg) = bash_windows::bash_windows_precheck(cmd) {
                return Some(msg.to_string());
            }
        }
    }
    None
}
