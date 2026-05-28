//! Qualité du plan architecte et des briefs `delegate_executor` (1.2.0).

use drox_tools::normalize_todo_write_payload;
use serde_json::Value;

pub(crate) const ARCHITECT_PLAN_META_BLOCKED: &str = "orchestration wording in a plan line";

pub(crate) const ARCHITECT_PLAN_PREP_BLOCKED: &str = "`workspace_map_read` used as a plan item";

pub(crate) const ARCHITECT_PLAN_MONOLITH_BLOCKED: &str = "plan line too broad (no concrete file/path target)";

pub(crate) const ARCHITECT_DELEGATION_TOO_BROAD: &str = "Blocked: delegation brief is too broad for the Executor model. \
Ask **one** narrow question (one deliverable). Split the work into more plan tasks and delegate again. \
Keep `scope` to a few paths; avoid « analyse complète », stack+architecture+modules in one call.";

/// Axes d'analyse — détection de listes fourre-tout (« stack, archi, deps… »).
const ANALYSIS_AXES: &[&str] = &[
    "stack",
    "techno",
    "architecture",
    "architectur",
    "structure",
    "dépendance",
    "dependenc",
    "configuration",
    "module",
    "fonctionnal",
    "functionality",
];

/// Meta-orchestration explicite — pas le mot « executor » seul (trop de faux positifs).
const META_PHRASES: &[&str] = &[
    "déléguer",
    "deleguer",
    "delegate to",
    "call delegate",
    "delegate_executor",
    "sub-agent",
    "sub agent",
    "vérifier le rapport",
    "verifier le rapport",
    "verify the report",
    "synthétiser",
    "synthetiser",
    "synthesize",
    "synthèse pour l'utilisateur",
    "synthèse utilisateur",
    "synthesis for the user",
    "résumé pour l'utilisateur",
    "resume pour l'utilisateur",
    "user summary",
    "user-facing summary",
    "rapport final",
    "final report",
    "final summary",
    "vérification finale",
    "verification finale",
    "vérifier le résultat final",
    "verifier le resultat final",
    "vérifier la compilation",
    "verifier la compilation",
    "validation finale",
    "final validation",
    "build check",
    "compile check",
    "smoke test final",
];

const PREP_MARKERS: &[&str] = &[
    "workspace_map",
    "workspace map",
    "carte du workspace",
    "carte workspace",
    "lire la carte",
    "read the map",
    "workspace map read",
];

/// Missions globales vagues — bloquées seulement sans cible concrète (fichier/chemin).
const MONOLITH_PHRASES: &[&str] = &[
    "analyse complète",
    "analyse complete",
    "complete analysis",
    "full analysis",
    "analyser le projet",
    "analyze the project",
    "analyse du projet",
    "project analysis",
    "prise de connaissance",
    "comprendre le projet",
    "understand the project",
    "explore the entire",
    "explorer tout le",
];

const ARCHITECT_MAX_DELEGATE_SCOPE_PATHS: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlanLineIssueKind {
    Prep,
    Meta,
    Monolith,
}

#[derive(Debug, Clone)]
struct PlanLineIssue {
    kind: PlanLineIssueKind,
    id: String,
    content: String,
}

#[must_use]
fn content_lower(content: &str) -> String {
    content.trim().to_lowercase()
}

#[must_use]
fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

/// Todo de synthèse / résumé utilisateur — pas de `delegate_executor` requis.
#[must_use]
pub fn is_meta_synthesis_label(content: &str) -> bool {
    let lower = content_lower(content);
    contains_any(&lower, META_PHRASES)
}

#[must_use]
fn has_concrete_probe_target(content: &str) -> bool {
    let lower = content_lower(content);
    const PATH_HINTS: &[&str] = &[
        "package.json",
        "tsconfig",
        "next.config",
        "pnpm-lock",
        "yarn.lock",
        "cargo.toml",
        "pyproject",
        "go.mod",
        "readme",
        "src/",
        "app/",
        "components/",
        "pages/",
        "public/",
        ".drox/",
        ".tsx",
        ".ts",
        ".jsx",
        ".js",
        ".json",
        ".md",
        ".css",
        ".scss",
        "glob ",
        "grep ",
        "file_read",
    ];
    contains_any(&lower, PATH_HINTS)
}

