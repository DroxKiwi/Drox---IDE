//! Moteur de décision : combine `RuleSet` + `PermissionMode` + cible.
//!
//! Le pipeline simplifié, qui suit l'esprit du système TS d'origine (cf.
//! `src/utils/permissions/permissions.ts`), est :
//!
//! 1. Si une règle `Deny` matche (tool-wide ou contenu) → `Deny`.
//! 2. Mode `Plan` + tool d'écriture → `Deny` (l'agent doit `exit_plan_mode`).
//! 3. Si une règle `Ask` matche (tool-wide ou contenu) → `Ask` (sauf modes
//!    `AcceptEdits` / `BypassPermissions` qui ignorent les règles Ask).
//! 4. Si une règle `Allow` matche (tool-wide ou contenu) → `Allow`.
//! 5. Mode `BypassPermissions` → `Allow` (sauf si déjà Deny en étape 1).
//! 6. Mode `AcceptEdits` + tool d'écriture → `Allow`.
//! 7. Tool considéré comme "lecture seule" (`is_read_only`) → `Allow`.
//! 8. Sinon → `Ask` en `Default` ; `Allow` en `AcceptEdits` / `BypassPermissions`.

use crate::matcher::ShellPattern;
use crate::mode::PermissionMode;
use crate::path_matcher::{
    PathMatchContext, dangerous_path_reason, is_under_workspace_drox, path_rule_matches,
};
use crate::rule::{PermissionBehavior, Rule, RuleSet, format_rule};
use crate::tool_names::{primary_rule_tool_name, uses_path_patterns};

/// Décision finale du moteur.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionDecision {
    /// L'agent peut exécuter le tool.
    Allow { reason: DecisionReason },
    /// Demander confirmation à l'humain.
    Ask {
        reason: DecisionReason,
        message: String,
    },
    /// Refuser ; l'agent recevra un `tool_result` d'erreur.
    Deny {
        reason: DecisionReason,
        message: String,
    },
}

impl PermissionDecision {
    /// Renvoie `true` si la décision est `Allow`.
    #[must_use]
    pub const fn is_allow(&self) -> bool {
        matches!(self, Self::Allow { .. })
    }
    /// Renvoie `true` si la décision est `Deny`.
    #[must_use]
    pub const fn is_deny(&self) -> bool {
        matches!(self, Self::Deny { .. })
    }
    /// Renvoie `true` si la décision est `Ask`.
    #[must_use]
    pub const fn is_ask(&self) -> bool {
        matches!(self, Self::Ask { .. })
    }

    /// Agrège deux décisions (p. ex. sous-commandes d’une même ligne Bash) :
    /// **Deny** l’emporte sur **Ask**, qui l’emporte sur **Allow**.
    #[must_use]
    pub fn merge_compound(self, other: Self) -> Self {
        if self.is_deny() || other.is_deny() {
            return if self.is_deny() { self } else { other };
        }
        if self.is_ask() || other.is_ask() {
            return if self.is_ask() { self } else { other };
        }
        self
    }
}

/// Raison d'une décision (utile pour les logs et l'affichage CLI).
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum DecisionReason {
    /// La décision provient d'une règle utilisateur.
    Rule {
        rule: String,
        source_display: String,
    },
    /// La décision provient du mode courant.
    Mode(PermissionMode),
    /// Le tool est considéré comme "lecture seule" et a donc été auto-autorisé.
    ReadOnlyTool,
    /// Aucune règle ne s'applique, demande à l'humain par défaut.
    Default,
}

/// Cible d'une décision : nom du tool + valeur représentative à matcher.
///
/// Pour `Bash` la cible est la `command` ; pour `FileWrite`/`FileEdit` c'est
/// le `path` ; pour les autres tools (`FileRead`, `Grep`, …) la cible peut
/// être `None` et seules les règles tool-wide jouent.
#[derive(Debug, Clone)]
pub struct PermissionTarget<'a> {
    /// Nom du tool (canonique).
    pub tool_name: &'a str,
    /// Valeur cible (command, path, …) à confronter aux `rule_content`.
    pub content: Option<&'a str>,
    /// `true` si le tool écrit dans le filesystem / change le système.
    pub is_write: bool,
    /// `true` si le tool est considéré "lecture seule" (`file_read`, `grep`, `glob`, `web_fetch`).
    pub is_read_only: bool,
}

