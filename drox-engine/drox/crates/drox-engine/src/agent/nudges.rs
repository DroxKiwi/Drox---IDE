//! Constantes et builders de nudges système injectés dans la boucle agent.

use drox_tools::CANONICAL_ASK_JSON_EXAMPLE;

pub(crate) const CODE_MUTATION_TESTING_NUDGE: &str = "You modified **code** in this run but never entered \
    `[phase: testing]` with a **concrete verification** tool call.\n\
    \n\
    Before your final `[phase: answering]` + `[phase: done]`, you MUST:\n\
    1. Emit `[phase: testing]` on its own line.\n\
    2. Call at least one verification tool in the same turn or the next: `bash` \
    (e.g. `cargo check`, `cargo test`, `npm test`, `pnpm typecheck`, `tsc --noEmit`), \
    `lsp` with diagnostics, or `file_read` on a file you edited.\n\
    \n\
    Do not skip this — the engine will keep refusing `[phase: done]` until testing ran.";


pub(crate) const ANALYZING_PHASE_NUDGE: &str = "The user asked for a **workspace / repo analysis** \
     or topic understanding. Prefer `[phase: analyzing]` (not generic `[phase: reading]`). \
     If the `task` tool is available this run, **default to `task` (`explore`) early** \
     (`thoroughness`: `medium` or `very thorough`) for understanding / synthesis / multi-file \
     scope — keep only the returned report in the parent. Needles or 1–2 known paths → direct \
     tools. Otherwise playbook: `workspace_map_read` if `[Workspace map]` is fresh → targeted \
     `glob` → `grep` + ranged `file_read` → `lsp`. Treat `directory_fanout_caps` / `truncated` as \
     refine signals. Telegraphic notes in `analyzing`; full report only in `[phase: answering]`.";

/// 1.6.0 S-5 — parent enchaîne des lectures sans déléguer Explore.
pub(crate) const PARENT_HEAVY_READ_NUDGE: &str = "STOP flooding the parent context with repeated \
    reads / `Get-Content` / `cat` dumps.\n\
    \n\
    For **understanding, synthesis, or multi-file reading**: if `task` (Explore) is available, \
    you are the **session master** — **Plan → Assign → Merge** NOW:\n\
    1. `todo_write` with 2–4 focused explore steps (or Context-load recommended_n).\n\
    2. Spawn those `task` (`explore`) calls with `must_return` filled.\n\
    3. Keep only the returned **reports** in the parent.\n\
    \n\
    Else: `file_read` with **`start_line` + `end_line`** (short ranges) or `grep` — do NOT \
    re-ingest whole docs into this conversation.\n\
    \n\
    Needle lookups on 1–2 known paths may continue with direct tools.";

/// Nombre de lectures parent sans `task` avant nudge S-5 (1 = default-to-Explore ferme).
pub(crate) const PARENT_HEAVY_READ_NUDGE_THRESHOLD: u32 = 1;

/// Soft Context-load V1 — suggestion chiffrée après un `glob` large (pas un hard gate).
pub(crate) fn context_load_nudge(
    files_effective: usize,
    total_kb: u64,
    load: u64,
    recommended_n: u32,
) -> String {
    format!(
        "[Context load] files≈{files_effective} ≈{total_kb}KB → load={load}. \
You are the **session master**: you only keep Explore **reports**. \
**Plan → Assign → Merge**:\n\
1. `todo_write` with about **{recommended_n}** explore steps (one subtree / one question each).\n\
2. Spawn that many focused `task` (`explore`) calls — each with short `title`, scoped \
`description`, and non-empty `must_return` (facts your parent mission still needs).\n\
3. Merge reports only — do **not** parent-read the whole tree.\n\
\n\
Sequential is fine if concurrency is 1. This is **guidance**, not a hard gate — \
you may use a smaller N if a tighter scope is clearly enough."
    )
}

