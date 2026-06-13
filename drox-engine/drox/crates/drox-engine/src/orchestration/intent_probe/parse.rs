//! JSON parsing for intent probe responses.

use serde::Deserialize;
use serde_json::Value;

use super::flags::RunIntentFlags;
use crate::orchestration::json_response::extract_first_json_object;

#[derive(Debug, Deserialize)]
struct RunIntentPayload {
    probe: Option<String>,
    greeting_only: Option<bool>,
    expects_workspace_mutation: Option<bool>,
    gate: Option<String>,
    value: Option<bool>,
}

/// Parse the first JSON object in `text` into [`RunIntentFlags`].
pub fn parse_run_intent_json(text: &str) -> Result<RunIntentFlags, &'static str> {
    let Some(v) = extract_first_json_object(text) else {
        return Err("no_json_object");
    };
    parse_run_intent_value(&v)
}

fn parse_run_intent_value(v: &Value) -> Result<RunIntentFlags, &'static str> {
    let payload: RunIntentPayload =
        serde_json::from_value(v.clone()).map_err(|_| "invalid_json_shape")?;

    if let (Some(gate), Some(value)) = (payload.gate.as_deref(), payload.value) {
        if gate.contains("greeting") {
            return Ok(RunIntentFlags::from_llm(value, false));
        }
        if gate == "run_intent" {
            return Ok(RunIntentFlags::from_llm(value, !value));
        }
    }

    let greeting_only = payload.greeting_only.ok_or("missing_greeting_only")?;
    let expects_workspace_mutation = payload
        .expects_workspace_mutation
        .ok_or("missing_expects_workspace_mutation")?;

    if let Some(probe) = payload.probe.as_deref() {
        if probe != "run_intent" {
            return Err("unexpected_probe_id");
        }
    }

    Ok(RunIntentFlags::from_llm(
        greeting_only,
        expects_workspace_mutation,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::intent_probe::ProbeSource;

    #[test]
    fn parse_valid_run_intent() {
        let flags = parse_run_intent_json(
            r#"{"probe":"run_intent","greeting_only":true,"expects_workspace_mutation":false}"#,
        )
        .expect("parse");
        assert!(flags.greeting_only);
        assert!(!flags.expects_workspace_mutation);
        assert_eq!(flags.source, ProbeSource::Llm);
    }

    #[test]
    fn parse_mutation_brief_de() {
        let flags = parse_run_intent_json(
            r#"{"probe":"run_intent","greeting_only":false,"expects_workspace_mutation":true}"#,
        )
        .expect("parse");
        assert!(!flags.greeting_only);
        assert!(flags.expects_workspace_mutation);
    }

    #[test]
    fn parse_legacy_gate_value_greeting() {
        let flags =
            parse_run_intent_json(r#"{"gate":"run_intent.greeting_only","value":true}"#).expect("parse");
        assert!(flags.greeting_only);
    }

    #[test]
    fn parse_rejects_prose_pollution() {
        let flags = parse_run_intent_json(
            "Sure.\n{\"probe\":\"run_intent\",\"greeting_only\":false,\"expects_workspace_mutation\":true}\n",
        )
        .expect("parse");
        assert!(!flags.greeting_only);
        assert!(flags.expects_workspace_mutation);
    }

    #[test]
    fn parse_rejects_missing_fields() {
        assert!(parse_run_intent_json(r#"{"probe":"run_intent"}"#).is_err());
    }

    /// Golden fixture for smoke `ses_3eb8a6d5` — plan + SVG brief must route to Edit + mutation.
    #[test]
    fn parse_compound_plan_mutation_brief_fixture() {
        let flags = parse_run_intent_json(
            r#"{"probe":"run_intent","greeting_only":false,"expects_workspace_mutation":true}"#,
        )
        .expect("parse");
        assert!(!flags.greeting_only);
        assert!(flags.expects_workspace_mutation);
    }
}
