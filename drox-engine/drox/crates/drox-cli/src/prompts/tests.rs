//! Tests unitaires des prompts système.

use super::*;

#[test]
fn native_thinking_supplement_warns_against_duplicating_thinking() {
    assert!(NATIVE_THINKING_REASONING_SUPPLEMENT.contains("thinking"));
    assert!(NATIVE_THINKING_REASONING_SUPPLEMENT.contains("Do not duplicate"));
    assert!(NATIVE_THINKING_REASONING_SUPPLEMENT.contains("ignored"));
}

#[test]
fn subagents_explore_supplement_is_kickoff_scoped() {
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("task"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("explore"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("session master"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("return_kinds"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("must_return"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("Plan"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("Assign"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("Merge"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("Prefer Explore at step kickoff"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("Do **not** fan out Explore before the plan"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("Needle"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("2–4"));
    assert!(SUBAGENTS_EXPLORE_SUPPLEMENT.contains("title"));
}

#[test]
fn core_prompt_describes_phase_protocol() {
    assert!(CORE_SYSTEM_PROMPT.contains("# Phase protocol"));
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
        txt.contains("ONLY stop signal") || txt.contains("This is the ONLY stop signal"),
        "prompt must state explicitly that done is the ONLY termination signal"
    );
}

#[test]
fn core_prompt_forbids_actions_outside_phases() {
    // Sprint A.4 — filet de sécurité moteur, mais c'est au modèle de
    // déclarer ses phases avant d'agir pour ne pas parasiter la trace.
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("No action outside a phase"),
        "prompt must state the no-action-outside-phase rule"
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
        txt.contains("`[phase: done]` is accepted only after `[phase: answering]`"),
        "prompt must state the answering-before-done rule"
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
        "prompt must name answering as the EXCLUSIVE phase for user-facing prose"
    );
    assert!(
        txt.contains("telegraphic notes"),
        "prompt must require telegraphic notes in internal phases"
    );
    assert!(
        txt.contains("Critical anti-pattern") && txt.contains("twice"),
        "prompt must name double-redaction as a critical anti-pattern"
    );
    assert!(
        txt.contains("STOP") && txt.contains("BEFORE writing the first `#`"),
        "prompt must state the STOP reflex when formatting markdown outside answering"
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
        txt.contains("Does NOT close the cycle"),
        "rule must say micro-cycle answering phases do NOT close the cycle"
    );
    assert!(
        txt.contains("post-edit intent"),
        "rule must include a post-edit answering phase for intent"
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
        txt.contains("Intermediate micro-announcement") || txt.contains("micro-announcement"),
        "answering must be documented as usable for intermediate micro-announcements"
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
        "prompt must note that the legacy reasoning marker is ignored"
    );
    assert!(
        txt.contains("todo_write") && txt.contains("at least 1 item"),
        "prompt must require todo_write with at least one item when there is real work"
    );
    assert!(
        txt.contains("before ANY mutation"),
        "prompt must state that todo_write precedes any mutation"
    );
}

/// Sprint A.7 — relax de la gate aux read-only. Le prompt doit refléter
/// que `glob`/`file_read`/`grep`/`lsp`/`web_*` peuvent être appelés
/// AVANT `todo_write` pour explorer, et que seules les mutations
/// (`file_edit`/`file_write`/`notebook_edit`/`delete_path`/`bash`) restent gardées par la gate.
#[test]
fn core_prompt_allows_read_only_exploration_before_todo_write() {
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("Read-only tools before `todo_write` are allowed")
            || txt.contains("BEFORE `todo_write`"),
        "prompt must allow read-only exploration before todo_write"
    );
    assert!(
        txt.contains("step kickoff") && txt.contains("task") && txt.contains("explore"),
        "prompt must prefer Explore (`task`) at plan step kickoff for multi-file / docs"
    );
    assert!(
        txt.contains("do **not** fan out Explore before the plan")
            || txt.contains("never fan out Explore **before** the plan"),
        "prompt must forbid Explore fan-out before the plan"
    );
    assert!(
        !txt.contains("explore freely"),
        "prompt must not contradict default-to-Explore with 'explore freely'"
    );
    assert!(
        txt.contains("before ANY mutation"),
        "prompt must gate mutating tools behind todo_write"
    );
    assert!(
        txt.contains("Do not") && txt.contains("merely to unlock"),
        "prompt must forbid cargo-cult todo_write just to unlock inspect shell"
    );
    assert!(
        txt.contains("ls|grep|awk") || txt.contains("dir|findstr"),
        "prompt must mention filter pipelines as inspect-only (aligned with drox-bash E14)"
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
        txt.contains("IN REAL TIME") || txt.contains("in real time"),
        "prompt must require step-by-step todo updates, not one batch at the end"
    );
    assert!(
        txt.to_lowercase().contains("anti-pattern"),
        "prompt must name the batch-at-end anti-pattern"
    );
    assert!(
        txt.contains("2 mutating tools"),
        "prompt must announce the engine threshold for mutating tools without todo_write"
    );
}

/// Anti-régression GLM : `tool_calls` `phase` + {\"done\"} au lieu de la
/// ligne texte `[phase: done]` — le prompt doit l'interdire explicitement.
#[test]
fn core_prompt_bans_phase_markers_as_tool_calls() {
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("1bis") && txt.contains("TWO strictly separate"),
        "prompt must have rule 1bis separating phases (text) from tools (tool_calls)"
    );
    assert!(
        txt.contains("no such tool exists"),
        "prompt must state that there is no `phase` tool"
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
        txt.contains("native") && txt.contains("tool_calls"),
        "prompt must state that real tools use native tool_calls"
    );
    assert!(
        txt.contains("simulated") && txt.contains("JSON"),
        "prompt must forbid simulating tool calls with inline JSON"
    );
    assert!(
        txt.contains("`todo_write`") && txt.contains("is not a phase"),
        "prompt must name todo_write as a tool, not a phase"
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
        "prompt must name the pure-conversation case"
    );
    assert!(
        txt.contains("unnecessary"),
        "prompt must say todo_write is unnecessary for trivial conversation"
    );
    assert!(
        txt.contains("answering → done"),
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

/// Sprint Hotfix « boucle édition/lecture » — anti-régression. Si on
/// supprime la règle anti-boucle ou la borne moteur, les modèles
/// reprennent l'habitude de répéter texte+outil à l'identique jusqu'à
/// `max_iterations`, ce qu'on a explicitement éliminé.
#[test]
fn core_prompt_describes_anti_loop_rule() {
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("Anti-loop"),
        "prompt must name the hard anti-loop rule"
    );
    assert!(
        txt.contains("LoopDetected") || txt.contains("abort the run"),
        "prompt must announce the engine abort effect on repetition"
    );
    assert!(
        txt.contains("change angle"),
        "prompt must suggest changing angle rather than repeating"
    );
}

#[test]
fn core_prompt_requires_incremental_writes_and_bounded_reads() {
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("Incremental writes"),
        "prompt must require skeleton / section-by-section writes"
    );
    assert!(
        txt.contains("Get-Content") || txt.contains("start_line"),
        "prompt must discourage dumping whole files into context"
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
        txt.contains("non-trivial doubt that changes upcoming actions"),
        "prompt must name the non-trivial doubt criterion for clarifying"
    );
    assert!(
        txt.contains("BEFORE any mutation"),
        "prompt must require ask_user_question BEFORE any mutation"
    );
    assert!(
        txt.contains("multiple** questions at once") || txt.contains("multiple questions at once"),
        "prompt must document asking multiple questions at once"
    );
    assert!(
        txt.contains("skips a question") || txt.contains("skipped: true"),
        "prompt must explain skip semantics in the UI"
    );
    assert!(
        txt.contains("proactively"),
        "Tools section must say ask_user_question is used proactively"
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
        txt.contains("# Session memory"),
        "prompt must have a dedicated session memory section"
    );
    for tool in [
        "memory_read",
        "memory_list",
        "session_note",
        "session_search",
        "session_compact",
    ] {
        assert!(txt.contains(tool), "le prompt doit nommer le tool `{tool}`");
    }
    assert!(
        txt.contains("/session_end") && txt.contains("no `session_end` tool"),
        "prompt must say session end is user /session_end, not an LLM tool"
    );
    assert!(
        txt.contains(".drox/memory/sessions/"),
        "le prompt doit pointer vers le dossier de persistance"
    );
    assert!(
        txt.contains("NEVER write directly"),
        "prompt must forbid writing session markdown files directly"
    );
}

/// Sprint §2.31 — skills locaux : outils et chemin `.drox/skills/`.
#[test]
fn core_prompt_documents_local_skills_tools() {
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("# Local skills"),
        "prompt must have a local skills section"
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
        "rule must tie MEMORY.md update to full todo_write plan closure"
    );
    assert!(
        txt.contains("not engine-gated") || txt.contains("does **not** refuse"),
        "MEMORY must not claim a hard engine gate on done"
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
        txt.contains("## Objective") || txt.contains("## Goal"),
        "compaction prompt must mandate the `## Objective` / `## Goal` section"
    );
    assert!(
        txt.contains("## Decisions"),
        "compaction prompt must mandate the `## Decisions` section"
    );
    assert!(
        txt.contains("## Files touched") || txt.contains("## Files"),
        "compaction prompt must mandate the `## Files` section"
    );
    assert!(
        txt.contains("## What's in progress") || txt.contains("## Next"),
        "compaction prompt must mandate the `## Next` / progress section"
    );
    assert!(
        txt.contains("## Done"),
        "compaction prompt must mandate the `## Done` section (S-3)"
    );
    assert!(
        txt.contains("## Blockers"),
        "compaction prompt must mandate the `## Blockers` section (S-3)"
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
fn professor_mode_supplement_describes_course_plan() {
    let txt = PROFESSOR_MODE_SUPPLEMENT;
    assert!(txt.contains("HARD RULES"));
    assert!(txt.contains("FORBIDDEN"));
    assert!(txt.contains("course_plan_write"));
    assert!(txt.contains("Course plan"));
    assert!(txt.contains("todo_write") && txt.contains("forbidden"));
    assert!(txt.contains("lesson") && txt.contains("exercise"));
}

#[test]
fn core_prompt_closes_with_done_when_asking_user_a_question() {
    let txt = CORE_SYSTEM_PROMPT;
    assert!(
        txt.contains("Question to the user"),
        "prompt must mention question-to-user → done"
    );
    assert!(
        txt.contains("engine reminder"),
        "prompt must warn that an engine reminder is not a user reply"
    );
}
