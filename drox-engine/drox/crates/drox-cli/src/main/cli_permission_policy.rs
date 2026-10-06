//! Construction de la `PermissionPolicy` depuis CLI + settings.

use std::sync::Arc;

use anyhow::Context;
use camino::Utf8PathBuf;
use drox_engine::{LayeredConfig, PermissionEngine, PermissionMode, PermissionPolicy};
use drox_permissions::{
    DetectUnreachableOptions, PathMatchContext, PermissionBehavior, Rule, RuleSet, RuleSource,
    detect_unreachable_rules, format_rule, parse_rule,
};

use super::cli::Cli;

/// Construit la `PermissionPolicy` à partir des arguments CLI + des fichiers
/// `~/.drox/settings.json`, `<workspace>/.drox/settings.json` et
/// `settings.local.json` (sauf si `--no-settings`).
pub(crate) fn build_permission_policy(
    cli: &Cli,
    workspace: &Utf8PathBuf,
) -> anyhow::Result<(PermissionMode, PermissionPolicy)> {
    let (user_path, project_path, local_path) = if cli.no_settings {
        (None, None, None)
    } else {
        let user = dirs::home_dir().map(|h| h.join(".drox").join("settings.json"));
        let drox_dir = workspace.as_std_path().join(".drox");
        let project = Some(drox_dir.join("settings.json"));
        let local = Some(drox_dir.join("settings.local.json"));
        (user, project, local)
    };

    let layered = LayeredConfig::load(
        user_path.as_deref(),
        project_path.as_deref(),
        local_path.as_deref(),
    )
    .context("failed to load drox settings")?;

    let mut rules: RuleSet = layered.build_rule_set();
    push_cli_rules(&mut rules, &cli.allow, PermissionBehavior::Allow);
    push_cli_rules(&mut rules, &cli.ask, PermissionBehavior::Ask);
    push_cli_rules(&mut rules, &cli.deny, PermissionBehavior::Deny);

    let mode = if cli.plan {
        PermissionMode::Plan
    } else if let Some(raw) = cli.mode.as_deref() {
        PermissionMode::from_str_lossy(raw)
    } else if let Some(m) = layered.effective_mode() {
        m
    } else {
        PermissionMode::Default
    };

    for unreachable in detect_unreachable_rules(&rules, &DetectUnreachableOptions::default()) {
        tracing::warn!(
            rule = %format_rule(&unreachable.rule.value),
            reason = %unreachable.reason,
            fix = %unreachable.fix,
            "règle de permission inatteignable (masquée)"
        );
    }

    let home = dirs::home_dir().unwrap_or_else(|| workspace.as_std_path().to_path_buf());
    let engine = Arc::new(
        PermissionEngine::with_rules(rules)
            .with_path_context(PathMatchContext::new(workspace.as_std_path(), home)),
    );
    Ok((mode, PermissionPolicy::new(engine, mode)))
}

pub(crate) fn push_cli_rules(set: &mut RuleSet, raw: &[String], behavior: PermissionBehavior) {
    for s in raw {
        set.push(Rule {
            value: parse_rule(s),
            behavior,
            source: RuleSource::CliArg,
        });
    }
}