/// Après un Explore `truncated` / plafond — re-split chiffré, pas de sauvetage parent.
pub(crate) fn explore_incomplete_nudge(
    iterations_used: u64,
    max_iterations: u64,
    recommended_n: u32,
) -> String {
    let n = recommended_n.max(2);
    format!(
        "[Explore incomplete] truncated=true iterations_used={iterations_used}/{max_iterations}.\n\
\n\
You are the **session master**. That Explore did not finish cleanly. You receive ONLY \
structured reports — **do not** rescue by flooding the parent with `file_read` / `grep` / \
`Get-Content` on the same perimeter.\n\
\n\
Choose **ONE** predictable path NOW:\n\
1. **Re-split** — `todo_write` then spawn about **{n}** focused `task` (`explore`) missions \
(one concern each). Each call MUST set `must_return` to the acceptance criteria your \
overall mission still needs from that child.\n\
2. **Needle** — only if you already know **1–2** exact paths: ranged `file_read` / `grep` \
on those paths only.\n\
\n\
Forbidden: parent-read spam, re-opening Explore spill JSON, or one new mega-brief `task`."
    )
}

/// Annex turn-0 — ingestion / calque docs multi-fichiers (quand `task` est dispo).
pub(crate) const DOC_INGESTION_EXPLORE_ANNEX: &str = "DOC INGESTION / MULTI-FILE DOCS — engine directive\n\
    \n\
    The user asked you to take knowledge of a **docs tree** and/or rewrite / replace \
    documentation pages from that source.\n\
    \n\
    **Session master — Plan → Assign → Merge (numeric):**\n\
    1. **Plan** — `todo_write` with **2–4** explore steps (inventory / tone / target page / …).\n\
    2. **Assign** — one step → one focused `task` (`explore`): short `title`, scoped \
    `description`, non-empty `must_return` listing what YOUR rewrite still needs from that child.\n\
    3. **Merge** — keep only Explore `report`s; then mutate 1–2 target pages in the parent.\n\
    \n\
    The Explore sub-agent does **not** see this chat — put every needed fact into \
    `description` + `must_return`. Never pack the whole job into one mega Explore.\n\
    \n\
    Parent may `file_read` only the **1–2 pages being rewritten** (short line ranges). \
    Do **NOT** dump the whole docs tree into the parent via `file_read` / bash dumps.\n\
    \n\
    Trust the reports. Context isolation is intentional.";

/// Post-échec Explore — parent tente encore de sauver en lisant.
pub(crate) const EXPLORE_RESCUE_PARENT_READ_NUDGE: &str = "STOP. A prior Explore was incomplete \
    (`truncated`). Rescuing with parent `file_read` / `grep` / dumps on the same perimeter \
    burns the context window and loses the point of sub-agents.\n\
    \n\
    **Required next action:** spawn **2–4 focused** `task` (`explore`) with explicit \
    `must_return`, OR needle **1–2** known paths only. No third option.";

/// P1 dogfood — même `file_read` path réussi N fois → stop re-read.
pub(crate) const REPEATED_FILE_READ_NUDGE_THRESHOLD: u32 = 3;

pub(crate) const REPEATED_FILE_READ_NUDGE: &str = "STOP re-reading the same file.\n\
    \n\
    You already successfully `file_read` the same path multiple times in this run. \
    Do **not** call `file_read` (or bash `Get-Content`/`cat`/`type`) on it again.\n\
    \n\
    Next step — pick ONE:\n\
    1. If you have enough context: write / edit (`file_write`/`file_edit`) or answer \
       (`[phase: answering]` + `[phase: done]`).\n\
    2. If you still need broad understanding: delegate one or more focused `task` \
       (`explore`) missions (short `title` + scoped `description`), then act from the reports.\n\
    3. If you need a different slice of another file: read a **new** path or a clearly \
       different line range on a file you have not already fully covered.\n\
    \n\
    Re-reading the same path burns context and loops the run.";