impl<'a> PermissionTarget<'a> {
    /// Cible "tool-wide" sans contenu.
    #[must_use]
    pub const fn tool(tool_name: &'a str) -> Self {
        Self {
            tool_name,
            content: None,
            is_write: false,
            is_read_only: false,
        }
    }

    /// Marque la cible comme écriture (déclenche les règles plan / acceptEdits).
    #[must_use]
    pub const fn with_write(mut self, is_write: bool) -> Self {
        self.is_write = is_write;
        self
    }

    /// Marque la cible comme lecture seule.
    #[must_use]
    pub const fn with_read_only(mut self, is_read_only: bool) -> Self {
        self.is_read_only = is_read_only;
        self
    }

    /// Attache un `content` (command, path, …).
    #[must_use]
    pub const fn with_content(mut self, content: &'a str) -> Self {
        self.content = Some(content);
        self
    }
}

/// Moteur de permissions.
///
/// Stateless une fois construit : peut être partagé entre tâches via `Arc`.
#[derive(Debug, Clone, Default)]
pub struct PermissionEngine {
    rules: RuleSet,
    path_ctx: Option<PathMatchContext>,
}

impl PermissionEngine {
    /// Construit un moteur vide.
    #[must_use]
    pub fn new() -> Self {
        Self {
            rules: RuleSet::new(),
            path_ctx: None,
        }
    }

    /// Construit un moteur à partir d'un `RuleSet` pré-rempli.
    #[must_use]
    pub fn with_rules(rules: RuleSet) -> Self {
        Self {
            rules,
            path_ctx: None,
        }
    }

    /// Attache le contexte de résolution des chemins (workspace + home).
    #[must_use]
    pub fn with_path_context(mut self, ctx: PathMatchContext) -> Self {
        self.path_ctx = Some(ctx);
        self
    }

    /// Contexte chemins, si défini.
    #[must_use]
    pub fn path_context(&self) -> Option<&PathMatchContext> {
        self.path_ctx.as_ref()
    }

    /// Accès lecture seule aux règles.
    #[must_use]
    pub const fn rules(&self) -> &RuleSet {
        &self.rules
    }

    /// Accès mutable, utile pour ajouter des règles de session dynamiquement.
    pub const fn rules_mut(&mut self) -> &mut RuleSet {
        &mut self.rules
    }