#[must_use]
fn analysis_axis_count(text: &str) -> usize {
    ANALYSIS_AXES
        .iter()
        .filter(|axis| text.contains(*axis))
        .count()
}

#[must_use]
fn is_monolithic_mission(content: &str) -> bool {
    if has_concrete_probe_target(content) {
        return false;
    }
    let lower = content_lower(content);
    if contains_any(&lower, MONOLITH_PHRASES) {
        return true;
    }
    if analysis_axis_count(&lower) >= 3 {
        return true;
    }
    false
}

#[must_use]
fn plan_line_issue(content: &str, id: &str) -> Option<PlanLineIssue> {
    let lower = content_lower(content);
    if contains_any(&lower, PREP_MARKERS) {
        return Some(PlanLineIssue {
            kind: PlanLineIssueKind::Prep,
            id: id.to_string(),
            content: content.to_string(),
        });
    }
    if contains_any(&lower, META_PHRASES) {
        return Some(PlanLineIssue {
            kind: PlanLineIssueKind::Meta,
            id: id.to_string(),
            content: content.to_string(),
        });
    }
    if is_monolithic_mission(content) {
        return Some(PlanLineIssue {
            kind: PlanLineIssueKind::Monolith,
            id: id.to_string(),
            content: content.to_string(),
        });
    }
    None
}

#[must_use]
fn example_fix_for_issue(issue: &PlanLineIssue) -> &'static str {
    match issue.kind {
        PlanLineIssueKind::Prep => {
            "Remove this line — call workspace_map_read before todo_write, not inside the plan."
        }
        PlanLineIssueKind::Meta => {
            "Replace with a concrete outcome (e.g. « Lister les technos dans package.json ») — no « déléguer », « synthèse », « rapport final »."
        }
        PlanLineIssueKind::Monolith => {
            "Split into one axis per line with a file/path (e.g. t1 « Lister deps dans package.json », t2 « Arborescence src/app », t3 « Reliques non branchées dans src/ »)."
        }
    }
}

#[must_use]
fn format_plan_line_block(issue: &PlanLineIssue) -> String {
    let reason = match issue.kind {
        PlanLineIssueKind::Prep => ARCHITECT_PLAN_PREP_BLOCKED,
        PlanLineIssueKind::Meta => ARCHITECT_PLAN_META_BLOCKED,
        PlanLineIssueKind::Monolith => ARCHITECT_PLAN_MONOLITH_BLOCKED,
    };
    format!(
        "Blocked on todo `{id}`: « {content} » — {reason}.\n\
         Fix: {fix}\n\
         Rules: one axis per line · cite paths (package.json, src/…) · 10–20 narrow lines OK · no user summary in the plan.",
        id = issue.id,
        content = issue.content.trim(),
        reason = reason,
        fix = example_fix_for_issue(issue),
    )
}

#[must_use]
fn todo_item_id(item: &Value, index: usize) -> String {
    item.get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("t{}", index + 1))
}

#[must_use]
fn todo_item_content(item: &Value) -> Option<&str> {
    item.get("content").and_then(|v| v.as_str())
}

#[must_use]
pub(crate) fn architect_todo_plan_quality_gate(arguments: &Value) -> Option<String> {
    let normalized = normalize_todo_write_payload(arguments.clone());
    let todos = normalized.get("todos")?.as_array()?;
    for (i, item) in todos.iter().enumerate() {
        let content = todo_item_content(item)?;
        let id = todo_item_id(item, i);
        if let Some(issue) = plan_line_issue(content, &id) {
            return Some(format_plan_line_block(&issue));
        }
    }
    None
}

