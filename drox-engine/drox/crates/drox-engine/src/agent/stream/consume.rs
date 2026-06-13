use drox_types::{StopReason, StreamEvent, Usage};
use futures::StreamExt;
use tokio::sync::mpsc;
use tracing::debug;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};
use super::super::gates::is_hallucinated_phase_tool_call;
use super::super::phases::{
    needs_synthetic_phase_enter, phase_for_tool, phase_visible_in_ui,
    PhaseLineBuffer,
};
use super::{PendingToolCall, TurnOutcome};


/// Marque la fin du sous-flux d'affichage `internal_reasoning` (pensÃ©e
/// native Ollama). Renvoie `true` si le bloc Ã©tait ouvert et vient d'Ãªtre
/// fermÃ© logiquement (l'UI doit recevoir un `PhaseClose` si `native_ui`).
fn mark_native_thinking_closed(native_ui: bool, native_open: &mut bool) -> bool {
    if native_ui && *native_open {
        *native_open = false;
        true
    } else {
        false
    }
}

/// Consomme un stream LLM, relaie texte et `tool_calls` vers `tx`, et
/// retourne le bilan du tour. Retourne `Err(())` si le canal est fermÃ© cÃ´tÃ©
/// consommateur (auquel cas l'agent doit s'arrÃªter sans bruit).
///
/// `native_thinking_ui` : si vrai, relaie `message.thinking` (Ollama) vers la
/// phase UI `internal_reasoning` ; sinon les deltas natifs sont ignorÃ©s.
#[allow(clippy::too_many_lines)] // streaming linÃ©aire, dÃ©couper nuirait Ã  la lisibilitÃ©
pub(crate) async fn consume_stream(
    mut stream: drox_llm::StreamHandle,
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    native_thinking_ui: bool,
    rail_active: bool,
) -> Result<TurnOutcome, ()> {
    let mut text = String::new();
    let mut tool_calls: Vec<PendingToolCall> = Vec::new();
    let mut last_stop: Option<(StopReason, Usage)> = None;
    let mut buffer = PhaseLineBuffer::new();
    // DerniÃ¨re phase **Ã©mise** vers le consommateur. Sert Ã  dÃ©dupliquer les
    // marqueurs consÃ©cutifs identiques (Ã©vite des blocs UI vides).
    let mut final_phase: Option<Phase> = None;
    let mut saw_answering = false;
    let mut pending_text: Vec<String> = Vec::new();
    let mut pending_phases: Vec<Phase> = Vec::new();
    let mut pending_run_objectives: Vec<String> = Vec::new();
    let mut run_objective: Option<String> = None;
    // `true` tant que des deltas `thinking` Ollama sont affichÃ©s dans
    // `internal_reasoning`.
    let mut native_thinking_open = false;

    while let Some(event) = stream.next().await {
        match event {
            Ok(StreamEvent::Start) => {}
            Ok(StreamEvent::ThinkingDelta { text: delta }) => {
                if !native_thinking_ui || delta.is_empty() {
                    continue;
                }
                if !native_thinking_open {
                    native_thinking_open = true;
                    if final_phase != Some(Phase::InternalReasoning) {
                        final_phase = Some(Phase::InternalReasoning);
                        if tx
                            .send(Ok(AgentEvent::PhaseEnter {
                                phase: Phase::InternalReasoning,
                            }))
                            .await
                            .is_err()
                        {
                            return Err(());
                        }
                    }
                }
                if tx
                    .send(Ok(AgentEvent::TextDelta { text: delta }))
                    .await
                    .is_err()
                {
                    return Err(());
                }
            }
            Ok(StreamEvent::TextDelta { text: delta }) => {
                buffer.push_chunk(
                    &delta,
                    |line| pending_text.push(line),
                    |phase| pending_phases.push(phase),
                    |objective| pending_run_objectives.push(objective),
                );
                for objective in std::mem::take(&mut pending_run_objectives) {
                    if run_objective.is_none() {
                        run_objective = Some(objective.clone());
                        if tx
                            .send(Ok(AgentEvent::RunObjective { text: objective }))
                            .await
                            .is_err()
                        {
                            return Err(());
                        }
                    }
                }
                for phase in std::mem::take(&mut pending_phases) {
                    let native_just_closed =
                        mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
                    if native_just_closed && native_thinking_ui {
                        if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                            return Err(());
                        }
                    }
                    if phase == Phase::Answering && phase_visible_in_ui(phase, rail_active) {
                        saw_answering = true;
                    }
                    if final_phase == Some(phase) {
                        continue;
                    }
                    final_phase = Some(phase);
                    if phase_visible_in_ui(phase, rail_active)
                        && tx
                            .send(Ok(AgentEvent::PhaseEnter { phase }))
                            .await
                            .is_err()
                    {
                        return Err(());
                    }
                }
                let native_just_closed =
                    mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
                if native_just_closed && native_thinking_ui {
                    if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                        return Err(());
                    }
                }
                for line in std::mem::take(&mut pending_text) {
                    text.push_str(&line);
                    if tx
                        .send(Ok(AgentEvent::TextDelta { text: line }))
                        .await
                        .is_err()
                    {
                        return Err(());
                    }
                }
            }
            Ok(StreamEvent::ToolCall {
                id,
                name,
                arguments,
            }) => {
                let native_just_closed =
                    mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
                if native_just_closed && native_thinking_ui {
                    if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                        return Err(());
                    }
                }
                // Sprint A.4 â€” filet de sÃ©curitÃ© Â« pas d'outil hors phase Â».
                // Si le modÃ¨le ouvre directement un tour avec une `ToolCall`
                // sans avoir dÃ©clarÃ© de phase, on en synthÃ©tise une avant
                // de forward la `ToolStart`. Sinon, cÃ´tÃ© UI, l'outil
                // atterrit en orphelin sur `logEl` et apparaÃ®t hors de la
                // trace repliÃ©e. Le choix entre `Reading` et `Acting` se fait
                // selon la nature lecture seule / mutative du tool.
                if !rail_active && needs_synthetic_phase_enter(final_phase, &name) {
                    let inferred = phase_for_tool(&name, final_phase);
                    final_phase = Some(inferred);
                    if tx
                        .send(Ok(AgentEvent::PhaseEnter { phase: inferred }))
                        .await
                        .is_err()
                    {
                        return Err(());
                    }
                }
                if !is_hallucinated_phase_tool_call(&name, &arguments) {
                    if tx
                        .send(Ok(AgentEvent::ToolStart {
                            id: id.clone(),
                            name: name.clone(),
                            arguments: arguments.clone(),
                        }))
                        .await
                        .is_err()
                    {
                        return Err(());
                    }
                }
                tool_calls.push(PendingToolCall {
                    id,
                    name,
                    arguments,
                });
            }
            Ok(StreamEvent::Stop { reason, usage }) => {
                let native_just_closed =
                    mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
                if native_just_closed && native_thinking_ui {
                    let _ = tx.send(Ok(AgentEvent::PhaseClose)).await;
                }
                last_stop = Some((reason, usage));
            }
            Ok(other) => {
                debug!(?other, "event LLM non gÃ©rÃ© par l'agent");
            }
            Err(err) => {
                let _ = tx.send(Err(err.into())).await;
                return Err(());
            }
        }
    }

    // Flush du reliquat (ligne sans `\n` final).
    let mut tail_text: Vec<String> = Vec::new();
    let mut tail_phases: Vec<Phase> = Vec::new();
    let mut tail_run_objectives: Vec<String> = Vec::new();
    buffer.finish(
        |line| tail_text.push(line),
        |phase| tail_phases.push(phase),
        |objective| tail_run_objectives.push(objective),
    );
    for objective in tail_run_objectives {
        if run_objective.is_none() {
            run_objective = Some(objective.clone());
            if tx
                .send(Ok(AgentEvent::RunObjective { text: objective }))
                .await
                .is_err()
            {
                return Err(());
            }
        }
    }
    for phase in tail_phases {
        let native_just_closed =
            mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
        if native_just_closed && native_thinking_ui {
            if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                return Err(());
            }
        }
        if phase == Phase::Answering && phase_visible_in_ui(phase, rail_active) {
            saw_answering = true;
        }
        if final_phase == Some(phase) {
            continue;
        }
        final_phase = Some(phase);
        if phase_visible_in_ui(phase, rail_active)
            && tx
                .send(Ok(AgentEvent::PhaseEnter { phase }))
                .await
                .is_err()
        {
            return Err(());
        }
    }
    let native_just_closed = mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
    if native_just_closed && native_thinking_ui {
        if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
            return Err(());
        }
    }
    for line in tail_text {
        text.push_str(&line);
        if tx
            .send(Ok(AgentEvent::TextDelta { text: line }))
            .await
            .is_err()
        {
            return Err(());
        }
    }

    let (reason, usage) = last_stop.unwrap_or_else(|| (StopReason::EndTurn, Usage::default()));
    Ok(TurnOutcome {
        text,
        tool_calls,
        reason,
        usage,
        final_phase,
        saw_answering,
        run_objective,
    })
}