    /// Évalue une décision sur une cible.
    #[must_use]
    pub fn evaluate(
        &self,
        target: &PermissionTarget<'_>,
        mode: PermissionMode,
    ) -> PermissionDecision {
        // 1. Deny tool-wide
        if let Some(rule) = find_tool_wide(&self.rules, target.tool_name, PermissionBehavior::Deny)
        {
            return PermissionDecision::Deny {
                reason: rule_reason(rule),
                message: format!("Permission to use {} has been denied.", target.tool_name),
            };
        }

        // 1b. Deny content-specific
        if let Some(content) = target.content {
            if let Some(rule) = find_content_rule(
                &self.rules,
                target.tool_name,
                content,
                PermissionBehavior::Deny,
                self.path_ctx.as_ref(),
            ) {
                return PermissionDecision::Deny {
                    reason: rule_reason(rule),
                    message: format!("Command denied by rule `{}`.", format_rule(&rule.value)),
                };
            }
        }

        // 1c. Chemins sensibles (auto-deny) pour outils fichier, sauf Allow explicite / bypass / `.drox/`.
        if target.is_write {
            if let (Some(path), Some(ctx)) = (target.content, self.path_ctx.as_ref()) {
                let drox_storage = is_under_workspace_drox(path, ctx);
                if let Some(hint) = dangerous_path_reason(path, ctx) {
                    if drox_storage && mode.blocks_writes_outside_drox() {
                        // Analyze : autoriser la mémoire / analyses sous `.drox/`.
                    } else {
                    let allowed = find_content_rule(
                        &self.rules,
                        target.tool_name,
                        path,
                        PermissionBehavior::Allow,
                        Some(ctx),
                    )
                    .is_some()
                        || find_tool_wide(
                            &self.rules,
                            target.tool_name,
                            PermissionBehavior::Allow,
                        )
                        .is_some();
                    if !allowed && !mode.trust_level_full() {
                        return PermissionDecision::Deny {
                            reason: DecisionReason::Default,
                            message: format!(
                                "Modification refusée ({hint}) sur `{path}`. Ajoutez une règle Allow explicite pour autoriser."
                            ),
                        };
                    }
                    }
                }
            }
        }

        // 2. Legacy Plan : bloque toute écriture (tools `plan_mode`).
        if mode.enables_plan_mode_on_tools() && target.is_write {
            return PermissionDecision::Deny {
                reason: DecisionReason::Mode(mode),
                message: format!(
                    "Plan mode forbids `{}` (no writes allowed). Use `exit_plan_mode` first.",
                    target.tool_name
                ),
            };
        }

        // 2b. Analyze : écritures uniquement sous `.drox/`.
        if mode.blocks_writes_outside_drox() && target.is_write {
            let allowed_drox = target.content.is_some_and(|path| {
                self.path_ctx
                    .as_ref()
                    .is_some_and(|ctx| is_under_workspace_drox(path, ctx))
            });
            if !allowed_drox {
                return PermissionDecision::Deny {
                    reason: DecisionReason::Mode(mode),
                    message: format!(
                        "Analyze mode: `{}` cannot modify paths outside `.drox/` (workspace memory and analyses only).",
                        target.tool_name
                    ),
                };
            }
            return PermissionDecision::Allow {
                reason: DecisionReason::Mode(mode),
            };
        }

        // 3. Ask rules — ignorées en TrustEdit ; lectures libres en Analyze / ImNotCrazy
        if !mode_skips_permission_asks_for(mode, target) {
            if let Some(rule) =
                find_tool_wide(&self.rules, target.tool_name, PermissionBehavior::Ask)
            {
                return PermissionDecision::Ask {
                    reason: rule_reason(rule),
                    message: format!(
                        "Permission rule `{}` requires approval to use {}.",
                        format_rule(&rule.value),
                        target.tool_name
                    ),
                };
            }
            if let Some(content) = target.content {
                if let Some(rule) = find_content_rule(
                    &self.rules,
                    target.tool_name,
                    content,
                    PermissionBehavior::Ask,
                    self.path_ctx.as_ref(),
                ) {
                    return PermissionDecision::Ask {
                        reason: rule_reason(rule),
                        message: format!(
                            "Rule `{}` requires approval for this {} command.",
                            format_rule(&rule.value),
                            target.tool_name
                        ),
                    };
                }
            }
        }

        // 4. Allow rules
        if let Some(rule) = find_tool_wide(&self.rules, target.tool_name, PermissionBehavior::Allow)
        {
            return PermissionDecision::Allow {
                reason: rule_reason(rule),
            };
        }
        if let Some(content) = target.content {
            if let Some(rule) = find_content_rule(
                &self.rules,
                target.tool_name,
                content,
                PermissionBehavior::Allow,
                self.path_ctx.as_ref(),
            ) {
                return PermissionDecision::Allow {
                    reason: rule_reason(rule),
                };
            }
        }

        // 5. TrustEdit / legacy bypass — auto-allow
        if mode.trust_level_full() {
            return PermissionDecision::Allow {
                reason: DecisionReason::Mode(mode),
            };
        }

        // 6. TrustEdit / legacy acceptEdits — auto-allow les écritures
        if target.is_write && mode.auto_allows_writes() {
            return PermissionDecision::Allow {
                reason: DecisionReason::Mode(mode),
            };
        }

        // 7. Tools read-only autorisés par défaut
        if target.is_read_only {
            return PermissionDecision::Allow {
                reason: DecisionReason::ReadOnlyTool,
            };
        }

        // 8. Défaut : TrustEdit déjà géré ; ImNotCrazy → Ask sur écritures / tools inconnus
        if mode_skips_permission_asks_for(mode, target) {
            return PermissionDecision::Allow {
                reason: DecisionReason::Mode(mode),
            };
        }
        PermissionDecision::Ask {
            reason: DecisionReason::Default,
            message: format!("Drox requests permission to use {}.", target.tool_name),
        }
    }
}

#[must_use]
fn mode_skips_permission_asks_for(mode: PermissionMode, target: &PermissionTarget<'_>) -> bool {
    let m = mode.effective();
    match m {
        PermissionMode::TrustEdit => true,
        PermissionMode::Analyze | PermissionMode::ImNotCrazy if target.is_read_only => true,
        _ => false,
    }
}

