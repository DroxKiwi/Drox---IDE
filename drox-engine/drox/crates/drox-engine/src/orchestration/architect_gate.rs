//! Résolution discuss vs edit — override RPC ou défaut edit (`start_run`).

/// Gate empruntée après résolution d'intention.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchitectGate {
    /// Orchestration — plan, `todo_write`, `delegate_executor` (`gate_architect_edit`).
    Edit,
    /// Discussion — réponse directe ; lecture repo autorisée, pas de plan ni sous-agents.
    Discuss,
    /// Analyse dépôt — exploration lecture seule puis synthèse (pas de plan / delegate).
    Analyze,
}

impl ArchitectGate {
    /// Override explicite depuis `agent.run` (pas de tour intent).
    #[must_use]
    pub fn parse_param(raw: &str) -> Option<Self> {
        match raw.trim().to_lowercase().as_str() {
            "discussion" | "discuss" | "chat" | "light" | "light_reply" | "architect_discuss" => {
                Some(Self::Discuss)
            }
            "action" | "edit" | "agir" | "agissement" | "work" | "architect_edit" => {
                Some(Self::Edit)
            }
            "analyze" | "analysis" | "explore" | "architect_analyze" => Some(Self::Analyze),
            "auto" | "" => None,
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Edit => "architect_edit",
            Self::Discuss => "architect_discuss",
            Self::Analyze => "architect_analyze",
        }
    }
}

use crate::agent::{parse_phase_marker, strip_phase_protocol_lines};
use crate::event::Phase;
use super::json_response::{extract_first_json_object, looks_like_gate_json_response};
use super::protocol_markers::{DISCUSSION_DONE_LINE, DISCUSSION_REPLY_LINE};

const DISCUSSION_REPLY_NEEDLE: &str = "[discussion: reply]";
const DISCUSSION_DONE_NEEDLE: &str = "[discussion: done]";
/// Ligne de plan architecte (monologue modèle — pas la réponse utilisateur).
fn is_discussion_plan_step_line(line: &str) -> bool {
    let t = line.trim();
    t.starts_with("Plan:")
        || t.starts_with("plan:")
        || (t.chars().next().is_some_and(|c| c.is_ascii_digit())
            && (t.contains("Add ") || t.contains("Append ")))
        || t.starts_with("- Add ")
        || t.starts_with("- Append ")
}

/// Ligne protocole / artefact gate — exclue de la réponse canonique.
fn is_discussion_protocol_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return true;
    }
    if parse_discussion_done_marker(t) || parse_discussion_reply_marker(t) {
        return true;
    }
    if looks_like_gate_json_response(t) {
        return true;
    }
    if is_discussion_plan_step_line(t) {
        return true;
    }
    let bytes = t.as_bytes();
    bytes.first() == Some(&b'{') && bytes.last() == Some(&b'}')
}

/// Retire un marqueur `[discussion: …]` en **fin** de chaîne (pas au milieu d’un plan bruité).
fn trim_discussion_reply_tail(s: &str) -> String {
    let mut out = s.trim();
    if let Some(i) = out.rfind('[') {
        let tail = out[i..].to_ascii_lowercase();
        if tail.starts_with("[discussion:") {
            out = out[..i].trim();
        }
    }
    out.trim_end_matches(|c: char| {
        c == '"' || c == '\'' || c == ')' || c == '(' || c == '.' || c.is_whitespace()
    })
    .trim()
    .to_string()
}

fn strip_embedded_json_objects(mut text: String) -> String {
    while let Some(start) = text.find('{') {
        let Some(v) = extract_first_json_object(&text[start..]) else {
            break;
        };
        let json_str = v.to_string();
        if let Some(pos) = text[start..].find(&json_str) {
            text.replace_range(start + pos..start + pos + json_str.len(), "");
        } else {
            break;
        }
    }
    text
}