/// Texte injecté en `system` quand un tour LLM se termine **sans** marqueur
/// `[phase: done]`. Sprint A.2 — done-driven completion : le moteur n'observe
/// plus du tout `tool_calls.is_empty()` pour décider de la fin ; seul
/// `[phase: done]` ferme la boucle. Tant que ce marqueur n'est pas vu, on
/// relance avec ce nudge, jusqu'à `max_iterations` (garde-fou unique).
///
/// Rédigé en anglais : les modèles Ollama de taille modeste (Devstral 24b,
/// Gemma 27b) suivent mieux les méta-instructions structurelles en anglais.
pub(crate) const NUDGE_PROMPT: &str = "Have you fully completed the user's objective?\n\
    \n\
    **IMPORTANT — read this before acting:** This is an engine reminder, NOT \
    a user reply. Do NOT treat it as user approval.\n\
    \n\
    **Before `[phase: done]`, the engine enforces this order** (a later step is \
    refused until earlier ones are clear):\n\
    1. At least one `[phase: answering]` must have happened in the run.\n\
    2. If your todo list still has `pending` / `in_progress` items → call \
    `todo_write` to close them (or keep working). Bare `[phase: done]` will be refused.\n\
    3. If you mutated **code** this run and never ran `[phase: testing]` + a \
    verification tool → do that first. Bare `[phase: done]` will be refused.\n\
    4. If your last answering asked the user a question and you are waiting → \
    emit ONLY `[phase: done]` and stop (do not start new work).\n\
    5. Otherwise: `[phase: answering]` + final Markdown reply + `[phase: done]`.\n\
    \n\
    - If work remains: `[phase: reading]` or `[phase: acting]` then a real tool \
    call in the same reply. Intent prose alone (\"I should verify…\") does not \
    end the turn.";

/// Injecté quand le modèle a **déjà** rédigé sa réponse
/// dans `[phase: answering]` mais a oublié le marqueur `[phase: done]` final,
/// **et** que les gates todo + testing sont déjà satisfaites.
///
/// Si testing / todos manquent encore, le moteur envoie le nudge **spécifique**
/// correspondant — pas celui-ci (sinon « ONLY done » mentirait).
pub(crate) const DONE_ONLY_NUDGE_PROMPT: &str = "Your previous reply ended inside \
    `[phase: answering]` but did NOT include the final `[phase: done]` marker. \
    The engine only closes the turn on `[phase: done]`.\n\
    \n\
    Your todo list is closed and no testing gate is pending. Do NOT rewrite your \
    answer. Do NOT start new tools. In your next reply emit ONLY:\n\
    \n\
    [phase: done]\n\
    \n\
    (Optionally keep a one-line `[phase: answering]` if required by your stack — \
    still no new tool calls.)";
/// FX-B 1.5.16 — nudge quand le modèle annonce une mutation (`file_write` /
/// `file_edit`…) en prose **sans** émettre de `tool_calls`. Remplace le
/// `NUDGE_PROMPT` générique qui laisse boucler « je vais écrire… ».
/// Prefer a **small** first mutation (skeleton / one section), not a giant
/// single-shot rewrite — oversized `file_write` payloads often never leave
/// the model as structured `tool_calls`.
pub(crate) const INTENT_ONLY_WRITE_NUDGE_PROMPT: &str = "STOP. You described writing or \
    editing a file in plain text, but you did NOT emit any native `tool_calls`.\n\
    \n\
    Intent prose alone does nothing. In your NEXT reply you MUST either:\n\
    1. Emit a real `file_write` or `file_edit` tool call (preferred — same \
       reply as a short `[phase: acting]` line). Prefer a **small** first \
       write: skeleton + 1–2 sections, then `file_edit` for the rest — do \
       NOT attempt a multi-section / \"complete page\" rewrite in one call, OR\n\
    2. If you cannot mutate, explain why briefly in `[phase: answering]` then \
       emit `[phase: done]`.\n\
    \n\
    Do NOT repeat \"I will write / Je vais écrire\". Call the tool NOW.";