/// Cherche la première règle tool-wide qui correspond.
fn find_tool_wide<'a>(
    rules: &'a RuleSet,
    tool_name: &str,
    behavior: PermissionBehavior,
) -> Option<&'a Rule> {
    let name = primary_rule_tool_name(tool_name);
    rules
        .iter_tool_wide(behavior)
        .find(|r| r.value.tool_name == name)
}

/// Cherche la première règle content qui matche `content`.
fn find_content_rule<'a>(
    rules: &'a RuleSet,
    tool_name: &'a str,
    content: &str,
    behavior: PermissionBehavior,
    path_ctx: Option<&PathMatchContext>,
) -> Option<&'a Rule> {
    let name = primary_rule_tool_name(tool_name);
    let use_paths = uses_path_patterns(tool_name) && path_ctx.is_some();

    rules.iter_for_tool(name, behavior).find(|rule| {
        rule.value.rule_content.as_deref().is_some_and(|raw| {
            if use_paths {
                path_rule_matches(raw, content, rule.source, path_ctx.expect("checked"))
            } else {
                ShellPattern::parse(raw).matches(content)
            }
        })
    })
}

fn rule_reason(rule: &Rule) -> DecisionReason {
    DecisionReason::Rule {
        rule: format_rule(&rule.value),
        source_display: rule.source.display_name().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rule::{RuleSource, RuleValue};

    fn rule(
        tool: &str,
        content: Option<&str>,
        behavior: PermissionBehavior,
        source: RuleSource,
    ) -> Rule {
        let value = content.map_or_else(
            || RuleValue::tool_wide(tool),
            |c| RuleValue::with_content(tool, c),
        );
        Rule {
            value,
            behavior,
            source,
        }
    }

    fn engine_with(rules: Vec<Rule>) -> PermissionEngine {
        let mut set = RuleSet::new();
        for r in rules {
            set.push(r);
        }
        PermissionEngine::with_rules(set)
    }

    #[test]
    fn deny_tool_wide_blocks_everything() {
        let engine = engine_with(vec![rule(
            "Bash",
            None,
            PermissionBehavior::Deny,
            RuleSource::UserSettings,
        )]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("echo hello"),
            PermissionMode::Default,
        );
        assert!(decision.is_deny(), "got {decision:?}");
    }

    #[test]
    fn deny_content_blocks_specific_command() {
        let engine = engine_with(vec![rule(
            "Bash",
            Some("rm -rf *"),
            PermissionBehavior::Deny,
            RuleSource::CliArg,
        )]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("rm -rf /tmp/foo"),
            PermissionMode::Default,
        );
        assert!(decision.is_deny(), "got {decision:?}");
    }

    #[test]
    fn allow_prefix_matches() {
        let engine = engine_with(vec![rule(
            "Bash",
            Some("npm:*"),
            PermissionBehavior::Allow,
            RuleSource::ProjectSettings,
        )]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("npm install drox"),
            PermissionMode::Default,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn ask_rule_overrides_allow_when_higher_priority() {
        // Deny est plus prioritaire que ask ; ask est plus prioritaire qu'allow.
        let engine = engine_with(vec![
            rule(
                "Bash",
                Some("git push:*"),
                PermissionBehavior::Ask,
                RuleSource::UserSettings,
            ),
            rule(
                "Bash",
                Some("git *"),
                PermissionBehavior::Allow,
                RuleSource::UserSettings,
            ),
        ]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("git push origin"),
            PermissionMode::Default,
        );
        assert!(decision.is_ask(), "got {decision:?}");
    }

    #[test]
    fn plan_mode_blocks_writes() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("FileWrite")
                .with_content("/tmp/foo.txt")
                .with_write(true),
            PermissionMode::Plan,
        );
        assert!(decision.is_deny(), "got {decision:?}");
    }

    #[test]
    fn analyze_mode_allows_drox_writes_only() {
        let engine = PermissionEngine::with_rules(RuleSet::new()).with_path_context(PathMatchContext::new(
            std::path::Path::new("/proj"),
            "/home",
        ));
        let deny = engine.evaluate(
            &PermissionTarget::tool("FileWrite")
                .with_content("src/main.ts")
                .with_write(true),
            PermissionMode::Analyze,
        );
        assert!(deny.is_deny(), "got {deny:?}");
        let allow = engine.evaluate(
            &PermissionTarget::tool("FileWrite")
                .with_content(".drox/memory/note.md")
                .with_write(true),
            PermissionMode::Analyze,
        );
        assert!(allow.is_allow(), "got {allow:?}");
    }

    #[test]
    fn im_not_crazy_asks_on_writes() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("FileWrite")
                .with_content("src/foo.ts")
                .with_write(true),
            PermissionMode::ImNotCrazy,
        );
        assert!(decision.is_ask(), "got {decision:?}");
    }

    #[test]
    fn im_not_crazy_allows_reads() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("FileRead")
                .with_content("README.md")
                .with_read_only(true),
            PermissionMode::ImNotCrazy,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn trust_edit_auto_allows_writes() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("FileWrite")
                .with_content("src/foo.ts")
                .with_write(true),
            PermissionMode::TrustEdit,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn plan_mode_allows_reads() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("FileRead")
                .with_content("README.md")
                .with_read_only(true),
            PermissionMode::Plan,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn accept_edits_auto_allows_writes() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("FileWrite")
                .with_content("/tmp/foo.txt")
                .with_write(true),
            PermissionMode::AcceptEdits,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn bypass_auto_allows_arbitrary() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("curl evil"),
            PermissionMode::BypassPermissions,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn bypass_still_respects_deny() {
        let engine = engine_with(vec![rule(
            "Bash",
            Some("rm -rf *"),
            PermissionBehavior::Deny,
            RuleSource::UserSettings,
        )]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("rm -rf /"),
            PermissionMode::BypassPermissions,
        );
        assert!(decision.is_deny(), "got {decision:?}");
    }

    #[test]
    fn unknown_tool_defaults_to_ask() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("MysteryTool"),
            PermissionMode::Default,
        );
        assert!(decision.is_ask(), "got {decision:?}");
    }

    #[test]
    fn accept_edits_auto_allows_unknown_tool() {
        let engine = engine_with(vec![]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("MysteryTool"),
            PermissionMode::AcceptEdits,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn accept_edits_ignores_ask_rules() {
        let engine = engine_with(vec![rule(
            "Bash",
            None,
            PermissionBehavior::Ask,
            RuleSource::UserSettings,
        )]);
        let decision = engine.evaluate(
            &PermissionTarget::tool("Bash").with_content("npm test"),
            PermissionMode::AcceptEdits,
        );
        assert!(decision.is_allow(), "got {decision:?}");
    }

    #[test]
    fn merge_compound_deny_wins_over_ask() {
        let ask = PermissionDecision::Ask {
            reason: DecisionReason::Default,
            message: "a".into(),
        };
        let deny = PermissionDecision::Deny {
            reason: DecisionReason::Default,
            message: "b".into(),
        };
        assert!(ask.clone().merge_compound(deny.clone()).is_deny());
        assert!(deny.merge_compound(ask).is_deny());
    }

    #[test]
    fn file_edit_deny_glob_matches_path() {
        let root = std::env::temp_dir().join("drox_engine_perm_env");
        let _ = std::fs::create_dir_all(root.join("pkg"));
        let env_file = root.join("pkg/.env");
        let _ = std::fs::write(&env_file, "SECRET=1");

        let engine = engine_with(vec![rule(
            "file_edit",
            Some("**/*.env"),
            PermissionBehavior::Deny,
            RuleSource::ProjectSettings,
        )])
        .with_path_context(PathMatchContext::new(&root, root.join("home")));

        let path = env_file.to_str().unwrap();
        let decision = engine.evaluate(
            &PermissionTarget::tool("file_edit")
                .with_content(path)
                .with_write(true),
            PermissionMode::AcceptEdits,
        );
        assert!(decision.is_deny(), "got {decision:?}");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn merge_compound_ask_wins_over_allow() {
        let ask = PermissionDecision::Ask {
            reason: DecisionReason::Default,
            message: "m".into(),
        };
        let allow = PermissionDecision::Allow {
            reason: DecisionReason::ReadOnlyTool,
        };
        assert!(allow.merge_compound(ask.clone()).is_ask());
        assert!(
            ask.merge_compound(PermissionDecision::Allow {
                reason: DecisionReason::ReadOnlyTool,
            })
            .is_ask()
        );
    }
}
