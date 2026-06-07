//! Anti-boucle — recentrage injecté dans le transcript (architecte / exécuteur).
//!
//! | Rust | Rôle |
//! |------|------|
//! | `loop_intervention_level`, `loop_recenter_user_message` | Choix palier, rôle, `kind`, assemblage |
//! | `loop_intervention_ui_message` | Texte **UI** (français), pas envoyé au LLM |
//! | `templates/loop/*.md` | Wording LLM (`include_str!`, compile-time) |

use crate::run_spec::{RoleId, RunSpec};

use super::templates::r#loop as tpl;

/// Nudge système court (complète le message `user` de recentrage).
pub(crate) const LOOP_DETECTED_SYSTEM_NUDGE: &str = tpl::SYSTEM_NUDGE;

#[must_use]
fn apply_strike_placeholders(raw: &str, strike: u32, max_strikes: u32) -> String {
    raw.replace("{strike}", &strike.to_string())
        .replace("{max_strikes}", &max_strikes.to_string())
}

#[must_use]
fn role_block(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::Executor => tpl::ROLE_EXECUTOR,
        RoleId::Architect | RoleId::ArchitectDiscussion => {
            tpl::ROLE_ARCHITECT
        }
        RoleId::Standard => tpl::ROLE_STANDARD,
    }
}

#[must_use]
fn repeat_detail(kind: &str) -> &'static str {
    match kind {
        "tool_calls" => tpl::REPEAT_TOOL_CALLS,
        "text" => tpl::REPEAT_TEXT,
        _ => tpl::REPEAT_BOTH,
    }
}

#[must_use]
fn escalation_block(strike: u32, max_strikes_before_abort: u32) -> &'static str {
    if strike >= max_strikes_before_abort {
        tpl::ESCALATION_FINAL
    } else if strike >= 2 {
        tpl::ESCALATION_SECOND
    } else {
        tpl::ESCALATION_FIRST
    }
}

/// Messages **UI** (chat Drox) — restent en Rust (i18n / `format!` dynamique).
#[must_use]
pub(crate) fn loop_intervention_ui_message(
    level: &str,
    kind: &str,
    strike: u32,
    max_strikes: u32,
) -> String {
    match level {
        "reroute" => format!(
            "Boucle ({kind}) — recentrage renforcé ({strike}/{max_strikes}). \
Le modèle doit relire le contexte et changer d'angle."
        ),
        "abort" => format!(
            "Boucle non résolue ({kind}, {strike} tours identiques) — arrêt du run. \
Relancez avec un brief plus précis ou shard la tâche."
        ),
        _ => format!(
            "Boucle détectée ({kind}) — injection de recentrage ({strike}/{max_strikes})."
        ),
    }
}

/// Message **`user`** injecté dans l'historique LLM pour recentrer le modèle.
#[must_use]
pub(crate) fn loop_recenter_user_message(
    spec: &RunSpec,
    kind: &str,
    strike: u32,
    max_strikes_before_abort: u32,
) -> String {
    let footer = apply_strike_placeholders(tpl::FOOTER, strike, max_strikes_before_abort);
    format!(
        "{}\n{}\n\n{}\n\n{}",
        role_block(spec).trim(),
        repeat_detail(kind).trim(),
        escalation_block(strike, max_strikes_before_abort).trim(),
        footer.trim(),
    )
}

#[must_use]
pub(crate) fn loop_intervention_level(strike: u32, max_strikes_before_abort: u32) -> &'static str {
    if strike + 1 >= max_strikes_before_abort {
        "reroute"
    } else {
        "warn"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::run_spec::{RoleId, RunSpec};

    #[test]
    fn templates_load_non_empty() {
        assert!(!tpl::ESCALATION_FIRST.is_empty());
        assert!(!tpl::SYSTEM_NUDGE.is_empty());
    }

    #[test]
    fn recenter_user_message_mentions_executor_deliverable() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        let msg = loop_recenter_user_message(&spec, "both", 1, 4);
        assert!(msg.contains("Executor"));
        assert!(msg.contains("agent-output"));
        assert!(msg.contains("strike 1/4") || msg.contains("1/4"));
    }

    #[test]
    fn final_strike_uses_final_escalation_md() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        let msg = loop_recenter_user_message(&spec, "both", 4, 4);
        assert!(msg.contains("FINAL WARNING"));
        assert_eq!(loop_intervention_level(3, 4), "reroute");
        assert_eq!(loop_intervention_level(1, 4), "warn");
    }
}
