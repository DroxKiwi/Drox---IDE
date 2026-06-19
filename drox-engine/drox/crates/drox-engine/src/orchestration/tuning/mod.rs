//! Profil moteur unique (`EngineTuning::product_default`) — rail + tool folders actifs.
//!
//! `resolve_engine_tuning` ignore `strictness` / overrides RPC (rétrocompat wire).
//! [`StrictnessPreset`] et [`EngineTuningOverrides`] restent pour tests unitaires internes.

use serde::{Deserialize, Serialize};

/// Presets historiques — **non exposés produit** ; tests / construction interne uniquement.
#[doc(hidden)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StrictnessPreset {
    Relaxed,
    #[default]
    Normal,
    Strict,
    /// Base = [`Normal`] ; champs surchargés via [`EngineTuningOverrides`].
    Custom,
}

impl StrictnessPreset {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "relaxed" | "relax" | "light" => Some(Self::Relaxed),
            "normal" | "default" | "standard" => Some(Self::Normal),
            "strict" | "hard" => Some(Self::Strict),
            "custom" | "advanced" | "manual" => Some(Self::Custom),
            _ => None,
        }
    }

    #[must_use]
    pub fn base_preset(self) -> Self {
        match self {
            Self::Custom => Self::Normal,
            other => other,
        }
    }
}

/// Surcharges partielles — désérialisation RPC legacy ; ignorées par `resolve_engine_tuning`.
#[doc(hidden)]
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EngineTuningOverrides {
    pub read_budget_percent: Option<u8>,
    pub promotable_answer_min_chars: Option<u32>,
    pub discussion_promotable_min_chars: Option<u32>,
    pub discussion_auto_stop_on_reply: Option<bool>,
    pub intent_max_iterations: Option<u32>,
    pub discussion_max_iterations: Option<u32>,
    pub loop_strikes_before_abort: Option<u32>,
    pub max_consecutive_ask_user_failures: Option<u32>,
    pub max_tools_per_turn_architect: Option<u32>,
    pub max_tools_per_turn_discussion: Option<u32>,
    pub max_tools_per_turn_intent: Option<u32>,
    pub max_parallel_tool_calls: Option<u32>,
    pub max_todo_items: Option<u32>,
    pub memory_budget_tokens: Option<u32>,
    pub live_compact_tail_keep_messages: Option<u32>,
    pub live_compact_max_tail_ratio: Option<f32>,
    pub live_compact_min_prefix_tokens: Option<u32>,
    pub live_compact_max_passes: Option<u32>,
    pub checkpoint_max_chars: Option<u32>,
    pub anchor_user_request_max_chars: Option<u32>,
    pub anchor_plan_max_items: Option<u32>,
    pub summarize_tool_result_truncate: Option<u32>,
    pub reinject_tool_result_truncate: Option<u32>,
    pub context_snip_enabled: Option<bool>,
    pub gate_done_requires_answering: Option<bool>,
    /// Block `[phase: done]` until verify passes or is waived (default off — strong invitation only).
    pub gate_done_requires_verify: Option<bool>,
    /// Active le conducteur run rail (1.4.0) sur les runs architecte edit.
    pub run_rail_enabled: Option<bool>,
    /// L2 — nudge après N outils sans MAJ plan interne (0 = désactivé).
    pub internal_plan_stale_nudge_after_tools: Option<u32>,
}