/// 2e strike FX-B — même situation + exemple minimal pour forcer le format.
pub(crate) const INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT: &str = "You still have not called \
    a mutating tool after announcing a write/edit. This is your last chance \
    before the engine aborts the run.\n\
    \n\
    Emit a native `file_write` (or `file_edit`) tool call NOW with a **small** \
    payload — skeleton or first section only. Example shape:\n\
    `{ \"path\": \"relative/or/absolute/path.ext\", \"content\": \"/* skeleton */\\n...\" }`\n\
    \n\
    Or `file_edit` with `{ \"path\", \"old_string\", \"new_string\" }` to append \
    the next section. Forbidden: announce \"full page / all sections / one big \
    file_write\" without a tool_call. No more announcement-only replies.";

/// When prose clearly plans an oversized single-shot write (whole page, N
/// sections, \"one big file_write\"), steer toward chunked mutations instead
/// of repeating \"call file_write with everything\".
pub(crate) const LARGE_WRITE_CHUNK_NUDGE_PROMPT: &str = "STOP. You announced a \
    **large** write (whole file / complete page / many sections / one big \
    `file_write`) in plain text, but you did NOT emit any native `tool_calls`.\n\
    \n\
    Oversized one-shot writes often fail to become tool_calls. In your NEXT \
    reply you MUST:\n\
    1. Emit `file_write` with a **skeleton** (imports + headings + 1–2 short \
       sections only), OR\n\
    2. Emit `file_edit` that adds **one** section to an existing file,\n\
    then continue section-by-section in later turns.\n\
    \n\
    Do NOT try to paste the entire multi-section page in one tool call. Do NOT \
    repeat \"I'll write the whole file / J'écris la page complète\".";

/// Nombre de nudges « intent-only write » avant soft-abort (`LoopDetected`).
pub(crate) const INTENT_ONLY_WRITE_MAX_NUDGES: u32 = 2;

/// Plafond un cran plus haut quand la prose vise clairement un écrit monolithe
/// (dogfood : page multi-fiches) — un nudge `LARGE_WRITE_CHUNK` supplémentaire.
pub(crate) const INTENT_ONLY_LARGE_WRITE_MAX_NUDGES: u32 = 3;

/// Détecte une intention de mutation fichier annoncée en prose (FR/EN).
/// Utilisé uniquement quand `tool_calls` est vide — pas un parseur NLP.
#[must_use]
pub(crate) fn assistant_text_suggests_mutation_intent(text: &str) -> bool {
    let t = text.to_lowercase();
    const NEEDLES: &[&str] = &[
        // EN
        "i will write",
        "i'll write",
        "i am going to write",
        "i'm going to write",
        "going to write the file",
        "write the file",
        "writing the file",
        "i will edit",
        "i'll edit",
        "i am going to edit",
        "create the file",
        "creating the file",
        "call file_write",
        "calling file_write",
        "use file_write",
        "using file_write",
        "call file_edit",
        "use file_edit",
        // FR (accents + ASCII)
        "je vais écrire",
        "je vais ecrire",
        "je dois écrire",
        "je dois ecrire",
        "j'écris",
        "j'ecris",
        "j’écris",
        "écrire le fichier",
        "ecrire le fichier",
        "je lance l'écriture",
        "je lance l'ecriture",
        "appeler file_write",
        "utiliser file_write",
        "je vais éditer",
        "je vais editer",
        "je crée le fichier",
        "je cree le fichier",
        "je vais créer le fichier",
        "je vais creer le fichier",
    ];
    // Mention nue de l'outil dans une phrase d'action (souvent FR/EN mélangés).
    if t.contains("file_write") || t.contains("file_edit") {
        return true;
    }
    NEEDLES.iter().any(|n| t.contains(n))
}

