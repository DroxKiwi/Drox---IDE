//! Parsing des marqueurs `[phase: …]`, inférence de phase par outil, buffer stream.

use crate::event::Phase;

/// Parse une ligne déjà extraite (sans `\n`) et tente d'en faire un marqueur
/// de phase. Reconnaît :
///
/// - le format canonique `[phase: nom]` avec espaces tolérés autour de `nom` ;
/// - quelques alias pratiques (`act` → `acting`, `verify` → `verifying`, …) ;
/// - la casse libre (`[PHASE: Done]` accepté).
///
/// Toute autre ligne renvoie `None` et reste du texte ordinaire.
#[must_use]
pub(crate) fn parse_phase_marker(line: &str) -> Option<Phase> {
    let trimmed = line.trim();
    let body = trimmed.strip_prefix('[')?.strip_suffix(']')?;
    let (head, raw_name) = body.split_once(':')?;
    if !head.trim().eq_ignore_ascii_case("phase") {
        return None;
    }
    phase_from_name_token(raw_name)
}

/// Token de phase brut (nom d'outil halluciné ou segment `[phase: nom]`).
#[must_use]
pub(crate) fn phase_from_name_token(raw: &str) -> Option<Phase> {
    let name = raw.trim().to_ascii_lowercase();
    let name = name.replace('_', "-");
    let name = name.replace(' ', "-");
    match name.as_str() {
        "analyzing" | "analysis" | "survey" => Some(Phase::Analyzing),
        "reading" | "read" => Some(Phase::Reading),
        "clarifying" | "clarify" | "clarification" => Some(Phase::Clarifying),
        "planning" | "plan" => Some(Phase::Planning),
        "acting" | "act" | "action" => Some(Phase::Acting),
        "testing" | "test" | "tests" => Some(Phase::Testing),
        "verifying" | "verify" | "verification" => Some(Phase::Verifying),
        "answering" | "answer" | "respond" | "reply" | "response" => Some(Phase::Answering),
        "done" | "finish" | "finished" | "complete" | "completed" => Some(Phase::Done),
        _ => None,
    }
}

/// Marqueur objectif de run : `[run_objective: phrase actionnable]`.
#[must_use]
pub(crate) fn parse_run_objective_marker(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let body = trimmed.strip_prefix('[')?.strip_suffix(']')?;
    let (head, rest) = body.split_once(':')?;
    let key = head.trim().to_ascii_lowercase();
    if key != "run_objective" && key != "objective" && key != "objectif" {
        return None;
    }
    let text = rest.trim();
    if text.len() < 8 {
        return None;
    }
    Some(text.to_string())
}

/// Marqueurs de phase **retirés du protocole** : la ligne est consommée
/// (aucun `PhaseEnter`, pas de texte) pour compatibilité avec d'anciens prompts.
#[must_use]
pub(crate) fn legacy_removed_phase_marker_line(line: &str) -> bool {
    let trimmed = line.trim();
    let Some(body) = trimmed.strip_prefix('[').and_then(|s| s.strip_suffix(']')) else {
        return false;
    };
    let Some((head, raw_name)) = body.split_once(':') else {
        return false;
    };
    if !head.trim().eq_ignore_ascii_case("phase") {
        return false;
    }
    let name = raw_name.trim().to_ascii_lowercase();
    let name = name.replace('_', "-");
    let name = name.replace(' ', "-");
    matches!(
        name.as_str(),
        "reasoning" | "reason" | "think" | "thought"
            | "next-move" | "nextmove" | "next" | "next-step"
    )
}

/// Inférence de phase pour un appel d'outil émis **hors phase** (filet UI).
#[must_use]
pub(crate) fn phase_for_tool(tool_name: &str, active_phase: Option<Phase>) -> Phase {
    if active_phase == Some(Phase::Testing) {
        if matches!(
            tool_name,
            "bash" | "lsp" | "file_read" | "grep" | "glob" | "web_fetch" | "web_search"
        ) {
            return Phase::Testing;
        }
    }
    let exploration_default = if active_phase == Some(Phase::Analyzing) {
        Phase::Analyzing
    } else {
        Phase::Reading
    };
    match tool_name {
        "glob" | "file_read" | "grep" | "lsp" | "web_search" | "web_fetch"
        | "list_mcp_resources" | "read_mcp_resource" | "workspace_map_read"
        | "memory_read" | "memory_list" | "task"
        | "todo_write" | "course_plan_write" | "ask_user_question" => exploration_default,
        _ => Phase::Acting,
    }
}

