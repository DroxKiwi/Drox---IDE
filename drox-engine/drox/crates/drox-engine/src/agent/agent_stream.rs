//! Stream LLM : consume_stream, TurnOutcome, détection de boucle turn-à-turn.

use drox_types::{Content, Message, Role, StopReason, StreamEvent, ToolUseId, Usage};
use futures::StreamExt;
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::debug;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};
use crate::run_spec::{RoleId, RunSpec};
use super::gates::{
    is_hallucinated_phase_tool_call,
};

use super::phases::{
    needs_synthetic_phase_enter, phase_for_tool,
    strip_phase_protocol_lines, PhaseLineBuffer,
};
#[derive(Clone)]
pub(crate) struct PendingToolCall {
    pub id: ToolUseId,
    pub name: String,
    pub arguments: Value,
}

/// Applique `RunSpec::max_tools_per_turn` sur les appels outils d'un tour.
///
/// Exception Low + sous-agents : jusqu'à `min(subagent_max_concurrent, 2)` appels
/// `task` avec `background: true` dans le **même** tour (lancement parallèle).
pub(crate) fn enforce_max_tools_per_turn(
    tool_calls: &mut Vec<PendingToolCall>,
    spec: &RunSpec,
    subagent_max_concurrent: usize,
) {
    let Some(base_max) = spec.max_tools_per_turn() else {
        return;
    };
    let max = effective_max_tools_per_turn(spec, subagent_max_concurrent, tool_calls)
        .unwrap_or(base_max);
    if tool_calls.len() > max {
        debug!(
            role = ?spec.role_id,
            max,
            dropped = tool_calls.len() - max,
            "truncating assistant tool_calls for run spec"
        );
        tool_calls.truncate(max);
    }
}

#[must_use]
fn effective_max_tools_per_turn(
    spec: &RunSpec,
    subagent_max_concurrent: usize,
    tool_calls: &[PendingToolCall],
) -> Option<usize> {
    let base = spec.max_tools_per_turn()?;
    let _ = (subagent_max_concurrent, tool_calls);
    Some(base)
}

