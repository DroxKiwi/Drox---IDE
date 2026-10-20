//! État et `observe` / `observe_tool_outputs`.

use super::decision::{escalate, LoopDecision};
use super::fingerprint::{
    combine_hash, hash_text, hash_tool_calls, hash_tool_calls_family, is_targeted_tool_loop_family,
};
use super::outcome::{PendingToolCall, TurnOutcome};

/// Détecteur de répétition turn-à-turn.
///
/// Escalade (2026-10-15) : Warn → ForceConclude → SyntheticDone.
/// `observe` est appelé **après** les gates `[phase: done]` (1.5.14).
#[derive(Default)]
pub(crate) struct LoopDetector {
    last_fingerprint: Option<u64>,
    last_text_hash: u64,
    last_tools_hash: u64,
    last_tools_family_hash: Option<u64>,
    strike: u32,
    family_strike: u32,
    last_body_hash: Option<u64>,
    text_only_strike: u32,
    last_tools_call_sig: Option<u64>,
    last_tools_output_sig: Option<u64>,
    tools_progress_strike: u32,
}

impl LoopDetector {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Reset (nudges structurels seulement — pas DONE_ONLY).
    pub(crate) fn reset(&mut self) {
        self.strike = 0;
        self.family_strike = 0;
        self.text_only_strike = 0;
        self.last_body_hash = None;
        self.tools_progress_strike = 0;
        self.last_tools_call_sig = None;
        self.last_tools_output_sig = None;
    }

    pub(crate) fn observe(&mut self, outcome: &TurnOutcome) -> LoopDecision {
        let text_h = combine_hash(hash_text(&outcome.text), hash_text(&outcome.thinking));
        let body_h = hash_text(&outcome.text);
        let tools_h = hash_tool_calls(&outcome.tool_calls);
        let tools_family_h = hash_tool_calls_family(&outcome.tool_calls);
        let fp = combine_hash(text_h, tools_h);
        let targeted_family = is_targeted_tool_loop_family(&outcome.tool_calls);
        let text_only = outcome.tool_calls.is_empty() && !outcome.text.trim().is_empty();

        if outcome.text.trim().is_empty()
            && outcome.thinking.trim().is_empty()
            && outcome.tool_calls.is_empty()
        {
            self.last_fingerprint = Some(fp);
            self.last_text_hash = text_h;
            self.last_tools_hash = tools_h;
            self.last_tools_family_hash = None;
            self.family_strike = 0;
            self.last_body_hash = None;
            self.text_only_strike = 0;
            return LoopDecision::Ok;
        }

        let exact_repeat = matches!(self.last_fingerprint, Some(prev) if prev == fp);
        let family_repeat = targeted_family
            && matches!(self.last_tools_family_hash, Some(prev) if prev == tools_family_h);
        let body_repeat =
            text_only && matches!(self.last_body_hash, Some(prev) if prev == body_h);

        let last_text_h = self.last_text_hash;
        let last_tools_h = self.last_tools_hash;
        self.last_fingerprint = Some(fp);
        self.last_text_hash = text_h;
        self.last_tools_hash = tools_h;
        if targeted_family {
            self.last_tools_family_hash = Some(tools_family_h);
        } else {
            self.last_tools_family_hash = None;
            self.family_strike = 0;
        }
        if text_only {
            self.last_body_hash = Some(body_h);
        } else {
            self.last_body_hash = None;
            self.text_only_strike = 0;
        }

        // 0) Text-only body.
        if text_only {
            if body_repeat {
                self.text_only_strike = self.text_only_strike.saturating_add(1);
                return escalate("text_only", self.text_only_strike);
            }
            self.text_only_strike = 0;
        }

        // 1) Famille bash/grep normalisée.
        if family_repeat {
            self.family_strike = self.family_strike.saturating_add(1);
            return escalate("tool_family", self.family_strike);
        } else if targeted_family {
            self.family_strike = 0;
        }

        // 2) Empreinte stricte.
        if !exact_repeat {
            self.strike = 0;
            return LoopDecision::Ok;
        }

        let kind = if text_h == last_text_h && tools_h == last_tools_h {
            "both"
        } else if text_h == last_text_h {
            "text"
        } else {
            "tool_calls"
        };

        self.strike = self.strike.saturating_add(1);
        escalate(kind, self.strike)
    }

    /// Même `(name, args)` + même output → escalade ; output change = progrès.
    pub(crate) fn observe_tool_outputs(
        &mut self,
        calls: &[PendingToolCall],
        output_blob: &str,
    ) -> LoopDecision {
        if calls.is_empty() {
            self.last_tools_call_sig = None;
            self.last_tools_output_sig = None;
            self.tools_progress_strike = 0;
            return LoopDecision::Ok;
        }
        let call_sig = hash_tool_calls(calls);
        let out_sig = hash_text(output_blob);
        let same_call = matches!(self.last_tools_call_sig, Some(prev) if prev == call_sig);
        let same_out = matches!(self.last_tools_output_sig, Some(prev) if prev == out_sig);

        self.last_tools_call_sig = Some(call_sig);
        self.last_tools_output_sig = Some(out_sig);

        if !same_call {
            self.tools_progress_strike = 0;
            return LoopDecision::Ok;
        }
        if !same_out {
            self.tools_progress_strike = 0;
            return LoopDecision::Ok;
        }
        self.tools_progress_strike = self.tools_progress_strike.saturating_add(1);
        escalate("tools", self.tools_progress_strike)
    }
}