/// Fin de la **dernière** ligne seule `[discussion: reply]` (ignore les mentions inline dans le thinking).
fn last_standalone_discussion_reply_line_end(text: &str) -> Option<usize> {
    let mut last = None;
    let mut offset = 0usize;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n').trim();
        if parse_discussion_reply_marker(trimmed) {
            last = Some(offset + line.len());
        }
        offset += line.len();
    }
    last
}

/// Début de la première ligne seule `[discussion: done]` dans `text`.
fn first_standalone_discussion_done_line_start(text: &str) -> Option<usize> {
    let mut offset = 0usize;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n').trim();
        if parse_discussion_done_marker(trimmed) {
            return Some(offset);
        }
        offset += line.len();
    }
    None
}

/// Corps entre la dernière ligne `[discussion: reply]` et la première `[discussion: done]` qui suit.
fn slice_between_reply_and_done(text: &str) -> Option<&str> {
    let body_start = last_standalone_discussion_reply_line_end(text)?;
    let slice = text[body_start..].trim_start();
    let end = first_standalone_discussion_done_line_start(slice).unwrap_or(slice.len());
    let body = slice[..end].trim();
    if body.is_empty() {
        None
    } else {
        Some(body)
    }
}

/// Index d'une ligne contenant **uniquement** `[discussion: done]` (pas une mention dans un plan).
fn find_discussion_done_line_start(text: &str) -> Option<usize> {
    for (i, line) in text.lines().enumerate() {
        if parse_discussion_done_marker(line.trim()) {
            let offset: usize = text.lines().take(i).map(|l| l.len() + 1).sum();
            return Some(offset.min(text.len()));
        }
    }
    None
}

fn join_non_protocol_lines(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|l| !is_discussion_protocol_line(l))
        .collect::<Vec<_>>()
        .join("\n")
}

fn join_user_facing_lines(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|l| {
            !l.is_empty() && !is_discussion_protocol_line(l) && !is_meta_discussion_line(l)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Bloc de monologue interne (thinking / plan) — pas une réponse utilisateur seule.
fn block_looks_like_thinking(block: &str) -> bool {
    block
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !is_discussion_protocol_line(l))
        .any(is_meta_discussion_line)
}

/// Ligne de monologue interne (thinking) — pas une réponse utilisateur.
fn is_meta_discussion_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return true;
    }
    t.starts_with("The user ")
        || t.starts_with("I should")
        || t.starts_with("According to")
        || t.starts_with("Let me ")
        || t.starts_with("No exploration")
        || t.starts_with("Plan:")
        || (t.chars().next().is_some_and(|c| c.is_ascii_digit()) && t.contains('.'))
}

/// Dernière ligne non méta (repli discussion sans marqueur phase).
fn last_user_facing_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .rev()
        .find(|l| !l.is_empty() && !is_discussion_protocol_line(l) && !is_meta_discussion_line(l))
        .map(str::to_string)
}

/// Premier bloc de lignes non protocole (repli sans marqueur — salutation en tête).
fn first_non_protocol_block(text: &str) -> String {
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if is_discussion_protocol_line(line) {
            if !current.is_empty() {
                blocks.push(current);
                current = Vec::new();
            }
            continue;
        }
        current.push(line);
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    blocks
        .first()
        .map(|b| b.join("\n"))
        .unwrap_or_default()
}

/// Dernier bloc de lignes non protocole (repli sans marqueur `reply`).
fn last_non_protocol_block(text: &str) -> String {
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if is_discussion_protocol_line(line) {
            if !current.is_empty() {
                blocks.push(current);
                current = Vec::new();
            }
            continue;
        }
        current.push(line);
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    blocks
        .pop()
        .map(|b| b.join("\n"))
        .unwrap_or_default()
}

/// Fin de ligne (octets inclus) après la dernière ligne **seule** `[phase: …]`.
fn last_standalone_phase_line_end(text: &str, target: Phase) -> Option<usize> {
    let mut last_end: Option<usize> = None;
    let mut offset = 0usize;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n').trim();
        if parse_phase_marker(trimmed) == Some(target) {
            last_end = Some(offset + line.len());
        }
        offset += line.len();
    }
    last_end
}

