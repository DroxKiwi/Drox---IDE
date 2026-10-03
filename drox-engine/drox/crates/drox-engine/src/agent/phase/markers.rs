//! Marqueurs `[phase: …]`, inférence hors-phase, heuristiques workspace.

use drox_bash::command_is_inspect_only_with_workspace;
use drox_types::Content;
use serde_json::Value;

use crate::event::Phase;

/// Parse une ligne déjà extraite (sans `\n`) et tente d'en faire un marqueur
/// de phase. Reconnaît :
///
/// - le format canonique `[phase: nom]` avec espaces tolérés autour de `nom` ;
/// - quelques alias pratiques (`act` → `acting`, `verify` → `verifying`, …) ;
/// - la casse libre (`[PHASE: Done]` accepté).
///
/// Toute autre ligne renvoie `None` et reste du texte ordinaire.
pub(crate) fn parse_phase_marker(line: &str) -> Option<Phase> {
    let trimmed = line.trim();
    let body = trimmed.strip_prefix('[')?.strip_suffix(']')?;
    let (head, raw_name) = body.split_once(':')?;
    if !head.trim().eq_ignore_ascii_case("phase") {
        return None;
    }
    let name = raw_name.trim().to_ascii_lowercase();
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

/// Inférence de phase pour un appel d'outil émis **hors phase** (filet de
/// sécurité du moteur, cf. Sprint A.4). On classe selon la nature du tool :
///
/// - **lecture seule** (`glob`, `file_read`, `grep`, `lsp`, `web_search`,
///   `web_fetch`, `todo_write`, `ask_user_question`) → `Reading` (ce sont
///   en pratique des opérations d'exploration / méta) ;
/// - **mutatif / exécution** (`file_edit`, `file_write`, `delete_path`, `bash`, autres) →
///   `Acting`.
///
/// La précision n'est pas critique : l'utilisateur observera juste un
/// bloc de phase au bon endroit, peu importe le nom exact. Le modèle est
/// invité par le prompt à déclarer ses propres phases ; ce helper sert
/// uniquement quand il oublie.
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
        // Inspect-only bash is exploration; mutating bash stays Acting.
        // Callers that know args should prefer `phase_for_tool_call`.
        _ => Phase::Acting,
    }
}

/// Bash inspect-only for agent gates — destination-aware redirects (temp / hors workspace OK).
pub(crate) fn bash_is_inspect_only(command: &str, workspace_root: &camino::Utf8Path) -> bool {
    command_is_inspect_only_with_workspace(command, Some(workspace_root.as_std_path()))
}

/// Like [`phase_for_tool`], but bash inspect-only (`git status`, `cargo check`, …) maps to Reading.
pub(crate) fn phase_for_tool_call(
    tool_name: &str,
    arguments: &Value,
    active_phase: Option<Phase>,
    workspace_root: &camino::Utf8Path,
) -> Phase {
    if tool_name == "bash"
        && arguments
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(|cmd| bash_is_inspect_only(cmd, workspace_root))
    {
        if active_phase == Some(Phase::Testing) {
            return Phase::Testing;
        }
        return if active_phase == Some(Phase::Analyzing) {
            Phase::Analyzing
        } else {
            Phase::Reading
        };
    }
    phase_for_tool(tool_name, active_phase)
}

/// `true` si le texte utilisateur ressemble à une demande d'analyse de dépôt (§2.18).
pub(crate) fn user_prompt_suggests_workspace_analysis(text: &str) -> bool {
    let lower = text.to_lowercase();
    [
        "analyse",
        "analyze",
        "audit",
        "vue d'ensemble",
        "overview",
        "structure du projet",
        "structure of the project",
        "explore le repo",
        "explore the repo",
        "cartograph",
        "survey the",
        "comprendre le projet",
        "understand the project",
        "analyse le projet",
        "analyze the project",
        "analyse ce repo",
        "analyze this repo",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

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

pub(crate) fn user_blocks_plain_text(blocks: &[Content]) -> String {
    blocks
        .iter()
        .filter_map(|b| match b {
            Content::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