/// Indices qu'une prose vise une écriture **trop grosse** pour un seul
/// `tool_call` (dogfood 1.6 — page docs multi-sections).
#[must_use]
pub(crate) fn assistant_text_suggests_large_write_intent(text: &str) -> bool {
    let t = text.to_lowercase();
    const NEEDLES: &[&str] = &[
        // EN
        "whole file",
        "entire file",
        "full file",
        "complete page",
        "full page",
        "entire page",
        "one file_write",
        "one big file_write",
        "single file_write",
        "all sections",
        "all 17",
        "write the whole",
        "write it all",
        // FR
        "page complète",
        "page complete",
        "fichier complet",
        "tout le fichier",
        "toute la page",
        "en un seul file_write",
        "un seul file_write",
        "un gros file_write",
        "17 fiches",
        "toutes les fiches",
        "toutes les sections",
    ];
    NEEDLES.iter().any(|n| t.contains(n))
}

/// Injecté quand le modèle signe `[phase: done]` SANS jamais avoir émis
/// `[phase: answering]` au cours du run. Symptôme : le modèle écrit sa
/// synthèse dans `reading` / `verifying` puis ferme directement — la
/// réponse se retrouve enfouie dans la trace UI repliée, invisible.
///
/// Le moteur refuse alors la clôture et demande au modèle de **re-rédiger**
/// sa réponse dans la bonne phase, même au prix d'une répétition. C'est
/// délibéré : la phase `answering` est la seule rendue en clair côté UI
/// (cf. `enterPhase` dans `chat.js`).
pub(crate) const MISSING_ANSWERING_PROMPT: &str = "You emitted `[phase: done]` without \
    ever using `[phase: answering]` in this run. The engine cannot close yet: \
    your final user-facing reply MUST live inside `[phase: answering]`. Any \
    text written in `reading`, `verifying`, or other reflection phases is \
    hidden in the collapsible trace and the user will not see it.\n\
    \n\
    Re-send your final response NOW in this exact shape, even if it repeats \
    what you already wrote:\n\
    \n\
    [phase: answering]\n\
    <your full user-facing answer in Markdown>\n\
    [phase: done]";

pub(crate) fn step_by_step_todo_nudge(unupdated_tools: u32, pending: u64, in_progress: u64) -> String {
    format!(
        "Heads-up: you've called {unupdated_tools} mutating tools \
         (file_edit / file_write / notebook_edit / delete_path / copy_path / mutating bash) \
         since your last `todo_write`, and your \
         plan still has {pending} pending + {in_progress} in_progress item(s).\n\
         \n\
         The user follows your progress in real time on the todo widget. Don't \
         wait until the end of the run to flip everything to `completed` in one \
         batch — that defeats the whole point of the plan.\n\
         \n\
         Before your next action: emit `todo_write` with the SAME list, but \
         move the finished step(s) to `completed` and the next active step to \
         `in_progress`. Then continue with `[phase: reading]` / `[phase: acting]` + your next \
         tool. One `todo_write` per real step transition is enough — you don't \
         need one between every tool call inside the same step. \
         Inspect-only bash (ls/dir/git status/…) does not count toward this reminder."
    )
}

/// Injecté quand le modèle signe `[phase: done]` alors que la **dernière**
/// `todo_write` a encore des items en `pending` ou `in_progress`. Le moteur
/// considère qu'on n'a pas le droit de clôturer si la to-do n'est pas
/// elle-même clôturée (tous les items en `completed` ou `cancelled`).
///
/// Le message demande au modèle de **se poser** : est-ce qu'il reste vraiment
/// du travail (alors `[phase: reading]` / `[phase: acting]` + outil) ou est-ce que les items
/// sont en fait faits (alors un nouveau `todo_write` qui les passe en
/// `completed`).
pub(crate) fn unfinished_todos_prompt(pending: u64, in_progress: u64) -> String {
    format!(
        "You emitted `[phase: done]` but your most recent `todo_write` still has \
         {pending} item(s) in `pending` and {in_progress} item(s) in `in_progress`. \
         The engine cannot close yet — the todo list must mirror reality before you \
         end the turn.\n\
         \n\
         Decide which case you're in, then act:\n\
         \n\
         - If the remaining items are ACTUALLY done (you just forgot to update them): \
         call `todo_write` again with the SAME items, but flip their `status` to \
         `completed` (or `cancelled` if no longer relevant). Then emit \
         `[phase: answering]` + your final reply + `[phase: done]`.\n\
         - If something is still left to do: do NOT close. Emit `[phase: reading]` or \
         `[phase: acting]` on its own line, then call the appropriate tool in the SAME reply.\n\
         \n\
         An open todo means the work is not finished."
    )
}

