//! Consommation du stream LLM et constitution du bilan de tour.

use drox_types::{Content, Message, Role, StopReason, StreamEvent, Usage};
use futures::StreamExt;
use tokio::sync::mpsc;
use tracing::debug;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};

use super::loop_detect::{PendingToolCall, TurnOutcome};
use super::phase::{phase_for_tool_call, PhaseLineBuffer};

/// Marque la fin du sous-flux d'affichage `internal_reasoning` (pensée
/// native Ollama). Renvoie `true` si le bloc était ouvert et vient d'être
/// fermé logiquement (l'UI doit recevoir un `PhaseClose` si `native_ui`).
pub(crate) fn mark_native_thinking_closed(native_ui: bool, native_open: &mut bool) -> bool {
    if native_ui && *native_open {
        *native_open = false;
        true
    } else {
        false
    }
}

/// Consomme un stream LLM, relaie texte et `tool_calls` vers `tx`, et
/// retourne le bilan du tour. Retourne `Err(())` si le canal est fermé côté
/// consommateur (auquel cas l'agent doit s'arrêter sans bruit).
///
/// `native_thinking_ui` : si vrai, relaie `message.thinking` (Ollama) vers la
/// phase UI `internal_reasoning` ; sinon les deltas natifs sont ignorés.
#[allow(clippy::too_many_lines)] // streaming linéaire, découper nuirait à la lisibilité
pub(crate) async fn consume_stream(
    mut stream: drox_llm::StreamHandle,
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    native_thinking_ui: bool,
    workspace_root: &camino::Utf8Path,
) -> Result<TurnOutcome, ()> {
    let mut text = String::new();
    let mut thinking = String::new();
    let mut tool_calls: Vec<PendingToolCall> = Vec::new();
    let mut last_stop: Option<(StopReason, Usage)> = None;
    let mut buffer = PhaseLineBuffer::new();
    // Dernière phase **émise** vers le consommateur. Sert à dédupliquer les
    // marqueurs consécutifs identiques (évite des blocs UI vides).
    let mut final_phase: Option<Phase> = None;
    let mut saw_answering = false;
    let mut saw_analyzing = false;
    let mut saw_testing = false;
    let mut pending_text: Vec<String> = Vec::new();
    let mut pending_phases: Vec<Phase> = Vec::new();
    // `true` tant que des deltas `thinking` Ollama sont affichés dans
    // `internal_reasoning`.
    let mut native_thinking_open = false;

    while let Some(event) = stream.next().await {
        match event {
            Ok(StreamEvent::Start) => {}
            Ok(StreamEvent::ThinkingDelta { text: delta }) => {
                // Toujours accumuler pour l'empreinte anti-boucle (même si
                // l'UI n'affiche pas le thinking).
                if !delta.is_empty() {
                    thinking.push_str(&delta);
                }
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
                );
                for phase in std::mem::take(&mut pending_phases) {
                    let native_just_closed =
                        mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
                    if native_just_closed && native_thinking_ui {
                        if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                            return Err(());
                        }
                    }
                    if phase == Phase::Answering {
                        saw_answering = true;
                    }
                    if phase == Phase::Analyzing {
                        saw_analyzing = true;
                    }
                    if phase == Phase::Testing {
                        saw_testing = true;
                    }
                    if final_phase == Some(phase) {
                        // Marqueur identique au précédent émis → on l'ignore
                        // pour éviter les blocs UI dupliqués.
                        continue;
                    }
                    final_phase = Some(phase);
                    if tx
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
                // Sprint A.4 — filet de sécurité « pas d'outil hors phase ».
                // Si le modèle ouvre directement un tour avec une `ToolCall`
                // sans avoir déclaré de phase, on en synthétise une avant
                // de forward la `ToolStart`. Sinon, côté UI, l'outil
                // atterrit en orphelin sur `logEl` et apparaît hors de la
                // trace repliée. Le choix entre `Reading` et `Acting` se fait
                // selon la nature lecture seule / mutative du tool.
                if final_phase.is_none() {
                    let inferred =
                        phase_for_tool_call(&name, &arguments, final_phase, workspace_root);
                    if inferred == Phase::Analyzing {
                        saw_analyzing = true;
                    }
                    if inferred == Phase::Testing {
                        saw_testing = true;
                    }
                    final_phase = Some(inferred);
                    if tx
                        .send(Ok(AgentEvent::PhaseEnter { phase: inferred }))
                        .await
                        .is_err()
                    {
                        return Err(());
                    }
                }
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
                debug!(?other, "event LLM non géré par l'agent");
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
    buffer.finish(
        |line| tail_text.push(line),
        |phase| tail_phases.push(phase),
    );
    for phase in tail_phases {
        let native_just_closed =
            mark_native_thinking_closed(native_thinking_ui, &mut native_thinking_open);
        if native_just_closed && native_thinking_ui {
            if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                return Err(());
            }
        }
        if phase == Phase::Answering {
            saw_answering = true;
        }
        if phase == Phase::Analyzing {
            saw_analyzing = true;
        }
        if phase == Phase::Testing {
            saw_testing = true;
        }
        if final_phase == Some(phase) {
            continue;
        }
        final_phase = Some(phase);
        if tx
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
        thinking,
        tool_calls,
        reason,
        usage,
        final_phase,
        saw_answering,
        saw_analyzing,
        saw_testing,
    })
}

/// Ajoute le message assistant au log de conversation (`text` + `tool_uses`).
pub(crate) fn push_assistant_message(messages: &mut Vec<Message>, outcome: &TurnOutcome) {
    let mut blocks = Vec::new();
    if !outcome.text.is_empty() {
        blocks.push(Content::text(&outcome.text));
    }
    for call in &outcome.tool_calls {
        blocks.push(Content::ToolUse {
            id: call.id.clone(),
            name: call.name.clone(),
            input: call.arguments.clone(),
        });
    }
    if !blocks.is_empty() {
        messages.push(Message::new(Role::Assistant, blocks));
    }
}
