//! Résolution unique `EngineTuning` — presets + overrides `custom`.
//!
//! Registre : `docs/1.3/1.3.2/PLAN-PROMPTS-ADDITIFS-1.3.2.md` §9–§10.

use serde::{Deserialize, Serialize};

/// Preset produit `drox.engine.strictness`.
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

/// Surcharges partielles (RPC `engineTuning` — ignoré si preset ≠ `custom`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EngineTuningOverrides {
    pub read_budget_percent: Option<u8>,
    pub max_reads_before_delegate: Option<u32>,
    pub max_mutations_before_delegate_nudge: Option<u32>,
    pub min_delegate_instructions_len: Option<u32>,
    pub max_delegate_scope_paths: Option<u32>,
    pub delegate_scope_max_files: Option<u32>,
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
    pub max_tools_per_turn_executor: Option<u32>,
    pub max_parallel_tool_calls: Option<u32>,
    pub max_todo_items: Option<u32>,
    pub memory_budget_tokens: Option<u32>,
    pub max_delegations_per_task: Option<u32>,
    pub min_deliverable_bytes: Option<u64>,
    pub executor_deliverable_excerpt_max_chars: Option<u32>,
    pub executor_subrun_max_iterations: Option<u32>,
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
    pub executor_glob_heavy_blocked: Option<bool>,
    pub executor_ask_user_blocked: Option<bool>,
    pub executor_todo_write_blocked: Option<bool>,
    pub executor_deliverable_met_blocked: Option<bool>,
    pub gate_done_requires_answering: Option<bool>,
    pub gate_testing_after_code_mutation: Option<bool>,
    pub gate_todo_recreation_blocked: Option<bool>,
    pub gate_professor_course_plan: Option<bool>,
    pub gate_todo_stale_before_done: Option<bool>,
}

/// Paramètres moteur résolus (prompts + gates + limites).
#[derive(Debug, Clone, PartialEq)]
pub struct EngineTuning {
    pub strictness: StrictnessPreset,
    pub read_budget_percent: u8,
    pub max_reads_before_delegate: u32,
    /// Nudge soft après N `file_edit`/`file_write` sans `delegate_executor`.
    pub max_mutations_before_delegate_nudge: u32,
    pub min_delegate_instructions_len: u32,
    pub max_delegate_scope_paths: u32,
    pub delegate_scope_max_files: u32,
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
    pub max_tools_per_turn_executor: u32,
    pub max_parallel_tool_calls: u32,
    /// `None` = pas de plafond todo.
    pub max_todo_items: Option<u32>,
    pub memory_budget_tokens: Option<u32>,
    pub max_delegations_per_task: u32,
    pub min_deliverable_bytes: u64,
    pub executor_deliverable_excerpt_max_chars: u32,
    pub executor_subrun_max_iterations: u32,
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
    /// K1 — bloque glob lourd (`node_modules`, `dist`, …) sur l'exécuteur.
    pub executor_glob_heavy_blocked: bool,
    /// K2 — bloque `ask_user_question` sur l'exécuteur.
    pub executor_ask_user_blocked: bool,
    /// K3 — bloque `todo_write` sur l'exécuteur.
    pub executor_todo_write_blocked: bool,
    /// K4 — bloque les outils après livrable `.md` prêt.
    pub executor_deliverable_met_blocked: bool,
    /// L1 — gate `done` sans réponse utilisateur.
    pub gate_done_requires_answering: bool,
    /// L2 — gate tests après mutation code.
    pub gate_testing_after_code_mutation: bool,
    /// L3 — gate recréation todo.
    pub gate_todo_recreation_blocked: bool,
    /// L4 — gate plan cours professor.
    pub gate_professor_course_plan: bool,
    /// L5 — gate todo stale avant `done`.
    pub gate_todo_stale_before_done: bool,
}

/// Alias historique — prompts additifs 1.3.2 phase 3a.
pub type PromptVars = EngineTuning;

