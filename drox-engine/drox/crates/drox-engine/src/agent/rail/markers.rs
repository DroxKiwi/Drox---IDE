//! Parse `[gate: hold|advance]` and `[depth: complex]` from assistant text.

use super::station::RunDepth;

/// Transition declared on a single assistant turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateTransition {
    Hold,
    Advance,
}

/// Parsed rail protocol markers (first match per kind).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ParsedRailMarkers {
    pub gate: Option<GateTransition>,
    pub depth: Option<RunDepth>,
}

/// Parse `[gate: hold]` / `[gate: advance]` and `[depth: complex]` (line or inline).
#[must_use]
pub fn parse_rail_markers(text: &str) -> ParsedRailMarkers {
    let mut out = ParsedRailMarkers::default();
    for line in text.lines() {
        let trimmed = line.trim();
        if out.gate.is_none() {
            if let Some(g) = parse_gate_marker(trimmed) {
                out.gate = Some(g);
            }
        }
        if out.depth.is_none() {
            if let Some(d) = parse_depth_marker(trimmed) {
                out.depth = Some(d);
            }
        }
        if out.gate.is_some() && out.depth.is_some() {
            break;
        }
    }
    out
}

#[must_use]
fn parse_gate_marker(line: &str) -> Option<GateTransition> {
    let body = line.strip_prefix('[')?.strip_suffix(']')?;
    let (head, raw) = body.split_once(':')?;
    if !head.trim().eq_ignore_ascii_case("gate") {
        return None;
    }
    match raw.trim().to_ascii_lowercase().as_str() {
        "hold" | "stop" | "answer" | "close" => Some(GateTransition::Hold),
        "advance" | "next" | "continue" => Some(GateTransition::Advance),
        _ => None,
    }
}

#[must_use]
fn parse_depth_marker(line: &str) -> Option<RunDepth> {
    let body = line.strip_prefix('[')?.strip_suffix(']')?;
    let (head, raw) = body.split_once(':')?;
    if !head.trim().eq_ignore_ascii_case("depth") {
        return None;
    }
    match raw.trim().to_ascii_lowercase().as_str() {
        "complex" | "full" | "long" => Some(RunDepth::Complex),
        "short" | "simple" | "quick" => Some(RunDepth::Short),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gate_and_depth() {
        let text = "[depth: complex]\nSome text\n[gate: advance]";
        let p = parse_rail_markers(text);
        assert_eq!(p.depth, Some(RunDepth::Complex));
        assert_eq!(p.gate, Some(GateTransition::Advance));
    }

    #[test]
    fn parses_hold() {
        assert_eq!(
            parse_rail_markers("[gate: hold]").gate,
            Some(GateTransition::Hold)
        );
    }
}
