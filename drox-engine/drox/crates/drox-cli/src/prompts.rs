//! System prompts injected at conversation start (English for the model).
//!
//! Standard-agent bodies live in [`core_standard`](core_standard.rs).
//! Orchestration prompts live in `drox_engine::orchestration::prompts`.
//!
//! Phase-protocol supplements for **Standard** agent runs (CLI one-shot — not IDE chat).
//! IDE chat uses `drox_engine::orchestration::prompts` (`role_split`).
//!
//! `PROFESSOR_MODE_SUPPLEMENT` retiré en 1.4.0 — voir `docs/1.4/REPORT/professor-2.0.md`.

/// Ajouté au `system` lorsque le client active le raisonnement natif Ollama
/// (`nativeThinking` / `think: true`). Le canal `thinking` porte déjà le
/// monologue interne : ne le recopie pas dans le corps `content` de la réponse.
pub const NATIVE_THINKING_REASONING_SUPPLEMENT: &str = r#"# Native thinking mode (Ollama `think: true`)

The server streams your **internal monologue** in a separate native `thinking` channel. **Do not duplicate that prose** in the assistant `content` body.

Hard rules for EVERY reply while this mode is active:

1. Use `content` for protocol markers (`[phase: …]` on their own line), short telegraphic notes inside internal phases, micro-announcements, and the final answer in `[phase: answering]`. Put long free-form reasoning only in the native `thinking` stream.
2. The chat UI shows your native `thinking` in the **Raisonnement natif** fold. There is **no** separate Drox `[phase: reasoning]` phase anymore — that marker is ignored if present.
3. Write the native `thinking` stream **in English only** (telegraphic). User-facing `[phase: answering]` follows the primary response language when configured.
4. All other phase rules (`reading`, `planning`, `acting`, `[phase: done]`, `todo_write` gates, micro-cycles around edits, …) stay unchanged."#;

mod core_standard;

pub use core_standard::CORE_SYSTEM_PROMPT;

pub const EXPLORATION_INTERNAL_ENGLISH_RULE: &str = r#"# Language split (exploration vs user)

- **Internal exploration** (`analyzing`, `reading`, `planning`, `acting`, `testing`, `verifying`, `clarifying`) and any native `thinking` stream: write **only in English** — short telegraphic notes.
- **User-facing** (`[phase: answering]` — final reply and brief visible micro-announcements): use the primary response language when configured above; otherwise match the language of the user's last message."#;

/// Ajoute un bloc système optionnel (langue exploration, thinking natif, …).
#[must_use]
pub fn append_system_supplement(base: Option<String>, supplement: &str) -> Option<String> {
    match base {
        Some(mut s) => {
            s.push_str("\n\n");
            s.push_str(supplement);
            Some(s)
        }
        None => Some(supplement.to_string()),
    }
}

// CORE_SYSTEM_PROMPT — see core_standard.rs

/// System prompt for the compaction LLM turn only (`drox_engine::compaction::summarize_run`).
/// English; fixed H2 sections parsed by `extract_metadata`. No tools exposed during compaction.
pub const COMPACTION_PROMPT: &str = r#"You are a **compaction model**. Your only job is to read the conversation transcript provided by the user and produce a **structured markdown summary** of what happened in the session.

This summary will be **persisted to disk** under `.drox/memory/sessions/` as a file named like `YYYY-MM-DD-HHMMSS-<slug>.md` (UTC timestamp + slug from the objective) so that future sessions on the same project can reload it via `memory_read` (using the **slug** field, not the filename prefix). It must be readable both by a human glancing at the file AND by a future LLM scanning a directory of summaries.

## Output format (STRICT)

Produce **markdown** with the following sections, in this order, using `## ` headers (no `# ` H1, no other levels):

```
## Objective
<ONE single line stating the goal of the session, in the user's language. No preamble. This line is used verbatim in directory listings — keep it under 100 chars and self-contained.>

## Decisions
- <Each meaningful technical decision, one bullet, telegraphic style>
- <Include the *why* when it's not obvious, e.g. "Chose sqlx over diesel: tokio-native">
- <If the model considered alternatives and rejected them, note it briefly>

## Files touched
- <relative/path/to/file.rs>
- <one bullet per file actually edited, created, or executed via bash>
- <Omit files only read>

## What's in progress
- <Any item that was started but not finished>
- <Any TODO / hypothesis / open question the model flagged>
- <If nothing — write a single line "Nothing pending.">

## Pinned notes
- <Verbatim copy of each `session_note` from the transcript, if any>
- <If none, omit this section entirely>
```

## Rules