/// Paramètres moteur résolus (prompts + gates + limites).
#[derive(Debug, Clone, PartialEq)]
pub struct EngineTuning {
    pub strictness: StrictnessPreset,
    pub read_budget_percent: u8,
    pub promotable_answer_min_chars: u32,
    pub discussion_promotable_min_chars: u32,
    pub discussion_auto_stop_on_reply: bool,
    pub intent_max_iterations: u32,
    pub discussion_max_iterations: u32,
    pub loop_strikes_before_abort: u32,
    pub max_consecutive_ask_user_failures: u32,
    pub max_tools_per_turn_architect: u32,
    pub max_tools_per_turn_discussion: u32,
    pub max_tools_per_turn_intent: u32,
    pub max_parallel_tool_calls: u32,
    /// `None` = pas de plafond todo.
    pub max_todo_items: Option<u32>,
    pub memory_budget_tokens: Option<u32>,
    pub live_compact_tail_keep_messages: u32,
    pub live_compact_max_tail_ratio: f32,
    pub live_compact_min_prefix_tokens: u32,
    pub live_compact_max_passes: u32,
    pub checkpoint_max_chars: u32,
    pub anchor_user_request_max_chars: u32,
    pub anchor_plan_max_items: u32,
    pub summarize_tool_result_truncate: u32,
    pub reinject_tool_result_truncate: u32,
    pub context_snip_enabled: bool,
    /// L1 — gate `done` sans réponse utilisateur.
    pub gate_done_requires_answering: bool,
    /// L1 — gate `done` sans verify (bash/lsp ou `[verify: waived]`). Off by default.
    pub gate_done_requires_verify: bool,
    /// `false` (Phase 0) : run rail documenté mais inactif jusqu'à Phase 1+.
    pub run_rail_enabled: bool,
    /// L2 internal plan — soft nudge when notebook stale (0 = disabled).
    pub internal_plan_stale_nudge_after_tools: u32,
}

/// Alias historique — prompts additifs 1.3.2 phase 3a.
pub type PromptVars = EngineTuning;

impl Default for EngineTuning {
    fn default() -> Self {
        Self::product_default()
    }
}

impl EngineTuning {
    /// Profil produit unique — ancien preset `normal` avec run rail et tool folders.
    #[must_use]
    pub fn product_default() -> Self {
        Self::from_preset(StrictnessPreset::Normal)
    }

    #[must_use]
    pub fn from_engine_strictness_param(_value: Option<&str>) -> Self {
        resolve_engine_tuning(None, None)
    }

