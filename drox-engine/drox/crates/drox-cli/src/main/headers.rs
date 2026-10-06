//! Headers HTTP LLM (`--api-key` / `--header`).

use std::collections::BTreeMap;

/// Découpe un header HTTP au format `Name: Value` ou `Name:Value`. Tolère
/// les espaces. Renvoie une erreur si le `:` est absent ou si le nom est
/// vide.
pub(crate) fn parse_header_arg(raw: &str) -> anyhow::Result<(String, String)> {
    let (name, value) = raw
        .split_once(':')
        .ok_or_else(|| anyhow::anyhow!("invalid --header `{raw}` (expected `Name: Value`)"))?;
    let name = name.trim();
    let value = value.trim();
    if name.is_empty() {
        anyhow::bail!("invalid --header `{raw}` (empty header name)");
    }
    Ok((name.to_string(), value.to_string()))
}

/// Fusionne `--api-key` (raccourci) et `--header K:V` (répétables) en une
/// map normalisée (noms lowercased pour éviter les doublons).
pub(crate) fn collect_headers(
    api_key: Option<&str>,
    raw_headers: &[String],
) -> anyhow::Result<BTreeMap<String, String>> {
    let mut out = BTreeMap::new();
    if let Some(k) = api_key {
        out.insert("x-api-key".into(), k.to_string());
    }
    for raw in raw_headers {
        let (n, v) = parse_header_arg(raw)?;
        out.insert(n.to_lowercase(), v);
    }
    Ok(out)
}