/// Début de la première ligne **seule** `[phase: …]` dans `text`.
fn first_standalone_phase_line_start(text: &str, target: Phase) -> Option<usize> {
    let mut offset = 0usize;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_end_matches('\n').trim();
        if parse_phase_marker(trimmed) == Some(target) {
            return Some(offset);
        }
        offset += line.len();
    }
    None
}

/// Corps après le **dernier** marqueur phase `answering` sur sa propre ligne.
///
/// N'interprète **pas** les mentions inline dans le thinking (ex. `` `[phase: answering]` ``).
fn slice_after_last_phase_answering(text: &str) -> Option<String> {
    let start = last_standalone_phase_line_end(text, Phase::Answering)?;
    let slice = text[start..].trim_start();
    let end = first_standalone_phase_line_start(slice, Phase::Done).unwrap_or(slice.len());
    let body = strip_phase_protocol_lines(slice[..end].trim());
    let cleaned = body.trim();
    if cleaned.is_empty() {
        return None;
    }
    Some(cleaned.to_string())
}

/// Extrait la réponse visible utilisateur depuis un tour discussion (transcript assistant).
///
/// **Canonique** : bloc entre `[discussion: reply]` et `[discussion: done]`.
/// **Phase** : texte après le dernier `[phase: answering]` (hors thinking accumulé).
/// **Repli** : lignes non protocole avant `[discussion: done]` (sans heuristique langue).
#[must_use]
pub fn extract_discussion_user_facing_reply(text: &str) -> String {
    let work = strip_embedded_json_objects(strip_phase_protocol_lines(text));

    if let Some(block) = slice_between_reply_and_done(&work) {
        let cleaned = join_non_protocol_lines(block);
        if !cleaned.trim().is_empty() {
            return cleaned;
        }
    }

    if let Some(block) = slice_after_last_phase_answering(text) {
        return block;
    }

    let end = find_discussion_done_line_start(&work).unwrap_or(work.len());
    let before_done = &work[..end];
    let first_block = trim_discussion_reply_tail(&first_non_protocol_block(before_done));
    if !first_block.trim().is_empty() && !block_looks_like_thinking(&first_block) {
        return first_block;
    }
    if block_looks_like_thinking(&first_block) {
        if let Some(line) = last_user_facing_line(before_done) {
            return line;
        }
    }
    let last_block = trim_discussion_reply_tail(&last_non_protocol_block(before_done));
    let last_clean = join_user_facing_lines(&last_block);
    if !last_clean.trim().is_empty() && !block_looks_like_thinking(&last_clean) {
        return last_clean;
    }
    if let Some(line) = last_user_facing_line(before_done) {
        return line;
    }
    if !last_clean.trim().is_empty() {
        return last_clean;
    }
    first_block
}

/// `true` si le texte contient le marqueur de clôture discussion (`[discussion: done]`).
#[must_use]
pub fn extract_discussion_done_from_text(text: &str) -> bool {
    text.lines()
        .any(|line| parse_discussion_done_marker(line.trim()))
        || text
            .to_ascii_lowercase()
            .contains(DISCUSSION_DONE_NEEDLE)
}

#[must_use]
pub fn parse_discussion_reply_marker(line: &str) -> bool {
    line.trim()
        .eq_ignore_ascii_case(DISCUSSION_REPLY_LINE)
        || line.trim().eq_ignore_ascii_case("[discussion:reply]")
}