    /// Construction interne / tests — pas le chemin wire produit.
    #[doc(hidden)]
    #[must_use]
    pub fn from_preset(strictness: StrictnessPreset) -> Self {
        let base = strictness.base_preset();
        let mut t = match base {
            StrictnessPreset::Relaxed => Self {
                strictness,
                read_budget_percent: 85,
                promotable_answer_min_chars: 40,
                discussion_promotable_min_chars: 6,
                discussion_auto_stop_on_reply: true,
                intent_max_iterations: 2,
                discussion_max_iterations: 20,
                loop_strikes_before_abort: 5,
                max_consecutive_ask_user_failures: 5,
                max_tools_per_turn_architect: 10,
                max_tools_per_turn_discussion: 30,
                max_tools_per_turn_intent: 0,
                max_parallel_tool_calls: 16,
                max_todo_items: None,
                memory_budget_tokens: None,
                live_compact_tail_keep_messages: 6,
                live_compact_max_tail_ratio: 0.25,
                live_compact_min_prefix_tokens: 2500,
                live_compact_max_passes: 4,
                checkpoint_max_chars: 5000,
                anchor_user_request_max_chars: 1200,
                anchor_plan_max_items: 32,
                summarize_tool_result_truncate: 600,
                reinject_tool_result_truncate: 1600,
                context_snip_enabled: true,
                gate_done_requires_answering: true,
                gate_done_requires_verify: false,
                run_rail_enabled: false,
                internal_plan_stale_nudge_after_tools: 8,
            },
            StrictnessPreset::Strict => Self {
                strictness,
                read_budget_percent: 45,
                promotable_answer_min_chars: 150,
                discussion_promotable_min_chars: 20,
                discussion_auto_stop_on_reply: true,
                intent_max_iterations: 2,
                discussion_max_iterations: 15,
                loop_strikes_before_abort: 2,
                max_consecutive_ask_user_failures: 3,
                max_tools_per_turn_architect: 6,
                max_tools_per_turn_discussion: 20,
                max_tools_per_turn_intent: 0,
                max_parallel_tool_calls: 8,
                max_todo_items: None,
                memory_budget_tokens: None,
                live_compact_tail_keep_messages: 4,
                live_compact_max_tail_ratio: 0.20,
                live_compact_min_prefix_tokens: 3000,
                live_compact_max_passes: 3,
                checkpoint_max_chars: 3000,
                anchor_user_request_max_chars: 900,
                anchor_plan_max_items: 24,
                summarize_tool_result_truncate: 300,
                reinject_tool_result_truncate: 800,
                context_snip_enabled: true,
                gate_done_requires_answering: true,
                gate_done_requires_verify: true,
                run_rail_enabled: false,
                internal_plan_stale_nudge_after_tools: 5,
            },
            StrictnessPreset::Normal | StrictnessPreset::Custom => Self {
                strictness,
                read_budget_percent: 70,
                promotable_answer_min_chars: 60,
                discussion_promotable_min_chars: 8,
                discussion_auto_stop_on_reply: true,
                intent_max_iterations: 2,
                discussion_max_iterations: 20,
                loop_strikes_before_abort: 4,
                max_consecutive_ask_user_failures: 4,
                max_tools_per_turn_architect: 8,
                max_tools_per_turn_discussion: 25,
                max_tools_per_turn_intent: 0,
                max_parallel_tool_calls: 12,
                max_todo_items: None,
                memory_budget_tokens: None,
                live_compact_tail_keep_messages: 5,
                live_compact_max_tail_ratio: 0.22,
                live_compact_min_prefix_tokens: 2800,
                live_compact_max_passes: 4,
                checkpoint_max_chars: 4000,
                anchor_user_request_max_chars: 1100,
                anchor_plan_max_items: 28,
                summarize_tool_result_truncate: 500,
                reinject_tool_result_truncate: 1200,
                context_snip_enabled: true,
                gate_done_requires_answering: true,
                gate_done_requires_verify: false,
                run_rail_enabled: false,
                internal_plan_stale_nudge_after_tools: 6,
            },
        };
        if strictness == StrictnessPreset::Custom {
            t.strictness = StrictnessPreset::Custom;
        }
        if strictness == StrictnessPreset::Normal {
            t.run_rail_enabled = true;
        }
        t
    }

