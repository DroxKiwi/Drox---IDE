//! Budget tokens pour l'injection mémoire dans le system prompt ([MEMOIRE-LONG-TERME] Mem-B).

const TRUNCATION_FOOTER: &str =
    "\n\n[… memory truncated to fit run budget — use `memory_read` / `memory_list` for full session archives …]";

/// Estimation conservative (~4 caractères / token, texte mixte EN/code).
#[must_use]
pub fn estimate_tokens(text: &str) -> u32 {
    let n = text.len() as u32;
    n.div_ceil(4)
}

/// Tronque `text` pour tenir dans `max_tokens` (estimation caractères).
#[must_use]
pub fn truncate_to_token_budget(text: &str, max_tokens: u32) -> String {
    if max_tokens == 0 {
        return String::new();
    }
    if estimate_tokens(text) <= max_tokens {
        return text.to_string();
    }
    let max_chars = (max_tokens as usize).saturating_mul(4);
    let mut end = max_chars.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    let mut out = text[..end].to_string();
    out.push_str(TRUNCATION_FOOTER);
    out
}

/// Applique un budget global sur memdir + listing sessions (profil Low / futur Medium).
#[must_use]
pub fn apply_prompt_memory_budget(
    memdir: Option<String>,
    sessions: Option<String>,
    budget_tokens: Option<u32>,
) -> (Option<String>, Option<String>) {
    let Some(budget) = budget_tokens else {
        return (memdir, sessions);
    };
    if budget == 0 {
        return (None, None);
    }

    let mem_t = memdir.as_ref().map(|s| estimate_tokens(s)).unwrap_or(0);
    let ses_t = sessions.as_ref().map(|s| estimate_tokens(s)).unwrap_or(0);
    let total = mem_t.saturating_add(ses_t);

    if total <= budget {
        return (memdir, sessions);
    }

    match (memdir, sessions) {
        (None, None) => (None, None),
        (Some(m), None) => (Some(truncate_to_token_budget(&m, budget)), None),
        (None, Some(s)) => (None, Some(truncate_to_token_budget(&s, budget))),
        (Some(m), Some(s)) => {
            // Memdir prioritaire (MEMORY.md / DROX.md), reste pour le listing compact.
            let mem_share = (budget * 40) / 100;
            let mem_share = mem_share.max(32).min(budget);
            let mem_out = truncate_to_token_budget(&m, mem_share);
            let mem_used = estimate_tokens(&mem_out);
            let ses_budget = budget.saturating_sub(mem_used);
            let ses_out = if ses_budget > 0 {
                truncate_to_token_budget(&s, ses_budget)
            } else {
                String::new()
            };
            if ses_out.trim().is_empty() {
                (Some(mem_out), None)
            } else {
                (Some(mem_out), Some(ses_out))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_tokens_uses_char_heuristic() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens(&"a".repeat(100)), 25);
    }

    #[test]
    fn truncate_adds_footer_when_over_budget() {
        let long = "x".repeat(2000);
        let t = truncate_to_token_budget(&long, 50);
        assert!(t.contains("memory truncated"));
        assert!(estimate_tokens(&t) <= 50 + estimate_tokens(TRUNCATION_FOOTER));
    }

    #[test]
    fn apply_none_budget_passes_through() {
        let m = Some("mem".into());
        let s = Some("ses".into());
        assert_eq!(
            apply_prompt_memory_budget(m.clone(), s.clone(), None),
            (m, s)
        );
    }

    #[test]
    fn apply_budget_truncates_memdir_only() {
        let big = "m".repeat(800);
        let (m, s) = apply_prompt_memory_budget(Some(big), None, Some(40));
        assert!(m.as_ref().unwrap().contains("truncated"));
        assert!(s.is_none());
    }

    #[test]
    fn apply_zero_budget_clears_blocks() {
        assert_eq!(
            apply_prompt_memory_budget(Some("x".into()), Some("y".into()), Some(0)),
            (None, None)
        );
    }
}