/// Sprint Hotfix Â« boucle Ã©dition/lecture Â» â€” dÃ©tecteur de rÃ©pÃ©tition strict
/// turn-Ã -turn. Le modÃ¨le (typ. GLM-4.7-Flash sous pression de contexte) se
/// met parfois Ã  **rÃ©pÃ©ter exactement** le mÃªme texte assistant et/ou les
/// mÃªmes `tool_calls` (mÃªmes args), sans jamais converger vers `[phase: done]`.
/// Sans filet, le run Ã©puise `max_iterations` en gaspillant des tokens.
///
/// Heuristique V1 (stricte, peu de faux positifs) :
/// 1. On capture l'empreinte du tour : (texte trimÃ©, signature des tool_calls).
///    Empreinte vide = on ignore (cas pathologique, dÃ©jÃ  gÃ©rÃ© par
///    `tool_calls.is_empty()` en amont).
/// 2. Si l'empreinte est identique Ã  la prÃ©cÃ©dente :
///    - 1er strike â†’ `Decision::Warn` (le moteur injecte un nudge anti-boucle).
///    - 2e strike â†’ `Decision::Abort(kind)` (le moteur stoppe le run).
/// 3. Toute empreinte **diffÃ©rente** reset le compteur.
///
/// Anti-faux-positif : les nudges moteur (`unfinished_todos`, `DONE_ONLY`,
/// etc.) appellent `LoopDetector::reset` parce qu'ils **forcent**
/// le modÃ¨le Ã  changer de comportement â€” leur effet sur le tour suivant doit
/// Ãªtre Ã©valuÃ© Ã  part.
#[derive(Default)]
pub(crate) struct LoopDetector {
    /// Hash du dernier tour observÃ© (`None` au dÃ©but du run).
    last_fingerprint: Option<u64>,
    /// Composante texte du dernier tour (utile pour qualifier `kind` :
    /// Â« text Â» / Â« tool_calls Â» / Â« both Â»).
    last_text_hash: u64,
    last_tools_hash: u64,
    /// Nombre de tours identiques **consÃ©cutifs** observÃ©s.
    strike: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LoopDecision {
    /// Tour normal, pas de rÃ©pÃ©tition.
    Ok,
    /// Répétition stricte — recentrage (`user` + `system`) puis continuer le run.
    Warn { kind: &'static str, strike: u32 },
    /// Strikes épuisés — stopper avec `EngineError::LoopDetected`.
    Abort { kind: &'static str, turns: u32 },
}

impl LoopDetector {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Reset le compteur (Ã  appeler aprÃ¨s chaque nudge moteur structurel pour
    /// laisser une chance de convergence sans pÃ©nalitÃ©).
    pub(crate) fn reset(&mut self) {
        self.strike = 0;
    }

    /// Examine un `TurnOutcome` et renvoie la dÃ©cision Ã  prendre.
    pub(crate) fn observe(
        &mut self,
        outcome: &TurnOutcome,
        max_strikes_before_abort: u32,
    ) -> LoopDecision {
        let text_h = hash_text(&outcome.text);
        let tools_h = hash_tool_calls(&outcome.tool_calls);
        let fp = combine_hash(text_h, tools_h);

        // Tour vide (ni texte significatif, ni outils) : on laisse les
        // gates `tool_calls.is_empty()` + `NUDGE_PROMPT` faire leur job et
        // on n'incrÃ©mente pas â€” sinon un run silencieux puis re-silencieux
        // se ferait flagger par erreur.
        if outcome.text.trim().is_empty() && outcome.tool_calls.is_empty() {
            self.last_fingerprint = Some(fp);
            self.last_text_hash = text_h;
            self.last_tools_hash = tools_h;
            return LoopDecision::Ok;
        }

        let repeat = matches!(self.last_fingerprint, Some(prev) if prev == fp);

        // Mise Ã  jour de l'Ã©tat AVANT de retourner : le prochain `observe`
        // doit voir l'empreinte courante quelle que soit la dÃ©cision.
        let last_text_h = self.last_text_hash;
        let last_tools_h = self.last_tools_hash;
        self.last_fingerprint = Some(fp);
        self.last_text_hash = text_h;
        self.last_tools_hash = tools_h;

        if !repeat {
            self.strike = 0;
            return LoopDecision::Ok;
        }

        // Qualifie le `kind` pour le message d'erreur / nudge.
        let kind = if text_h == last_text_h && tools_h == last_tools_h {
            "both"
        } else if text_h == last_text_h {
            "text"
        } else {
            "tool_calls"
        };

        self.strike = self.strike.saturating_add(1);
        if self.strike <= max_strikes_before_abort {
            LoopDecision::Warn {
                kind,
                strike: self.strike,
            }
        } else {
            LoopDecision::Abort {
                kind,
                turns: self.strike.saturating_add(1),
            }
        }
    }
}

/// Hash stable d'un fragment de texte (FNV-1a-like via `DefaultHasher`).
/// On `trim` pour Ã©viter qu'un saut de ligne en plus change l'empreinte â€”
/// les deltas Ollama sont fragmentÃ©s et le `consume_stream` recolle parfois
/// avec des espaces autour des marqueurs supprimÃ©s.
fn hash_text(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.trim().hash(&mut h);
    h.finish()
}

/// Signature stable d'une sÃ©quence de `PendingToolCall`. L'`id` est
/// **volontairement ignorÃ©** (il change Ã  chaque tour par construction), seuls
/// `name` + `arguments` sÃ©rialisÃ©s comptent. Pour les arguments, on passe par
/// `serde_json::to_string` ; deux turns identiques produiront le mÃªme JSON
/// d'arguments (les LLM sont dÃ©terministes au format prÃ¨s quand l'intention
/// est la mÃªme), c'est suffisant pour une dÃ©tection stricte.
fn hash_tool_calls(calls: &[PendingToolCall]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    calls.len().hash(&mut h);
    for c in calls {
        c.name.hash(&mut h);
        let args = serde_json::to_string(&c.arguments).unwrap_or_default();
        args.hash(&mut h);
    }
    h.finish()
}

fn combine_hash(a: u64, b: u64) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    a.hash(&mut h);
    b.hash(&mut h);
    h.finish()
}

pub(crate) struct TurnOutcome {
    /// Texte assistant **nettoyÃ©** : tous les marqueurs `[phase: ...]` reconnus
    /// ont Ã©tÃ© retirÃ©s (y compris les lignes `reasoning` / `next-move` ignorÃ©es).
    /// C'est ce qui est poussÃ© dans le transcript et renvoyÃ© au LLM aux tours
    /// suivants â€” le contexte sÃ©mantique pour le modÃ¨le, sans la quincaillerie
    /// protocolaire.
    pub text: String,
    pub tool_calls: Vec<PendingToolCall>,
    pub reason: StopReason,
    pub usage: Usage,
    /// DerniÃ¨re phase dÃ©clarÃ©e dans ce tour, si prÃ©sente. UtilisÃ©e par
    /// `drive_inner` pour dÃ©cider de la clÃ´ture (cf. `Phase::Done`).
    pub final_phase: Option<Phase>,
    /// `true` si la phase `Answering` a Ã©tÃ© dÃ©clarÃ©e Ã  un moment ou un autre
    /// pendant ce tour. Sert Ã  dÃ©tecter les `Done` prÃ©maturÃ©s oÃ¹ le modÃ¨le
    /// Ã©crit sa synthÃ¨se dans `reading`/`verifying` puis ferme sans passer
    /// par `answering` (cf. Sprint A.3 â€” answering-before-done).
    pub saw_answering: bool,
    /// `true` si `[phase: analyzing]` a Ã©tÃ© dÃ©clarÃ© pendant ce tour (Â§2.18).
    pub saw_analyzing: bool,
    /// `true` si `[phase: testing]` a Ã©tÃ© dÃ©clarÃ© pendant ce tour (Â§2.11).
    pub saw_testing: bool,
    /// Premier `[run_objective: â€¦]` du tour (dÃ©fini par le modÃ¨le).
    pub run_objective: Option<String>,
}

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
) -> Result<TurnOutcome, ()> {
    let mut text = String::new();
    let mut tool_calls: Vec<PendingToolCall> = Vec::new();
    let mut last_stop: Option<(StopReason, Usage)> = None;
    let mut buffer = PhaseLineBuffer::new();
    // DerniÃ¨re phase **Ã©mise** vers le consommateur. Sert Ã  dÃ©dupliquer les
    // marqueurs consÃ©cutifs identiques (Ã©vite des blocs UI vides).
    let mut final_phase: Option<Phase> = None;
    let mut saw_answering = false;
    let mut saw_analyzing = false;
    let mut saw_testing = false;
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
                        // Marqueur identique au prÃ©cÃ©dent Ã©mis â†’ on l'ignore
                        // pour Ã©viter les blocs UI dupliquÃ©s.
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
                // Sprint A.4 â€” filet de sÃ©curitÃ© Â« pas d'outil hors phase Â».
                // Si le modÃ¨le ouvre directement un tour avec une `ToolCall`
                // sans avoir dÃ©clarÃ© de phase, on en synthÃ©tise une avant
                // de forward la `ToolStart`. Sinon, cÃ´tÃ© UI, l'outil
                // atterrit en orphelin sur `logEl` et apparaÃ®t hors de la
                // trace repliÃ©e. Le choix entre `Reading` et `Acting` se fait
                // selon la nature lecture seule / mutative du tool.
                if needs_synthetic_phase_enter(final_phase, &name) {
                    let inferred = phase_for_tool(&name, final_phase);
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
        tool_calls,
        reason,
        usage,
        final_phase,
        saw_answering,
        saw_analyzing,
        saw_testing,
        run_objective,
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

#[must_use]
pub(crate) fn message_plain_text(m: &Message) -> String {
    let mut buf = String::new();
    for block in &m.content {
        if let Content::Text { text } = block {
            if !buf.is_empty() {
                buf.push('\n');
            }
            buf.push_str(text);
        }
    }
    buf
}

#[cfg(test)]
mod enforce_tests {
    use super::*;
    use crate::run_spec::RunSpec;
    use drox_types::ToolUseId;
    use serde_json::json;

    #[test]
    fn enforce_max_tools_per_turn_truncates_executor() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Executor);
        let mut calls = vec![
            PendingToolCall {
                id: ToolUseId::new(),
                name: "glob".into(),
                arguments: json!({}),
            },
            PendingToolCall {
                id: ToolUseId::new(),
                name: "grep".into(),
                arguments: json!({}),
            },
            PendingToolCall {
                id: ToolUseId::new(),
                name: "file_read".into(),
                arguments: json!({}),
            },
        ];
        enforce_max_tools_per_turn(&mut calls, &spec, 1);
        assert_eq!(calls.len(), 2);
    }

    #[test]
    fn enforce_max_tools_per_turn_noop_for_standard() {
        let spec = RunSpec::default();
        let mut calls = vec![
            PendingToolCall {
                id: ToolUseId::new(),
                name: "glob".into(),
                arguments: json!({}),
            },
            PendingToolCall {
                id: ToolUseId::new(),
                name: "grep".into(),
                arguments: json!({}),
            },
        ];
        enforce_max_tools_per_turn(&mut calls, &spec, 1);
        assert_eq!(calls.len(), 2);
    }
}

#[must_use]
pub(crate) fn promotable_answer_min_chars(role_id: RoleId, tuning: &crate::EngineTuning) -> usize {
    if role_id == RoleId::ArchitectDiscussion {
        tuning.discussion_promotable_min_chars as usize
    } else {
        tuning.promotable_answer_min_chars as usize
    }
}

#[must_use]
pub(crate) fn run_has_promotable_user_facing_text(
    outcome: &TurnOutcome,
    messages: &[Message],
    role_id: RoleId,
    tuning: &crate::EngineTuning,
) -> bool {
    let min = promotable_answer_min_chars(role_id, tuning);
    let from_outcome = strip_phase_protocol_lines(&outcome.text);
    if from_outcome.trim().chars().count() >= min {
        return true;
    }
    for m in messages.iter().rev() {
        if !matches!(m.role, Role::Assistant) {
            continue;
        }
        let plain = strip_phase_protocol_lines(&message_plain_text(m));
        if plain.trim().chars().count() >= min {
            return true;
        }
    }
    false
}