    #[doc(hidden)]
    pub fn apply_overrides(&mut self, o: &EngineTuningOverrides) {
        apply_opt(&mut self.read_budget_percent, o.read_budget_percent);
        apply_opt(&mut self.promotable_answer_min_chars, o.promotable_answer_min_chars);
        apply_opt(
            &mut self.discussion_promotable_min_chars,
            o.discussion_promotable_min_chars,
        );
        apply_opt(
            &mut self.discussion_auto_stop_on_reply,
            o.discussion_auto_stop_on_reply,
        );
        apply_opt(&mut self.intent_max_iterations, o.intent_max_iterations);
        apply_opt(
            &mut self.discussion_max_iterations,
            o.discussion_max_iterations,
        );
        apply_opt(&mut self.loop_strikes_before_abort, o.loop_strikes_before_abort);
        apply_opt(
            &mut self.max_consecutive_ask_user_failures,
            o.max_consecutive_ask_user_failures,
        );
        apply_opt(
            &mut self.max_tools_per_turn_architect,
            o.max_tools_per_turn_architect,
        );
        apply_opt(
            &mut self.max_tools_per_turn_discussion,
            o.max_tools_per_turn_discussion,
        );
        apply_opt(&mut self.max_tools_per_turn_intent, o.max_tools_per_turn_intent);
        apply_opt(&mut self.max_parallel_tool_calls, o.max_parallel_tool_calls);
        if let Some(n) = o.max_todo_items {
            self.max_todo_items = if n == 0 { None } else { Some(n) };
        }
        if let Some(n) = o.memory_budget_tokens {
            self.memory_budget_tokens = if n == 0 { None } else { Some(n) };
        }
        apply_opt(
            &mut self.live_compact_tail_keep_messages,
            o.live_compact_tail_keep_messages,
        );
        apply_opt(
            &mut self.live_compact_max_tail_ratio,
            o.live_compact_max_tail_ratio,
        );
        apply_opt(
            &mut self.live_compact_min_prefix_tokens,
            o.live_compact_min_prefix_tokens,
        );
        apply_opt(&mut self.live_compact_max_passes, o.live_compact_max_passes);
        apply_opt(&mut self.checkpoint_max_chars, o.checkpoint_max_chars);
        apply_opt(
            &mut self.anchor_user_request_max_chars,
            o.anchor_user_request_max_chars,
        );
        apply_opt(&mut self.anchor_plan_max_items, o.anchor_plan_max_items);
        apply_opt(
            &mut self.summarize_tool_result_truncate,
            o.summarize_tool_result_truncate,
        );
        apply_opt(
            &mut self.reinject_tool_result_truncate,
            o.reinject_tool_result_truncate,
        );
        apply_opt(&mut self.context_snip_enabled, o.context_snip_enabled);
        apply_opt(
            &mut self.gate_done_requires_answering,
            o.gate_done_requires_answering,
        );
        apply_opt(
            &mut self.gate_done_requires_verify,
            o.gate_done_requires_verify,
        );
        apply_opt(&mut self.run_rail_enabled, o.run_rail_enabled);
        apply_opt(
            &mut self.internal_plan_stale_nudge_after_tools,
            o.internal_plan_stale_nudge_after_tools,
        );
    }

    pub fn clamp_to_bounds(&mut self) {
        self.read_budget_percent = self.read_budget_percent.clamp(5, 100);
        self.promotable_answer_min_chars = self.promotable_answer_min_chars.clamp(1, 500);
        self.discussion_promotable_min_chars =
            self.discussion_promotable_min_chars.clamp(1, 200);
        self.intent_max_iterations = self.intent_max_iterations.clamp(1, 3);
        self.discussion_max_iterations = self.discussion_max_iterations.clamp(1, 25);
        self.loop_strikes_before_abort = self.loop_strikes_before_abort.clamp(1, 5);
        self.max_consecutive_ask_user_failures =
            self.max_consecutive_ask_user_failures.clamp(1, 10);
        self.max_tools_per_turn_architect = self.max_tools_per_turn_architect.clamp(0, 16);
        self.max_tools_per_turn_discussion = self.max_tools_per_turn_discussion.clamp(0, 80);
        self.max_tools_per_turn_intent = self.max_tools_per_turn_intent.clamp(0, 4);
        self.max_parallel_tool_calls = self.max_parallel_tool_calls.clamp(1, 32);
        self.live_compact_max_tail_ratio = self.live_compact_max_tail_ratio.clamp(0.05, 0.5);
        self.live_compact_tail_keep_messages = self.live_compact_tail_keep_messages.clamp(1, 16);
        self.live_compact_min_prefix_tokens = self.live_compact_min_prefix_tokens.clamp(500, 20_000);
        self.live_compact_max_passes = self.live_compact_max_passes.clamp(1, 5);
        self.checkpoint_max_chars = self.checkpoint_max_chars.clamp(500, 10_000);
        self.anchor_user_request_max_chars = self.anchor_user_request_max_chars.clamp(200, 4_000);
        self.anchor_plan_max_items = self.anchor_plan_max_items.clamp(4, 64);
        self.internal_plan_stale_nudge_after_tools =
            self.internal_plan_stale_nudge_after_tools.clamp(0, 32);
        self.summarize_tool_result_truncate = self.summarize_tool_result_truncate.clamp(80, 2_000);
        self.reinject_tool_result_truncate = self.reinject_tool_result_truncate.clamp(200, 4_000);
    }