impl Default for EngineTuning {
    fn default() -> Self {
        Self::from_preset(StrictnessPreset::Normal)
    }
}

impl EngineTuning {
    #[must_use]
    pub fn from_engine_strictness_param(value: Option<&str>) -> Self {
        resolve_engine_tuning(value, None)
    }

    #[must_use]
    pub fn from_preset(strictness: StrictnessPreset) -> Self {
        let base = strictness.base_preset();
        let mut t = match base {
            StrictnessPreset::Relaxed => Self {
                strictness,
                read_budget_percent: 85,
                max_reads_before_delegate: 24,
                max_mutations_before_delegate_nudge: 5,
                min_delegate_instructions_len: 40,
                max_delegate_scope_paths: 16,
                delegate_scope_max_files: 200,
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
                max_tools_per_turn_executor: 6,
                max_parallel_tool_calls: 16,
                max_todo_items: None,
                memory_budget_tokens: None,
                max_delegations_per_task: 4,
                min_deliverable_bytes: 32,
                executor_deliverable_excerpt_max_chars: 1200,
                executor_subrun_max_iterations: 40,
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
                executor_glob_heavy_blocked: true,
                executor_ask_user_blocked: true,
                executor_todo_write_blocked: true,
                executor_deliverable_met_blocked: true,
                gate_done_requires_answering: true,
                gate_testing_after_code_mutation: true,
                gate_todo_recreation_blocked: true,
                gate_professor_course_plan: true,
                gate_todo_stale_before_done: true,
            },
            StrictnessPreset::Strict => Self {
                strictness,
                read_budget_percent: 45,
                max_reads_before_delegate: 6,
                max_mutations_before_delegate_nudge: 1,
                min_delegate_instructions_len: 100,
                max_delegate_scope_paths: 6,
                delegate_scope_max_files: 60,
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
                max_tools_per_turn_executor: 3,
                max_parallel_tool_calls: 8,
                max_todo_items: None,
                memory_budget_tokens: None,
                max_delegations_per_task: 2,
                min_deliverable_bytes: 64,
                executor_deliverable_excerpt_max_chars: 600,
                executor_subrun_max_iterations: 20,
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
                executor_glob_heavy_blocked: true,
                executor_ask_user_blocked: true,
                executor_todo_write_blocked: true,
                executor_deliverable_met_blocked: true,
                gate_done_requires_answering: true,
                gate_testing_after_code_mutation: true,
                gate_todo_recreation_blocked: true,
                gate_professor_course_plan: true,
                gate_todo_stale_before_done: true,
            },
            StrictnessPreset::Normal | StrictnessPreset::Custom => Self {
                strictness,
                read_budget_percent: 70,
                max_reads_before_delegate: 16,
                max_mutations_before_delegate_nudge: 3,
                min_delegate_instructions_len: 50,
                max_delegate_scope_paths: 12,
                delegate_scope_max_files: 120,
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
                max_tools_per_turn_executor: 4,
                max_parallel_tool_calls: 12,
                max_todo_items: None,
                memory_budget_tokens: None,
                max_delegations_per_task: 3,
                min_deliverable_bytes: 48,
                executor_deliverable_excerpt_max_chars: 900,
                executor_subrun_max_iterations: 32,
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
                executor_glob_heavy_blocked: true,
                executor_ask_user_blocked: true,
                executor_todo_write_blocked: true,
                executor_deliverable_met_blocked: true,
                gate_done_requires_answering: true,
                gate_testing_after_code_mutation: true,
                gate_todo_recreation_blocked: true,
                gate_professor_course_plan: true,
                gate_todo_stale_before_done: true,
            },
        };
        if strictness == StrictnessPreset::Custom {
            t.strictness = StrictnessPreset::Custom;
        }
        t
    }

