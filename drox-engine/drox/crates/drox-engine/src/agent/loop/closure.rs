// Critères de clôture moteur (1.4.2) — promotion `answering`/`done` sans second tour LLM.
//
// La gate mutation a été retirée (rail observateur). Quand le moteur promeut une
// réponse utilisateur déjà publiée, on livre le `USER-FACING REPLY` même si aucune
// mutation n'a réussi.

use crate::agent::stream::TurnOutcome;
use crate::EngineTuning;

/// Contexte factuel pour décider si le moteur peut clôturer le run.
#[derive(Debug, Clone, Copy)]
pub(crate) struct EngineClosureCtx {
    pub mutation_count: u32,
    pub work_closed: bool,
    pub seen_answering_in_run: bool,
    pub verify_satisfied: bool,
    pub verify_gate_required: bool,
}

/// Promotion auto quand du texte utilisateur substantiel est prêt (4.2).
#[must_use]
pub(crate) fn should_engine_auto_close_with_promotable_reply(
    ctx: &EngineClosureCtx,
    outcome: &TurnOutcome,
    messages: &[Message],
    role_id: RoleId,
    tuning: &EngineTuning,
    rail_active: bool,
) -> bool {
    if role_id != RoleId::Architect || !rail_active || !outcome.tool_calls.is_empty() {
        return false;
    }
    if !ctx.work_closed {
        return false;
    }
    if ctx.mutation_count > 0 && ctx.verify_gate_required && !ctx.verify_satisfied {
        return false;
    }
    if !run_has_promotable_user_facing_text(outcome, messages, role_id, tuning) {
        return false;
    }
    if ctx.seen_answering_in_run
        && (outcome.final_phase == Some(Phase::Answering)
            || outcome.final_phase.is_none()
            || outcome.saw_answering)
    {
        return true;
    }
    !ctx.seen_answering_in_run
        && ctx.mutation_count > 0
        && outcome.final_phase.is_none()
}

/// Phase events à émettre lors d'une promotion moteur.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EngineReplyClosureMode {
    /// Déjà en `answering` — ajouter `done` seulement.
    DoneOnly,
    /// Texte hors phase — ouvrir `answering` puis `done`.
    AnsweringThenDone,
}

#[must_use]
pub(crate) fn reply_closure_mode_for_promotion(
    seen_answering_in_run: bool,
) -> EngineReplyClosureMode {
    if seen_answering_in_run {
        EngineReplyClosureMode::DoneOnly
    } else {
        EngineReplyClosureMode::AnsweringThenDone
    }
}

impl Agent {
    /// Promeut la réponse déjà streamée, émet les phases UI et `Stop`.
    pub(super) async fn engine_promote_user_reply_closure(
        &self,
        outcome: &TurnOutcome,
        messages: &mut Vec<Message>,
        transcript_cursor: &mut usize,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        seen_answering_in_run: &mut bool,
        final_answer_guard: &mut FinalAnswerGuard,
        mode: EngineReplyClosureMode,
    ) -> PostLlmStep {
        final_answer_guard.mark_user_facing_answer_seen();
        match mode {
            EngineReplyClosureMode::AnsweringThenDone => {
                if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                    return PostLlmStep::Stop;
                }
                if tx
                    .send(Ok(AgentEvent::PhaseEnter {
                        phase: Phase::Answering,
                    }))
                    .await
                    .is_err()
                {
                    return PostLlmStep::Stop;
                }
                *seen_answering_in_run = true;
                if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                    return PostLlmStep::Stop;
                }
                if tx
                    .send(Ok(AgentEvent::PhaseEnter {
                        phase: Phase::Done,
                    }))
                    .await
                    .is_err()
                {
                    return PostLlmStep::Stop;
                }
                messages.push(Message::assistant("[phase: answering]\n[phase: done]"));
            }
            EngineReplyClosureMode::DoneOnly => {
                if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                    return PostLlmStep::Stop;
                }
                if tx
                    .send(Ok(AgentEvent::PhaseEnter {
                        phase: Phase::Done,
                    }))
                    .await
                    .is_err()
                {
                    return PostLlmStep::Stop;
                }
                messages.push(Message::assistant("[phase: done]"));
            }
        }
        if let Err(e) = self.flush_transcript(messages, transcript_cursor).await {
            let _ = tx.send(Err(e)).await;
            return PostLlmStep::Stop;
        }
        let _ = tx
            .send(Ok(AgentEvent::Stop {
                reason: outcome.reason,
                usage: outcome.usage.clone(),
            }))
            .await;
        PostLlmStep::Stop
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::stream::TurnOutcome;
    use drox_types::{StopReason, Usage};

    fn ctx(mutation_count: u32, seen: bool) -> EngineClosureCtx {
        EngineClosureCtx {
            mutation_count,
            work_closed: true,
            seen_answering_in_run: seen,
            verify_satisfied: true,
            verify_gate_required: false,
        }
    }

    fn long_text_outcome(final_phase: Option<Phase>, saw: bool) -> TurnOutcome {
        TurnOutcome {
            text: "x".repeat(400),
            tool_calls: vec![],
            reason: StopReason::EndTurn,
            usage: Usage::default(),
            final_phase,
            saw_answering: saw,
            run_objective: None,
        }
    }

    #[test]
    fn auto_close_when_answering_without_mutation_but_promotable_text() {
        let c = ctx(0, true);
        let outcome = long_text_outcome(Some(Phase::Answering), true);
        let messages = vec![Message::user("modernize background")];
        let tuning = EngineTuning::default();
        assert!(should_engine_auto_close_with_promotable_reply(
            &c,
            &outcome,
            &messages,
            RoleId::Architect,
            &tuning,
            true,
        ));
    }

    #[test]
    fn auto_close_idle_after_mutations_requires_verify_when_gate_on() {
        let c = EngineClosureCtx {
            mutation_count: 2,
            verify_satisfied: false,
            verify_gate_required: true,
            ..ctx(2, false)
        };
        let outcome = long_text_outcome(None, false);
        let messages = vec![Message::user("fix file")];
        let tuning = EngineTuning::default();
        assert!(!should_engine_auto_close_with_promotable_reply(
            &c,
            &outcome,
            &messages,
            RoleId::Architect,
            &tuning,
            true,
        ));
        let c_ok = EngineClosureCtx {
            verify_satisfied: true,
            ..c
        };
        assert!(should_engine_auto_close_with_promotable_reply(
            &c_ok,
            &outcome,
            &messages,
            RoleId::Architect,
            &tuning,
            true,
        ));
    }

    #[test]
    fn reply_closure_mode_done_only_when_already_answering() {
        assert_eq!(
            reply_closure_mode_for_promotion(true),
            EngineReplyClosureMode::DoneOnly
        );
        assert_eq!(
            reply_closure_mode_for_promotion(false),
            EngineReplyClosureMode::AnsweringThenDone
        );
    }
}