pub(crate) fn unfinished_course_plan_prompt(pending: u64, active: u64) -> String {
    format!(
        "You emitted `[phase: done]` but your most recent `course_plan_write` still has \
         {pending} step(s) in `pending` and {active} in `active`. Update the **course plan** \
         (`mastered` / `skipped`) or continue teaching the active step before closing.\n\
         \n\
         - If the learner finished the step: `course_plan_write` with that step `mastered`, \
         next step `active`, then `[phase: answering]` + `[phase: done]` if you wait for them.\n\
         - If work remains: do NOT close — continue `[phase: teach]` / `[phase: exercise]`."
    )
}

pub(crate) fn run_objective_system_block(objective: &str) -> String {
    format!(
        "## Locked objective (user request)\n{}\n\n\
         Objective fidelity:\n\
         - A discovered inconsistency is NOT an implicit task: use `scope_defer` \
         or `ask_user_question` before widening scope.\n\
         - No global audit or refactor until this objective is met.\n\
         - Before `[phase: done]`, briefly state in your last `[phase: answering]` \
         how the objective is satisfied.",
        objective.trim()
    )
}

pub(crate) fn run_objective_done_nudge(objective: &str) -> String {
    format!(
        "You emitted `[phase: done]`. Before closing: in `[phase: answering]`, briefly \
         recall in **one short sentence** how the locked objective is satisfied, then \
         `[phase: done]` again.\n\nObjective: {}",
        objective.trim()
    )
}

/// Nombre d'échecs `ask_user_question` consécutifs avant nudge système (§2.21).
pub(crate) const MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES: u32 = 3;

#[must_use]
pub(crate) fn ask_user_question_loop_nudge() -> String {
    format!(
        "You called `ask_user_question` {MAX} times in a row without success. \
         Either ask the user in plain Markdown under `[phase: clarifying]` (no tool), \
         OR call `ask_user_question` again via native tool_calls with EXACTLY this JSON \
         (do NOT paste JSON in assistant text): {CANONICAL_ASK_JSON_EXAMPLE}",
        MAX = MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    )
}

/// Prompt injecté au modèle quand une répétition stricte est détectée
/// (1er strike). Volontairement court et en anglais (les modèles compactés
/// suivent mieux les méta-instructions anglophones). Le moteur **n'invente
/// jamais** la suite : on demande au modèle de choisir entre changer
/// d'approche ou clôturer proprement.
pub(crate) const LOOP_DETECTED_NUDGE_PROMPT: &str = "You just repeated the exact same \
output (text and/or tool call) as your previous turn. This is a loop — \
continuing will not converge.\n\nDecide NOW between two paths:\n\n\
1. **Change approach**: identify what's actually missing or wrong (a \
permission denial? a stale tool result? a misread file?) and try a \
different tool, different args, or a different angle. State the new \
hypothesis in `[phase: reading]` or `[phase: acting]` BEFORE acting.\n\n\
2. **Conclude**: if you genuinely have nothing more to do, emit \
`[phase: answering]` with your final answer in Markdown, then \
`[phase: done]`.\n\n\
Repeating the same content again will cause the run to be aborted.";

/// Nudge spécifique familles bash/grep (args équivalents après normalisation).
pub(crate) const LOOP_TOOL_FAMILY_NUDGE_PROMPT: &str = "You are repeating the same shell/search \
tool family with only cosmetic changes (case, retry labels, duplicated commands). \
That will not converge.\n\n\
1. **Stop retrying the same findstr/grep/bash** — treat empty stdout + exit 1 as \
\"no matches\" (not a crash), OR switch to `file_read` / `codebase_search`.\n\
2. **Or conclude**: `[phase: answering]` with what you already know, then `[phase: done]`.\n\n\
Repeating the same search family again will abort the run.";