    #[must_use]
    pub fn render(&self, template: &str) -> String {
        let mut out = template.to_string();
        for (key, value) in self.substitutions() {
            out = out.replace(&format!("{{{key}}}"), &value);
        }
        out
    }

    fn substitutions(&self) -> [(&str, String); 2] {
        [
            (
                "read_budget_percent",
                self.read_budget_percent.to_string(),
            ),
            ("strictness", format!("{:?}", self.strictness)),
        ]
    }
}

/// Point d'entrée unique (RPC / settings) — toujours le profil produit.
#[must_use]
pub fn resolve_engine_tuning(
    _strictness: Option<&str>,
    _overrides: Option<&EngineTuningOverrides>,
) -> EngineTuning {
    let mut tuning = EngineTuning::product_default();
    tuning.clamp_to_bounds();
    tuning
}

fn apply_opt<T: Copy>(target: &mut T, opt: Option<T>) {
    if let Some(v) = opt {
        *target = v;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_default_enables_run_rail() {
        let t = EngineTuning::product_default();
        assert!(t.run_rail_enabled);
        assert_eq!(t.strictness, StrictnessPreset::Normal);
        assert_eq!(t.read_budget_percent, 70);
    }

    #[test]
    fn resolve_engine_tuning_ignores_strictness_and_overrides() {
        let base = EngineTuning::product_default();
        for strictness in ["relaxed", "normal", "strict", "custom"] {
            let t = resolve_engine_tuning(Some(strictness), None);
            assert_eq!(t, base, "strictness {strictness}");
        }
        let t = resolve_engine_tuning(
            Some("strict"),
            Some(&EngineTuningOverrides {
                read_budget_percent: Some(99),
                run_rail_enabled: Some(false),
                ..Default::default()
            }),
        );
        assert_eq!(t, base);
    }

    #[test]
    fn from_preset_relaxed_disables_run_rail_for_internal_tests() {
        let t = EngineTuning::from_preset(StrictnessPreset::Relaxed);
        assert!(!t.run_rail_enabled);
        assert_eq!(t.read_budget_percent, 85);
    }

    #[test]
    fn from_preset_custom_applies_overrides_internally() {
        let mut t = EngineTuning::from_preset(StrictnessPreset::Custom);
        t.apply_overrides(&EngineTuningOverrides {
            discussion_promotable_min_chars: Some(8),
            ..Default::default()
        });
        assert_eq!(t.strictness, StrictnessPreset::Custom);
        assert_eq!(t.discussion_promotable_min_chars, 8);
        assert_eq!(t.read_budget_percent, 70);
    }

    #[test]
    fn compaction_config_uses_tuning_truncates() {
        let mut t = EngineTuning::from_preset(StrictnessPreset::Normal);
        t.summarize_tool_result_truncate = 111;
        t.reinject_tool_result_truncate = 222;
        let cfg = crate::compaction::CompactionConfig::from_tuning(&t);
        assert_eq!(cfg.summarize_tool_result_truncate_chars, 111);
        assert_eq!(cfg.tool_result_truncate_chars, 222);
    }

    #[test]
    fn live_compact_settings_from_internal_override() {
        let mut t = EngineTuning::product_default();
        t.checkpoint_max_chars = 1500;
        let live = crate::compaction::LiveCompactSettings::from_tuning(&t);
        assert_eq!(live.checkpoint_max_chars, 1500);
    }

    #[test]
    fn render_replaces_placeholders() {
        let t = EngineTuning::from_preset(StrictnessPreset::Normal);
        let s = t.render("Read up to {read_budget_percent}% before answering.");
        assert!(s.contains("70%"));
        assert!(!s.contains('{'));
    }

    #[test]
    fn default_preset_is_normal() {
        let t = EngineTuning::default();
        assert_eq!(t.strictness, StrictnessPreset::Normal);
    }
}