#[must_use]
pub(crate) fn architect_delegation_quality_gate(arguments: &Value) -> Option<String> {
    let description = arguments
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let deliverable = arguments
        .get("deliverable")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let instructions = arguments
        .get("instructions")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let context = arguments
        .get("context")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let combined = content_lower(&format!(
        "{description} {deliverable} {instructions} {context}"
    ));
    if is_monolithic_mission(&combined) && !has_concrete_probe_target(&combined) {
        return Some(ARCHITECT_DELEGATION_TOO_BROAD.to_string());
    }
    if let Some(scope) = arguments.get("scope").and_then(|v| v.as_array()) {
        if scope.len() > ARCHITECT_MAX_DELEGATE_SCOPE_PATHS {
            return Some(format!(
                "{ARCHITECT_DELEGATION_TOO_BROAD} (scope has {} paths; keep ≤ {ARCHITECT_MAX_DELEGATE_SCOPE_PATHS}).",
                scope.len()
            ));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn blocks_delegate_in_plan() {
        let msg = architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t2",
                "content": "Déléguer l'analyse complète du projet au Executor",
                "status": "pending"
            }]
        }));
        let msg = msg.expect("blocked");
        assert!(msg.contains("t2"));
        assert!(msg.contains("Déléguer"));
        assert!(msg.contains("Fix:"));
    }

    #[test]
    fn blocks_workspace_map_as_plan_item() {
        let msg = architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t1",
                "content": "Lire la carte du workspace pour comprendre la structure",
                "status": "pending"
            }]
        }));
        assert!(msg.unwrap().contains("workspace_map"));
    }

    #[test]
    fn blocks_monolithic_plan_line_without_path() {
        let msg = architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t1",
                "content": "Stack technique, architecture, dépendances et configuration",
                "status": "pending"
            }]
        }));
        assert!(msg.is_some());
    }

    #[test]
    fn allows_narrow_plan_lines() {
        assert!(architect_todo_plan_quality_gate(&json!({
            "todos": [
                { "id": "t1", "content": "Lister les technos dans package.json et configs", "status": "pending" },
                { "id": "t2", "content": "Cartographier src/app et src/components (arborescence)", "status": "pending" },
            ]
        }))
        .is_none());
    }

    #[test]
    fn allows_analyze_project_when_path_present() {
        assert!(architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t1",
                "content": "Lire package.json pour identifier la stack du projet",
                "status": "pending"
            }]
        }))
        .is_none());
    }

    #[test]
    fn blocks_vague_analyze_project_line() {
        let msg = architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t1",
                "content": "Analyser le projet pour en prendre connaissance",
                "status": "pending"
            }]
        }));
        assert!(msg.is_some());
        assert!(msg.unwrap().contains("t1"));
    }

    #[test]
    fn allows_executor_word_in_outcome_line() {
        assert!(architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t3",
                "content": "Repérer composants UI animés dans src/components/",
                "status": "pending"
            }]
        }))
        .is_none());
    }

    #[test]
    fn blocks_user_summary_in_plan() {
        let msg = architect_todo_plan_quality_gate(&json!({
            "todos": [{
                "id": "t9",
                "content": "Synthèse utilisateur — rapport final",
                "status": "pending"
            }]
        }));
        assert!(msg.is_some());
    }

    #[test]
    fn treats_final_validation_as_meta_synthesis() {
        assert!(is_meta_synthesis_label(
            "Vérification finale build/compilation + synthèse utilisateur"
        ));
        assert!(is_meta_synthesis_label(
            "Final validation and user-facing summary"
        ));
    }

    #[test]
    fn blocks_broad_delegation_brief() {
        let msg = architect_delegation_quality_gate(&json!({
            "task_id": "t2",
            "description": "Analyse complète du projet app-kdds-main : stack, architecture, modules",
            "instructions": "Read everything and summarize dependencies, configuration, and main features.",
            "scope": ["app-kdds-main"]
        }));
        assert!(msg.is_some());
    }

    #[test]
    fn allows_narrow_delegation_brief() {
        assert!(architect_delegation_quality_gate(&json!({
            "task_id": "t1",
            "description": "List technologies from package.json and config files",
            "instructions": "Read app-kdds-main/package.json, tsconfig.json, next.config.ts. Return bullet list only.",
            "scope": ["app-kdds-main/package.json", "app-kdds-main/tsconfig.json"]
        }))
        .is_none());
    }

    #[test]
    fn allows_delegation_with_concrete_paths_despite_analyze_phrase() {
        assert!(architect_delegation_quality_gate(&json!({
            "task_id": "t1",
            "description": "Analyze the project stack from package.json",
            "instructions": "Read app-kdds-main/package.json only. List framework and major deps.",
            "scope": ["app-kdds-main/package.json"]
        }))
        .is_none());
    }
}