#[must_use]
pub(crate) fn is_workspace_exploration_tool(name: &str) -> bool {
    matches!(
        name,
        "glob"
            | "grep"
            | "file_read"
            | "lsp"
            | "web_search"
            | "web_fetch"
            | "workspace_map_read"
            | "memory_read"
            | "memory_list"
            | "task"
    )
}

/// Filet UI : ré-ouvrir une phase d'exploration avant un outil de lecture quand
/// le modèle enchaîne depuis `internal_reasoning` sans marqueur `[phase: reading]`.
#[must_use]
pub(crate) fn needs_synthetic_phase_enter(active: Option<Phase>, tool_name: &str) -> bool {
    if active.is_none() {
        return true;
    }
    let active = active.expect("Some when not none");
    if matches!(active, Phase::Answering | Phase::Done) {
        return false;
    }
    if active == Phase::InternalReasoning {
        return is_workspace_exploration_tool(tool_name) || tool_name == "bash";
    }
    false
}

/// Texte normalisé pour détection de boucle / quasi-répétition (profil Low).
#[must_use]
#[allow(dead_code)] // conservé pour tests phases ; détection boucle Low retirée du hot path
pub(crate) fn normalize_for_loop_fingerprint(text: &str) -> String {
    strip_phase_protocol_lines(text)
        .to_ascii_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Retire les lignes protocole (`[phase: …]`, `[run_objective: …]`, …).
#[must_use]
pub(crate) fn strip_phase_protocol_lines(text: &str) -> String {
    text.lines()
        .filter(|line| {
            parse_phase_marker(line).is_none()
                && !legacy_removed_phase_marker_line(line)
                && parse_run_objective_marker(line).is_none()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Buffer line-based pour extraire les marqueurs `[phase: ...]` d'un stream
/// texte arbitrairement fragmenté.
pub(crate) struct PhaseLineBuffer {
    pending: String,
}

impl PhaseLineBuffer {
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self {
            pending: String::new(),
        }
    }

    /// Consomme un fragment et appelle les callbacks pour chaque ligne
    /// terminée par `\n`. Le reliquat (ligne incomplète) est conservé.
    pub(crate) fn push_chunk<TextSink, PhaseSink, ObjectiveSink>(
        &mut self,
        delta: &str,
        mut on_text: TextSink,
        mut on_phase: PhaseSink,
        mut on_run_objective: ObjectiveSink,
    ) where
        TextSink: FnMut(String),
        PhaseSink: FnMut(Phase),
        ObjectiveSink: FnMut(String),
    {
        self.pending.push_str(delta);
        while let Some(idx) = self.pending.find('\n') {
            let line: String = self.pending.drain(..=idx).collect();
            let body = line.trim_end_matches('\n');
            if legacy_removed_phase_marker_line(body) {
                continue;
            }
            if let Some(objective) = parse_run_objective_marker(body) {
                on_run_objective(objective);
                continue;
            }
            if let Some(phase) = parse_phase_marker(body) {
                on_phase(phase);
            } else {
                on_text(line);
            }
        }
    }

    /// À appeler en fin de stream : flush le reliquat.
    pub(crate) fn finish<TextSink, PhaseSink, ObjectiveSink>(
        self,
        mut on_text: TextSink,
        mut on_phase: PhaseSink,
        mut on_run_objective: ObjectiveSink,
    ) where
        TextSink: FnMut(String),
        PhaseSink: FnMut(Phase),
        ObjectiveSink: FnMut(String),
    {
        if self.pending.is_empty() {
            return;
        }
        if legacy_removed_phase_marker_line(self.pending.trim()) {
            return;
        }
        if let Some(objective) = parse_run_objective_marker(self.pending.trim()) {
            on_run_objective(objective);
        } else if let Some(phase) = parse_phase_marker(&self.pending) {
            on_phase(phase);
        } else {
            on_text(self.pending);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_for_loop_fingerprint_strips_phases() {
        let n = normalize_for_loop_fingerprint(
            "[phase: reading]\nHello world\n[phase: acting]",
        );
        assert!(n.contains("hello"));
        assert!(!n.contains("phase"));
    }

    #[test]
    fn parse_run_objective_marker_extracts_actionable_line() {
        assert_eq!(
            parse_run_objective_marker(
                "[run_objective: Relire le fichier page.tsx et résumer son rôle]"
            ),
            Some("Relire le fichier page.tsx et résumer son rôle".to_string())
        );
        assert!(parse_run_objective_marker("Tu peux le relire ?").is_none());
    }

    #[test]
    fn parse_phase_marker_accepts_canonical_forms() {
        assert_eq!(
            parse_phase_marker("[phase: analyzing]"),
            Some(Phase::Analyzing)
        );
        assert_eq!(
            parse_phase_marker("[phase: testing]"),
            Some(Phase::Testing)
        );
        assert_eq!(parse_phase_marker("[phase: reading]"), Some(Phase::Reading));
        assert_eq!(parse_phase_marker("[phase: clarifying]"), Some(Phase::Clarifying));
        assert_eq!(parse_phase_marker("[phase: planning]"), Some(Phase::Planning));
        assert_eq!(parse_phase_marker("[phase: acting]"), Some(Phase::Acting));
        assert_eq!(parse_phase_marker("[phase: verifying]"), Some(Phase::Verifying));
        assert_eq!(parse_phase_marker("[phase: answering]"), Some(Phase::Answering));
        assert_eq!(parse_phase_marker("[phase: done]"), Some(Phase::Done));
    }

    #[test]
    fn parse_phase_marker_returns_none_for_legacy_removed_names() {
        for line in [
            "[phase: reasoning]",
            "[phase: next-move]",
            "[phase:reason]",
            "[phase: think]",
            "[phase: nextmove]",
            "[phase: next_move]",
        ] {
            assert_eq!(parse_phase_marker(line), None, "{line}");
        }
    }

    #[test]
    fn legacy_removed_phase_marker_line_matches_deprecated_names() {
        assert!(legacy_removed_phase_marker_line("[phase: reasoning]"));
        assert!(legacy_removed_phase_marker_line("[phase: next-move]"));
        assert!(legacy_removed_phase_marker_line("[phase:reason]"));
    }

    #[test]
    fn parse_phase_marker_accepts_analyzing_aliases() {
        assert_eq!(
            parse_phase_marker("[phase: analysis]"),
            Some(Phase::Analyzing)
        );
        assert_eq!(
            parse_phase_marker("[phase: survey]"),
            Some(Phase::Analyzing)
        );
    }

    #[test]
    fn parse_phase_marker_accepts_testing_aliases() {
        assert_eq!(parse_phase_marker("[phase: test]"), Some(Phase::Testing));
        assert_eq!(parse_phase_marker("[phase: tests]"), Some(Phase::Testing));
    }

    #[test]
    fn phase_for_tool_keeps_testing_during_verification_tools() {
        assert_eq!(
            phase_for_tool("bash", Some(Phase::Testing)),
            Phase::Testing
        );
        assert_eq!(
            phase_for_tool("file_edit", Some(Phase::Testing)),
            Phase::Acting
        );
    }

    #[test]
    fn parse_phase_marker_accepts_answering_aliases() {
        assert_eq!(parse_phase_marker("[phase: answer]"), Some(Phase::Answering));
        assert_eq!(parse_phase_marker("[phase: reply]"), Some(Phase::Answering));
        assert_eq!(parse_phase_marker("[phase: respond]"), Some(Phase::Answering));
        assert_eq!(parse_phase_marker("[phase: response]"), Some(Phase::Answering));
    }

    #[test]
    fn parse_phase_marker_accepts_aliases_and_casing() {
        assert_eq!(parse_phase_marker("[PHASE: Done]"), Some(Phase::Done));
        assert_eq!(parse_phase_marker("[phase: read]"), Some(Phase::Reading));
        assert_eq!(parse_phase_marker("[phase: act]"), Some(Phase::Acting));
        assert_eq!(parse_phase_marker("  [phase: done]  "), Some(Phase::Done));
    }

    #[test]
    fn parse_phase_marker_rejects_non_markers() {
        assert_eq!(parse_phase_marker(""), None);
        assert_eq!(parse_phase_marker("hello world"), None);
        assert_eq!(parse_phase_marker("[note: done]"), None);
        assert_eq!(parse_phase_marker("phase: done"), None);
        assert_eq!(parse_phase_marker("[phase: bogus]"), None);
        assert_eq!(parse_phase_marker("a [phase: done] b"), None);
    }

    #[test]
    fn needs_synthetic_phase_enter_when_no_phase_or_after_native_thinking() {
        assert!(needs_synthetic_phase_enter(None, "file_read"));
        assert!(needs_synthetic_phase_enter(
            Some(Phase::InternalReasoning),
            "file_read"
        ));
        assert!(needs_synthetic_phase_enter(
            Some(Phase::InternalReasoning),
            "bash"
        ));
        assert!(!needs_synthetic_phase_enter(Some(Phase::Reading), "file_read"));
        assert!(!needs_synthetic_phase_enter(Some(Phase::Answering), "file_read"));
    }

    #[test]
    fn phase_for_tool_classifies_readonly_as_reading() {
        for t in [
            "glob",
            "file_read",
            "grep",
            "lsp",
            "web_search",
            "web_fetch",
            "todo_write",
            "ask_user_question",
        ] {
            assert_eq!(
                phase_for_tool(t, None),
                Phase::Reading,
                "{t} should be Reading"
            );
        }
    }

    #[test]
    fn phase_for_tool_keeps_analyzing_during_exploration() {
        for t in ["glob", "grep", "file_read", "workspace_map_read"] {
            assert_eq!(
                phase_for_tool(t, Some(Phase::Analyzing)),
                Phase::Analyzing,
                "{t}"
            );
        }
        assert_eq!(
            phase_for_tool("file_edit", Some(Phase::Analyzing)),
            Phase::Acting
        );
    }

    #[test]
    fn phase_for_tool_classifies_mutative_or_unknown_as_acting() {
        for t in [
            "bash",
            "file_edit",
            "file_write",
            "notebook_edit",
            "delete_path",
            "anything_else",
        ] {
            assert_eq!(phase_for_tool(t, None), Phase::Acting, "{t}");
        }
    }

    #[test]
    fn phase_line_buffer_strips_marker_and_emits_phase() {
        let mut buf = PhaseLineBuffer::new();
        let mut text = String::new();
        let mut phases: Vec<Phase> = Vec::new();
        buf.push_chunk(
            "Salut\n[phase: done]\nau revoir\n",
            |line| text.push_str(&line),
            |p| phases.push(p),
            |_o| {},
        );
        assert_eq!(phases, vec![Phase::Done]);
        assert_eq!(text, "Salut\nau revoir\n");
    }

    #[test]
    fn phase_line_buffer_handles_fragmented_marker() {
        let mut buf = PhaseLineBuffer::new();
        let mut text = String::new();
        let mut phases: Vec<Phase> = Vec::new();
        for chunk in ["[phase:", " read", "ing]\n", "data"] {
            buf.push_chunk(chunk, |l| text.push_str(&l), |p| phases.push(p), |_o| {});
        }
        buf.finish(|l| text.push_str(&l), |p| phases.push(p), |_o| {});
        assert_eq!(phases, vec![Phase::Reading]);
        assert_eq!(text, "data");
    }

    #[test]
    fn phase_line_buffer_finish_treats_trailing_marker() {
        let mut buf = PhaseLineBuffer::new();
        let mut text = String::new();
        let mut phases: Vec<Phase> = Vec::new();
        buf.push_chunk("[phase: done]", |l| text.push_str(&l), |p| phases.push(p), |_o| {});
        buf.finish(|l| text.push_str(&l), |p| phases.push(p), |_o| {});
        assert_eq!(phases, vec![Phase::Done]);
        assert!(text.is_empty());
    }
}