    pub fn apply_overrides(&mut self, o: &EngineTuningOverrides) {
        apply_opt(&mut self.read_budget_percent, o.read_budget_percent);
        apply_opt(&mut self.max_reads_before_delegate, o.max_reads_before_delegate);
        apply_opt(
            &mut self.max_mutations_before_delegate_nudge,
            o.max_mutations_before_delegate_nudge,
        );
        apply_opt(&mut self.min_delegate_instructions_len, o.min_delegate_instructions_len);
        apply_opt(&mut self.max_delegate_scope_paths, o.max_delegate_scope_paths);
        apply_opt(&mut self.delegate_scope_max_files, o.delegate_scope_max_files);
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
        apply_opt(
            &mut self.max_tools_per_turn_executor,
            o.max_tools_per_turn_executor,
        );
        apply_opt(&mut self.max_parallel_tool_calls, o.max_parallel_tool_calls);
        if let Some(n) = o.max_todo_items {
            self.max_todo_items = if n == 0 { None } else { Some(n) };
        }
        if let Some(n) = o.memory_budget_tokens {
            self.memory_budget_tokens = if n == 0 { None } else { Some(n) };
        }
        apply_opt(&mut self.max_delegations_per_task, o.max_delegations_per_task);
        apply_opt(&mut self.min_deliverable_bytes, o.min_deliverable_bytes);
        apply_opt(
            &mut self.executor_deliverable_excerpt_max_chars,
            o.executor_deliverable_excerpt_max_chars,
        );
        apply_opt(
            &mut self.executor_subrun_max_iterations,
            o.executor_subrun_max_iterations,
        );
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
            &mut self.executor_glob_heavy_blocked,
            o.executor_glob_heavy_blocked,
        );
        apply_opt(
            &mut self.executor_ask_user_blocked,
            o.executor_ask_user_blocked,
        );
        apply_opt(
            &mut self.executor_todo_write_blocked,
            o.executor_todo_write_blocked,
        );
        apply_opt(
            &mut self.executor_deliverable_met_blocked,
            o.executor_deliverable_met_blocked,
        );
        apply_opt(
            &mut self.gate_done_requires_answering,
            o.gate_done_requires_answering,
        );
        apply_opt(
            &mut self.gate_testing_after_code_mutation,
            o.gate_testing_after_code_mutation,
        );
        apply_opt(
            &mut self.gate_todo_recreation_blocked,
            o.gate_todo_recreation_blocked,
        );
        apply_opt(
            &mut self.gate_professor_course_plan,
            o.gate_professor_course_plan,
        );
        apply_opt(
            &mut self.gate_todo_stale_before_done,
            o.gate_todo_stale_before_done,
        );
    }

    pub fn clamp_to_bounds(&mut self) {
        self.read_budget_percent = self.read_budget_percent.clamp(5, 100);
        self.max_reads_before_delegate = self.max_reads_before_delegate.clamp(1, 64);
        self.max_mutations_before_delegate_nudge =
            self.max_mutations_before_delegate_nudge.clamp(1, 16);
        self.min_delegate_instructions_len = self.min_delegate_instructions_len.clamp(20, 500);
        self.max_delegate_scope_paths = self.max_delegate_scope_paths.clamp(1, 32);
        self.delegate_scope_max_files = self.delegate_scope_max_files.clamp(5, 500);
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
        self.max_tools_per_turn_executor = self.max_tools_per_turn_executor.clamp(1, 12);
        self.max_parallel_tool_calls = self.max_parallel_tool_calls.clamp(1, 32);
        self.max_delegations_per_task = self.max_delegations_per_task.clamp(1, 5);
        self.live_compact_max_tail_ratio = self.live_compact_max_tail_ratio.clamp(0.05, 0.5);
        self.live_compact_tail_keep_messages = self.live_compact_tail_keep_messages.clamp(1, 16);
        self.live_compact_min_prefix_tokens = self.live_compact_min_prefix_tokens.clamp(500, 20_000);
        self.live_compact_max_passes = self.live_compact_max_passes.clamp(1, 5);
        self.checkpoint_max_chars = self.checkpoint_max_chars.clamp(500, 10_000);
        self.anchor_user_request_max_chars = self.anchor_user_request_max_chars.clamp(200, 4_000);
        self.anchor_plan_max_items = self.anchor_plan_max_items.clamp(4, 64);
        self.summarize_tool_result_truncate = self.summarize_tool_result_truncate.clamp(80, 2_000);
        self.reinject_tool_result_truncate = self.reinject_tool_result_truncate.clamp(200, 4_000);
        self.min_deliverable_bytes = self.min_deliverable_bytes.clamp(1, 4096);
        self.executor_deliverable_excerpt_max_chars =
            self.executor_deliverable_excerpt_max_chars.clamp(100, 4_000);
        self.executor_subrun_max_iterations = self.executor_subrun_max_iterations.clamp(1, 50);
    }

    #[must_use]
    pub fn render(&self, template: &str) -> String {
        let mut out = template.to_string();
        for (key, value) in self.substitutions() {
            out = out.replace(&format!("{{{key}}}"), &value);
        }
        out
    }

    fn substitutions(&self) -> [(&str, String); 7] {
        [
            (
                "read_budget_percent",
                self.read_budget_percent.to_string(),
            ),
            (
                "max_reads_before_delegate",
                self.max_reads_before_delegate.to_string(),
            ),
            (
                "max_mutations_before_delegate_nudge",
                self.max_mutations_before_delegate_nudge.to_string(),
            ),
            (
                "min_delegate_instructions_len",
                self.min_delegate_instructions_len.to_string(),
            ),
            (
                "max_delegate_scope_paths",
                self.max_delegate_scope_paths.to_string(),
            ),
            (
                "delegate_scope_max_files",
                self.delegate_scope_max_files.to_string(),
            ),
            ("strictness", format!("{:?}", self.strictness)),
        ]
    }
}