1. **Do not** invent files, decisions, or facts that are not visible in the transcript. If the transcript is shallow, the summary is short. Better empty than wrong.
2. **`## Objective` must restate the user's original ask** (faithful one-line paraphrase). Never use generic meta-phrases ("continue the architect cycle", "analyze the project") when the transcript has a concrete user request. Other sections capture *outcomes*, not a copy-paste of the whole prompt.
3. For **Architect orchestration**, list active `todo_write` items (ids + labels + status) under **What's in progress** when the plan is not finished.
4. **Do not** include code blocks or diffs. The summary is a *map*, not a reproduction.
5. **Do not** apologize, explain your reasoning, or address the user. Output the markdown sections and nothing else.
6. Language: write the `## Objective` line in the language the user used (typically French or English). Other sections can stay in English — they are technical notes for future LLM consumption.
7. If `## Pinned notes` (from the model's `session_note` calls) are present in the transcript, copy them **verbatim**. They were authored deliberately by the model that ran the session.
"#;

pub fn prepend_core_system_prompt(existing: Option<String>) -> String {
    match existing {
        Some(s) if !s.trim().is_empty() => format!("{CORE_SYSTEM_PROMPT}\n{s}"),
        _ => CORE_SYSTEM_PROMPT.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_thinking_supplement_warns_against_duplicating_thinking() {
        assert!(NATIVE_THINKING_REASONING_SUPPLEMENT.contains("thinking"));
        assert!(NATIVE_THINKING_REASONING_SUPPLEMENT.contains("Do not duplicate"));
        assert!(NATIVE_THINKING_REASONING_SUPPLEMENT.contains("ignored"));
    }

    #[test]
    fn core_prompt_describes_phase_protocol() {
        assert!(CORE_SYSTEM_PROMPT.contains("Phase protocol"));
        assert!(CORE_SYSTEM_PROMPT.contains("[phase: phase-name]"));
        assert!(CORE_SYSTEM_PROMPT.contains("[phase: done]"));
    }

    #[test]
    fn core_prompt_lists_all_phases() {
        for phase in [
            "reading",
            "clarifying",
            "planning",
            "acting",
            "verifying",
            "answering",
            "done",
        ] {
            assert!(
                CORE_SYSTEM_PROMPT.contains(phase),
                "phase `{phase}` should be documented"
            );
        }
    }

    #[test]
    fn core_prompt_states_done_is_only_termination_signal() {
        // Garde-fou : si quelqu'un re-introduit une formulation laxiste
        // (« si tu n'as rien à dire, arrête-toi »), le test casse. Le
        // moteur d'A.2 s'appuie sur cette propriété : seul `done` ferme.
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("ONLY stop signal"),
            "prompt must state that done is the only stop signal"
        );
    }

    #[test]
    fn core_prompt_forbids_actions_outside_phases() {
        // Sprint A.4 — filet de sécurité moteur, mais c'est au modèle de
        // déclarer ses phases avant d'agir pour ne pas parasiter la trace.
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("No action outside a phase"),
            "prompt must state no-action-outside-phase"
        );
    }

    #[test]
    fn core_prompt_requires_answering_before_done() {
        // Sprint A.3 — answering-before-done : le moteur refuse `done` si
        // `answering` n'a jamais été émis dans le run. Le prompt doit
        // anticiper ça en l'énonçant clairement (sinon le modèle se fait
        // « nudger » au pire moment, en répétant sa réponse).
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("only after at least one `[phase: answering]`"),
            "prompt must state answering-before-done"
        );
    }

    /// Sprint A.8 — anti-double-rédaction. Le modèle écrivait une analyse
    /// markdown complète dans `[phase: reading]` puis la copiait dans
    /// `[phase: answering]` → double coût tokens + double affichage UI. Le
    /// prompt doit interdire NOMINALEMENT ce pattern, pas juste « anticiper ».
    #[test]
    fn core_prompt_forbids_user_facing_prose_outside_answering() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("EXCLUSIVELY in `[phase: answering]`"),
            "prompt must name answering as exclusive for user-facing prose"
        );
        assert!(
            txt.contains("Telegraphic notes"),
            "prompt must require telegraphic internal phases"
        );
        assert!(
            txt.contains("Critical anti-pattern") && txt.contains("double cost"),
            "prompt must name double-write anti-pattern"
        );
        assert!(
            txt.contains("STOP") && txt.contains("before the first heading"),
            "prompt must tell the model to STOP and switch to answering before markdown headings"
        );
    }

    #[test]
    fn core_prompt_describes_file_edit_micro_cycle() {
        // Anti-régression : la règle 8 « micro-cycle autour de chaque édition
        // de fichier » doit rester documentée (focus interne + annonce
        // answering avant, intention answering après, le tout sans clôture).
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("Micro-cycle")
                && txt.contains("file_edit")
                && txt.contains("file_write")
                && txt.contains("notebook_edit")
                && txt.contains("delete_path"),
            "le prompt doit énoncer la règle de micro-cycle autour de file_edit/file_write/notebook_edit/delete_path"
        );
        assert!(
            txt.contains("Does NOT close the run"),
            "micro-cycle answering must not close the run"
        );
        assert!(
            txt.contains("post-edit"),
            "micro-cycle must include a post-edit answering line"
        );
    }

    #[test]
    fn core_prompt_allows_multiple_answering_phases() {
        // Anti-régression : `answering` n'est plus une phase strictement
        // terminale ; elle peut servir d'annonce courte intermédiaire. Le
        // prompt doit l'expliciter pour éviter qu'un test ou un futur edit
        // ne re-restreigne la sémantique.
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("micro-announcement"),
            "answering must be documented as micro-announcement capable"
        );
        assert!(
            txt.contains("last `answering`"),
            "prompt must clarify that only the last answering is the final reply"
        );
    }

    #[test]
    fn core_prompt_does_not_require_reasoning_marker_on_first_turn() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("ignored") && txt.contains("[phase: reasoning]"),
            "prompt must note legacy reasoning marker is ignored"
        );
        assert!(
            txt.contains("todo_write") && txt.contains("strongly recommended"),
            "prompt must recommend todo_write before mutations when there is real work"
        );
    }

    /// Sprint A.7 — relax de la gate aux read-only. Le prompt doit refléter
    /// que `glob`/`file_read`/`grep`/`lsp`/`web_*` peuvent être appelés
    /// AVANT `todo_write` pour explorer, et que seules les mutations
    /// Les mutations ne sont plus bloquées sans `todo_write` ; le prompt
    /// recommande fortement le plan avant d'agir.
    #[test]
    fn core_prompt_allows_read_only_exploration_before_todo_write() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("read-only tools allowed **before** `todo_write`"),
            "prompt must allow read-only exploration before todo_write"
        );
        assert!(
            txt.contains("strongly recommended"),
            "prompt must recommend todo_write before mutations (soft nudge)"
        );
    }

    /// Anti-régression : le modèle (GLM-4.7-Flash) batchait tous ses
    /// `todo_write` à la fin du run au lieu de cocher chaque étape en temps
    /// réel. Le prompt doit nommer explicitement l'anti-pattern et imposer
    /// la mise à jour au fil de l'eau.
    #[test]
    fn core_prompt_requires_step_by_step_todo_updates() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("AS YOU GO"),
            "prompt must require todo updates as you go"
        );
        assert!(
            txt.contains("Anti-pattern"),
            "prompt must name batch-at-end anti-pattern"
        );
        assert!(
            txt.contains("batch at the end"),
            "prompt must name batch-at-end anti-pattern"
        );
    }

    /// Anti-régression GLM : `tool_calls` `phase` + {\"done\"} au lieu de la
    /// ligne texte `[phase: done]` — le prompt doit l'interdire explicitement.
    #[test]
    fn core_prompt_bans_phase_markers_as_tool_calls() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("1bis") && txt.contains("TWO strictly separate"),
            "prompt must have rule 1bis separating phase text and tool_calls"
        );
        assert!(
            txt.contains("rejected by the engine"),
            "prompt must state fake phase tools are rejected"
        );
    }

    /// Anti-régression GLM v2 : le modèle écrivait `[phase: todo_write]` + un
    /// objet JSON `{\"todos\":[…]}` dans le body au lieu d'émettre un vrai
    /// `tool_call` natif. Conséquence : `todo_write` n'était jamais exécuté,
    /// `glob` qui suivait recevait `NON_TODO_BEFORE_TODO_WRITE_BLOCKED`, et
    /// le run bouclait. Le prompt doit nommer cet anti-pattern et imposer
    /// le canal natif `tool_calls` pour les vrais outils.
    #[test]
    fn core_prompt_requires_native_tool_calls_for_real_tools() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("native API `tool_calls`"),
            "prompt must require native tool_calls for real tools"
        );
        assert!(
            txt.contains("simulate") && txt.contains("JSON"),
            "prompt must forbid simulating tools via inline JSON"
        );
        assert!(
            txt.contains("`todo_write`") && txt.contains("is a tool, not a phase"),
            "prompt must state todo_write is a tool not a phase"
        );
    }

    /// Anti-régression : la boucle infinie sur « Salut » venait d'un gate
    /// moteur exigeant `todo_write` même pour les conversations triviales.
    /// Le prompt doit désormais autoriser explicitement l'exemption.
    #[test]
    fn core_prompt_allows_pure_conversation_without_todo_write() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("purely conversational"),
            "prompt must name pure conversational case"
        );
        assert!(
            txt.contains("optional for pure chat"),
            "prompt must say todo_write is optional for pure chat"
        );
        assert!(
            txt.contains("`answering` → `done`"),
            "le prompt doit montrer la chaîne courte sans todo_write"
        );
    }

    #[test]
    fn core_prompt_mentions_tools_we_use() {
        for tool in [
            "glob",
            "grep",
            "file_read",
            "file_edit",
            "file_write",
            "notebook_edit",
            "delete_path",
            "bash",
            "lsp",
            "todo_write",
            "ask_user_question",
            "web_search",
            "session_compact",
        ] {
            assert!(
                CORE_SYSTEM_PROMPT.contains(tool),
                "system prompt should reference `{tool}`"
            );
        }
    }

    #[test]
    fn core_prompt_forbids_inline_edit_tricks() {
        assert!(CORE_SYSTEM_PROMPT.contains("sed -i"));
        assert!(CORE_SYSTEM_PROMPT.contains("file_edit"));
    }

    #[test]
    fn core_prompt_keeps_security_rules() {
        assert!(CORE_SYSTEM_PROMPT.contains("rm -rf"));
        assert!(CORE_SYSTEM_PROMPT.contains("git push --force"));
    }

    #[test]
    fn core_prompt_no_longer_uses_legacy_defensive_phrases() {
        // Garde-fou : si le prompt re-introduit des listes de phrases interdites
        // (« ne dis pas X »), c'est une régression — le protocole de phases
        // est censé subsumer ce besoin.
        let lower = CORE_SYSTEM_PROMPT.to_lowercase();
        assert!(
            !lower.contains("je suis prêt"),
            "le prompt ne doit plus enseigner par interdiction de phrase"
        );
        assert!(!lower.contains("paraphrase"));
    }

    #[test]
    fn prepend_with_none_returns_core() {
        let out = prepend_core_system_prompt(None);
        assert_eq!(out, CORE_SYSTEM_PROMPT);
    }

    #[test]
    fn prepend_with_empty_returns_core() {
        let out = prepend_core_system_prompt(Some(String::new()));
        assert_eq!(out, CORE_SYSTEM_PROMPT);
    }

    #[test]
    fn prepend_with_existing_keeps_both() {
        let custom = "Use British English.".to_string();
        let out = prepend_core_system_prompt(Some(custom.clone()));
        assert!(out.starts_with(CORE_SYSTEM_PROMPT));
        assert!(out.contains(&custom));
    }

    /// Rail 1.4 — anti-régression : le prompt doit mentionner le stall ACT.
    #[test]
    fn core_prompt_describes_act_stall_rule() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("Anti-stall"),
            "prompt must name ACT stall rule"
        );
        assert!(
            txt.contains("file_edit") && txt.contains("file_write"),
            "prompt must steer toward mutation tools at ACT"
        );
        assert!(
            txt.contains("[phase: answering]"),
            "prompt must mention concluding when blocked"
        );
    }

    /// Sprint Questions bloquantes (§2.13) — la règle `clarifying` doit être
    /// proactive (« dès qu'un doute non trivial qui change les actions à
    /// venir ») et **précéder toute mutation**. Anti-régression : si
    /// quelqu'un re-relaxe la règle à « parcimonieusement », les modèles
    /// arrêteront de poser des questions au bon moment.
    #[test]
    fn core_prompt_makes_clarifying_proactive_and_blocking() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("non-trivial doubt changes upcoming actions"),
            "prompt must name non-trivial doubt criterion for clarifying"
        );
        assert!(
            txt.contains("BEFORE any mutation"),
            "prompt must require ask_user_question before mutations"
        );
        assert!(
            txt.contains("**several** questions"),
            "prompt must document multiple questions in one ask_user_question"
        );
        assert!(
            txt.contains("skips") && txt.contains("skipped: true"),
            "prompt must explain skip semantics"
        );
        assert!(
            txt.contains("proactive"),
            "prompt must say ask_user_question is proactive when context is missing"
        );
    }

    /// Sprint M1 — la section « Mémoire de session » doit nommer les outils
    /// dédiés (`memory_read`, `memory_list`, `session_note`, `session_search`,
    /// `session_compact`) et rappeler que la clôture de session est **manuelle**
    /// (`/session_end`), pas un outil modèle.
    #[test]
    fn core_prompt_documents_session_memory_tools() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("Session memory"),
            "prompt must have session memory section"
        );
        for tool in [
            "memory_read",
            "memory_list",
            "session_note",
            "session_search",
            "session_compact",
        ] {
            assert!(
                txt.contains(tool),
                "le prompt doit nommer le tool `{tool}`"
            );
        }
        assert!(
            txt.contains("/session_end") && txt.contains("No `session_end` tool"),
            "prompt must say session end is user /session_end, not an LLM tool"
        );
        assert!(
            txt.contains(".drox/memory/sessions/"),
            "prompt must point to persistence folder"
        );
    }

    /// Sprint §2.31 — skills locaux : outils et chemin `.drox/skills/`.
    #[test]
    fn core_prompt_documents_local_skills_tools() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("Local skills"),
            "prompt must have local skills section"
        );
        for tool in ["skill_read", "skill_list"] {
            assert!(txt.contains(tool), "le prompt doit nommer `{tool}`");
        }
        assert!(
            txt.contains(".drox/skills/"),
            "le prompt doit pointer vers le dossier skills"
        );
        assert!(
            txt.contains("disable-model-invocation"),
            "le prompt doit mentionner les skills réservés utilisateur"
        );
    }

    /// Après clôture complète du plan, le modèle doit pousser une trace dans MEMORY.md.
    #[test]
    fn core_prompt_nudges_project_memory_md_after_plan_closure() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("7quater") && txt.contains("MEMORY.md"),
            "le prompt doit nommer la règle 7quater (mémoire projet)"
        );
        assert!(
            txt.contains("full plan closure"),
            "rule must tie MEMORY.md to full plan closure"
        );
    }

    /// Sprint M1 — le `COMPACTION_PROMPT` doit imposer un format markdown
    /// stable avec les sections que `extract_metadata` parse (`Objective`,
    /// `Files touched`). Anti-régression : si quelqu'un renomme une section
    /// uniquement dans le prompt, le parsing renverra des champs vides sans
    /// crasher, et le front-matter sera vide. Ce test ferme ce trou.
    #[test]
    fn compaction_prompt_keeps_canonical_section_names() {
        let txt = COMPACTION_PROMPT;
        assert!(
            txt.contains("## Objective"),
            "compaction prompt must mandate the `## Objective` section"
        );
        assert!(
            txt.contains("## Decisions"),
            "compaction prompt must mandate the `## Decisions` section"
        );
        assert!(
            txt.contains("## Files touched"),
            "compaction prompt must mandate the `## Files touched` section"
        );
        assert!(
            txt.contains("## What's in progress"),
            "compaction prompt must mandate the `## What's in progress` section"
        );
        assert!(
            txt.contains("## Pinned notes"),
            "compaction prompt must mandate the `## Pinned notes` section"
        );
    }

    /// Sprint M1 — la compaction est lectrice, jamais agentique. Le prompt
    /// doit interdire toute tentative d'invention de faits ou de code, et
    /// ne PAS suggérer l'usage de `tool_calls` (le tour LLM de compaction
    /// n'expose aucun outil).
    #[test]
    fn compaction_prompt_forbids_invention_and_tool_use() {
        let txt = COMPACTION_PROMPT;
        assert!(
            txt.contains("Do not** invent"),
            "compaction prompt must forbid inventing facts"
        );
        assert!(
            txt.contains("better empty than wrong") || txt.contains("Better empty than wrong"),
            "compaction prompt must prefer empty sections over fabricated ones"
        );
        assert!(
            !txt.to_lowercase().contains("call a tool"),
            "compaction prompt must not invite tool_calls (no tools exposed during compaction)"
        );
    }

    /// Régression bug « Le modèle interprète un nudge moteur comme une réponse
    /// utilisateur » (feedbacks/discussion.txt) : le modèle posait une question
    /// dans `answering`, recevait `NUDGE_PROMPT`, et partait agir seul.
    ///
    /// Le prompt doit désormais :
    /// 1. Exiger `[phase: done]` APRÈS une question adressée à l'utilisateur.
    /// 2. Interdire explicitement d'interpréter un rappel moteur comme un accord.
    #[test]
    fn core_prompt_closes_with_done_when_asking_user_a_question() {
        let txt = CORE_SYSTEM_PROMPT;
        assert!(
            txt.contains("Question to user"),
            "prompt must mention question-to-user then done"
        );
        assert!(
            txt.contains("Engine nudges"),
            "prompt must warn engine nudges are not user answers"
        );
    }
}