#[must_use]
fn parse_discussion_done_marker(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.eq_ignore_ascii_case(DISCUSSION_DONE_LINE) {
        return true;
    }
    let body = match trimmed.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
        Some(b) => b,
        None => return false,
    };
    let (head, tail) = match body.split_once(':') {
        Some(p) => p,
        None => return false,
    };
    if !head.trim().eq_ignore_ascii_case("discussion") {
        return false;
    }
    matches!(
        tail.trim().to_ascii_lowercase().as_str(),
        "done" | "complete" | "finished"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn param_maps_discussion() {
        assert_eq!(
            ArchitectGate::parse_param("discussion"),
            Some(ArchitectGate::Discuss)
        );
    }

    #[test]
    fn parses_discussion_done_marker() {
        assert!(extract_discussion_done_from_text(
            "Voici la réponse.\n\n[discussion: done]\n"
        ));
        assert!(!extract_discussion_done_from_text("Salut !"));
    }

    #[test]
    fn extracts_canonical_reply_block() {
        let raw = r#"Some thinking.
[discussion: reply]
Voici comment fonctionne le module X (résumé court).
[discussion: done]"#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert_eq!(
            reply,
            "Voici comment fonctionne le module X (résumé court)."
        );
    }

    #[test]
    fn extracts_user_reply_from_mixed_gate_stream_fallback() {
        let raw = r#"The user said "Salut". Reply in French.
Plan:
1. Reply politely.
2. Add [discussion: done].
{"gate":"discuss.needs_repo_facts","value":false}
Salut ! Je vais bien, merci. Et vous ?
[discussion: done]"#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert!(
            reply.contains("Salut ! Je vais bien"),
            "unexpected reply: {reply:?}"
        );
        assert!(!reply.contains("The user said"));
        assert!(!reply.contains("needs_repo_facts"));
    }

    #[test]
    fn extracts_after_last_phase_answering_skips_thinking_blob() {
        let raw = r#"The user sent "Salut". Greeting-only → no tools.
According to my instructions I should not call workspace_map_read.
The user simply said "Salut" again. I already called memory_list by mistake.
[phase: answering]
Salut ! 👋 Comment puis-je t'aider aujourd'hui ?
[phase: done]"#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert_eq!(
            reply,
            "Salut ! 👋 Comment puis-je t'aider aujourd'hui ?"
        );
        assert!(!reply.contains("Greeting-only"));
        assert!(!reply.contains("memory_list"));
    }

    #[test]
    fn ignores_inline_phase_markers_in_thinking_backticks() {
        let raw = r#"The user said "Salut" which is a greeting.
I should:
1. Not use any tools
2. Write one short `[phase: answering]`
3. Then `[phase: done]` on the next line
4. Stop

No exploration needed.
Salut ! Comment puis-je t'aider aujourd'hui ?"#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert_eq!(reply, "Salut ! Comment puis-je t'aider aujourd'hui ?");
        assert!(!reply.contains("Then `"));
    }

    #[test]
    fn extracts_reply_marker_block_over_plan_noise() {
        let raw = r#"Plan:
1. Add something.
[discussion: reply]
Salut ! Comment puis-je t'aider aujourd'hui ?
[discussion: done]"#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert_eq!(reply, "Salut ! Comment puis-je t'aider aujourd'hui ?");
    }

    #[test]
    fn extracts_reply_skips_inline_discussion_markers_in_thinking() {
        let raw = r#"The user said "salut" which is a French greeting.
According to my instructions:
- Greeting-only → no tools at all
- Reply with `[discussion: reply]`, my short answer, then `[discussion: done]` — then stop.

I should just greet back and close the turn.
[discussion: reply]
Salut ! Comment puis-je t'aider aujourd'hui ?
[discussion: done]"#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert_eq!(reply, "Salut ! Comment puis-je t'aider aujourd'hui ?");
        assert!(!reply.contains("short answer"));
    }

    #[test]
    fn fallback_prefers_first_block_without_discussion_markers() {
        let raw = r#"Salut ! Ça va bien, merci ! Et toi ? 😊

Si tu as une question sur le code ou un besoin précis sur ce projet, n'hésite pas."#;
        let reply = extract_discussion_user_facing_reply(raw);
        assert!(reply.starts_with("Salut !"));
        assert!(reply.contains("Ça va bien"));
        assert!(!reply.starts_with("Si tu as"));
    }
}