/// Point d'entrée unique (RPC / settings).
#[must_use]
pub fn resolve_engine_tuning(
    strictness: Option<&str>,
    overrides: Option<&EngineTuningOverrides>,
) -> EngineTuning {
    let preset = strictness
        .and_then(StrictnessPreset::parse)
        .unwrap_or(StrictnessPreset::Normal);
    let mut tuning = EngineTuning::from_preset(preset);
    if preset == StrictnessPreset::Custom {
        if let Some(o) = overrides {
            tuning.apply_overrides(o);
        }
    }
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
    fn resolve_strict_preset() {
        let t = resolve_engine_tuning(Some("strict"), None);
        assert_eq!(t.read_budget_percent, 45);
        assert_eq!(t.max_reads_before_delegate, 6);
        assert_eq!(t.max_mutations_before_delegate_nudge, 1);
        assert_eq!(t.loop_strikes_before_abort, 2);
    }

    #[test]
    fn custom_override_ignored_when_not_custom() {
        let t = resolve_engine_tuning(
            Some("normal"),
            Some(&EngineTuningOverrides {
                max_reads_before_delegate: Some(99),
                ..Default::default()
            }),
        );
        assert_eq!(t.max_reads_before_delegate, 16);
    }

    #[test]
    fn custom_applies_override() {
        let t = resolve_engine_tuning(
            Some("custom"),
            Some(&EngineTuningOverrides {
                discussion_promotable_min_chars: Some(8),
                ..Default::default()
            }),
        );
        assert_eq!(t.strictness, StrictnessPreset::Custom);
        assert_eq!(t.discussion_promotable_min_chars, 8);
        assert_eq!(t.max_reads_before_delegate, 16);
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
    fn live_compact_settings_from_custom_override() {
        let t = resolve_engine_tuning(
            Some("custom"),
            Some(&EngineTuningOverrides {
                checkpoint_max_chars: Some(1500),
                ..Default::default()
            }),
        );
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
