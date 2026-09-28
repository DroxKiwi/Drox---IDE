# Backlog sprints post–phase 2 (Drox)

Document de suivi pour les prochains sprints : fonctionnalités inspirées du leak **Claude Code (TS)**, correctifs identifiés, et proposition **mémoire par sessions** (`.drox/memory/`). Les items qui **exigent de garder l’arborescence `src/` leak à côté** pendant l’implémentation portent le marqueur **`[REF-LEAK]`** (registre : **§2.26.0**).

Dernière mise à jour : **2026-05-19** — **audit alignement §1 / §2.0 / §2.26 / §6** avec §5 (items déjà livrés mais encore en « backlog » dans le tableau prioritaire). Derniers livrables documentés : **`.droxignore` §2.34 / §5 n°40**, **carte workspace §2.23 / §5 n°30**, **fidélité objectif §2.25 / §5 n°32** (V1 partielle), **règles permissions §2.30 / §5 n°36**, **sticky user §2.24 / §5 n°31**. **Convention `[REF-LEAK]`** (§2.26.0). **Réappropriation leak** : §2.29–§2.33 **livrés V1**. **Professeur enforcement** (§2.22) + hotfixes Ollama (cf. ci-dessous). **Images** (§2.20 / §5 n°27) **clos** ; **vision déléguée** retirée. **Professeur enforcement** (§2.22) + hotfixes Ollama (cf. ci-dessous). **2026-05-14** — **§1** (ligne « Cycles de session & mémoire longue ») + **§2.16** + **§5 n°24** : V1 extension (**`LongMemoryStore`**, `/session_end`, **`session_search`**) notée **partiellement livrée** ; périmètre strict §2.16.1 (SQLite + ONNX) reste **backlog** ; précision **`session_end`** non exposé au LLM (clôture utilisateur). **§2.17 + §5 n°25** — paramètres : liste des outils + activation / désactivation (cf. §2.17) ; **§2.18 + §5 n°12a** — phase **`analyzing`** (analyse efficace du répertoire ouvert).

**2026-05-15 — Mode Professeur + correctifs session longue** :
- **M1 (partiellement livré)** : mode `professor` (`drox-permissions`), `PROFESSOR_MODE_SUPPLEMENT`, tool **`course_plan_write`** (Plan de cours : `lesson` / `exercise` / `checkpoint`), gates moteur (`todo_write` masqué, `course_plan_write` avant mutations, gate `[phase: done]` si plan ouvert), UI webview (sticky 📚, `coursePlanUpdate`). Tests : `course_plan_write`, `professor_mode_supplement_describes_course_plan`.
- **M2 (livré)** : validation `workArea` obligatoire pour `exercise` / `checkpoint` (`primaryPaths` ou `referencePaths`) ; règles d’ancrage repo dans le supplément professeur.
- **M3 (V1 extension)** : **`CourseCycleStore`** (`.drox/course-cycles/<id>/` : `meta.json`, `baseline/`, `journal.jsonl`), journal des mutations client (`file_edit`, `file_write`, `notebook_edit`), slash **`/course_undo`** / **`/course_end`**, bannière webview. **Limite** : en mode Professeur le moteur est en `plan_mode` → pas d’écriture disque tant que l’utilisateur n’applique pas (le journal ne se remplit qu’après apply réel côté client tools).
- **MCP tools registre (livré, clos)** : `McpHub`, stubs `mcp__*`, resources. Cf. **§2.28** / §5 n°**34**.
- **Bash classifier (livré V1)** : `permission_flags`, auto-deny destructif, compound segments. Cf. **§2.27** / §5 n°**33**.
- **Hotfixes** : ✅ Ollama NDJSON sans champ `done` (`#[serde(default)]` sur `ChatResponseChunk.done`) ; ✅ **`ContextPolicy::for_model_context_window(num_ctx)`** (JSON-RPC `agent.run` + CLI `main.rs`) pour déclencher l’autocompact quand la pastille `ctx` approche la vraie fenêtre Ollama ; ✅ tool **`copy_path`** (évite `bash copy` / `robocopy`).
- **Reste Professeur** : polish UI plan de cours, tests d’intégration E2E, cartes exercices dédiées, journaler `copy_path` / `delete_path` côté moteur si besoin.
- **Régressions terrain (2026-05)** : (1) **`ask_user_question`** — échecs JSON en boucle, carte Questions jamais affichée (cf. **§2.21**) ; (2) **Mode Professeur** — l’agent modifie le code sans cours ni `course_plan_write` (cf. **§2.22**).

**2026-05-13** — **Sprint M1 (mémoire sessions `.drox/memory/sessions/`) livré** + **hardening qualité** (`cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `npm run compile` extension) ; détail technique §2.2 B / §4 / §5 item `12b`. **Livré ensuite (même jour)** : **Compaction proactive (live, M2)** ✅ (§1 + §2.7), **Smart paste V1 éditeur** ✅ (§1 + §2.9 + §5 n°16), **Questions bloquantes (style Cursor)** ✅ (§1 + §2.13 + §5 n°21). **Hotfix qualité (même jour)** : ✅ **anti-boucle moteur** (`LoopDetector` + `EngineError::LoopDetected`, prompt règle « Anti-boucle »), ✅ **un seul plan par run** (gate `TODO_RECREATION_BLOCKED`, prompt règle 7ter), ✅ **sticky plan cliquable réducteur** (persiste tous-completed, toggle compact ↔ expanded). **Ajouté backlog** : §2.14 + §5 n°22 — **message en attente pendant un run** (queue webview, dépile sur `agent/done`).

**Hotfix UI « verdict dans reading répété dans answering »** (2026-05-13 quater, post-M2) :
- Symptôme rapporté par l'utilisateur après la livraison M2 — le modèle écrit sa réponse finale dans `[phase: reading]`, le moteur refuse `[phase: done]` sans `answering` préalable et injecte `MISSING_ANSWERING_PROMPT` → le modèle re-rédige dans `answering` → l'utilisateur voit la réponse **deux fois** (la trace `reading` était toujours ouverte depuis A.5).
- Le prompt promet pourtant explicitement que les phases internes vont « dans une trace **repliée** que l'utilisateur ne lit pas » (§2 du `CORE_SYSTEM_PROMPT`) et `MISSING_ANSWERING_PROMPT` part de cette hypothèse pour justifier la re-rédaction. A.5 avait rouvert tous les `<details>` à la clôture sans réaligner cette contrainte → contrat rompu, dédoublement visible.
- Fix minimal côté webview (`extension-vscode/media/chat.js`, `closeCurrentPhase`) : à la sortie d'une phase **`reading`**, on remet `details.open = false`. Les autres phases (`reasoning`, `planning`, `next-move`, `acting`, `verifying`, `clarifying`) restent dépliées comme voulu par A.5. Un clic sur le summary réouvre `reading` si besoin.
- Pas de changement moteur : la branche `MISSING_ANSWERING_PROMPT` continue à forcer la re-rédaction (c'est ce qui garantit que la réponse arrive bien dans la bulle `answering` lisible) ; seule la trace `reading` redevient discrète.

**Historique du même jour (hotfix + A.5, avant M1)** :
- **Hotfix « boucle infinie sur Salut »** (2026-05-13 bis) : suppression de la gate moteur qui exigeait un `todo_write` avant tout `[phase: done]`. Cette gate provoquait une boucle infinie sur les conversations triviales (« Salut » → moteur nudge MISSING_TODO_WRITE_PROMPT → modèle ré-écrit la même salutation → loop). Désormais `todo_write` est obligatoire **uniquement avant d'appeler un autre outil** (gate `NON_TODO_BEFORE_TODO_WRITE_BLOCKED` conservée). Une conversation purement conversationnelle peut clôturer en `reasoning → answering → done` sans todo. Prompt mis à jour (règles 6 et 7), nouvelle chaîne typique courte documentée, test `done_accepted_for_pure_conversation_without_todo_write`.
- **Hotfix « double-réponse quand done oublié »** (2026-05-13 ter) : nouveau `DONE_ONLY_NUDGE_PROMPT` minimaliste injecté quand le modèle a déjà rédigé sa réponse dans `[phase: answering]` mais a oublié le `[phase: done]` final (cas GLM-4.7-Flash). Le `NUDGE_PROMPT` générique demandait au modèle de « write your final user-facing response » → il ré-écrivait toute la réponse, causant 2× rendu côté UI. Le nouveau nudge dit explicitement « do NOT rewrite, just send `[phase: done]` ». Déclenchement conditionné à `final_phase == Answering && seen_answering_in_run && pas de todo ouverte`. Test `forgotten_done_after_answering_uses_minimal_nudge` (asserte que le texte de la réponse n'apparaît qu'une fois dans le flux d'events).
- **Engine** : `drive_inner` traque `last_todo_pending` / `last_todo_in_progress` mis à jour à chaque `todo_write` réussi (`value["counts"]["pending"]` / `"in_progress"`). Gate sur `[phase: done]` : si l'un de ces compteurs > 0, on injecte `unfinished_todos_prompt(p, ip)` (message system) et on relance la boucle. Le modèle doit choisir : soit re-`todo_write` avec les items en `completed` (la todo reflétait mal la réalité), soit `[phase: next-move]` + tool concret (il reste vraiment du travail). Garde-fou unique : `max_iterations`.
- **`todo_write` tolérant** : `drox-tools::simple::todo_write::normalize_input` rattrape les payloads JSON mal formés courants (tableau nu `[...]`, objet plat `{id, content, status}`, clé `todo` au singulier, clé `items`) en les wrappant en `{ "todos": [...] }`. Quand le parse échoue malgré tout, le message d'erreur dit explicitement au modèle quel format utiliser (`{"todos": [{...}]}`) au lieu du sec `missing field 'id'`. Description du tool augmentée d'un exemple JSON inline.
- **Prompt** : règle 6 réécrite (« todo_write obligatoire avant tout autre outil dès qu'il y a du travail réel, optionnel pour une conversation purement conversationnelle »), règle 7 préfixée « s'applique uniquement si tu en as ouvert une », nouvelle chaîne typique pour les conversations triviales (`reasoning → answering → done`). Règle 8 « micro-cycle autour de chaque édition de fichier » conservée. Conversion du raw string `r"..."` en `r#"..."#` pour autoriser les `"` JSON inline dans le prompt.
- **Settings VS Code** : 4 nouveaux paramètres Ollama exposés — `drox.minP` (min_p), `drox.presencePenalty`, `drox.frequencyPenalty`, `drox.keepAlive`. Le `keep_alive` est sérialisé en **top-level** du payload `/api/chat` (pas dans `options`) ; test dédié `build_request_serializes_keep_alive_at_top_level`.
- **UI** : `closeCurrentPhase` (webview) ne met plus `details.open = false` — les phases passées **restent dépliées** dans le fil de discussion (l'utilisateur lit le raisonnement / les actions a posteriori, et peut replier manuellement d'un clic). Combiné aux corrections A.4 (frères directs sur `logEl`, plus de cadre parent « Réflexion », `.log > *` en `flex-shrink: 0` + `gap: 12px`, `max-height` cognitive streaming porté à `min(70vh, 36rem)`), le rendu n'a plus aucun « tassement ».

Tests (état au moment des hotfixes A.5) : **41 engine** (+`done_accepted_for_pure_conversation_without_todo_write`, +`forgotten_done_after_answering_uses_minimal_nudge`), 12 `todo_write`, **14 prompts** (+`core_prompt_allows_pure_conversation_without_todo_write`), 26 `drox-llm` (+`build_request_emits_min_p_alone`, +`build_request_serializes_keep_alive_at_top_level`). **État post-M1** : voir §5 item `12b` (compteurs à jour + clippy `-D warnings`).

---

## 1. Priorités produit (sélection équipe)

> **Colonne Priorité** : le suffixe **`[REF-LEAK]`** (référence TS obligatoire) ou **`[REF-LEAK ~]`** (consultation ponctuelle) signale qu’il faut **garder l’arborescence `src/` leak** dans le dépôt pendant le sprint — cf. **§2.26.0**.

| Priorité | Thème | Notes |
|----------|--------|--------|
| ✅ P0 | **Vision / images** | Livré : `Content::Image` + Ollama `images` + base64 extension ; **chemins actionnables** (légende avant chaque image, `absPath`/`relPath`, rappel `copy_path`) — cf. **§2.20** / §5 n°27. |
| ✅ P1 | **WebSearchTool** | Livré : `web_search` tool (provider DuckDuckGo HTML, read-only, aucune clé requise). |
| ✅ P1 | **Mémoire sessions (`.drox/memory/sessions/`)** | Livré Sprint M1 — compaction de fin de run + persistance + `memory_read` / `memory_list` / `session_note` + chip UI (cf. §2.2 B / §4). **Reste** : mémoire « objectifs » multi-run (Sprint C). L’accès rapide à `MEMORY.md` via `/memory` est livré avec les slash commands (§2.3). |
| ✅ P1 | **Slash commands (webview)** | Ajout des UI de bases : copié messages (utilsiateur et IA), réessayer un appel, etc |
| ✅ P1 | **Slash commands (webview)** | Livré : parseur ligne unique `^/` dans `chat.js`, `postMessage` `slash` → `chatView.ts` (`/help`, `/clear`/`/new`, `/model`, `/init`, `/memory`, `/compact`, **`/session_end`** / `/end-session`). JSON-RPC `session.compact` (transcript courant + `summarize_run`, cf. `drox-cli` handlers + `droxRpcClient.sessionCompact`). Placeholder composer « /help ». |
| ✅ P1 (régression) [REF-LEAK ~] | **Questions bloquantes (style Cursor)** | **Livré (V1 fiabilité, 2026-05-15)** — infra §2.13 + `normalize_input`, erreurs auto-explicites, anti-boucle moteur (3 échecs). Cf. **§2.21** / §5 n°**28**. |
| ✅ P2 | **Paramètres : outils activables / désactivables** | `drox.tools.disabled` + `drox.tools.mcp.enabled` ; filtre registre à chaque `agent.run` ; handlers client conditionnels. Cf. **§2.17** / **§5 n°25**. |
| ✅ P2 | **NotebookEditTool** | **Livré** — `notebook_edit` (replace / insert / delete par `cell_index`, normalisation payloads leak + Ollama). Rust `drox-tools` + handler extension. Cf. **§2.4**. |
| ✅ P2 | **LSPTool** | Livré : tool `lsp` (ops `diagnostics` / `workspace_symbol` / `definition` / `references` / `hover`), exécuté via `vscode.execute*Provider`, read-only. |
| ✅ P2 [REF-LEAK] | **Hooks pre/post tool** | **Livré (V1, 2026-05-15)** — `.drox/hooks.json`, `PreToolUse` / `PostToolUse`, commandes shell, allowlist. Cf. **§2.6**. |
| ✅ P1 | **Compaction proactive (live)** | **V2 efficacité** (2026-05-15) : microcompact (`drox-context/microcompact.rs`), queue tail token-bounded, checkpoint court, boucle `compact_until_budget`. Cf. §2.7. `/compact` manuelle (§2.3). **Suivi** : mesurer en prod sur gros runs réels ; reactive compact leak optionnel. |
| ✅ P2 [REF-LEAK ~] | **Placeholder / complétion prompt** | **Livré (V1, 2026-05-15)** — placeholder contextuel + complétion `@chemin`. Cf. **§2.8** / §5 n°**19**. |
| ✅ P2 | **Sticky — dernier message utilisateur** | Bandeau `#user-prompt-sticky` au-dessus du composer : dernière demande envoyée (texte tronqué + méta refs/images), clic → scroll + surbrillance dans le fil. Cf. **§2.24** et §5 n°**31**. |
| ✅ P2 | **Smart paste / paste-as-reference** | Livré (extension + webview) : tracker `PasteCandidateTracker` côté extension (sélections éditeur, hash FNV-1a 32-bit), poussée proactive `pasteCandidate` vers la webview, matching `paste` DOM par hash, chip `.paste-chip` cliquable (ouvre la source à la plage), envoi `pastes[]` dans le payload `send`, bloc `[Smart paste]` attaché au prompt côté `chatView.ts` (inliné si ≤ 50 l. / ≤ 8 000 ch., sinon référence + invitation à `file_read`). Cf. §2.9. **Reste** : terminal en V2 (nécessite shell integration). |
| ✅ P2 | **Phases UI agent (style Cursor)** | Livré par **Sprints A / A.2 / A.3 / A.5** (cf. §5 items 10 → 11) : protocole `[phase: …]` côté modèle, `AgentEvent::PhaseEnter`, blocs `.phase-block` collapsibles côté webview, `PHASE_META`, gate `answering`-before-`done`, persistance des phases passées ouvertes. §2.10 conservé comme contexte historique + piste sous-agents (P3). |
| ✅ P1 | **Cycles de session & mémoire longue** | **Partiellement livré** (2026) — Extension : **`LongMemoryStore`** (`extension-vscode/src/longMemoryStore.ts`, JSON versionné sous `globalStorageUri`, pas SQLite en V1), **`embeddings.ts`**, indexation des segments issus de la **compaction live** (`ContextCompacted` / notifications client), outil client **`session_search`** (embedding + score lexical). **Fin de cycle** : slash **`/session_end`** (pré-compact si besoin, écriture **`session_closure`**, `closeSession`, **nouveau transcript** / chat vierge) — le tool moteur **`session_end` n’est pas exposé au schéma Ollama** (clôture **utilisateur**, pas invocation modèle). **Reste (aligné §2.16.1 « strict »)** : SQLite optionnelle, modèle d’embed **ONNX / Transformers.js** si on dépasse l’embed actuel, polish §2.16.4 (au revoir / UX). **Plus tard** : endpoints embed custom, commit Git, graphe 2D / stats. Cf. **§2.16** + §5 n°24. |
| ✅ P1 [REF-LEAK ~] | **Phase `testing` — vérifier son propre code** | **Livré (V1, 2026-05-19)** — `Phase::Testing`, gate `done` si mutation code sans `[phase: testing]`, carve-out `.md`/assets, prompt + `PHASE_META`. Cf. **§2.11** / §5 n°**12**. |
| ✅ P1 [REF-LEAK ~] | **Phase `analyzing` — analyse efficace du workspace** | **Livré (V1, 2026-05-19)** — `Phase::Analyzing`, playbook prompt §2.18, `PHASE_META` « Analyse du dépôt », nudge moteur si intention analyse + ≥2 outils explore sans marqueur. Cf. **§2.18** / §5 n°**12a**. |
| ✅ P1 | **Carte structure workspace (mémoire de navigation)** | **Livré (V1, 2026-05-19)** — `.drox/workspace-map.json`, `workspace_map_read` / `workspace_map_note`, miroir `glob`/`file_read`/`lsp`, injection `[Workspace map]`. Suivi : empreinte `git HEAD`, tests E2E run 2. Cf. **§2.23** / §5 n°**30**. |
| ✅ P1 [REF-LEAK ~] | **Fidélité objectif — auto-vérification des décisions** | **Livré (V1 partielle, 2026-05-19)** — `runObjective.ts`, `scope_defer`, sticky `#run-objective-sticky`, rappel soft avant `done`. **Backlog** : checklist gate (B), budget exploration (D), auto-vérification LLM (E). Cf. **§2.25** / §5 n°**32**. |
| ✅ P3 [REF-LEAK] | **Workers / sous-agents (optionnel)** | **Livré (V1 partielle, 2026-05-19)** — tool `task` (Explore read-only), `EngineSubagentExecutor`, **désactivé par défaut** (`drox.subagents.enabled`). Paramètres : `maxIterations`, `maxConcurrent`. **Backlog** : types d'agents multiples, parallèle réel multi-modèle, sandbox. Cf. **§2.10** / §5 n°**20**. |
| ✅ P1 | **Message en attente pendant un run** | **Livré (2026)** — file FIFO webview : pendant un run, **Send / Entrée** met en file ; chaque message s’affiche **tronqué au-dessus du textarea** avec **Modifier** / **Retirer** ; dépile sur `state: busy=false` ; bouton **Stop** séparé. Cf. §2.14. |
| ✅ P2 | **Erreurs éditeur → chat (« Passer au modèle »)** | Code action + commande `drox.addDiagnosticToChat` ; préremplit le composer (`prefillPrompt`) sans envoi. Survol optionnel (`drox.addDiagnosticOnHover`). Cf. §2.19 / §5 n°26. |
| P1 (régression) | **Mode « Professeur » — enforcement** | **Code M1–M3 présent** mais **comportement non conforme** en usage réel : l'agent modifie le dépôt sans plan de cours ni phase pédagogique (ex. « texte page d'accueil » → `file_edit` direct). Cf. **§2.15** + **§2.22**. |
| ✅ P1 [REF-LEAK] | **Bash classifier complet** (`drox-bash`) | **Livré (V1)** — classifieur branché sur `PermissionPolicy` : auto-allow reads (`ls`, `git status`), auto-deny motifs destructifs, compound `&&`/pipes. Cf. **§2.27** / §5 n°**33**. **Backlog** : tree-sitter AST complet. |
| ✅ P2 [REF-LEAK] | **Tools MCP au registre agent** | **Livré (clos)** — `McpHub`, stubs `mcp__*`, resources, fallback `mcp_call`. Cf. **§2.28** / §5 n°**34**. Hors `cloudMcp`. Suivi : toggle §2.17, compaction MCP. |
| ✅ P2 [REF-LEAK] | **Orchestration tools (reads //, writes série)** | **Livré (V1, 2026-05-15)** — `partition_tool_calls`, lots parallèles read-only (`buffer_unordered`), mutations série ; ordre `tool_result` préservé. Cf. **§2.29** / §5 n°**35**. |
| ✅ P2 [REF-LEAK] | **Règles permissions fichier** | **Livré (V1, 2026-05-15)** — `drox-permissions/` ; `settings.local.json` chargé au run (2026-05-19) ; `copy_path` sous règles `file_edit`. Cf. **§2.30** / §5 n°**36**. |
| ✅ P2 [REF-LEAK ~] | **Tool `delete_path`** | **Livré (V1, 2026-05-15)** — garde-fous leak, `recursive?`, permissions chemins. Cf. **§2.33** / §5 n°**39**. |
| ✅ P3 [REF-LEAK] | **Skills — prompts réutilisables locaux** | **Livré (V1, 2026-05-15)** — `.drox/skills/<name>/SKILL.md`, listing injecté, `skill_read` / `skill_list`. Cf. **§2.31** / §5 n°**37**. |
| ✅ P3 [REF-LEAK] | **Git worktrees** | **Livré (V1, 2026-05-15)** — `git_worktree_enter` / `git_worktree_exit`, `.drox/worktrees/`. Cf. **§2.32** / §5 n°**38**. |
| ✅ **P0** | **`.droxignore` — chemins interdits au modèle (obligation moteur)** | **Livré (V1, 2026-05-19)** — `drox-session/drox_ignore.rs`, injection CLI + `ToolContext` ; filtre `glob` (post-match + `droxignore_omitted`), `grep` walk, refus `file_read`/`notebook_edit`, scan carte §2.23. **Hors V1** : garde `lsp` côté extension, refactor `glob` → `WalkBuilder` unifié. Cf. **§2.34** / §5 n°**40**. |

Référence historique du noyau TS leak : arborescence `src/tools/`, `src/services/`, `src/commands/`. **Matrice COEUR / backlog / NOISE** : **§2.26** + `docs/INVENTAIRE-NOYAU-MOTEUR.md`. Items qui **exigent de garder ce code TS à côté** pendant l’implémentation : marqueur **`[REF-LEAK]`** — voir **§2.26.0** (registre complet).

---

## 2. Détail par item (périmètre technique Drox)

### 2.0 Inventaire moteur — ✅ déjà fait

Liste synthétique des capacités **déjà implémentées** dans les crates Rust et le protocole JSON-RPC (`drox` / workspace). **✅** = présent dans le dépôt ; sert de **checklist features moteur** sans relire §1 ni §5. Les items **uniquement extension ou webview** (slash commands, smart paste UI, carte Questions, pastille `ctx`…) sont rappelés en fin de section avec renvoi.

#### Protocole JSON-RPC (`drox-cli`, stdio NDJSON)
- ✅ `initialize` — version protocole, capabilities (`sessions`, `interactive_ask`, outils exécutables côté client négociés).
- ✅ `agent.run` — run asynchrone, notifications `agent/event`, clôture `agent/done` (`completed` \| `cancelled` \| `error`).
- ✅ `agent.cancel` — annulation du run actif.
- ✅ `session.list` — sessions `ses_*.jsonl` (id, taille, date).
- ✅ `session.read` — messages transcript + champ optionnel **`uiStats`** (fichier auxiliaire `ses_*.ui-stats.json` : cumuls ↑↓ / dernier ctx, aligné barre statut).
- ✅ `session.compact` — compaction LLM sur transcript **hors** boucle agent (`summarize_run` + `COMPACTION_PROMPT`).
- ✅ `shutdown` — arrêt propre du serveur.
- ✅ Requêtes **serveur → client** : `tool/exec` (délégation tools hybrides), `user/ask` (questions bloquantes, file multi-Q).

#### Boucle agent (`drox-engine`)
- ✅ Itération LLM + exécution tools + persistance transcript append-only (`drox-session` / `ChatMessageRecord`).
- ✅ **Phases** — marqueurs `[phase: …]`, `PhaseLineBuffer`, `AgentEvent::{PhaseEnter, PhaseClose}`, enum `Phase` (dont `internal_reasoning`, `answering`, `done`, …).
- ✅ **Clôture** — règle *done-driven* + nudges (`NUDGE_PROMPT`, `MISSING_ANSWERING_PROMPT`, `DONE_ONLY_NUDGE_PROMPT`, `unfinished_todos_prompt`, …).
- ✅ **Gate `todo_write`** — refus `[phase: done]` tant qu’items `pending` / `in_progress` ; **`TODO_RECREATION_BLOCKED`** si nouvelle liste `todo_write` après plan entièrement `completed` sans conserver les ids précédents (anti « second plan »).
- ✅ **`LoopDetector`** — anti-boucle deux strikes (`EngineError::LoopDetected`).
- ✅ **Contexte** — `ContextPolicy` + comptage `drox-context`, **`ContextSnip`** (troncature gros `tool_result`), **`ContextCompacted`** + compaction live `try_live_compact` / `summarize_run`.
- ✅ **Mémoire M1** — `MemoryTracker`, `persist_run`, événement **`MemoryPersisted`** ; injection listing sessions dans le system prompt au démarrage du run.
- ✅ **Permissions** — `drox-permissions` (modes, règles allow/ask/deny, glob chemins fichier, shadowed rules, `settings.local.json`, bash classifier §2.27). Cf. **§2.30**.
- ✅ **Carte workspace** — `drox-session::workspace_map`, tools `workspace_map_read` / `workspace_map_note`, miroir post-tool. Cf. **§2.23**.
- ✅ **Fidélité objectif (V1)** — `scope_defer`, injection `run_objective`, events `RunObjective` / `ScopeParkingUpdate` (extension). Cf. **§2.25**.
- ✅ **`.droxignore`** — `DroxIgnoreMatcher`, filtre lectures agent. Cf. **§2.34**.

#### Client LLM (`drox-llm`)
- ✅ Streaming `/api/chat`, tool calls natifs Ollama.
- ✅ **`StopReason::MaxTokens`** — continuation automatique du tour.
- ✅ **Multimodal** — sérialisation `images[]` + `Content::Image` côté types.
- ✅ Options : `num_ctx`, `num_predict`, sampling (`top_p`, `top_k`, `repeat_penalty`, `seed`, `min_p`, pénalités présence/fréquence, …) — câblage settings + env `DROX_*` côté CLI.
- ✅ **`keep_alive`** — champ top-level du payload Ollama (test dédié).
- ✅ **Raisonnement natif** — flux *thinking* mappé vers phases / événements quand le serveur l’expose.

#### Tools — registre par défaut (`drox-tools::ToolRegistry::with_simple_tools`)
- ✅ `file_read`, `file_write`, **`file_edit`** (unicité `old_string` / `replace_all`, limite taille ; **aliases** serde / JSON : `old`/`new`, `file_path`, …).
- ✅ `grep`, **`glob`** (fichiers **et** répertoires, plafond `MAX_ENTRIES`, `truncated`).
- ✅ `web_fetch`, **`web_search`** (DuckDuckGo HTML, bornes timeout / résultats).
- ✅ **`bash`**, **`lsp`** (impl. serveur = stub `Remote` ; exécution réelle côté client VS Code).
- ✅ **`notebook_edit`** — cellules `.ipynb` : modes `replace` (old/new, comme `file_edit`), `insert`, `delete` ; normalisation format leak plat ; exécution **client** VS Code (+ impl. Rust pour CLI direct).
- ✅ **`todo_write`** (validation schéma + **normalisation** payloads mal formés), **`course_plan_write`** (mode Professeur — Plan de cours), **`copy_path`**, **`delete_path`**, **`exit_plan_mode`**, **`ask_user_question`** (schéma mono + multi + `ask_many`).
- ✅ **`scope_defer`** — parking hors scope (§2.25) ; **`workspace_map_read`** / **`workspace_map_note`** (§2.23).
- ✅ **Skills** — `skill_read`, `skill_list` (§2.31) ; **git worktrees** — `git_worktree_enter` / `exit` (§2.32).
- ✅ **M1 mémoire session** — `session_note`, `memory_read`, `memory_list` (scope `.drox/memory/sessions/` ; `session_note` inerte si pas de `SessionNotesHandle`).
- ✅ **MCP** — stubs `mcp__<server>__<tool>` (découverte à `agent.run`), `list_mcp_resources`, `read_mcp_resource` ; `mcp_call` en secours si échec découverte (`McpHub` + `ToolContext::mcp_hub`).
- ✅ **Outils on/off** — filtre registre + settings `drox.tools.disabled` / `drox.tools.mcp.enabled` (§2.17 / §5 n°25).
- ✅ **Bash classifier** — `drox-bash` → `PermissionPolicy::evaluate_bash_segment` (auto-allow lecture, auto-deny destructif, messages explicites). Cf. **§2.27**.

#### Persistance & session fichiers (`drox-session`)
- ✅ Chemins `transcript_path`, **`session_ui_stats_path`**, `default_sessions_dir`.
- ✅ **`read_transcript`** / **`JsonlTranscriptSink`** (JSONL schéma versionné).
- ✅ **`SessionUiStats`** — `read_session_ui_stats` / `write_session_ui_stats` (écriture atomique).
- ✅ **`memdir`** — chargement `MEMORY.md` / `DROX.md` ; **`memory_sessions`** (listing + écriture résumés `.drox/memory/sessions/*.md`).

#### Contexte & types (`drox-context`, `drox-types`)
- ✅ Compteurs tokens (`RoughTokenCounter`, `TiktokenCounter`) pour budget / snip / compaction.
- ✅ Messages / `Content` (texte, image, `tool_use`, `tool_result`), `Usage`, ids tools.

#### Hors périmètre « moteur Rust » (rappel — ✅ côté produit, autre couche)
- ✅ Slash commands webview + handlers `chatView.ts` — §2.3 ; compaction manuelle **`/compact`** = appel `session.compact` ; fin de session / mémoire longue **`/session_end`** (cf. §2.16).
- ✅ Smart paste éditeur, carte **Questions**, pastille **ctx** / **usage** UI, ouverture auto fichiers modifiés — extension + `chat.js` ; ils **consomment** le moteur mais ne sont pas listés comme crates ci-dessus. Voir §2.7 (affichage ctx), §2.9, §2.13, §5 n°7–8, 13, 16, 21.
- ✅ **Mémoire longue V1 (extension)** — `LongMemoryStore` + `session_search` + `/session_end` / `closeSession`, ingestion des résumés de compaction côté client (cf. §2.16). Distinct de la **M1** `.drox/memory/sessions/*.md` (§2.2 B).

### 2.1 WebSearchTool — **LIVRÉ**

- **But** : requête en langage naturel → liste de résultats (titre, URL, extrait), pas seulement le contenu d’une URL déjà connue.
- **État actuel** : tool `web_search` enregistré dans la registry par défaut, provider **`DuckDuckGo HTML`** (zéro clé, zéro setup). Marqué **read-only** côté permissions (auto-allow en mode `default`).
- **Schéma input** : `{ "query": string, "max_results"?: number (1..=25, défaut 10) }`.
- **Schéma output** : `{ query, provider, result_count, total_parsed, truncated, results: [{ title, url, snippet }] }`.
- **Implémentation** : POST `https://html.duckduckgo.com/html/` avec User-Agent navigateur, parsing `scraper` tolérant (plusieurs sélecteurs candidats), décodage du redirect `uddg=` pour exposer l'URL d'origine au modèle.
- **Bornes** : timeout 15 s ; snippet tronqué à 500 caractères ; max 25 résultats.
- **Prochaines évolutions possibles** (sprint ultérieur si besoin) :
  - Provider alternatif Brave / Tavily derrière `DROX_WEB_SEARCH_PROVIDER` + clé via setting / `.env`.
  - Cache mémoire courte durée (LRU) pour les recherches identiques dans une session.
  - Fallback automatique si DDG renvoie 0 résultat (changement de CSS).

### 2.2 Mémoire (trois couches, architecture unifiée)

**A — Existant : `MEMORY.md` / `DROX.md` (mémoire stable projet)**

- `MEMORY.md` / `DROX.md` à la racine du workspace, injectés dans le system prompt (voir `drox-session` / `memdir`).
- Améliorations possibles : extraction auto de faits durables (inspiré `extractMemories` du leak TS). Les commandes `/memory` et `/init` sont livrées via slash commands (§2.3).

**B — ✅ Livré (Sprint M1) : `.drox/memory/sessions/` (compaction = mémoire)**

Architecture unifiée : **un seul artefact** (le résumé de compaction) sert à la fois (1) à raccourcir le contexte d'un long run et (2) à persister pour les sessions futures. Pas de tool `memory_write` distinct : la persistance est **automatique** à la fermeture d'un run non trivial.

- **Fichiers** `.drox/memory/sessions/YYYY-MM-DD-<slug>.md` (slug = ASCII court, dédup `_2` si collision même jour).
- **Format** : front-matter YAML simplifié (`slug`, `objective`, `date`, `model`, `files_touched`) + corps markdown structuré (`## Objective` / `## Decisions` / `## Files touched` / `## What's in progress` / `## Pinned notes`).
- **Production** : à `[phase: done]` accepté + run **non trivial** (≥ 1 `file_edit`/`file_write`/`bash` réussi, OU ≥ 1 `todo_write` réussi, OU ≥ 1 `session_note` réussi). Run purement conversationnel (« salut », « merci ») → rien n'est écrit.
- **Tour LLM dédié** : nouveau prompt `COMPACTION_PROMPT` (anglais, sections H2 strictes), température basse (0.1), `max_tokens` ~1200. Aucun tool exposé au modèle de compaction → résumé pur.
- **Lecture** : listing court (slug + objectif 1 ligne, ≤ 10 entrées) injecté en début de system prompt à chaque run. Tools `memory_read { slug }` / `memory_list { limit? }` pour recharger en détail.
- **Tool `session_note { content ≤ 500 chars }`** : épingle pendant le run une décision / hypothèse / TODO que le modèle veut voir survivre. Stockage RAM (`SessionNotesHandle`), draîné par la compaction et concaténé au résumé. Aucune écriture filesystem directe.
- **UI** : chip discret `◌ Session archivée : <slug> — <objectif>  (ouvrir)` dans le fil de chat après le dernier `[phase: answering]`, cliquable pour ouvrir le `.md`. Event `AgentEvent::MemoryPersisted { slug, path, objective, usage }`.

**C — Compaction live (M2) : pipeline livré, efficacité à refaire**

`try_live_compact` / `summarize_run` sont branchés (seuil `autocompact`, `/compact`), mais le **gain réel sur le budget contexte est négligeable** en usage long (cf. §2.7). Le pipeline M1 (prompt, format, parsing) reste la base ; il faut surtout **réduire ce qui reste dans l’historique** après compaction, pas seulement produire un résumé markdown.

### 2.3 Slash commands (parseur webview) — **LIVRÉ**

- **Webview** (`extension-vscode/media/chat.js`) : une ligne utilisateur trimée qui commence par `/` + nom de commande ; pas de corps multi-lignes (sinon envoi message normal). Pièces jointes / références / smart paste interdits avec une slash command sauf `/clear` et `/new` (reset local puis envoi). `vscode.postMessage({ type: "slash", command, args })` ou `slashInvalid` si validation échoue.
- **Extension** (`chatView.ts`) : `/help` / `/?`, `/clear` / `/new` → `startNewChat` + message système ; `/model` / `/model <id>` → lecture ou `drox.model` workspace ; `/init` → `.drox` + `MEMORY.md` + `DROX.md` si absents ; `/memory` → ouverture / création `MEMORY.md` ; `/compact` → `session.compact` avec barre de progression VS Code (transcript non vide, `ses_*` courant).
- **JSON-RPC** : méthode `session.compact` (`SessionCompactParams` / `SessionCompactResult`), même pipeline `summarize_run` + `COMPACTION_PROMPT` que la compaction M1, sans `agent.run`. Table `jsonrpc/mod.rs` + dispatch `server.rs`.
- **Client** : `DroxRpcClient.sessionCompact`.

| Commande | Comportement livré |
|----------|---------------------|
| `/help`, `/?` | Liste des commandes (message système). |
| `/clear`, `/new` | Nouvelle discussion (`startNewChat` + reset UI webview). |
| `/compact` | `session.compact` sur le transcript de la session courante (LLM dédié ; erreur si transcript vide). |
| `/model`, `/model <id>` | Affichage ou mise à jour workspace de `drox.model`. |
| `/init` | Création `.drox`, `MEMORY.md`, `DROX.md` si manquants. |
| `/memory` | Ouverture `MEMORY.md` (fichier minimal créé si absent). |

### 2.4 NotebookEditTool — **LIVRÉ**

> Référence leak (modes insert/delete/replace) : `src/tools/NotebookEditTool/NotebookEditTool.ts` — cf. §2.26.0.

- **Tool** : `notebook_edit` — schéma + permissions Rust (`drox-tools/src/simple/notebook_edit.rs`) ; **exécution réelle** côté extension (`extension-vscode/src/tools/notebookEdit.ts`) via `tool/exec`, comme `file_edit` / `file_write`.
- **Modes** (par entrée dans `edits[]`, index 0-based, appliqués **dans l’ordre**) :
  - **`replace`** (défaut) — `old_string` → `new_string` dans la `source` de la cellule (règles `file_edit`). `old_string` vide = remplacement intégral de la source. Cellules **code** : reset `execution_count` + `outputs` après replace (aligné leak).
  - **`insert`** — insère une cellule à `cell_index` (`new_string`, `cell_type` : `code` | `markdown`).
  - **`delete`** — supprime la cellule à `cell_index`.
- **Normalisation** : payloads leak plats (`notebook_path`, `new_source`, `cell_number`, `edit_mode`) et alias (`old`/`new`, `file_path`) → schéma canonique `{ path, edits: [...] }`.
- **Limites** : `.ipynb` uniquement, 512 KiB max, `plan_mode` → refus.
- **Tests** : `cargo test -p drox-tools notebook_edit` (6 tests : replace string/array source, insert, delete, normalize leak, extension `.ipynb`).

### 2.5 LSPTool — **LIVRÉ**

- **But** : recherche **sémantique** (par symbole) plutôt que textuelle (`grep`), via les language servers configurés par VS Code (rust-analyzer, tsserver, pyright…).
- **Architecture** : tool **hybride**. Schéma + permissions vivent dans `drox-tools` (`simple/lsp.rs`) ; l'exécution réelle est déléguée à l'extension VS Code (`extension-vscode/src/tools/lsp.ts`) via `RemoteTool` (le moteur ne contient qu'un stub renvoyant `ToolError::Remote`).
- **Opérations exposées** (un seul tool `lsp` avec champ `op`) :
  - `diagnostics` — erreurs / warnings d'un fichier ou de tout le workspace (`vscode.languages.getDiagnostics`).
  - `workspace_symbol` — recherche un symbole par nom (`vscode.executeWorkspaceSymbolProvider`, équivalent `Ctrl+T`).
  - `definition` — `vscode.executeDefinitionProvider`.
  - `references` — `vscode.executeReferenceProvider`.
  - `hover` — `vscode.executeHoverProvider`.
- **Schéma input** : `{ op, path?, position? { line, character } (0-indexé LSP), symbol?, query?, max_results? }`. Pour `definition`/`references`/`hover`, le modèle peut fournir soit `position`, soit `symbol` (résolu côté client par regex `\bsymbol\b` dans le fichier ouvert via `openTextDocument`).
- **Bornes** : `max_results` plafonné à 500 (défaut 50). Texte de hover tronqué à 4 000 caractères.
- **Permissions** : marqué **read-only** dans `drox-engine::permissions` → auto-allow en mode `default`.
- **UI** : libellé court par `op` dans `toolEventPreview.ts` (`LSP diagnostics`, `LSP definition`, etc.).
- **Limitation connue** : si le language server du fichier n'est pas encore prêt (rust-analyzer indexant un gros workspace), `diagnostics` peut renvoyer vide. Un `hint` est renvoyé dans ce cas pour aider le modèle à réagir.
- **Pas inclus en V1** (à planifier si besoin) : `code_action` / quick-fixes, `rename`, `signature_help`, `document_symbol` (déjà couvert partiellement par `workspace_symbol`).

### 2.6 Hooks pre/post tool

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK]`** — sémantique exit codes : `src/services/tools/toolHooks.ts`, `src/utils/hooks/` (logique shell, pas UI Ink).

- **Livré** :
  - Crate **`drox-hooks`** : config `<workspace>/.drox/hooks.json` (+ fusion optionnelle `~/.drox/hooks.json`).
  - Événements **`PreToolUse`** / **`PostToolUse`** ; type **`command`** uniquement (V1).
  - Matchers : nom d'outil exact, glob (`file_*`, `*`), filtre `if` simplifié (`Bash(git *)`, …).
  - Exit codes leak : `0` = OK ; `2` = bloquant (Pre → refuse le tool ; Post → stderr au modèle) ; autre = log warning.
  - **Sécurité** : timeout configurable (défaut 60 s), `settings.allowed_commands` (allowlist 1er token).
  - Branchement moteur : pre/post sur la branche **série** des tools (`drox-engine/src/agent.rs`), sortie Post appendue au `tool_result`.
- **Hors périmètre V1** : hooks `prompt` / `http` / `agent`, `PostToolUseFailure`, hooks async, UI de configuration.

### 2.7 Compaction proactive (gestionnaire de contexte)

> **Statut** : **livré V2 efficacité** (2026-05-15) — microcompact + tail bornée + checkpoint court + boucle.  
> **Historique** : V1 pipeline OK mais summarize ~1 % de gain (`57k→56k`) ; corrigé par les pistes ci-dessous.

#### Problème efficacité (constat)

- Après un tour **`summarize_run`** (live ou `/compact`), la pastille **`ctx`** peut rester **quasi identique** — ex. **~57k → ~56k tokens** : la compaction **s’exécute** mais ne **libère** presque pas de fenêtre utilisable.
- Symptôme utilisateur : saturation `num_ctx` malgré autocompact ; le modèle continue avec un historique aussi lourd qu’avant le résumé.

#### Causes probables (audit code actuel)

| Zone | Fichier / constante | Effet |
|------|---------------------|--------|
| Queue conservée | `LIVE_COMPACT_TAIL_KEEP_MESSAGES = 8` (`compaction.rs`) | Les **8 derniers** messages (souvent gros `tool_result` + assistant) peuvent représenter **la majorité** des tokens — le préfixe résumé est remplacé, pas la queue. |
| Checkpoint injecté | `try_live_compact` → `Message::system` avec **corps = résumé LLM complet** | `max_summary_tokens` ~1200 + modèle verbeux → le checkpoint peut être **aussi volumineux** qu’un condensé intermédiaire ; en plus du **system prompt** initial inchangé. |
| Entrée summarize | `condense_messages_for_summary` | Rejoue **tout** le préfixe ligne à ligne (`tool_result` tronqués à **800 car.** seulement) — le tour de résumé **coûte** cher et n’implique pas une réduction proportionnelle de l’historique final. |
| Snip seul | `ContextSnip` (`drox-context`) | Passe **avant** compact ; libère souvent peu si les gros blocs sont déjà sous le seuil snip ou dans la **queue tail**. |
| Une passe | `try_live_compact` | **Un seul** summarize par déclenchement — pas de boucle « tant que `ctx` > seuil cible ». |
| Métrique UI | pastille `ctx` = `usage.inputTokens` Ollama vs `RoughTokenCounter` moteur | Écart possible, mais n’explique pas à lui seul un delta **1k** sur **57k** : le problème est surtout **structurel** (tail + checkpoint). |

#### Livré V2 (2026-05-15)

| Composant | Implémentation |
|-----------|----------------|
| Microcompact | `drox-context/src/microcompact.rs` — vide les anciens `tool_result` (`[Old tool result content cleared]`), garde les 3 derniers outils compactables |
| Snip agressif | `ContextPolicy::maybe_snip_aggressive` pendant la boucle |
| Queue tail | `LIVE_COMPACT_TAIL_KEEP_MESSAGES = 4`, plafond **20 %** fenêtre effective (`LIVE_COMPACT_MAX_TAIL_RATIO`) |
| Checkpoint court | `format_compact_checkpoint` ≤ 3000 car. (Objective / Decisions / Files) |
| Boucle | `compact_until_budget` — jusqu’à 3 passes (microcompact → snip → summarize) |
| Condensé summarize | `tool_result` tronqués à **300** car. pour le tour live |

#### Pistes restantes (optionnel)

**`[REF-LEAK]`** — `src/services/compact/{microCompact,reactiveCompact,apiMicrocompact}.ts` : le leak **vide / remplace** les anciens `tool_result` des outils compactables **avant** ou **à la place** d’un gros résumé unique.

1. **P0 — Microcompact Rust** (avant ou en parallèle du summarize live)  
   - Remplacer le contenu des `tool_result` **anciens** (read/bash/grep/glob/edit/write/web) par un placeholder court type `[Old tool result content cleared]` (cf. leak `TIME_BASED_MC_CLEARED_MESSAGE`).  
   - Cible : **−30 à −70 %** tokens sans appel LLM supplémentaire.

2. **P0 — Queue tail adaptative**  
   - Réduire `LIVE_COMPACT_TAIL_KEEP_MESSAGES` (ex. 4) **ou** borner la queue en **tokens** (garder N messages **tant que** `tail_tokens ≤ X %` de `num_ctx`).  
   - Snip agressif **dans** la queue avant de conclure qu’on ne peut plus compacter.

3. **P0 — Checkpoint compact**  
   - Ne pas injecter le markdown brut du modèle tel quel : extraire **Objective + décisions + fichiers + todos** (sections déjà parsées dans `extract_metadata`) ; plafond dur (ex. **≤ 400–600 tokens**).  
   - Option : **deux messages** — checkpoint court + lien « détail en mémoire session » si persistance M1.

4. **P1 — Boucle de compaction**  
   - Tant que `count_tokens(messages) > autocompact_threshold` : microcompact → snip → `try_live_compact` (max **2–3** passes) avec garde-fou temps/coût.

5. **P1 — Entrée summarize plus agressive**  
   - Condensé pour le LLM de compaction : drop phases verbeuses, fusionner tours tool_read redondants, tronquer à **200–400 car.** les `tool_result` dans le **payload de résumé** (distinct du transcript conservé après microcompact).

6. **P2 — Critère de succès testable**  
   - Test d’intégration : historique synthétique ~50k tokens → après compact, `tokens_after ≤ 0,5 × tokens_before` (ou ≤ 35 % de `num_ctx`).  
   - Event `ContextCompacted` : exposer `tokens_before` / `tokens_after` à l’UI (déjà partiellement dans `LiveCompactReport`) pour afficher le **gain réel**.

#### Déjà en place (ne pas re-livrer)

- **Snip + fin de run** : `ContextSnip` + compaction M1 à la clôture (cf. §2.2 B).
- **Live (M2)** : `maybe_snip` → `try_live_compact` → `summarize_run`, checkpoint `system`, queue K messages, `AgentEvent::ContextCompacted`, pastille **ctx** (§2.3 `/compact` manuel).
- **Tests actuels** : déclenchement et split (`live_compaction_emits_context_compacted_when_over_budget`, `choose_live_compact_split_idx`) — **pas** de test sur **ratio** de réduction.
- **Manuel** : `/compact` ; coût LLM = un tour summarize (souvent plusieurs secondes en local).

### 2.8 Placeholder / complétion (`usePromptInputPlaceholder`)

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK ~]`** — `src/components/PromptInput/usePromptInputPlaceholder.ts`, `useTypeahead.tsx`, `directoryCompletion.ts`. Cf. §2.26.0.

- **Livré** :
  - **Placeholder contextuel** dans la webview (`chat.js`) : première question, file d'attente, références actives, défaut `@ fichier`.
  - **Complétion `@chemin`** : panneau `#prompt-suggestions` sous le textarea ; RPC `pathComplete` → `promptCompletion.ts` (scan `readDirectory` workspace, max 12 entrées, masque `node_modules`/`.git` sauf filtre explicite).
  - Navigation clavier : ↑/↓, Tab/Entrée pour accepter, Esc pour fermer ; Entrée n'envoie pas tant que la liste est ouverte.
- **Hors périmètre V1** : ghost text proactif leak, slash commands dans le typeahead, skills MCP, historique shell, `#channel` Slack.
- **Articulation** : complète la vue **Références** (chips drag) — `@` insère un chemin dans le texte du prompt.

### 2.9 Smart paste / paste-as-reference — **LIVRÉ (éditeur)**

> **État** : la V1 « éditeur » est livrée (extension + webview). Le terminal reste différé en V2 (shell integration requise).

- **Implémentation V1 (livré)** :
  - **Tracker extension** — `extension-vscode/src/pasteCandidates.ts` : `PasteCandidateTracker` s'abonne à `vscode.window.onDidChangeTextEditorSelection`, capture les sélections **non vides** (max 200 000 caractères, scheme `file`), calcule un **hash FNV-1a 32-bit** sur le texte normalisé (CRLF→LF, sans BOM), maintient une LRU de 10 entrées, et émet un événement `onDidUpdate` par candidat.
  - **Bridge** — `extension.ts` instancie le tracker (Disposable), le passe au `DroxChatViewProvider`. Le provider écoute `onDidUpdate` et pousse `pasteCandidate { candidate }` à la webview ; il appelle `resync()` à l'attachement de la vue pour ne pas perdre les sélections antérieures.
  - **Webview** — `extension-vscode/media/chat.js` cache localement les candidats par token (cap 10), implémente la **même** fonction `fnv1a32` (déterministe entre les deux côtés). Le listener `paste` existant (image) est étendu : si le presse-papier contient du texte qui matche un token connu → `preventDefault`, on ajoute une **chip smart-paste** à la barre `#refs`. Texte intégral conservé côté webview jusqu'au `send`.
  - **UI** — chip `.paste-chip` (style dérivé de `.ref-chip` dans `chat.css`) : icône document, **label cliquable** `<basename(parent)/file> (start-end)` qui poste `openPasteSource` à l'extension (révèle le fichier à la plage), bouton ✕ pour retirer.
  - **Send** — `doSend()` joint `pastes: PasteAttachmentPayload[]` au message `send`. Côté `chatView.ts`, `handleSend` appelle `formatPastesForPrompt` qui choisit entre :
    - **inliné** (`lineCount ≤ 50` et `text.length ≤ 8 000`) → bloc ` ```languageId:start-end:rel/path \n <texte> \n``` ` ;
    - **référence** (sinon) → mention `Smart paste (référence) — chemin (start-end)` avec invitation explicite à utiliser `file_read`.
    Bloc concaténé au prompt sous l'en-tête `[Smart paste — extraits sélectionnés par l'utilisateur]`, juste avant les éventuelles `[Références utilisateur]`.
  - **Reset** — `chatReset` (nouvelle conversation / `/new` / `loadSession`) vide les chips ET le cache de candidats côté webview.
  - **Comportement non-match** — texte non reconnu (snippet web, paste manuel) → comportement natif du `<textarea>` (insertion en clair) inchangé. Pas de faux positif possible : le hash exige une **égalité stricte** sur le texte normalisé.

- **But UX** : reproduire le comportement de Cursor — quand l'utilisateur colle du code depuis un éditeur ouvert ou un extrait depuis le terminal dans le composer, on transforme automatiquement le paste en **chip compact** (`fichier.rs (12-30)`, `powershell (11-12)`) au lieu d'inliner 200 lignes de texte brut. Avantages : prompt plus lisible, économie de place, et le modèle reçoit une **référence localisable** plutôt qu'un blob anonyme.
- **Comportement attendu** :
  - Paste depuis un éditeur du workspace → chip `<rel-path> (<startLine>-<endLine>)`. Au moment de l'envoi, l'extension peut soit inclure le contenu en bloc collapsé (` ```rust:12-30:rel/path ... ``` `), soit juste fournir le chemin + plage et laisser le modèle `file_read` lui-même. Compromis : pour les petits extraits (< 50 lignes) on attache ; pour les gros, juste la référence.
  - Paste depuis un terminal → chip `terminal/<shell> (<startLine>-<endLine>)`. Le contenu est attaché en bloc ```text car le terminal n'est pas re-lisable a posteriori.
  - Paste classique (texte hors éditeur, snippet web, etc.) → comportement actuel inchangé.
- **Pistes techniques** :
  - VS Code expose `DocumentPasteEditProvider` mais **uniquement pour les éditeurs**, pas pour les webviews. Côté webview Drox, l'événement `paste` DOM ne donne que `clipboardData.getData("text/plain")` — aucune métadonnée d'origine.
  - Solution pragmatique : la couche **extension** observe `vscode.window.activeTextEditor.selection` et `vscode.window.activeTerminal` en permanence, et expose à la webview une "dernière sélection candidate" (`{ kind: "editor", path, range, text } | { kind: "terminal", text }`). Quand le webview détecte un paste, il compare le texte collé avec cette sélection candidate ; en cas de match, il poste un message `pasteWithReference` à l'extension qui transforme le paste en chip.
  - Pour le terminal : nécessite la **shell integration** VS Code (depuis 1.78) ou `onDidWriteTerminalData` pour avoir un buffer. Sans ça, on peut au mieux savoir qu'un terminal est actif, pas son contenu exact.
- **UI** : nouveau type de chip à côté des chips "Références" existantes dans le composer (ligne `#refs`). Statut : `📄 src/foo.rs (12-30)` cliquable → ouvre le fichier à la plage indiquée. Bouton ✕ pour retirer.
- **Permissions / sécurité** : aucune action automatique, c'est juste de la représentation. Le contenu attaché est celui que l'utilisateur a explicitement copié.
- **À trancher** :
  - Seuil de "petit extrait attaché vs juste référence" (proposé : 50 lignes).
  - Cas où la sélection candidate ne correspond plus (l'utilisateur a copié il y a longtemps, a édité depuis) → fallback en paste classique.
  - Comportement quand plusieurs fichiers sont copiés successivement ; on cumule les chips ou on remplace ?

### 2.10 Phases UI (type Cursor) et workers / sous-agents avec Ollama

> **Phases UI** : livré côté Drox (pas de `[REF-LEAK]`). **Workers / sous-agents (P3)** : **`[REF-LEAK]`** — `src/tools/AgentTool/*`, `spawnMultiAgent.ts`. Cf. §2.26.0.

#### Ce que tu observes dans Cursor

- **« Thought for 1s »** (ou équivalent) : en général une **couche produit** — libellé affiché pendant que le modèle « réfléchit » (premier token pas encore streamé, ou canal de raisonnement / résumé interne selon le produit). Ce n’est pas forcément un second modèle ; souvent c’est du **temporisation + UX** autour d’un seul appel LLM ou d’une petite étape préalable.
- **Phases de lecture** : corrélées aux **vrais** appels d’outils ou d’API éditeur (`read_file`, diagnostics, etc.) — le client sait « maintenant on lit » car un tool *read* est en cours.
- **« Planning next move »** : peut être (a) un **todo / plan** explicite côté agent, (b) un résumé court produit par le modèle avant la prochaine série d’actions, ou (c) encore une fois un **label UX** sur la même boucle agent. L’important pour Drox : exposer **clairement** à l’utilisateur *où* on en est (outils en cours, todo, raisonnement court optionnel).

#### « Clones » / sous-agents : c’est lié à Ollama ou à l’app ?

- **C’est surtout une question d’architecture applicative**, pas de « magie Ollama ». Cursor (et le leak Claude Code TS) peuvent lancer des **sessions agent séparées** : autre contexte, autre prompt système, autre transcript — parfois en parallèle — puis **fusion** du résultat dans la conversation principale (résumé, fichier, message outil).
- **Avec Ollama en moteur : oui, c’est possible** : chaque sous-agent n’est qu’un **autre** enchaînement `POST /api/chat` (ou un autre process `drox` JSON-RPC) avec son propre prompt et son historique court. Ollama ne « sait » pas que c’est un clone ; c’est le **client Drox** qui orchestre.
- **Contraintes réelles avec Ollama local** :
  - **VRAM / RAM** : N requêtes en parallèle sur le **même** modèle chargé une fois → souvent **file d’attente** côté serveur Ollama (un seul decode GPU à la fois sur une carte), donc le parallélisme réel est limité ; le gain est surtout **pipeline** (préparer le prochain prompt pendant qu’un autre tour finit) ou **tâches CPU** (grep, fetch) déjà hors LLM.
  - **N modèles différents** ou **N instances** : possible si la machine a assez de mémoire ; sinon risque d’OOM ou de ralentissement sévère.
  - **Cohérence** : les sous-agents ne partagent pas la mémoire par défaut ; il faut un **contrat** (résumé max N tokens, chemins autorisés, pas d’écriture concurrente sur les mêmes fichiers sans verrou).

#### Piste Drox (découpage sprint)

1. ✅ **Court terme (P2)** — **livré par Sprint A / A.2 / A.3** : protocole `[phase: …]` côté modèle + `AgentEvent::PhaseEnter` + `PHASE_META` + `.phase-block` collapsibles dans la webview. Va plus loin que la simple barre de statut : chaque phase a son propre bloc dépliable avec son contenu streamé. Cf. §5 items 10 / 10b / 10c.
2. ✅ **Moyen terme (P3) — V1 livrée (2026-05-19)** — tool **`task`** (`subagent_type: explore`) : second `Agent::run` interne (read-only, `plan_mode`, registre réduit : `grep`/`glob`/`file_read`/`lsp`/web/`workspace_map_read`). Résultat = rapport texte JSON `report`. **Désactivé par défaut** : `drox.subagents.enabled` (extension) / `subagentsEnabled` (JSON-RPC). Plafonds : `drox.subagents.maxIterations`, `drox.subagents.maxConcurrent` (sémaphore). Code : `drox-tools/simple/task.rs`, `drox-engine/subagent.rs`.
3. **Parallèle (backlog)** : types d’agents supplémentaires (`generalPurpose`, `shell`, …), sandbox worktree dédié, modèle dédié petit/fast pour les sous-agents.
4. **Raisonnement natif (« thinking ») des modèles → phase `reasoning`** : plusieurs familles exposent une chaîne de pensée **hors** du texte assistant visible (ex. champs type `reasoning_content` / blocs *think*, **extended thinking** côté certains fournisseurs). **Ollama** : la présence et la forme de ce flux dépendent du **couple modèle + version du serveur** ; ce n’est pas garanti pour tous les tags sur le Hub. **Piste Drox** : quand le canal est stable et parsable dans `drox-llm`, le **mapper** à l’UI existante de la phase **`reasoning`** (éventuellement avec un libellé type « pensée interne » / durée), au lieu de compter uniquement sur le marqueur texte `[phase: reasoning]` dans `content` — moins de duplication, meilleure corrélation avec la latence avant le premier token visible. **Repli** : modèles sans canal dédié → comportement actuel (marqueurs + `PhaseLineBuffer`). **À trancher** : persistance dans le transcript JSONL (inclure le thinking vs option « UI seule » / réglage utilisateur) et matrice de tests sur 1–2 modèles « reasoning » réels.

### 2.11 Phase `testing` — vérification post-modification

> **Statut** : **livré (V1, 2026-05-19)** — `Phase::Testing`, gate moteur post-mutation code, carve-out extensions non-code, prompt + UI.  
> **`[REF-LEAK ~]`** — gates tools / prompt leak. Cf. §2.26.0.

- **But** : transformer la convention actuelle (« le modèle est libre de vérifier ou non ») en **gate dure** : si Drox a modifié du code (`file_edit` / `file_write` / mutation `bash`) dans le run, il doit **exécuter** une vérification concrète avant `[phase: answering]`. La phase `verifying` actuelle est trop large et trop souvent zappée ; on isole le **test exécuté** dans une phase dédiée.
- **Comportement attendu** :
  - Modèle annonce `[phase: testing]` puis appelle un outil **exécutant** quelque chose : `bash` (compile / lint / `cargo test` / `npm test` / `pytest` / `tsc --noEmit` / `cargo clippy` selon stack détectée), `lsp diagnostics`, ou re-lecture par `file_read` du fichier édité.
  - **Cas script temporaire** : si le projet n'a pas de framework de test pour le périmètre touché, le modèle a le droit de créer un script jetable (`./.drox/scratch/test_<slug>.sh` ou `tests/_drox_tmp_<slug>.py`), de l'exécuter, puis de le **supprimer** dans le même run. Convention : un dossier `.drox/scratch/` ignoré dans `.gitignore` (à ajouter automatiquement).
  - **Cas app interactive** : pour une app (web / desktop), `bash` lance la commande de build/run/lint pertinente sans démarrer un serveur long-vivant (`npm run build`, `cargo check`, `pnpm typecheck`, `vite build`, etc.). Démarrer un dev-server est OUT of scope (timeout / boucle).
- **Détection « le modèle a édité du code »** côté moteur :
  - Tracker `saw_mutating_tool_in_run: bool` (true dès qu'un `file_edit` / `file_write` réussit, ou qu'un `bash` est exécuté avec un sous-commande mutative — heuristique simple : `git commit`, `cargo fix`, `npm install`, etc.).
  - Si `saw_mutating_tool_in_run && !saw_testing_phase_in_run` au moment de `[phase: done]`, on **nudge** : message system du type « tu as modifié du code mais tu n'as pas exécuté de vérification — émets `[phase: testing]` + outil concret ».
  - Le tracker est complémentaire à la gate « todo clôturée » (Sprint A.5 ci-dessous) : on peut imaginer une todo « Vérifier le build » ajoutée automatiquement par le moteur (P3) si elle manque, mais en V1 c'est juste un nudge dur.
- **Outils impliqués** (déjà tous présents) : `bash`, `file_read`, `lsp` (diagnostics). Pas de nouveau tool à écrire.
- **Risques / limites** :
  - **Faux positifs** : `file_edit` sur un fichier `.md` ne mérite pas forcément un build. Carve-out : extensions notoirement « non-code » (`md`, `txt`, `json` de config simple, `gitignore`) sortent du tracker mutating. À configurer via setting `drox.testing.requireAfterEdit` (default `true`) et liste `drox.testing.ignoredExtensions`.
  - **Coût** : `cargo check` sur un gros workspace peut prendre 10-30 s ; il faut que la phase soit visible dans l'UI (label « Testing… » + spinner). Reprend le visuel `.phase-block` existant.
  - **Mode plan** : la phase `testing` n'a pas de sens en read-only ; le tracker reste inactif si l'agent est en mode `plan` (permissions y bloquent les mutations).
- **Sprint suggéré** : **A.6 — Phase `testing` post-mutation** (A.5 est déjà pris par la gate todo clôturée — cf. §5 item 11). Ajoute la phase à `Phase` enum, étend `parse_phase_marker`, ajoute le tracker + le nudge, met à jour `PHASE_META` côté webview, ajoute une règle dans le `CORE_SYSTEM_PROMPT` (« si tu as modifié du code, tu DOIS passer par `[phase: testing]` avant `[phase: answering]` »).
- **Tests cibles** :
  - `done_blocked_when_code_edited_without_testing` (analogue à `done_blocked_when_todos_still_open`) : tour 1 `file_write`, tour 2 `answering`+`done` → bloqué ; tour 3 `testing` + `bash cargo check` → tour 4 ferme.
  - `done_allowed_when_only_markdown_edited` : modif `.md` seule → pas de gate.
  - `testing_phase_triggers_phase_enter_event` côté `consume_stream`.

## 3. ✅ Bug résolu — images jointes (vision réelle, 2026-05-12)

**Statut** : **livré** (cf. tableau §1 ligne *Vision / images* et §5 item 1). Conservé ici pour traçabilité.

### Symptôme historique

L’utilisateur joignait une image dans le chat VS Code ; le modèle décrivait n’importe quoi ou ignorait le visuel.

### Cause racine (état au 2026-05-12, avant fix)

1. **Extension** : les images étaient persistées sous `.drox/attachments/` et **seuls les chemins relatifs** étaient ajoutés au texte du prompt.
2. **Moteur Rust** : les messages utilisateur étaient des blocs `Content::Text` uniquement.
3. **Client Ollama** (`drox-llm`) : `message_to_wire` ne sérialisait qu’une chaîne `content: String` vers `/api/chat` — aucun pixel, aucun tableau multimodal.

### Correction livrée

1. **Types** : `drox_types::Content` étendu avec un variant `Image { mime, data }` (base64).
2. **Ollama** : payload `/api/chat` aligné sur le format multimodal Ollama (champ `images: [base64, …]` côté message user).
3. **Extension** : envoi du base64 + métadonnées (mime, taille) dans le JSON-RPC `agent.run`, en plus du chemin lisible.
4. **UI / capacités modèle** : la chip image reste visible quel que soit le modèle.

**Complément livré (§2.20)** : chaque image est couplée à son chemin disque (`absPath` / `relPath`) avec légende avant chaque `Content::Image` ; rappel prompt + tool `copy_path` pour le placement dans le repo.

**Limite résiduelle** : la qualité de la *compréhension visuelle* dépend du modèle multimodal chargé (modèles texte-only ne voient pas les pixels). Pas de second modèle vision auxiliaire prévu dans le backlog.

### 2.13 Bloc « Questions » bloquant — style Cursor (clarification proactive) — **LIVRÉ**

- **Principe produit** : **dès qu'un doute** subsiste (ambiguïté de spec, choix d'architecture, stratégie de correctif, périmètre de refactor…), le modèle **ne devine pas** : il pose **une ou plusieurs questions** dans une carte « Questions » au-dessus du composer (file 1/N, options cliquables A/B/C…, champ détails optionnels, actions Skip/Précédent/Continue). Aligné sur la capture Cursor de référence.

#### Comportement livré

- **Run agent en pause** : le tool `ask_user_question` est synchrone côté Rust et n'émet aucune relance LLM tant que `UserAsker::ask_many` n'a pas résolu sa promesse.
- **Capability négociée à l'init** : `clientCapabilities.interactiveAsk` (default `false`). Si `true`, le serveur installe `RpcUserAsker` ; sinon il garde `RefuseAsker` (le tool retourne `ToolError::Interactive`). La capability serveur `interactive_ask` est désormais `true` (le moteur sait poser des questions ; c'est le client qui décide s'il sait y répondre).
- **Multi-questions en un round-trip** : `UserAsker::ask_many(Vec<UserQuestion>, Option<title>)` envoie **une seule** requête JSON-RPC contenant la file complète — la carte UI se charge de la navigation 1/N. Rétro-compat : `ask` mono-question délègue par défaut à `ask_many`, et le tool accepte le schéma legacy `{ question, choices?, allowMultiple? }`.
- **Skip propre** : Esc ou clic « Skip » → toutes les réponses pending sortent avec `skipped: true` (champ exposé dans la valeur de retour du tool). Idem si l'utilisateur cancel le run, lance un `/new`, ou si le serveur sort en cours de question.

#### Implémentation (Rust)

- `drox-tools/src/asker.rs` — `UserQuestion` gagne `id?`, `allow_free_text` ; `UserAnswer` gagne `id?`, `skipped`. Nouvelle méthode `ask_many` avec implémentation par défaut (boucle séquentielle sur `ask`).
- `drox-tools/src/simple/ask.rs` — tool `ask_user_question` accepte deux schémas via `#[serde(untagged)] enum AskUserQuestionInput { Multi, Mono }`. Forme multi : `{ title?, questions: [{ id?, prompt, options?: [{id, label}], allowMultiple?, allowFreeText? }] }`. Mapping option-label↔index pour repasser des `optionIds` stables au modèle.
- `drox-cli/src/jsonrpc/protocol.rs` — nouveaux DTOs `UserAskParams` / `UserAskQuestion` / `UserAskOption` / `UserAskResult` / `UserAskAnswer`. Capability client `ClientCapabilities::interactive_ask`.
- `drox-cli/src/jsonrpc/server.rs` — `Server::set_interactive_ask` / `supports_interactive_ask` (drapeau atomique persistant pour toute la durée de la connexion).
- `drox-cli/src/jsonrpc/handlers.rs` — `RpcUserAsker { server, run_id }` : override `ask_many` qui sérialise les questions vers `user/ask`, attend `Server::send_request`, puis re-mappe `optionIds` ("opt1"…) vers les indices et combine `free_text` + labels d'options dans `UserAnswer::text` (rétro-compat avec les askers existants qui ne lisent que `text`). Sélection conditionnelle dans `build_agent_setup` : `interactive_ask ⇒ RpcUserAsker`, sinon `RefuseAsker`.
- `drox-cli/src/prompts.rs` — règle `clarifying` réécrite : « doute non trivial qui change les actions à venir → `ask_user_question` AVANT toute mutation », documentation du schéma multi-questions, sémantique du skip explicitée. Section Outils : « à utiliser **proactivement** dès qu'un doute non trivial influence les actions à venir ».

#### Implémentation (VS Code / webview)

- `extension-vscode/src/droxRpcClient.ts` — `InitializeOptions.interactiveAsk?: boolean` propagé dans `clientCapabilities`.
- `extension-vscode/src/chatView.ts` — `interactiveAsk: true` à l'init. Handler `setRequestHandler("user/ask", …)` ↔ webview : (a) post `userAsk` au webview ; (b) attend la promesse `pendingUserAsk` ; (c) renvoie `{ answers }` au serveur. Réception `userAskAnswer` depuis la webview, validation `askId`/`optionIds`, résolution de la promesse. Auto-skip via `resolvePendingUserAskAsSkipped` sur cancel run / chat reset / exit serveur.
- `extension-vscode/media/chat.{js,css}` — état global `pendingUserAsk` (askId, title, questions, currentIndex, answers Map<id, {optionIds Set, freeText, skipped}>). `openUserAskCard` / `renderUserAskCard` (header titre + compteur `1 of N`, prompt, options en boutons toggle, textarea conditionnelle sur `allowFreeText || options.length === 0`, actions Skip / Précédent / Suivant ou Continue selon position). `advanceOrSubmit` (Enter), `skipUserAsk` (Esc), navigation `currentIndex`. Bouton Send désactivé tant que `pendingUserAsk && !busy`. CSS `.user-ask*` : carte VS Code-themed, options avec lettrine A/B/C cliquable, état `selected` mis en évidence par `focusBorder`.

#### Tests

- `drox-tools::simple::ask` — 3 tests (`mono_schema_round_trips_legacy_output`, `multi_schema_passes_questions_and_maps_option_ids`, `multi_schema_empty_questions_rejects`).
- `drox-cli::jsonrpc::handlers::refuse_asker_returns_interactive_error` — message d'erreur mis à jour (« interactive prompts are disabled »).
- `drox-cli::prompts::core_prompt_makes_clarifying_proactive_and_blocking` — anti-régression sur le durcissement (« doute non trivial », « AVANT toute mutation », « plusieurs questions d'un coup », « skipped », « proactivement »).
- `cargo test --workspace` OK ; `npm run compile` extension OK.

#### Régression terrain (2026-05) — modèle n'arrive pas à ouvrir le formulaire — **corrigé (§2.21 V1)**

- **Symptôme** (historique) : plusieurs lignes **« Asked »** en échec ; carte Questions absente ; boucle de formats JSON.
- **Correctif livré** : `normalize_input`, `CANONICAL_ASK_JSON_EXAMPLE` dans les erreurs, anti-boucle 3× côté moteur. Cf. **§2.21**.

#### V2 / améliorations différées

- **Persistance des Q/R dans le transcript** : aujourd'hui la réponse est inlinée dans `UserAnswer::text` (lu par le modèle via le `tool_result` du `ask_user_question`). Une V2 pourrait projeter un message `user` structuré dédié pour faciliter le replay / l'export.
- **Multi-`user/ask` concurrents** : non supporté côté webview (un seul `pendingUserAsk` à la fois). Le moteur n'en émet pas plusieurs en parallèle aujourd'hui, donc OK.
- **Sanitization longueur free-text** : laissée au serveur LLM aval (`max_tokens` de la requête suivante). Pas de limite dure côté tool — à ajouter si abus.

### 2.14 Message en attente pendant un run — **LIVRÉ (extension webview, 2026)**

- **Principe produit** : aujourd'hui le composer est **désactivé** tant que `busy === true` (run en cours). Le bouton Send se transforme en Stop, l'utilisateur perd l'ergonomie d'enchaîner une remarque pendant que le modèle finit son cycle. À la place, on veut un workflow **« write ahead »** : pendant un run, le composer reste **éditable** et **envoyable**. Le message tapé n'interrompt rien : il est **mis en file d'attente locale** (badge « 1 en attente » discret sous le composer ou dans la zone refs), puis **dépilé automatiquement** dès que `agent/done` arrive (n'importe quel statut : `completed`, `cancelled`, `error`).
- **Comportement attendu** :
  - Bouton Send reste actif **même quand `busy`**. Clic → push dans la queue webview (pas de RPC immédiat), badge mis à jour, composer vidé, prêt pour un autre message.
  - Plusieurs messages en attente : autorisés ; ils sont envoyés **dans l'ordre** au fil des `agent/done` successifs. Une nouvelle ligne « 2 en attente » s'affiche.
  - Réception `agent/done` → si la queue n'est pas vide, on dépile la tête et on déclenche `handleSend` exactement comme un envoi manuel (utilise les références/pieces jointes/pastes capturés au moment de la mise en file).
  - **Annulation d'un message en attente** : possible avant qu'il ne soit dépilé (croix sur le badge → suppression de la queue, pas d'effet RPC).
  - **Suppression sur `chatReset`** : la queue est vidée silencieusement (cohérent avec le reset des références, attachments, pastes).
- **UI** :
  - **Cartes visibles** au-dessus du textarea (`#pending-prompts` dans `.editor`) : texte **tronqué** (~96 car.), méta (réf. / images / pastes), boutons **Modifier** (réinjecte dans le composer + retire de la file) et **Retirer**.
  - Badge `+N` sur Send pendant `busy` (taille de la file). Tooltip « Mettre en file d'attente — envoi à la fin du run ».
  - Pas de changement côté JSON-RPC : la queue est **strictement webview-side**. Le moteur ignore tout ; on lui envoie un nouveau `agent.run` au moment opportun.
- **Garanties produit** :
  - **Aucune perte** : si le serveur crash entre-temps, le badge reste affiché à l'écran (on les voit, on peut les renvoyer manuellement).
  - **Ordre conservé** : FIFO strict.
  - **Idempotence** : un même message tapé puis re-tapé compte comme deux entrées séparées. Pas de dédup auto.
- **Hors périmètre** :
  - Pas d'interruption forcée du run en cours (l'utilisateur peut toujours cliquer Stop séparément).
  - Pas de queue côté serveur (pas de besoin tant que la webview gère elle-même — et ça reste local par fenêtre / par session VS Code).
  - Pas de persistance disque de la queue (volatile à la fermeture de la webview).
- **Implémentation livrée** :
  - `extension-vscode/media/chat.js` : `pendingPrompts[]`, `tryEnqueueFromComposer()`, `flushPendingPromptQueue()` sur `state: busy=false`, cartes `.pending-prompt-card` (Modifier / Retirer), badge `+N` sur Send, bouton `#stop-run`.
  - `extension-vscode/src/chatView.ts` : `#pending-prompts` placé **dans** `.editor` au-dessus du textarea (aucun RPC nouveau).
  - Check manuel : run long → 2 messages en file → envoi FIFO à la fin du run.

### 2.15 Mode « Professeur »

> **Statut (2026-05-15)** : **M1+M2+M3 code présents**, mais **non conforme en E2E** (cf. **§2.22**). L'utilisateur signale : mode **Professeur** sélectionné, demande d'ajout de contenu sur la page d'accueil → l'agent **lit puis modifie le code** (comportement « exécuteur ») **sans** `course_plan_write`, **sans** cours structuré, **sans** respect du cycle leçon → exercice → contrôle.

#### Régression terrain (2026-05) — le mode « ne tient » pas

- **Attendu** : tuteur — plan de cours d'abord, explications, exercices guidés, mutations rares / sur mandat.
- **Observé** : même workflow qu'en **Accept edits** (exploration + `ask_user_question` en échec + édition fichier).
- **Hypothèses techniques** (à valider au sprint) :
  1. **Gates moteur trop faibles** : `course_plan_write` requis avant la **première** mutation, mais le modèle peut enchaîner `file_read` / `ask_user_question` / échecs puis mutation après nudge ; pas de gate « interdit `file_edit` tant qu'aucun plan de cours valide dans le run ».
  2. **`applyEdits: true` + `plan_mode`** : les tools client renvoient souvent `proposed` / diff + l'utilisateur peut **Appliquer** → contournement pédagogique involontaire.
  3. **Prompt** : `PROFESSOR_MODE_SUPPLEMENT` noyé ou ignoré par les petits modèles locaux ; pas de rappel en début de **chaque** tour.
  4. **Pas de feedback UI bloquant** : absence de bannière « Définissez d'abord un plan de cours » tant que `course_plan_write` n'a pas réussi.
- **Correctifs prévus** : **§2.22** (durcissement gates + UX + E2E).

- **But produit** : compléter les modes existants (**Default**, **Plan**, **Accept edits**, **Bypass**) par un mode où l'agent se comporte comme un **tuteur** plutôt que comme un exécuteur : expliquer les concepts, décomposer les problèmes, poser des questions de clarification *pédagogiques*, proposer des micro-exercices ou des « à toi de jouer » avec correction progressive — au lieu de livrer directement la solution complète ou d'éditer massivement le dépôt sans cadre.
- **Comportement attendu (brouillon)** :
  - **Priorité à la compréhension** : schémas, analogies, liens vers la doc pertinente ; code montré en **extraits commentés** plutôt qu'en fichiers entiers réécrits, sauf si l'utilisateur demande explicitement d'appliquer.
  - **Vérification active** : après une explication dense, une ou deux questions courtes pour valider que l'utilisateur suit ; adapter le niveau (débutant / intermédiaire) si l'utilisateur le signale.
  - **Outils** : privilégier lecture / recherche (`file_read`, `glob`, `web_search`, `lsp`) ; mutations (`file_edit`, `file_write`, `bash` destructif) **sous conditions** — soit en mode « proposition seule » (comme une prévisualisation), soit après confirmation explicite de l'utilisateur, selon la même mécanique que **Plan** / **Accept edits** (à trancher en conception).
  - **Socratic** : en cas de question vague du type « fais mon DM », rediriger vers la démarche (hypothèses, plan, premiers pas) plutôt que produire la copie prête à rendre.
- **Implémentation prévue** :
  - **Webview** : nouvelle valeur `<option value="professor">` (libellé FR **Professeur** ou **Mode professeur**) dans le sélecteur de mode ; persistance `vscode.setState` comme les autres.
  - **Extension** : `VALID_MODES` + mapping vers `agent.run` / `PermissionMode` (nouveau variant côté `drox-permissions` **ou** composition sur `Plan` + flag `pedagogy` — à trancher pour éviter l'explosion des matrices de règles).
  - **Moteur / prompt** : bloc `PROFESSOR_MODE_SUPPLEMENT` dans `drox-cli/src/prompts.rs` (ou équivalent), injecté **uniquement** quand ce mode est actif ; cohérence avec le protocole de **phases** (ex. encourager `clarifying` / `answering` pédagogiques sans alourdir `acting`).
  - **Tests** : au moins un test `prompts.rs` vérifiant la présence des règles clés ; un test d'intégration léger permissions si nouveau mode.
- **Hors périmètre V1** : suivi de progression type LMS, badges, ou profil utilisateur persistant — rester sur une **personnalité de session** simple.

### 2.16 Mémoire longue — cycles, compaction et fin de session

> **Statut (2026-05-14)** : **V1 partiellement livrée** côté extension (`longMemoryStore.ts`, `embeddings.ts`, **`session_search`**, **`/session_end`** + reset UI / nouveau transcript). Le cahier initial « **SQLite + ONNX obligatoires** » du tableau §2.16.1 est **assoupli** : le stockage V1 est un **JSON** sous `globalStorageUri`. **Backlog résiduel** : migration SQLite si besoin, embed « lourd » (qualité / offline), quotas / purge, polish §2.16.4. **Toujours hors périmètre court terme** : graphe 2D, commit Git auto, endpoint embed **HTTP custom** (sprints suivants).

#### Problème (inchangé)

- Discussion **longue durée** : la compaction M2 réduit le contexte mais les **jalons** ne sont pas exploitables comme **mémoire interrogable** (« il y a deux mois on avait un souci de build similaire »).
- Besoin d’une **clôture explicite** de cycle : l’utilisateur veut **archiver** puis **repartir à zéro** côté UI sans ambiguïté.

---

#### 2.16.1 Sprint 1 — périmètre strict

| Inclus | Exclu (sprints suivants) |
|--------|---------------------------|
| Base **embarquée** (ex. SQLite) sous contrôle de l’extension, chemin stable (`globalStorageUri` ou sous `.drox/` workspace — à trancher). | Endpoint HTTP **custom** pour embeddings (décocher « natif »). |
| Moteur d’**inférence embed embarqué** (ex. ONNX / Transformers.js), poids **lazy** au premier usage. | `git commit` à la clôture. |
| Écriture + embedding à chaque **résumé de compaction contexte** (format §2.16.2). | Vue graphe 2D / cartes mentales / stats temps passé. |
| Comportement UI §2.16.4 + slash **`/session_end`** + outil client **`session_search`** (§2.16.3). Le tool moteur **`session_end`** (stub / `tool/exec` client) **n’est pas** exposé au schéma Ollama. | Fichiers JSON optionnels sous `.drox/memory/summarizes/` **en plus** du store principal (export / debug). |

**État implémentation V1 (extension, 2026-05)** — à rapprocher des lignes « Inclus » du tableau :

- **Fait** : persistance **JSON** sous `globalStorageUri` (équivalent fonctionnel d’une BDD v1), vecteurs sur le texte principal, **`session_search`**, ingestion à chaque compaction notifiée au client, **`session_closure`** lors de **`/session_end`**.
- **À faire (durcissement « doc strict »)** : **SQLite** si volumétrie ou requêtes relationnelles, **ONNX / Transformers.js** (ou équivalent) si l’embed actuel est jugé insuffisant, politiques de rétention / taille max / purge.

**Même comportement dev / prod** : mêmes dépendances npm, même activation ; seuls le chemin de stockage et la présence GPU peuvent varier.

---

#### 2.16.2 Format « résumé de fin de contexte » (`context_chunk_summary`)

Déclenché **mécaniquement** par le moteur après une **compaction live réussie** (`try_live_compact` / `ContextCompacted`, §2.7) — **pas** un JSON libre rédigé par le modèle pour cet événement (le modèle a déjà produit le checkpoint / résumé dans le flux de compaction ; on **sérialise** et **indexe**).

**Nom logique** : `context_chunk_summary`  
**Rôle** : une ligne dans la BDD (+ vecteur sur le champ texte principal) = **un segment d’historique évincé du prompt** et condensé.

**Schéma JSON minimal (v1)** — champs **remplis par le moteur / l’extension** ; `schema_version` pour migrations.

```json
{
  "schema_version": 1,
  "id": "ccs_<uuid>",
  "workspace_fingerprint": "<hash ou chemin canonique>",
  "transcript_session_id": "<ses_… ou équivalent côté client>",
  "created_at": "2026-05-14T18:32:01Z",
  "compaction_seq": 3,
  "tokens_before": 28000,
  "tokens_after": 12000,
  "summary_text": "Paragraphe télégraphique : décisions, fichiers, état des todos, risques.",
  "files_touched": ["rel/path/a.rs"],
  "tags_suggested": ["build", "auth"],
  "checkpoint_message_id": "<optionnel — lien vers message system inséré>"
}
```

- **`summary_text`** : soit extrait du **checkpoint** déjà inséré dans l’historique (parser tolérant), soit **copie** du bloc résumé produit par le tour `summarize_run` — **une seule source** pour éviter divergence.
- **`tags_suggested`** : optionnel V1 ; peut être vide ou rempli par **heuristique** (mots du texte) avant d’introduire un petit appel LLM « tagger » plus tard.
- **Index** : clés `transcript_session_id`, `created_at`, `compaction_seq` ; vecteur sur `summary_text` (+ éventuellement concat `files_touched`).

---

#### 2.16.3 Outil **`session_end`** (nom définitif à valider)

**Alignement implémentation (2026-05)** : la clôture **explicite** est déclenchée par l’**utilisateur** (slash **`/session_end`** dans la webview, handler côté `chatView.ts`). Le moteur peut conserver un enregistrement **`session_end`** pour **stub / délégation JSON-RPC** (`tool/exec` vers le client), mais **`session_end` n’apparaît pas** dans la liste des outils **exposés au modèle** (pas d’appel LLM direct pour terminer la session). Le tableau ci-dessous reste la **référence de flux logique** (agrégation → `session_closure` → signal reset UI).

**But (cible produit)** : archiver proprement la session courante puis **repartir sur un contexte vierge** après intention utilisateur (« fin de session pour aujourd’hui »…).

**Comportement moteur / outil (brouillon — flux logique)** :

| Étape | Qui |
|-------|-----|
| 1. Agréger les `context_chunk_summary` du `transcript_session_id` courant (ordre `compaction_seq`) + dernier état pertinent (objectif, todos ouverts si dispo). | Moteur ou tool côté Rust avec accès transcript |
| 2. Produit un document **`session_closure`** (JSON v1 ci-dessous) + **embedding** du champ `summary_global` ; INSERT en BDD. | Idem |
| 3. Retourne au modèle un `tool_result` **succinct** (`{ "closure_id", "stored": true }`) pour qu’il enchaîne sur la **phrase d’au revoir** (texte libre dans `answering`). | Tool |
| 4. Signale à l’**extension** un événement dédié (ex. `session_closed` dans le flux JSON-RPC ou après `agent/done`) pour **reset UI** §2.16.4. | CLI / protocole |

**Note étape 3 (V1 `/session_end`)** : sans exposition de `session_end` au LLM, il n’y a **pas** de `tool_result` modèle pour cette clôture ; la synthèse, l’embed et l’INSERT sont traités **côté extension** dans le handler slash, puis reset UI §2.16.4. L’étape 3 reste valide comme **cible** si l’on réintroduit un chemin « modèle invoque `session_end` » plus tard.

**Schéma JSON `session_closure` (v1)** :

```json
{
  "schema_version": 1,
  "id": "sc_<uuid>",
  "transcript_session_id": "<ses_…>",
  "closed_at": "2026-05-14T19:00:00Z",
  "summary_global": "Synthèse utilisateur + modèle : objectif, livrables, ouverts, prochaine étape.",
  "context_chunk_ids": ["ccs_…", "ccs_…"],
  "memory_session_slug": "<optionnel — lien M1 si persist_run a eu lieu même jour>"
}
```

**Arguments tool (brouillon)** : `{ "farewell_hint"?: string }` — hint pour le modèle ; pas de logique métier côté args.

**Interventions dans le cycle** (à cadrer en implémentation) : garde-fous côté handler **`/session_end`** (ex. refus si run déjà « closing », session vide) ; **pas** de message système pour « forcer le modèle » à appeler `session_end` — la voie canonique est la **commande utilisateur**.

---

#### 2.16.4 Impact UI — fin de session

**Proposition validée backlog** (V1 : déclencheur **`/session_end`**) :

1. Après clôture **réussie** (pipeline `/session_end`), l’UI peut afficher un **message d’au revoir** / récap (bulle ou banner — **polish** backlog si on veut systématiser une bulle `answering` du modèle).
2. L’extension enchaîne **sans étape manuelle supplémentaire** après la commande utilisateur :
   - **discussion vierge** : équivalent **`startNewChat`** / `chatReset` — fil de messages UI effacé, état phases / todo sticky réinitialisé ;
   - **contexte vierge** : **nouveau** `transcript_session_id` (nouvelle session JSONL ou logique équivalente) pour le prochain `agent.run` ; **pas** de rechargement automatique de l’historique compacté dans le prochain prompt (repartir comme une nouvelle conversation).
3. Les données restent **dans le store** pour **`session_search`** (livré) ou injection sélective au prochain run (hors périmètre court si on veut rester minimal).

**Point d’attention** : bien distinguer **archive disque M1** (`.md` fin de run non trivial) — inchangé — de la **mémoire longue indexée** (sprint 1).

---

#### Plus tard (hors sprint 1)

- Settings **embed non natif** (URL + clé).
- Commit **Git** optionnel à la clôture.
- Graphe 2D / stats (fork VS Code).
- Outils lecture **`session_closure_list`** (ou équivalent paginé) et **RAG injecté** au prochain run au-delà de **`session_search`** (déjà livré côté client).

#### À trancher

- Emplacement BDD : **global** (tous workspaces) vs **par workspace** ; idéalement **par workspace** pour éviter fuite de contexte entre projets.
- Taille max de `summary_text` / rétention / purge.
- **PII** dans les résumés indexés.

---

### 2.17 Paramètres : liste des outils et activation / désactivation

> **Statut** : **livré (2026-05-19)** — `drox.tools.disabled`, `drox.tools.mcp.enabled`, filtre à chaque `agent.run`. Amélioration **produit / sécurité** : l’utilisateur voit **tous les outils** que Drox peut proposer au modèle et peut **désactiver** ceux qu’il ne veut pas (sandbox mentale, environnement sensible, ou simplicité). Même comportement **dev** et **prod** (lecture `package.json` / `contributes.configuration` + persistance workspace / utilisateur VS Code standard).

#### Objectif

- **Transparence** : noms d’outils alignés sur le **registre réel** (`drox-tools` + outils **client** / `RemoteTool` : `bash`, `lsp`, …).
- **Contrôle** : toggle par outil ; le modèle **ne reçoit pas** les définitions (`ToolSpec`) des outils désactivés → il ne peut pas les invoquer (pas de « refus au moment du tool call » inutile).
- **Cohérence permissions** : désactiver un outil **renforce** le mode « deny » ; ne **remplace** pas `drox-permissions` pour les outils encore actifs.

#### Liste « qui a du sens » (groupes UI)

Présentation recommandée en **sections repliables** dans la page de paramètres Drox (ordre indicatif) :

| Groupe | Outils (noms registre) | Note |
|--------|------------------------|------|
| **Fichiers & recherche** | `glob`, `grep`, `file_read` | Lecture seule ; désactiver rarement. |
| **Édition** | `file_edit`, `file_write`, `notebook_edit` | Souvent la première couche « je ne veux pas d’écriture auto ». |
| **Exécution** | `bash` | Très sensible ; toggle dédié + rappel permissions. |
| **IDE / analyse** | `lsp` | Délégation client ; désactiver si pas de LS. |
| **Web** | `web_search`, `web_fetch` | Réseau sortant. |
| **Plan & interaction** | `todo_write`, `ask_user_question`, `exit_plan_mode` | **Protocole** : voir règles « toujours actifs » ci-dessous. |
| **Mémoire session (M1)** | `session_note`, `memory_read`, `memory_list` | Optionnel selon usage mémoire. |

**Outils « toujours actifs » (non désactivables ou toggle grisé + tooltip)** — à trancher en UX :

- **`ask_user_question`** — bloque le run de façon **volontaire** ; le désactiver casse le flux **Questions** (§2.13).
- **`todo_write`** — si désactivé, les **gates** moteur (`todo_write` avant mutateurs, gate `done` vs todos) deviennent incohérentes ; **recommandation** : non désactivable **ou** désactivation = **mode « conversation only »** explicite avec bannière + adaptation moteur (hors scope minimal du sprint).

**Implémentation (piste)** :

- **`package.json`** : contribution `configuration` — soit objet `drox.tools.<toolName>.enabled` (bool, default `true`), soit liste `drox.tools.disabled` (array de strings) ; préférer une **liste exhaustive** générée à partir du registre pour éviter les typos.
- **`initialize`** / construction du registre côté extension : filtrer les specs envoyées au binaire (`buildToolRegistry` équivalent) **avant** `agent.run`.
- **`drox-cli`** : accepter une **liste blanche** optionnelle dans `initialize` ou `agent.run` (capability ou param) pour ne **pas** enregistrer les tools exclus — aligné avec la négociation actuelle des outils exécutables côté client.
- **Prompt** : si des outils sont désactivés, **ne pas** les mentionner dans le `CORE_SYSTEM_PROMPT` injecté (ou ajouter une ligne « Les outils X/Y ne sont pas disponibles dans ce workspace ») pour éviter les hallucinations d’appels.

#### Hors périmètre V1 de ce sprint

- Profils prédéfinis (« Data science », « Lecture seule ») — V2.
- Désactivation **granulaire** par sous-opération (`lsp` op `definition` seulement) — V2.

### 2.18 Phase `analyzing` — analyse efficace du répertoire ouvert

> **Statut** : **livré (V1, 2026-05-19)** — `Phase::Analyzing`, aliases `analysis`/`survey`, playbook dans `prompts.rs`, UI `PHASE_META`, nudge moteur (intention analyse + exploration sans marqueur).  
> **`[REF-LEAK ~]`** — inspiration `queryHelpers.ts` ; logique couverte par prompt + `directory_fanout_caps` + carte workspace (§2.23).

#### Objectif

- Introduire une phase explicite **`[phase: analyzing]`** (alias possibles : `analysis`, `survey` — à trancher comme pour les autres phases) lorsque le modèle doit **cartographier** un workspace ou un sous-arbre **sans** le confondre avec du `reading` opportuniste ou du `planning`.
- Répondre au besoin utilisateur : « analyse ce repo » **sans saturer le contexte** (éviter les `glob` récursifs aveugles, les dumps énormes, la confusion outil/réponse utilisateur) en s’appuyant sur les **mécanismes déjà prévus ou livrés** : plages `file_read`, filtre `glob` sur `grep`, sortie `directory_fanout_caps`, préfixe explicite des `tool_result`, etc.

#### Comportement attendu

1. **Protocole** — Le modèle annonce `[phase: analyzing]` puis enchaîne uniquement des outils **read-only** adaptés à la découverte : `glob` (premier niveau puis motifs ciblés), `grep`, `file_read` (éventuellement avec `start_line` / `end_line`), `lsp` (`workspace_symbol`, `definition`, …), `memory_list` / `memory_read` si pertinent.
2. **Transition** — Sortie de `analyzing` vers `planning` ou `todo_write` une fois la carte mentale du dépôt suffisante ; pas de mutation dans cette phase.
3. **Option moteur (P1)** — Détection légère des **intentions d’analyse** (mots-clés dans le premier message utilisateur + absence de todo) pour **synthétiser** une entrée en `Reading` / nudge si le modèle enchaîne des outils d’exploration sans marqueur `analyzing` (filet UX, pas une obligation stricte au premier sprint).
4. **UI** — Nouvelle entrée dans `PHASE_META` (`chat.js` / `chat.css`) : libellé du type « Analyse du dépôt », icône distincte de `reading`, trace collapsible alignée sur les autres phases.

#### Implémentation (piste)

- `drox-engine` — `Phase::Analyzing` dans `event.rs` ; `parse_phase_marker` + `phase_for_tool` (les outils read-only d’exploration sans `todo_write` préalable peuvent tomber en **Analyzing** au lieu de **Reading** si le marqueur l’indique — à harmoniser avec la matrice actuelle `reading` / `internal_reasoning`).
- `drox-cli/prompts.rs` — Règle courte dans le protocole de phases : quand l’utilisateur demande une **vue d’ensemble** ou un **audit de structure**, commencer par `[phase: analyzing]` ; rappel des **patterns efficaces** (déjà documentés ailleurs dans le prompt) pour réduire tokens et bruit.
- **Tests** — `parse_phase_marker_accepts_analyzing_aliases` ; éventuellement test d’intégration « premier tour marqueur analyzing + `glob` » sur `AgentEvent::PhaseEnter`.

#### Risques / limites

- **Chevauchement avec `reading`** : il faut cadrer dans le prompt *quand* choisir `analyzing` vs `reading` (analyzing = passe **structurante** initiale ou ré-audit large ; reading = lecture ciblée au fil de la tâche).
- **Modèles distraits** : comme pour les autres phases, le filet reste le nudge + `max_iterations` ; pas besoin de gate dure type « interdit `done` sans analyzing » (contrairement à `testing` post-mutation).
- **Complément** : la phase `analyzing` structure un **passage** ; la **carte workspace persistante** (§2.23) évite de **répéter** ce passage à chaque run sur le même dépôt.

### 2.19 Erreurs éditeur → chat (« Passer au modèle », style Cursor)

> **Statut** : **livré (2026-05-19)** — `diagnosticToChat.ts`, code actions, `prefillPrompt`.

- **But produit** : quand le code contient une erreur (soulignement rouge / jaune, panneau Problèmes), l’utilisateur peut **transférer le diagnostic dans le chat** en un clic, comme **Add to Chat** / **Passer au modèle** dans Cursor — **sans** lancer `agent.run` automatiquement.
- **Comportement attendu** :
  - **Survol** (ou menu contextuel) sur un diagnostic dans l’éditeur : entrée **« Passer au modèle »** (libellé FR).
  - **Clic** : le texte du diagnostic (message, sévérité, fichier, ligne:colonne, code source si disponible) est **inséré dans le composer** Drox (focus textarea), éventuellement formaté en bloc markdown/code.
  - L’utilisateur **complète ou envoie** lui-même — pas d’envoi auto.
  - Option : si le chat est en run (`busy`), pré-remplir le composer ou mettre en **file d’attente** (§2.14) selon le même flux que Send pendant un run.
- **Implémentation prévue** :
  - Extension : `CodeActionProvider` ou `HoverProvider` + commande `drox.addDiagnosticToChat` ; lecture via `vscode.languages.getDiagnostics` / événement `onDidChangeDiagnostics`.
  - Webview : handler `postMessage` `prefillPrompt` (texte + focus) — réutiliser le composer existant.
  - Setting `drox.addDiagnosticOnHover` (bool) pour activer l’action au survol vs. menu contextuel seul.
- **Hors périmètre V1** : correction automatique par le modèle sans validation utilisateur ; envoi RPC immédiat.

### 2.20 Images jointes — chemin disque couplé aux pixels — **LIVRÉ**

- **But** : le modèle reçoit **pixels + chemin exploitable** pour `copy_path` / `file_read` / placement UI (« place cette image sur la page d’accueil »).
- **Livré** :
  - `AgentRunImage` : `relPath`, `absPath` (+ `originalPath` si glissé depuis le repo).
  - Moteur : légende texte **avant** chaque `Content::Image` ; récap en tête du message utilisateur.
  - Extension : persistance `.drox/attachments/` + chemins absolus dans le prompt ; file d’attente §2.14 repasse les métadonnées.
  - Prompt : règle « images jointes → utiliser le chemin fourni ; privilégier `copy_path` pour intégrer dans le site ».
  - Tool `copy_path` (hotfix 2026-05-15) pour éviter `bash cp` / `robocopy`.
- **Limite résiduelle** : modèles **texte-only** ne voient toujours pas les pixels (choisir un modèle vision Ollama ou décrire l’image manuellement dans le prompt).

### 2.21 `ask_user_question` — fiabilité schéma (régression modèles locaux)

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK ~]`** — schéma / messages d’erreur : `src/tools/AskUserQuestionTool/*` (lecture ponctuelle). Cf. §2.26.0.

- **Livré** :
  - **`normalize_input`** (`drox-tools/src/simple/ask.rs`) : `questions` string ou objet unique, tableau racine, `question`↔`prompt`, `choices`/`options` string[], alias leak (`header`→`id`, `multiSelect`→`allowMultiple`, `description`→`label`), mono legacy `{question, choices}`.
  - **`CANONICAL_ASK_JSON_EXAMPLE`** dans chaque `tool_result` d'erreur + `description()` du tool.
  - **Anti-boucle moteur** : après **3** échecs `ask_user_question` consécutifs, nudge `system` (texte `[phase: clarifying]` ou JSON canonique) — `drox-engine/src/agent.rs`.
  - **Tests** : 10 tests `ask.rs` (fixtures type GLM/Devstral).
- **Hors périmètre** : message `user` structuré dédié pour Q/R (§2.13 V2) ; reformulation sans tool (fallback utilisateur).

### 2.22 Mode Professeur — enforcement E2E (régression produit)

- **But** : en mode **Professeur**, l'agent **ne peut pas** se comporter comme un mode Accept edits tant que le parcours pédagogique n'est pas engagé.
- **Critères d'acceptation (E2E)** :
  1. Premier tour sur une demande de modification : **`course_plan_write` réussi** avant tout `file_edit` / `file_write` / `copy_path` (gate moteur **dure**, pas seulement nudge).
  2. Au moins une étape `lesson` en `active` ou `mastered` avant toute mutation sur le repo (sauf chemins explicitement listés dans `workArea` d'un exercice — option V2).
  3. UI : si mode Professeur et **aucun** plan de cours dans le run → bannière composer « Commencez par un plan de cours » + lien vers sticky vide.
  4. **`applyEdits`** : en Professeur, forcer `applyFsWrites: false` par défaut (propositions seules) **ou** exiger confirmation modale « L'élève n'a pas encore validé le cours — appliquer quand même ? ».
  5. Prompt : règle **dure** en tête du supplément Professeur : « INTERDIT de modifier des fichiers avant `course_plan_write` ; INTERDIT de faire le travail à la place de l'utilisateur ».
- **Implémentation prévue** :
  - `drox-engine/agent.rs` — étendre gates (`professor_requires_course_plan_before_any_mutation`, blocage `done` si jamais de plan).
  - `handlers.rs` — `apply: false` quand `mode.is_professor()` sauf setting `drox.professor.allowApply`.
  - Extension — bannière + désactivation visuelle du mode si l'utilisateur veut « juste exécuter » (rappel : passer en Accept edits).
  - **Test d'intégration** : run scripté « modifie la homepage » en mode professor → premier tool autorisé = `course_plan_write` ou read-only.
- **Articulation** : complète §2.15 ; distinct de Plan (objectif pédagogique, pas seulement « pas d'écriture »).

### 2.23 Carte structure workspace — mémoire de navigation persistante

> **Statut** : **V1 livrée (2026-05-19)** — hybride **C** : `.drox/workspace-map.json`, scan initial, `workspace_map_read` / `workspace_map_note`, miroir auto `glob` / `file_read` / `lsp`, injection compacte au `agent.run`. Suivi : empreinte `git HEAD`, export `.md`.

- **Problème observé** : entre deux tours sur le **même sujet** (ex. « page d’accueil » → correction → autre détail UI), le modèle **recommence** souvent par une phase d’exploration générique : `glob *`, listing racine, lecture `README`, etc. — alors que la structure du dépôt **n’a pas changé**. Coût tokens, latence, impression de « feignant » ou de perte de fil.
- **But produit** : donner au modèle une **carte mentale persistante** du workspace, **synthétique** (pas un dump de tous les fichiers), **enrichie progressivement** quand il navigue, et **réutilisable** d’un `agent.run` à l’autre (et après compaction) sans refaire la cartographie from scratch.
- **Comportement attendu** :
  1. **Première visite** (workspace sans carte, ou carte périmée) : le modèle peut toujours explorer (`glob`, `file_read`, `lsp`) — mais il est invité à **figer** une première carte via un outil dédié (ou mise à jour automatique côté moteur, voir ci-dessous).
  2. **Runs suivants** sur le même workspace : un **extrait court** de la carte est injecté en début de system prompt (ou bloc `[Workspace map]` après `MEMORY.md`) ; le modèle **consulte** la carte avant de relancer des `glob` larges.
  3. **Enrichissement incrémental** : chaque exploration utile **complète** la carte (nouveau dossier découvert, rôle inféré, fichier pivot noté) — pas un replace aveugle de tout le repo à chaque `glob`.
  4. **Invalidation** : si l’empreinte workspace change (hash git HEAD, mtime racine, ou file watcher) → carte marquée `stale` ; le modèle reçoit un nudge « rafraîchis les zones touchées » plutôt qu’un reset total obligatoire.
- **Contenu cible de la carte (synthèse, pas listing brut)** :
  - Racine + **packages / apps** repérés (ex. `extension-vscode/`, `drox/crates/*`).
  - **Rôles** en une ligne par zone (« UI chat », « moteur agent », « tools Rust »).
  - **Fichiers pivots** déjà ouverts ou cités dans le run (`src/app/page.tsx`, `chatView.ts`, …).
  - **Zones non encore explorées** (optionnel) pour guider un `glob` ciblé au lieu de `*`.
  - Limite de taille (ex. ≤ 2–4 k tokens en injection ; détail complet via outil `read`).
- **Pistes d’implémentation** (à trancher) :

| Option | Idée | Pour / contre |
|--------|------|----------------|
| **A — Tools explicites** | `workspace_map_read` + `workspace_map_write` (replace partiel ou merge JSON) ; le modèle décide quand mettre à jour. | Contrôle explicite ; dépend du discipline modèle. |
| **B — Miroir automatique** | Le moteur observe les `tool_result` de `glob` / `file_read` / `lsp` et fusionne dans `.drox/workspace-map.json` sans appel modèle. | Moins de tokens modèle ; logique Rust plus complexe. |
| **C — Hybride (recommandé V1)** | Snapshot initial auto (scan léger : 1–2 niveaux, respect `.gitignore`) + tool `workspace_map_note { path?, summary }` pour annotations + `workspace_map_read` pour le détail. | Bon compromis produit / effort. |

- **Persistance** :
  - Fichier suggéré : `<workspace>/.drox/workspace-map.json` (machine) + option export markdown `.drox/workspace-map.md` (humain).
  - Schéma V1 minimal : `{ version, workspace_fingerprint, updated_at, roots: [{ path, role, children?, pivots?, explored? }] }`.
  - **Par workspace** (jamais globalStorage seul) pour éviter les fuites entre projets.
- **Injection contexte** :
  - Au `agent.run` : listing **compact** (10–30 lignes) dans le system prompt, comme `memory_list` sessions.
  - Après **compaction live** : réinjecter la carte dans le résumé ou la conserver hors transcript (référence stable).
  - Règle prompt : « Si `[Workspace map]` est présent et `stale: false`, **ne refais pas** un inventaire racine complet ; va directement aux chemins listés ou mets à jour la carte. »
- **Articulation backlog** :
  - **§2.18** (`analyzing`) : phase UX + protocole d’exploration **ponctuelle**.
  - **§2.23** (ici) : **mémoire structurelle** réutilisable entre runs.
  - **`MEMORY.md`** : conventions stables du projet (ne pas dupliquer l’arborescence fichier par fichier).
  - **`.drox/memory/sessions/`** : ce qui s’est **passé** dans une session, pas la carte du repo.
  - **`session_search` / mémoire longue** : recherche sémantique dans l’historique ; la carte structure répond à « **où** est le code pertinent **maintenant** ».
- **Tests cibles** :
  - Run 1 : `glob` large → carte créée.
  - Run 2 (même workspace, sujet lié) : pas de second `glob *` racine si carte fraîche ; `file_read` ciblé sur pivot connu.
  - Invalidation : après faux changement d’empreinte, nudge `stale` + refresh partiel.
- **Hors périmètre V1** : index full-text de tout le repo ; remplacement de `grep` ; graphe de dépendances complet ; sync temps réel sur chaque sauvegarde fichier.
- **Sécurité** : scan initial et miroir `glob` / `file_read` appliquent **§2.34 `.droxignore`** (V1 livré) ; `glob` utilise encore la crate `glob` + post-filtre (pas de `.gitignore` natif sur l’énumération).

### 2.24 Sticky — rappel du dernier message utilisateur

- **Problème UX** : pendant un run long (phases repliées, tools, diffs), l’utilisateur **scroll** dans le fil et **perd de vue** sa propre demande (« qu’est-ce que j’avais demandé déjà ? »). Les stickies existants couvrent le **plan agent** (`todo-sticky`, `course-plan-sticky`), pas l’**intention utilisateur**.
- **But produit** : une **bande compacte fixe** au-dessus du composer affiche en permanence le **dernier message utilisateur effectivement envoyé** (celui qui a déclenché le run en cours, ou le dernier avant un nouveau run).
- **Comportement attendu** :
  1. **À l’envoi** (`handleSend`, y compris message dépilé depuis la file §2.14) : mise à jour du sticky avec le texte final (prompt + éventuellement méta « +2 refs · 1 image »).
  2. **Pendant `busy`** : le sticky reste visible ; le textarea peut être vide ou contenir un brouillon / message en attente — le sticky montre la **dernière demande lancée**, pas le brouillon non envoyé.
  3. **Texte tronqué** : 1–2 lignes max (~120–160 car.) avec ellipsis ; tooltip ou `title` avec le texte complet au survol.
  4. **Clic** (ou icône « ↗ ») : scroll + surbrillance du bloc message utilisateur correspondant dans `#log` (même pattern que todo-sticky → scroll vers la carte complète).
  5. **Fin de run** : le sticky **reste** jusqu’au prochain envoi (rappel utile pendant la relecture de la réponse) ; option V2 : disparaître après `busy=false` si l’utilisateur préfère un composer « clean ».
  6. **Reset** : `/new`, `chatReset`, changement de session → masquer ou vider le sticky.
- **Empilement UI** (au-dessus du composer, ordre suggéré de haut en bas) :
  - Bannières contexte (`professor-guard`, `course-cycle`, …)
  - `course-plan-sticky` / `todo-sticky` (état agent)
  - **`user-prompt-sticky`** (nouveau — ce sprint)
  - `#pending-prompts` (messages **futurs** en file)
  - `#user-ask` (questions bloquantes — prioritaire, masque le reste si actif)
  - textarea + toolbar
- **Implémentation prévue (extension webview uniquement)** :
  - `chatView.ts` — sur `append` role `user` (ou payload `send` mémorisé), `post("userPromptSticky", { text, meta?, messageId? })`.
  - `chat.js` — élément `#user-prompt-sticky` (ou réutiliser une classe `.composer-sticky` générique), `renderUserPromptSticky()`, listeners clic → `scrollToUserMessage(id)`.
  - `chat.css` — style discret (fond `inputBackground`, bordure gauche accent « user », typo légèrement plus petite que le corps du message).
  - Pas de RPC / moteur Rust en V1.
- **Cas limites** :
  - Envoi **sans texte** (refs / images seules) : sticky = résumé « Références : foo.ts, bar.ts » ou « 1 image jointe ».
  - Message **très long** : troncature + « voir tout » au clic.
  - **Plusieurs messages** dans un run (file §2.14 dépilée) : sticky = **le dernier** déclencheur du run courant ; les messages en file restent sur les cartes `#pending-prompts`.
- **Articulation** :
  - Complète les stickies **agent** (todo / cours) : l’utilisateur voit **sa question** et **où en est l’agent**.
  - Distinct de **§2.14** (file = futur ; sticky = passé envoyé).
- **Hors périmètre V1** : historique des N derniers messages utilisateur ; édition inline depuis le sticky ; sync multi-fenêtre.

### 2.25 Fidélité objectif — auto-vérification des décisions (anti-dérive de scope)

> **Statut** : **V1 partielle livrée (2026-05-19)** — pistes **A + C + F** (heuristique `run_objective`, tool `scope_defer`, sticky objectif, rappel soft avant `[phase: done]`). **Backlog** : checklist gate (B), budget exploration (D), auto-vérification LLM (E).  
> **`[REF-LEAK ~]`** — inspiration `queryContext.ts` / parties de `QueryEngine.ts` ; conception surtout **Drox-native**. Cf. §2.26.0.

#### Symptôme (exemple utilisateur)

Demande : *« Tu peux supprimer les liens avec la BDD ? Pour l’instant c’est un site vitrine, pas besoin de Prisma. »*

Comportement observé : le modèle **explore**, repère des **incohérences** (fichiers orphelins, imports morts, config DB ailleurs, README obsolète…), s’**auto-réfléchit** de plus en plus large, et **s’éloigne** de l’objectif mesurable : **retirer la dépendance Prisma / les chemins BDD**, pas refondre tout le dépôt.

#### Problème structuré

| Ce n’est pas… | C’est… |
|---------------|--------|
| Manque d’outils (`glob`, `grep`, `lsp`) | **Mauvaise priorisation** : exploration et « qualité globale » mangent le budget tours / tokens |
| Phase `testing` (§2.11) | Vérifier que **le code tourne** après edit — pas que **la bonne tâche** a été faite |
| `todo_write` mal rempli | La todo peut lister 12 items « audit » sans lien avec la **question utilisateur** |
| Absence de mémoire | Même avec mémoire sessions, l’**objectif du run courant** n’est pas **réinjecté** assez fort pour résister aux découvertes |

#### But produit

Avant `[phase: done]`, le système doit pouvoir répondre (au moins en interne) à :

1. **Quelle était la demande utilisateur en une phrase ?**
2. **Qu’est-ce qui était explicitement hors scope** (découvertes notées mais non traitées) ?
3. **Qu’est-ce qui a été livré** pour répondre à (1) — preuves (fichiers touchés, commandes, critères) ?
4. **Reste-t-il du travail in-scope** non fait ?

#### Pistes d’implémentation (non exclusives — à trancher)

| # | Piste | Idée | Effort estimé |
|---|--------|------|----------------|
| **A** | **Objectif verrouillé (Sprint B+)** | Au 1er tour, extraire `run_objective` du message user (LLM léger ou heuristique) ; **réinjecter** à chaque nudge / avant `done` : « Rappel objectif : … ». Cf. §5 n°14. | Faible → moyen |
| **B** | **Checklist de clôture** | Gate `[phase: done]` : refuser si aucun item « Definition of done » coché (ex. `package.json` sans `@prisma/client`, plus de `schema.prisma` référencé, build OK). Peut vivre dans `todo_write` ou tool `run_checklist_write`. | Moyen |
| **C** | **Parking « hors scope »** | Tool `scope_defer { finding, reason }` ou section fixe dans `session_note` : *« Trouvé X — hors scope de la demande actuelle »*. Règle prompt : **noter puis ignorer** sauf demande utilisateur. | Faible |
| **D** | **Budget exploration** | Compteur moteur : après N tours **read-only** sans mutation liée à l’objectif → nudge « tu explores sans avancer sur : … ». Complète `LoopDetector` (répétition) par **dérive d’intention**. | Moyen |
| **E** | **Auto-vérification LLM** (coûteux) | Tour dédié sans tools avant `done` : « Compare objective vs fichiers modifiés ; liste écarts ». Option setting `drox.alignmentCheck`. | Moyen → élevé |
| **F** | **UI rappel objectif** | Sticky jumeau de §2.24 : bandeau **objectif du run** (1 ligne) + lien vers message user. | Faible (webview) |

**Piste recommandée pour un V1 pragmatique** : **A + C + F** (objectif visible + parking hors scope + réinjection texte), puis **B** si les dérives persistent.

#### Règles prompt (brouillon)

- « Une **incohérence découverte** n’est **pas** une tâche implicite : soit tu la **ranges** hors scope (`scope_defer` / note), soit tu demandes confirmation via `ask_user_question`. »
- « Tant que l’objectif utilisateur n’est pas atteint, **ne pas** ouvrir de chantier parallèle (refactor global, migration stack, audit complet). »
- « Avant `[phase: done]`, cite **3 preuves** que l’objectif est satisfait (chemins / diffs / commandes). »

#### Articulation backlog

| Item | Lien |
|------|------|
| **§5 n°14 — Sprint B** | Socle « objectif persistant en RAM » — §2.25 en est l’**extension produit** (anti-dérive, pas seulement rappel texte). |
| **§2.11 — `testing`** | Orthogonal : build/lint après mutation. |
| **§2.18 — `analyzing`** | L’analyse large est **légitime** si demandée ; ici le problème est l’analyse **non demandée** qui remplace la tâche. |
| **§2.13 — Questions** | Si le modèle veut élargir le scope (« je vois aussi X, on s’en occupe ? ») → `ask_user_question` **avant** de partir en refactor. |
| **§2.24 — sticky user** | Affichage parallèle : **ce que l’user a dit** + **ce que le run doit accomplir**. |

#### Critères d’acceptation (E2E — brouillon)

- Scénario Prisma : run avec demande « retirer Prisma » → à la fin, `package.json` / imports cohérents **ou** message clair « bloqué par … » ; **pas** de 10 fichiers hors sujet modifiés sans accord.
- Si le modèle note ≥ 2 findings hors scope, ils apparaissent dans un **bloc parking** visible (UI ou `session_note` agrégé), pas noyés dans la trace.
- `[phase: done]` déclenche au moins un **rappel objectif** dans les 2 derniers tours (nudge moteur si absent).

#### Hors périmètre (pour l’instant)

- Jugement moral ou « qualité architecture » globale du repo.
- Remplacement du jugement utilisateur sur ce qui mérite d’être corrigé.
- Modèle séparé « chef de projet » en permanence (trop lourd pour V1).

### 2.26 Réappropriation leak — matrice moteur découplé (sans services Claude)

> **Statut** : **référence produit** — cartographie de ce qu’on **garde**, **porte**, ou **ignore** dans le package TS leak (~2000 fichiers ; ~10–12 % **COEUR** selon `docs/INVENTAIRE-NOYAU-MOTEUR.md`). Objectif : ne pas réécrire le binaire TS ; **extraire les patterns** réutilisables avec **Ollama + workspace local**.

#### 2.26.0 Convention `[REF-LEAK]` — conserver le moteur TS leak comme référence

Certains sprints **ne peuvent pas** s’appuyer uniquement sur `docs/INVENTAIRE-NOYAU-MOTEUR.md` ou le code Rust déjà écrit : il faut garder l’arborescence **`src/`** du package leak **dans ce dépôt** (ou submodule équivalent) **tant que l’item est ouvert**, pour comparer comportement, edge cases et enchaînements.

| Marqueur | Signification | Règle équipe |
|----------|---------------|--------------|
| **`[REF-LEAK]`** | Référence TS **obligatoire** pendant tout le sprint | Ne pas supprimer / déplacer `src/` sans extraire d’abord tests Rust + notes dans la section concernée. L’inventaire doc indique *quoi* lire ; `src/` est la *vérité comportementale*. **Affiché dans la colonne Priorité** (§1, §5) : ex. `P1 [REF-LEAK]`. |
| **`[REF-LEAK ~]`** | Consultation **ponctuelle** (1–3 fichiers ou schéma tool) | `INVENTAIRE` + code Drox suffisent souvent ; ouvrir le TS seulement en cas d’ambiguïté. Ex. `P2 [REF-LEAK ~]`. |
| *(aucun)* | Conception **Drox-native** (extension, prompt, UX) | Pas de dépendance au leak pour livrer. Priorité seule : ex. `P1`, `P2`. |

**Arborescence de référence** (racine repo) :

- `src/tools/`, `src/services/`, `src/utils/`, `src/constants/` — logique moteur / tools.
- `docs/INVENTAIRE-NOYAU-MOTEUR.md` — index par crate Drox (ne remplace pas la lecture du TS pour les items `[REF-LEAK]`).
- **Hors référence utile** pour ces sprints : `src/hooks/` (UI Ink), services cloud listés en NOISE ci-dessous.

**Registre backlog — besoin `[REF-LEAK]`** (priorité produit = colonne **Priorité** §1 / §5)

| Priorité | Item | § | §5 | Fichiers leak prioritaires (non exhaustif) |
|----------|------|---|-----|---------------------------------------------|
| ✅ P1 [REF-LEAK] | Bash classifier | 2.27 | 33 | **Livré (V1)** — `permission_flags`, `auto_deny_message`, compound segments |
| ✅ P2 [REF-LEAK] | Tools MCP registre | 2.28 | 34 | **Livré (clos)** — stubs `mcp__*`, resources, `McpHub` |
| ✅ P2 [REF-LEAK] | Orchestration tools | 2.29 | 35 | **Livré (V1)** — `drox-engine/src/tool_orchestration.rs`, boucle agent par lots |
| ✅ P2 [REF-LEAK] | Règles permissions fichier | 2.30 | 36 | **Livré (V1)** — `drox-permissions/` ; `settings.local.json` ; glob chemins ; shadowed rules |
| ✅ P2 | Notebook edit | 2.4 | 18 | **Livré** — `notebook_edit` replace/insert/delete |
| ✅ P2 [REF-LEAK] | Hooks pre/post tool | 2.6 | — | **Livré (V1)** — `drox-hooks/`, `.drox/hooks.json` |
| P3 [REF-LEAK] | Workers / sous-agents | 2.10 | 20 | `tools/AgentTool/*`, `tools/shared/spawnMultiAgent.ts` |
| ✅ P3 [REF-LEAK] | Skills locaux | 2.31 | 37 | **Livré (V1)** — `drox-tools/src/skills/`, `skill_read`, `skill_list` |
| ✅ P3 [REF-LEAK] | Git worktrees | 2.32 | 38 | **Livré (V1)** — `drox-tools/src/git_worktree/`, enter/exit tools |
| ✅ P2 [REF-LEAK ~] | `delete_path` | 2.33 | 39 | **Livré (V1)** — `drox-tools/simple/delete_path.rs`, `path_util` |
| ✅ **P0** | `.droxignore` (lecture interdite) | 2.34 | 40 | **Livré (V1, 2026-05-19)** — `DroxIgnoreMatcher` ; post-filtre `glob` ; walk `grep` ; refus `file_read` ; carte §2.23 |
| ✅ P1 [REF-LEAK ~] | `ask_user_question` (régression) | 2.21 | 28 | **Livré (V1)** — `normalize_input`, `CANONICAL_ASK_JSON_EXAMPLE`, anti-boucle 3× |
| P1 [REF-LEAK ~] | Phase `analyzing` | 2.18 | 12a | `utils/queryHelpers.ts`, `queryContext.ts` |
| P1 [REF-LEAK ~] | Phase `testing` | 2.11 | 12 | Gates tools / prompt (pas de module unique) |
| ✅ P1 [REF-LEAK ~] | Fidélité objectif | 2.25 | 32 | **Livré V1 partielle** — `runObjective.ts`, `scope_defer`, sticky objectif ; suivi checklist / budget |
| ✅ P1 | Carte workspace | 2.23 | 30 | **Livré V1** — `workspace_map.rs`, tools + miroir moteur |
| ✅ P2 [REF-LEAK ~] | Placeholder / complétion | 2.8 | 19 | **Livré (V1)** — `promptCompletion.ts`, webview `@` + placeholder |
| ✅ P1 | **Compaction efficace V2** | **2.7** | **17** | `microcompact.rs` + `compact_until_budget` — ref. leak `microCompact.ts` |

**Sans `[REF-LEAK]`** (ne pas bloquer un ménage `src/` sur ces seuls items) : sticky user §2.24 ✅, carte workspace §2.23 ✅, fidélité objectif §2.25 ✅ (V1 partielle), **`.droxignore` §2.34** ✅, erreurs → chat §2.19 ✅, outils on/off §2.17 ✅, mode Professeur enforcement §2.22 (gates déjà en Rust), smart paste §2.9 ✅, file d’attente §2.14 ✅, mémoire longue extension §2.16 (V1 hors TS).

**Clôture d’un item `[REF-LEAK]`** : avant de retirer le marqueur, documenter dans la section §2.x les **écarts assumés** vs leak + tests Rust qui figent le contrat ; optionnel : pointer les fichiers TS « lus une fois » dans un commentaire crate.

#### Déjà porté (ne pas re-planifier)

| Domaine | Drox | Sources leak (indicatif) |
|---------|------|---------------------------|
| Boucle agent + phases | `drox-engine` | `QueryEngine.ts`, `query.ts`, `toolExecution.ts` (simplifié) |
| Tools fichiers / web / todo / plan / MCP | `drox-tools` | `File*Tool`, `GrepTool`, `GlobTool`, `Web*Tool`, `TodoWriteTool`, `MCPTool/*` (V1 : `mcp_call` générique) |
| Permissions modes | `drox-permissions` | `permissions.ts`, plan mode |
| Contexte / compaction | `drox-context`, M1/M2 | `services/compact/*` (partiel) — **efficacité live V2 livrée** §2.7 ; reactive compact leak **P2** |
| Sessions JSONL + MEMORY | `drox-session` | `sessionStorage.ts`, `memdir/*` |
| Protocole client | JSON-RPC | `structuredIO.ts` (contrat, pas Ink) |

#### Backlog actif (items dédiés ci-dessous)

| Priorité | Thème | Section |
|----------|--------|---------|
| P1 [REF-LEAK ~] | Phases `analyzing` / `testing` | §2.18, §2.11 |
| P1 (régression) | Mode Professeur — enforcement E2E | §2.22 |
| P0 (suite) | Sprint B/C — objectif persistant multi-run | §5 n°14–15 |
| ✅ P1 [REF-LEAK ~] | Fidélité objectif (V1 partielle) | §2.25 — suivi checklist / budget / LLM |
| ✅ P1 | Carte workspace | §2.23 — suivi git HEAD, E2E |
| ✅ **P0** | `.droxignore` | §2.34 — **livré V1** |
| ✅ P2 [REF-LEAK] | Orchestration, règles fichier, hooks | §2.29–§2.30, §2.6 |
| ✅ P2 [REF-LEAK ~] | `delete_path` | §2.33 |
| ✅ P3 [REF-LEAK] | Skills, worktrees | §2.31, §2.32 **livrés** |
| P3 [REF-LEAK] | Multi-agent local | §2.10 |

#### NOISE — ne pas porter (traçabilité)

- **UI terminal** : `src/hooks/` (Ink), spinners, surveys.
- **Cloud Anthropic** : OAuth session cloud, settings sync, teleport, ultrareview, policy/quota, GrowthBook, OTEL, `logEvent` analytics.
- **Produits fermés** : marketplace plugins, voice, computer use, Chrome extension, x402, team memory sync cloud, `cloudMcp.ts`, swarm tmux, remote agents.
- **Stubs inutiles** : copier `bashClassifier.ts` du fork tel quel (stub) — **réimplémenter** en Rust (§2.27).

#### Améliorations secondaires (mention leak, pas de sprint dédié V1)

- **Extraction auto faits** (`extractMemories`) → complète §2.2, pas de nouveau §.
- **Microcompact / reactive compact** → **P1** pour §2.7 (efficacité summarize) ; pas un « nice-to-have » perf.
- **PowerShell classifier** (`utils/powershell/*`) → après bash ; Windows-first.
- **Attachments unifiés** (`fsOperations.ts`, `attachments.ts`) → partiellement couvert §2.20 + `.drox/attachments/`.

### 2.27 Bash classifier complet (`drox-bash` → `drox-permissions`) — **LIVRÉ (V1)**

> **Statut** : **livré (2026-05-15)** — classifieur branché sur la boucle permissions.
> **`[REF-LEAK]`** — référence `utils/bash/*`, `BashTool/*`, `destructiveCommandWarning.ts`.

- **Livré** :
  - `BashCommandKind` + `permission_flags` / `auto_deny_message` (`drox-bash/src/classify.rs`).
  - `PermissionPolicy::evaluate_bash_segment` : compound `split_command_segments`, flags read/write par segment, **auto-deny** motifs destructifs (`rm -rf`, `git reset --hard`, `kubectl delete`, …) sauf règle `Allow` explicite ou `BypassPermissions`.
  - **Auto-allow** lectures (`ls`, `git status`, `cat`, …) en mode défaut.
  - Messages refus explicites (« Commande Bash refusée (…) »).
- **Écart vs leak** : pas d’AST tree-sitter complet ni `bashSecurity.ts` intégral ; heuristique premier token + regex destructives.
- **Backlog (suivi)** : tree-sitter pour heredocs/pipes complexes.
- **Tests** : `drox-bash` classify + `drox-engine` permissions (ls allow, rm -rf deny, curl ask, compound).

### 2.28 Tools MCP au registre agent (`drox-mcp`) — **LIVRÉ**

> **Statut** : **livré (2026-05-15)** — tools modèle branchés au registre agent.  
> **`[REF-LEAK]`** — `src/services/mcp/*`, `src/tools/MCPTool/*` (hors `cloudMcp.ts`). Cf. §2.26.0.

- **Crate `drox-mcp`** : parse `.mcp.json` / `mcp.json`, expansion `${VAR}`, connexion stdio + HTTP streamable (`rmcp`), **`McpHub`** (pool lazy par serveur), `list_tools_json` / `call_tool_json` / `list_resources_json`.
- **Tools registre** (`drox-tools`, enregistrés à `agent.run` si config MCP non vide) :
  - **`mcp_call`** — `{ server, tool, arguments }` → appel tool distant.
  - **`list_mcp_resources`** — liste agrégée avec champ `server` ; filtre `server` optionnel.
  - **`read_mcp_resource`** — `{ server, uri }`.
- **Branchement** : `McpHub::discover(workspace)` dans `drox-cli` handlers ; `ToolContext::with_mcp_hub` ; `ToolRegistry::register_mcp_tools()`.
- **Permissions** : `list_mcp_resources` / `read_mcp_resource` en lecture seule ; `mcp_call` → règles qualifiées `mcp__<server>__<tool>` (aligné leak).
- **Stubs dynamiques** : à `agent.run`, connexion aux serveurs `.mcp.json` / `mcp.json`, `tools/list` → un tool registre par entrée (`mcp__<server>__<tool>`) avec **schéma MCP réel** ; `mcp_call` masqué au LLM si au moins un stub ; conservé en secours si découverte vide.
- **Permissions** : `readOnlyHint` MCP → `Tool::is_read_only()` ; règles `mcp__<server>__<tool>`.
- **Backlog mineur (hors clôture §2.28)** : toggle désactiver MCP (§2.17) ; compaction résultats volumineux (`classifyForCollapse.ts`).
- **Sources leak** : `src/services/mcp/{client,config,auth}.ts`, `src/tools/MCPTool/*`, `ReadMcpResourceTool`, `ListMcpResourcesTool` — **exclure** `cloudMcp.ts`, `xaa*.ts`.
- **Tests** : `cargo test -p drox-mcp -p drox-tools -p drox-engine -p drox-cli`.

### 2.29 Orchestration tools — reads parallèles, writes sérialisés

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK]`** — `src/services/tools/{toolOrchestration,StreamingToolExecutor,toolExecution}.ts`. Cf. §2.26.0.

- **Livré** :
  - **`partition_tool_calls`** (`drox-engine/src/tool_orchestration.rs`) : lots consécutifs `Parallel` (read-only / `is_concurrency_safe`) vs `Serial` (mutations, `bash`, `todo_write`, …).
  - Boucle agent : gates pré-exécution + permissions → exécution **`buffer_unordered`** (plafond `AgentConfig.max_parallel_tool_calls`, défaut **8**) pour les reads ; branche série inchangée pour mutations / plan / compteurs todo.
  - **`is_concurrency_safe`** sur `Tool` (défaut = `is_read_only`) ; reads marqués : `file_read`, `grep`, `glob`, `lsp`, `web_fetch`, `web_search`, `memory_read`, `memory_list`, MCP list/read resources.
  - Ordre des **`tool_result`** dans le transcript = ordre des tool calls du tour (indices du lot parallèle rejoués en série après collecte).
- **Hors périmètre V1** : exécution tools **pendant** le streaming assistant ; verrou workspace global au-delà de la partition par tour.
- **Tests** : `cargo test -p drox-tools -p drox-engine` (`tool_orchestration::tests`, régression agent).

### 2.30 Règles permissions fichier (style `.claude` / `.drox`)

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK]`** — `src/utils/permissions/{permissionRuleParser,filesystem,shadowedRuleDetection}.ts`. Cf. §2.26.0.

- **Livré** :
  - **Alias leak** à l’import : `Edit`/`Read`/`Write` → `file_edit`/`file_read`/`file_write` (`drox-permissions/src/tool_names.rs`, `parse_rule`).
  - **Matching chemins gitignore** pour `file_*` / `notebook_edit` / `delete_path` : motifs `**/*.env`, `/.env`, `~/…`, `//…` (`path_matcher.rs` + `PathMatchContext` sur le moteur).
  - **Auto-deny chemins sensibles** (`.env`, `.git/`, `.drox/`, dotfiles config) sauf règle `Allow` explicite.
  - **Règles masquées** : `detect_unreachable_rules` (allow spécifique + ask/deny tool-wide) → `tracing::warn` au chargement CLI / JSON-RPC.
  - Règles dans `~/.drox/settings.json`, `<workspace>/.drox/settings.json` et **`settings.local.json`** (priorité mode : local > project > user).
  - **`copy_path`** : source + destination évaluées ; règles `Edit(…)` / `file_edit(…)` applicables (2026-05-19).
- **Hors périmètre V1** : fichier dédié `.drox/permissions.json` séparé ; lecture `.claude/settings` ; sandbox Bash dans shadowing ; UI warnings extension.
- **Articulation** : §2.27 (bash), §2.17, mode Professeur (`workArea` inchangé).
- **Tests** : `cargo test -p drox-permissions -p drox-engine` (glob `Edit(**/*.env)`, shadowed, dangerous paths).

### 2.31 Skills — catalogue de prompts locaux

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK]`** — `src/tools/SkillTool/*`, `skills/bundled/`. Cf. §2.26.0.

- **Livré** :
  - Découverte `<workspace>/.drox/skills/<name>/SKILL.md` (`drox-tools/src/skills/catalog.rs`) : front-matter `name`, `description`, `when_to_use`, `disable-model-invocation`.
  - **Listing compact** injecté au system prompt à chaque `agent.run` (CLI + JSON-RPC), budget ~8k caractères (aligné leak `SkillTool/prompt.ts`).
  - Tools read-only **`skill_read { name }`** et **`skill_list {}`** ; auto-allow permissions ; parallélisables (orchestration §2.29).
  - Skills `disable-model-invocation: true` exclus du listing LLM ; `skill_read` renvoie une erreur explicite.
- **Hors périmètre V1** : skills utilisateur globaux `~/.drox/skills/` ; marketplace / MCP skills ; invocation fork / sous-agent ; slash `/skill` côté UI.
- **Articulation** : distinct de `MEMORY.md` (état projet) et skills Cursor utilisateur (hors repo).
- **Tests** : `cargo test -p drox-tools -p drox-cli` (`skills::catalog`, `skill_read`, `skill_list`, prompt).

### 2.32 Git worktrees — branches isolées

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK]`** — `EnterWorktreeTool`, `ExitWorktreeTool`, `utils/worktree.ts`. Cf. §2.26.0.

- **Livré** :
  - **`git_worktree_enter { name? }`** — `git worktree add -B worktree-<slug> .drox/worktrees/<slug>` ; session `.drox/worktree-session.json` ; `ToolContext::effective_workspace()` redirige file/bash vers le worktree.
  - **`git_worktree_exit { action, discard_changes? }`** — `keep` (conserve) ou `remove` (garde-fou changements non commités, puis `worktree remove` + `branch -D`).
  - Validation slug leak (`validateWorktreeSlug`), branche `worktree-<slug>` avec `/` → `+`.
- **Hors périmètre V1** : symlinks `node_modules`, hooks WorktreeCreate, tmux, sparse-checkout, UI graphique, fetch origin automatique.
- **Tests** : `cargo test -p drox-tools` (`git_worktree::tests`, roundtrip git si `git` dispo).

### 2.33 Tool `delete_path`

> **Statut** : **LIVRÉ (V1)** — 2026-05-15.  
> **`[REF-LEAK ~]`** — `src/utils/fsOperations.ts` (`rm`), `src/utils/permissions/pathValidation.ts` (`isDangerousRemovalPath`). Cf. §2.26.0.

- **Livré** :
  - Tool `delete_path` (`drox-tools/src/simple/delete_path.rs`) : fichier / dossier sous workspace, mode propose vs apply.
  - **`recursive`** (défaut `true`) : `remove_dir_all` ; `false` = `remove_dir` (dossier vide uniquement).
  - Garde-fous leak : wildcards (`*`, `/*`), racine workspace, chemins résolus sensibles, entrées protégées (`.git`, `.drox`, `node_modules`, …).
  - **`normalize_input`** : alias `file_path` / `filePath` / `target`.
  - Permissions : règles fichier §2.30, `plan_mode` → refus, preview UI `Deleted` (`toolEventPreview.ts`).
- **Hors périmètre V1** : journal mode Professeur (feature Drox-native, §2.15) ; undo suppression.

### 2.34 `.droxignore` — chemins interdits au modèle (obligation moteur)

> **Statut** : **livré (V1, 2026-05-19)** — filtre moteur actif ; **backlog V2** : refactor `glob` → walk unifié, garde `lsp` extension VS Code, commande « Ouvrir `.droxignore` ».  
> Distinct de `.gitignore` (VCS) et des règles **permissions** §2.30 (allow/ask/deny par action) : ici il s’agit d’**exclure des chemins de toute lecture agent**, y compris quand le modèle « explore ».

#### Problème observé

| Outil / chemin | Comportement actuel (2026-05) | Risque |
|----------------|------------------------------|--------|
| **`glob`** | Crate `glob` sur le FS : **aucun** filtre `.gitignore` ni liste Drox | `glob **/*` ou `*.env` peut **lister et révéler** `.env`, clés, dumps, `node_modules/`, artefacts hors périmètre |
| **`grep`** | `WalkBuilder` avec `.git_ignore(true)` seulement | Respecte le dépôt git, **pas** les exclusions projet Drox (secrets commités par erreur, chemins hors git) |
| **`file_read`** | Résolution sous workspace, **pas** de check ignore | Lecture directe si le modèle connaît le chemin (référence, erreur LSP, ancien glob) |
| **`workspace_map` scan** | `WalkBuilder` + `.git_ignore(true)` | Même limite que `grep` |
| **Prompt seul** | « Ne lis pas les secrets » | **Non fiable** — contournable par exploration |

**Conclusion** : ce n’est **pas** une question de discipline modèle ; le moteur doit **refuser ou filtrer** avant que le contenu n’entre dans le contexte LLM.

#### But produit

1. Fichier **`<workspace>/.droxignore`** (à la racine, versionnable par l’équipe) — syntaxe **gitignore** (motifs relatifs, `!` négation optionnelle V2).
2. **Chargement** au `agent.run` (et cache par workspace) ; échec explicite si le fichier est absent → **template par défaut** embarqué ou généré à la première utilisation (`.env`, `.env.*`, `**/*.pem`, `**/secrets/**`, `**/.aws/**`, dumps `*.sql`, `*.dump`, répertoires build massifs optionnels).
3. **Application obligatoire** (liste non exhaustive) :
   - **`glob`** : post-filtrage des `files` / `directories` **ou** remplacement par walk `ignore` + motif (recommandé pour alignement `grep`).
   - **`grep`** : `WalkBuilder` avec matcher **gitignore ∪ droxignore** (builder custom ou fichier temporaire fusionné).
   - **`file_read`** / **`notebook_edit`** (lecture) : **refus** `ToolError` si chemin ignoré (message : « path blocked by .droxignore »).
   - **`lsp`** : refus ou no-op sur chemins ignorés.
   - **`workspace_map`** scan + miroir : ne pas indexer les chemins ignorés.
   - **Injection prompt** : rappel court « N motifs actifs dans `.droxignore` — lecture interdite » (complément, **pas** substitut au filtre moteur).
4. **Permissions** §2.30 : les règles `deny` fichier restent complémentaires ; `.droxignore` est la **barrière baseline** lisibilité / secrets pour **tous** les modes.

#### Pistes d’implémentation

| # | Composant | Idée |
|---|-----------|------|
| **A** | `drox-session` ou `drox-tools::path_ignore` | `DroxIgnoreMatcher` : charge `.droxignore`, `matched(path) -> Ignored`, tests insta |
| **B** | `ToolContext::path_ignore` | Matcher partagé cloné sur tous les tools |
| **C** | **`glob` refactor** | Abandonner `glob::glob` seul → `WalkBuilder` + filtre motif **ou** `glob` + filtre post-match systématique |
| **D** | Réponses outils | Champs `paths_omitted_by_droxignore: N` + échantillon (sans contenu) pour que le modèle comprenne le trou |
| **E** | VS Code | Commande « Ouvrir `.droxignore` », snippet à la création workspace, diagnostic si le modèle tente un chemin bloqué |

**Priorité technique** : **C + B** en premier (`glob` est le plus problématique pour l’exploration large).

#### Exemple `.droxignore` (brouillon)

```gitignore
# Secrets & credentials (obligatoire — ne pas retirer)
.env
.env.*
!.env.example
**/*.pem
**/*.key
**/secrets/
**/.aws/credentials

# Dumps / artefacts volumineux (adapter au projet)
**/*.sql
**/*.dump
**/backups/

# Optionnel : déjà dans .gitignore mais renforcer côté agent
# node_modules/
# target/
```

#### Critères d’acceptation

- `glob` avec `pattern: "**/*"` sur un repo contenant `.env` : `.env` **absent** de `files`, compteur `droxignore_omitted` ≥ 1.
- `file_read` sur chemin listé dans `.droxignore` : **erreur** outil, aucun octet dans le `tool_result`.
- `grep` ne matche **aucune** ligne dans un fichier ignoré même si hors `.gitignore`.
- Carte workspace §2.23 : scan initial **n’ajoute pas** de nœuds sous chemins ignorés.
- Test régression : modifier `.droxignore` → rechargement au run suivant.

#### Articulation backlog

| Item | Lien |
|------|------|
| **§2.23** carte workspace | Le scan et le miroir doivent respecter `.droxignore` |
| **§2.30** permissions | Deny par action vs ignore lecture globale |
| **§2.17** tools on/off | Orthogonal |
| **§5 n°40** | Item de suivi sprint |

---

## 4. Mémoire `.drox/memory/` (récap, livré Sprint M1)

**Principe central** : compaction et mémoire sont **le même artefact**. Le résumé produit pour persistance est exactement ce qui pourrait demain alléger un contexte trop long. Pas de duplication d'effort modèle, pas de divergence entre « ce qui est sauvé » et « ce qui est ré-injecté ».

- Dossier : `<workspace>/.drox/memory/sessions/`.
- Création : **automatique** à la fin d'un run non trivial (≥ 1 mutation réussie OU ≥ 1 `todo_write` réussi OU ≥ 1 `session_note` réussi).
- Fichiers : `YYYY-MM-DD-<slug>.md` (slug ASCII court ≤ 50 chars, dédup `_2`/`_3`/… si collision même jour).
- Front-matter : `slug`, `objective`, `date` (ISO 8601 UTC), `model`, `files_touched`.
- Body : markdown structuré (`## Objective` / `## Decisions` / `## Files touched` / `## What's in progress` / `## Pinned notes`). Produit par un **tour LLM dédié** avec `COMPACTION_PROMPT` (anglais, sections H2 obligatoires). Pas de secrets — c'est au modèle de filtrer.
- Lecture inverse : listing court (slug + objectif) injecté en début de system prompt ; tools `memory_read { slug }` / `memory_list { limit? }` pour recharger en détail.
- Tool `session_note { content }` : épingle pendant le run une info à survivre. Stockage RAM, draîné par la compaction et concaténé au résumé. Optionnel — le résumé automatique capture déjà l'essentiel.
- UI : event `MemoryPersisted`, chip discret « ◌ Session archivée : <slug> — <objectif>  (ouvrir) » dans le fil de chat, cliquable.
- Lien avec transcript JSONL existant : le `.md` est une **vue humaine** condensée ; le JSONL reste la vérité machine pour `session.read`. Les deux coexistent.
- **Évolution prévue (backlog §2.16)** : mémoire longue — en **Sprint 1**, résumés de compaction + fins de session dans une **BDD embarquée** (extension) avec **embeddings** ; pas d’obligation de fichiers `summarizes/` / `cycles/` sur disque au début (export possible plus tard).
- **Relation `MEMORY.md`** : complémentaire. `MEMORY.md` = mémoire **stable** du projet (conventions, architecture macro) ; `.drox/memory/sessions/*.md` = **traces horodatées** par session de travail.

---

## 5. Ordre de sprint suggéré (modifiable)

1. ✅ **Vision réelle** (P0) — livré (2026-05-12).
2. ✅ **WebSearchTool** (P1) — livré (2026-05-12).
3. ✅ **LSPTool** (P2) — livré (2026-05-12, avancé en priorité).
4. ✅ **Stabilité Ollama** (P0) — livré (2026-05-12) : defaults `num_predict`=4096 / `num_ctx`=32768, auto-continuation sur `StopReason::MaxTokens`, core system prompt orienté discipline d'outillage, sampling avancé (`top_p`/`top_k`/`repeat_penalty`/`seed`) exposé via settings + env vars (`DROX_TOP_P`, `DROX_TOP_K`, `DROX_REPEAT_PENALTY`, `DROX_SEED`), bouton ⚙ ouvrant les paramètres VS Code depuis la barre du chat.
5. ✅ **Tool `todo_write`** (P1) — livré (2026-05-13). Tool Rust pur stateless (`drox-tools/src/simple/todo_write.rs`), schéma `{ todos: [{ id, content, status: pending|in_progress|completed|cancelled }] }`, validation stricte (≥ 2 items, ids uniques, ≤ 1 `in_progress`), permissions read-only (auto-allow en mode `default`). Section "Planification" ajoutée au `CORE_SYSTEM_PROMPT`. Côté extension : `tool_finish` du tool intercepté dans `chatView.ts`, payload converti en event `todoUpdate`, rendu dans la webview comme **un bloc unique qui s'update en place** (carte "Plan de la tâche" avec icônes ○/◐/✓/⊘ par statut, items terminés barrés) + **sticky compact** au-dessus du composer affichant l'étape `in_progress` courante tant qu'il reste un item actif (click = scroll vers le bloc complet). Reset auto sur `chatReset` (`/new` ou `loadSession`).
6. ✅ **Refonte system prompt action-first** (P0 régression) — livré (2026-05-13). Symptôme : depuis la stabilité Ollama, le modèle (Devstral-small 24B / Gemma 26B) devenait "feignant" : il répondait sans appeler les tools, hallucinait des contextes, demandait des clarifications au lieu d'agir. Cause : `CORE_SYSTEM_PROMPT` trop long (4 grandes sections + section `todo_write` qui rendait le modèle hésitant). Fix : prompt réécrit avec une **Règle d'or "AGIR pas annoncer"** en premier, **exemples concrets** ("Analyse le projet" → `glob` + `file_read README*` immédiatement), `todo_write` marqué explicitement comme optionnel. Tests étendus pour vérifier la présence des exemples concrets et des outils référencés. **Itération suivante (2026-05-13 bis)** : ajout d'une consigne **"lis vraiment + suis les imports / types / fonctions appelées"** pour les demandes d'analyse / explication de code (au lieu de scanner les noms de fichiers), et d'une consigne de **brièveté** ("droit au but, pas de paraphrase ligne par ligne, max 1-2 extraits courts"). 9 tests sur `prompts.rs`.
7. ✅ **Fix `ctx` à 0** (bug) — livré (2026-05-13). Le compteur `ctx` en bas à droite restait toujours à 0 parce qu'il n'était mis à jour que sur l'event rarissime `context_snip`. Or Ollama renvoie déjà `prompt_eval_count` dans chaque réponse, exposé comme `usage.inputTokens` côté `stop` event. On affecte maintenant `ctxTokens = m.inputTokens` à chaque `usage` reçu (côté `chat.js`) : la pastille reflète la taille réelle du contexte (system + tools + transcript + user) chargé pour le tour courant.
8. ✅ **Ouvrir auto les fichiers modifiés** (UX) — livré (2026-05-13). Nouveau setting `drox.openModifiedFiles` (bool, default `true`, scope resource) qui, à chaque `fileChange` réussi via `file_edit` / `file_write`, ouvre le fichier dans l'éditeur avec `preserveFocus: true` (le chat garde le focus) et `preview: false` (onglet persistant). Le diff reste visible dans le chat ; l'éditeur sert juste à inspecter / continuer la modif manuellement.
9. ✅ **Fix exploration `glob` ne voit pas les dossiers** (bug) — livré (2026-05-13). Symptôme : sur un workspace multi-projets (`.drox/`, `app-kdds-main/`, `app-kdds-rust/`, `README.md`), un `glob *` à la racine renvoyait `files: ["README.md"]` et le modèle concluait « le workspace ne contient qu'un README ». Cause : `drox-tools::simple::glob` filtrait `utf.is_file()`. Fix : output enrichi `{ files, directories, truncated }`, plafond cumulé renommé `MAX_ENTRIES` (10 000), description du tool clarifiée. Test de régression `star_pattern_lists_files_and_directories`.
10. ✅ **Sprint A — Refonte protocole de phases** (P0, refonte philosophie) — livré (2026-05-13). **Motivation** : les itérations précédentes (#6, #8, #9) avaient empilé des heuristiques de détection de « réponses paresseuses » (`looks_like_synthesis_deferral` + 28 phrases, `looks_like_action_deferral` + 30 phrases + composite). Approche fragile, non-portable, qui inverse la responsabilité (moteur = flic ; modèle = exécuteur). **Refonte** : c'est désormais le modèle qui structure son raisonnement en phases explicites annoncées par des marqueurs ligne `[phase: nom]`, et qui décide lui-même de sa clôture via `[phase: done]`. Le moteur applique **une seule règle** : pas de tool call et pas de Done → nudge unique, sinon stop. **Implémentation** : (a) `drox-engine` — nouveau `Phase` enum (8 variants : `reasoning`, `reading`, `clarifying`, `planning`, `next-move`, `acting`, `verifying`, `done`) ; nouvel `AgentEvent::PhaseEnter` ; `parse_phase_marker` (accepte alias et casse libre) ; nouveau `PhaseLineBuffer` (parsing line-by-line, robuste à la fragmentation Ollama) ; `consume_stream` strip les marqueurs du texte assistant et émet `PhaseEnter` ; `drive_inner` réécrit autour de la règle unique (compteur `nudged_last_turn: bool`) ; constantes `MAX_CONTINUATIONS`/`MAX_SYNTHESIS_DEFERRAL`/`MAX_ACTION_DEFERRAL` **supprimées** ainsi que les deux fonctions `looks_like_*` et leurs 60+ phrases. (b) `drox-cli/prompts.rs` réécrit autour du protocole : section « Protocole de phases » documentant chaque phase + règles structurelles + 3 règles d'or ; suppression des paragraphes défensifs (« interdit de dire X »). (c) JSON-RPC : `AgentEvent` étant déjà sérialisé via `#[serde(tag = "kind")]`, le nouveau variant flow automatiquement vers l'extension. (d) Extension `chatView.ts` : `case "phase_enter"` → post `phase` au webview. (e) Webview `chat.js` : nouvel état `currentPhase`/`currentPhaseEl`/`currentPhaseBodyEl`, `PHASE_META` (label + icône par phase), `enterPhase` / `openPhaseBlock` / `closeCurrentPhase` ; `appendDelta` et `createToolBlock` re-routés via `currentContainer()` (le texte et les outils sont insérés DANS le bloc de phase actif). (f) `chat.css` : styles `.phase-block` collapsibles type Cursor « Thought for 1s ▸ », fermés par défaut, avec point pulsant `.streaming` tant que la phase reçoit du contenu. **Tests** : 13 tests ciblés phases (`parse_phase_marker_*`, `phase_line_buffer_*`, `done_marker_terminates_turn`, `silent_turn_triggers_one_nudge_then_done`, `two_consecutive_silent_turns_stop_anyway`, `tool_call_resets_nudge_counter`) + tests `prompts.rs` (présence/exhaustivité des phases, anti-régression sur les phrases défensives). **Sprint B** (objectif persistant) et **Sprint C** (`.drox/memory/objectives/`) à suivre, voir §2.10.
10c. ✅ **Sprint A.3 — Answering-before-done** (P0, suite directe Sprint A.2) — livré (2026-05-13). **Motivation** : le modèle écrit parfois sa synthèse finale **dans** une phase de réflexion (`reading`, `verifying`) puis émet `[phase: done]` direct, sans passer par `[phase: answering]`. Côté UI, ce texte se retrouve enfoui dans la trace collapsible repliée → l'utilisateur ne le voit pas. Confusion observée aussi par l'utilisateur sur la **hiérarchie visuelle** : les phases étaient indentées sous le conteneur « Réflexion » avec une barre verticale, ce qui suggérait à tort une parenté (« `reading` enfant de `reasoning` ») alors qu'elles sont séquentielles. **Refonte (deux axes)** : (a) Moteur — `TurnOutcome` gagne un champ `saw_answering: bool` ; `consume_stream` le met à true dès qu'une phase `Answering` traverse le buffer (déduplication ou non) ; `drive_inner` track `seen_answering_in_run` ; quand `[phase: done]` arrive mais que le run n'a jamais vu `answering`, on injecte un nouveau `MISSING_ANSWERING_PROMPT` (en anglais, demande explicite de re-rédiger la réponse au format `[phase: answering]` + Markdown + `[phase: done]`) et on continue la boucle. (b) UI — `.phase-trace[open] > .phase-block` perd `margin-left: 22px` et la barre `::before` qui faisaient apparaître les phases comme « enfants » du conteneur. Désormais les phases sont alignées à 10px de chaque côté du conteneur, séquentielles. (c) Prompt — règle dure n°2 ajoutée (« Jamais `[phase: done]` sans `[phase: answering]` avant ») qui anticipe le nudge moteur, et explicite que le contenu hors `answering` est invisible côté UI. **Tests** : `done_turn` helper mis à jour pour inclure `answering` ; nouveau `premature_done_turn` ; nouveau test `done_without_answering_triggers_re_emission_nudge` (2 Done dans la séquence, le 1er ignoré comme signal d'arrêt) ; tests existants `done_marker_terminates_turn` et `consecutive_same_phase_markers_are_deduplicated` adaptés (answering ajouté). Nouveau test prompt `core_prompt_requires_answering_before_done`.
10b. ✅ **Sprint A.2 — Done-driven completion** (P0, suite directe Sprint A) — livré (2026-05-13). **Motivation** : Sprint A avait introduit le protocole de phases mais conservait une règle d'arrêt implicite (« pas de tool call → on s'arrête après 1 nudge »). Symptôme observé : le modèle écrit « Je dois vérifier… » puis émet EOS sans appeler d'outil → le moteur acceptait la réponse alors que la tâche n'était pas terminée. **Refonte** : la seule règle d'arrêt propre devient `[phase: done]`. Tant que ce marqueur n'a pas été vu, on relance avec un nudge jusqu'à atteindre `max_iterations` (garde-fou unique, plus de compteur séparé). Nouvelle phase `Answering` séparant explicitement raisonnement interne (rendu dans la trace UI repliée) de la réponse finale destinée à l'utilisateur (bulle assistant standard, Markdown plein). **Implémentation** : (a) `drox-engine/event.rs` — ajout de `Phase::Answering` à l'enum, mise à jour `as_marker`. (b) `drox-engine/agent.rs` — `parse_phase_marker` reconnaît `answering` + alias (`answer` / `reply` / `respond` / `response`) ; `drive_inner` simplifié : suppression du flag `nudged_last_turn` et du cas « accept after one nudge » ; règle unique `final_phase == Done → Stop` sinon nudge + continue ; `NUDGE_PROMPT` réécrit en anglais autour de la question « Have you completed the user's objective? » avec instructions structurées (answering+done pour conclure, next-move+tool pour continuer). (c) `drox-cli/prompts.rs` — section « Protocole de phases » réécrite avec `answering` documenté, `verifying` durci (« phase d'ACTION pas de méta-pensée »), nouvelles règles structurelles (5 au lieu de 3, affirmation explicite que `done` est le SEUL signal d'arrêt), 2 chaînes typiques d'exemples (analyse / modification). (d) Webview `chat.js` — `PHASE_META.answering` (icône 💬 / label Answering) ; `enterPhase("answering")` ferme la trace courante et bascule en bulle assistant standard (hors trace) ; `enterPhase("done")` reste silencieux (clôture sans bloc visible). (e) `chat.css` — style italique gommé + scroll-frame avec mask-image étendu de `reasoning` aux phases pensives `planning` et `verifying`. **Tests** : test caduc `two_consecutive_silent_turns_stop_anyway` remplacé par `nudge_loops_until_max_iterations_when_done_never_emitted` (valide que le moteur boucle jusqu'à `MaxIterations(3)` quand `done` n'est jamais émis) ; nouveau `answering_phase_alone_does_not_terminate_loop` (vérifie qu'`answering` sans `done` déclenche le nudge) ; `parse_phase_marker_accepts_answering_aliases` ; test prompt anti-régression `core_prompt_states_done_is_only_termination_signal`.
11. ✅ **Sprint A.5 — Gate todo clôturée avant `[phase: done]`** (P0) — livré (2026-05-13). Moteur traque le snapshot du dernier `todo_write` réussi (`last_todo_pending` / `last_todo_in_progress`, lus depuis `value["counts"]`) ; `[phase: done]` est refusé tant qu'au moins un item reste en `pending` ou `in_progress`. Nudge `unfinished_todos_prompt(p, ip)` qui demande au modèle de choisir : soit re-`todo_write` avec items en `completed`/`cancelled` (la todo reflétait mal la réalité), soit `[phase: next-move]` + tool (il reste vraiment du travail). Règle prompt #7 ajoutée. Tool `todo_write` étendu pour tolérer des payloads JSON mal formés (objet plat, tableau nu, clé `todo`/`items`) avec message d'erreur auto-explicatif. UI : phases passées **restent ouvertes** (`details.open` n'est plus mis à `false` dans `closeCurrentPhase`), pour que l'utilisateur lise le contenu des étapes a posteriori. Tests : `done_blocked_when_todos_still_open` (4 tours scriptés) + tests `todo_write` (formes tolérées + message clair).
12a. ✅ **Sprint A.7 — Phase `analyzing` (exploration workspace)** — **Livré (V1, 2026-05-19)** — voir **§2.18**. `Phase::Analyzing`, playbook prompt, `PHASE_META` « Analyse du dépôt », nudge si intention analyse + ≥2 outils explore sans marqueur.
12. ✅ **Sprint A.6 — Phase `testing` post-mutation** — **Livré (V1, 2026-05-19)** — voir §2.11. `Phase::Testing`, gate `done` si code muté sans phase testing, carve-out `.md`/assets, `PHASE_META` 🧪. **Backlog** : setting `drox.testing.ignoredExtensions`, auto `.drox/scratch/`.
12b. ✅ **Sprint M1 — Mémoire de session unifiée (compaction = mémoire)** (P1, livré 2026-05-13). Architecture pensée avec l'utilisateur (cf. §2.2 B / §4) : un seul artefact (résumé de compaction) sert à la fois à la persistance entre sessions ET à la réduction de contexte (à venir M2).

**Implémentation (Rust)** :
- `drox-session/src/memory_sessions.rs` — I/O markdown + slug + réservation de chemin (dédup `_2`), listing tolérant aux fichiers mal formés, injection `format_sessions_listing_for_prompt`.
- `drox-tools/src/session_notes.rs` + `ToolContext::session_notes` — `SessionNotesHandle` partagé (RAM).
- `drox-tools/src/simple/{session_note,memory_read,memory_list}.rs` + registry — 3 tools read-only côté sessions (scope strict `.drox/memory/sessions/`).
- `drox-engine/src/{compaction,memory}.rs` + `AgentConfig::memory` — `summarize_run` (condense transcript + notes, tour LLM **sans tools**, extraction tolérante `objective` / `files_touched`) + `persist_run` (écriture `.md`).
- `drox-engine/src/agent.rs` — `MemoryTracker` (non-trivial si mutation **ou** `todo_write` **ou** `session_note` **réussi** — le compteur `session_note` évite de dépendre d'un état RAM hors tool-calls) ; `maybe_persist_session` juste avant `Stop` sur `[phase: done]` accepté (best-effort : erreur d'archivage ne casse pas le run).
- `drox-engine/src/event.rs` — `AgentEvent::MemoryPersisted { slug, path, objective, usage }`.
- `drox-cli/src/prompts.rs` — `COMPACTION_PROMPT` + section « Mémoire de session » dans `CORE_SYSTEM_PROMPT`.
- `drox-cli/src/jsonrpc/handlers.rs` + `main.rs` — listing startup + construction `MemoryRuntime` (LLM partagé avec la boucle agent).

**Implémentation (VS Code)** :
- `extension-vscode/src/chatView.ts` — `memory_persisted` → message webview `memory`.
- `extension-vscode/media/chat.{js,css}` — chip `.msg-memory-chip` (ouverture du `.md`).

**Qualité / vérifs (2026-05-13)** :
- `cargo test --workspace --lib` OK (dont **65** tests `drox-engine`, **61** `drox-tools`, **11** `drox-session`, …).
- `cargo test -p drox-cli --bin drox` OK (**71** tests).
- `cargo clippy --workspace --all-targets -- -D warnings` OK (petits ajustements `write!` / doc / `MemoryTracker` pour satisfaire les lints stricts).
- `npm run compile` dans `extension-vscode/` OK.

**Couverture utile (repères, pas exhaustif)** :
- `drox-session` : **11** tests (dont **8** dans `memory_sessions.rs`).
- `drox-tools` : tests dédiés `session_note` (**7**), `memory_read` (**3**), `memory_list` (**3**), `session_notes` (**4**).
- `drox-engine` : **8** tests `compaction`, **4** tests `memory::tracker`, **3** tests d'intégration `agent::tests::session_persisted_*`.
- `drox-cli` : **2** tests `compaction_prompt_*` + **1** test `core_prompt_documents_session_memory_tools`.

**M2 compaction live** : pipeline livré (cf. §2.7) ; **P1 efficacité** (57k→56k) : microcompact + tail + checkpoint court (§2.7). `/compact` manuelle livrée (§2.3). **Reste** : validation terrain runs 50k+ ; reactive compact leak **P2**.
13. ✅ **Slash commands** (P1) — livré : `/help`, `/clear`, `/new`, `/compact` (`session.compact`), `/model`, `/init`, `/memory` (cf. §2.3).
14. **Sprint B — Objectif persistant** (P0, suite de Sprint A) — extraction de l'objectif depuis le premier `[phase: reasoning]` (ou message user), stockage en RAM dans `Agent`, ré-injection au nudge et avant `[phase: done]`. **Extension prévue** : anti-dérive de scope (§2.25 / §5 n°32) — parking hors scope, checklist de clôture, UI sticky objectif.
15. **Sprint C — `.drox/memory/objectives/*.md`** (P1, suite de Sprint B) — un fichier markdown libre par grand objectif (convention au §4 B), **outil dédié** (nom à trancher : éviter collision avec `memory_list` **sessions** livré en M1 — ex. `objective_list` / `memory_objectives_list`) qui retourne `[{ slug, status, last_session, summary_first_line }]`, injection automatique du listing en début de conversation, `.gitignore` géré par setting `drox.memory.gitignoreObjectives` (default `true`). UI : panneau latéral « Objectifs en cours ». Permet la reprise multi-session.
16. ✅ **Smart paste / paste-as-reference** (P2) — livré (2026-05-13). V1 « éditeur » : `PasteCandidateTracker`, hash FNV-1a partagé extension/webview, chip `.paste-chip` cliquable, bloc `[Smart paste]` injecté au prompt (inliné si ≤ 50 lignes / ≤ 8 000 ch., sinon référence + `file_read`). Terminal différé V2 (shell integration). Cf. §2.9.
17. **Gestionnaire de contexte — compaction efficace** — **livré V2** (2026-05-15, cf. §2.7). Microcompact + tail + checkpoint + `compact_until_budget`. **Reste** : validation terrain sur runs 50k+ ; reactive compact leak **P2**. Hooks tool : **§2.6 livré**.
18. ✅ **NotebookEditTool** — **livré** (§2.4). `notebook_edit` : replace / insert / delete, normalisation leak, extension + Rust, 6 tests.
19. ✅ **Placeholder / complétion** — **livré (V1, 2026-05-15)** — §2.8 ; `promptCompletion.ts`, webview `pathComplete`.
20. ✅ **Workers / sous-agents** — **Livré (V1 partielle, 2026-05-19)** — tool `task` + Explore read-only, settings `drox.subagents.*`, défaut **off**. **Backlog** : multi-types, parallèle avancé (§2.10).
21. ✅ **Bloc Questions bloquant (style Cursor)** (P1) — livré (2026-05-13). Tool `ask_user_question` enrichi (schéma multi + rétro-compat mono), JSON-RPC `user/ask` server→client avec capability `clientCapabilities.interactiveAsk`, `RpcUserAsker` (sélection conditionnelle vs `RefuseAsker`), carte modale « Questions » côté webview (file 1/N, options A/B/C cliquables, champ détails optionnels, Esc/Skip/Continue, Send désactivé tant que la carte est active), règle prompt `clarifying` durcie (« doute non trivial qui change les actions à venir → `ask_user_question` AVANT toute mutation »). Tests : `ask.rs` (3 tests schémas), `prompts.rs` (anti-régression durcissement), `handlers.rs` (message d'erreur RefuseAsker mis à jour). Cf. §2.13.

22. ✅ **Message en attente pendant un run** (P1) — **livré (2026)** — voir §2.14. File FIFO : cartes tronquées au-dessus du textarea (**Modifier** / **Retirer**) ; dépile sur `state: busy=false` ; **Stop** séparé. Aucun JSON-RPC.
26. ✅ **Erreurs éditeur → chat** (P2) — livré (2026-05-19). Voir **§2.19**. Code action « Passer au modèle », `prefillPrompt` webview, réglage `drox.addDiagnosticOnHover`.
27. ✅ **Images jointes — chemin + pixels** (P1) — **livré**. Voir **§2.20** : `absPath`/`relPath`, légende intercalée avant chaque image, rappel `copy_path`, tests `build_user_blocks`.
28. ✅ **`ask_user_question` — normalisation JSON** — **livré (V1, 2026-05-15)** — voir **§2.21**. `normalize_input`, exemple canonique dans erreurs, anti-boucle 3 échecs.
29. **Mode Professeur — enforcement E2E** (P1, régression) — voir **§2.22**. Gates dures, bannière UI, `applyEdits` en proposition seule ; test intégration « pas de file_edit avant plan de cours ».
30. ✅ **Carte structure workspace** (P1) — livré (V1, 2026-05-19). Voir **§2.23**. `drox-session::workspace_map`, tools `workspace_map_read` / `workspace_map_note`, miroir moteur, injection system. Suivi : git HEAD, tests E2E run 2.
31. ✅ **Sticky dernier message utilisateur** (P2, UX) — livré (2026-05-19). Voir **§2.24**. `#user-prompt-sticky` ; event `userPromptSticky` depuis `handleSend` ; clic → scroll + surbrillance ; reset sur `chatReset` / `/new`.
32. ✅ **Fidélité objectif — auto-vérification des décisions** (V1 partielle, 2026-05-19) — voir **§2.25**. `runObjective.ts`, `scope_defer`, `#run-objective-sticky`, parking repliable ; gate `done` = rappel soft uniquement. Suivi : checklist (B), budget exploration (D).
33. ✅ **Bash classifier complet** — **livré (V1, 2026-05-15)** — voir **§2.27**. `permission_flags` + `auto_deny_message` + `evaluate_bash_segment`. Suivi : AST tree-sitter, §2.30.
34. ✅ **Tools MCP au registre** — **livré / clos (2026-05-15)** — voir **§2.28**. Stubs `mcp__*`, resources, `McpHub`, fallback `mcp_call`. Suivi : toggle §2.17, compaction MCP.
35. ✅ **Orchestration tools parallèle** — **livré (V1, 2026-05-15)** — voir **§2.29**. `partition_tool_calls`, `max_parallel_tool_calls`, lots // reads.
36. ✅ **Règles permissions fichier** — **livré (V1, 2026-05-15)** — voir **§2.30**. Parseur, glob chemins, shadowed rules, `settings.local.json`. V2 : UI warnings extension, `.drox/permissions.json` dédié.
37. ✅ **Skills locaux** — **livré (V1, 2026-05-15)** — voir **§2.31**. `.drox/skills/`, `skill_read`, `skill_list`, listing prompt.
38. ✅ **Git worktrees** — **livré (V1, 2026-05-15)** — voir **§2.32**. `git_worktree_enter`, `git_worktree_exit`.
39. ✅ **Tool `delete_path`** — **livré (V1, 2026-05-15)** — voir **§2.33**. Garde-fous leak, `recursive?`, permissions.
40. ✅ **`.droxignore` — chemins interdits (obligation moteur)** — **livré (V1, 2026-05-19)** — voir **§2.34**. `DroxIgnoreMatcher`, template auto, filtre `glob`/`grep`/`file_read`/`notebook_edit`, carte §2.23, injection prompt. V2 : walk `glob`, `lsp` client.

23. ~~**Mode « Professeur »** (P2)~~ — **remplacé par §2.15 (code) + §2.22 (enforcement)**. Le socle M1–M3 est en place ; le sprint prioritaire est l'**E2E conforme**, pas le re-design du sélecteur.
24. **Mémoire longue — Sprint 1** (P1) — voir **§2.16** (**2.16.1–2.16.4**). **Partiellement livré (2026)** : extension **`LongMemoryStore`** (JSON sous `globalStorageUri`, pas SQLite V1) + **`embeddings.ts`** ; enregistrement des segments type **`context_chunk_summary`** à chaque compaction contexte notifiée ; **`session_search`** (outil client) ; **`/session_end`** + JSON **`session_closure`** + **chat / transcript vierge** (§2.16.3–4). **`session_end`** : **non** exposé au LLM — clôture **utilisateur**. **Backlog « doc strict »** : SQLite, ONNX / embed dédié, polish au revoir, listes / RAG étendu. **Sprints suivants** : embed HTTP custom, `git commit`, graphe 2D / stats.
25. ✅ **Paramètres : outils on/off** (P2) — livré (2026-05-19). `drox.tools.disabled` (enum VS Code) + `drox.tools.mcp.enabled` ; filtre registre + notice prompt à chaque `agent.run` ; `ask_user_question` / `todo_write` toujours actifs. Voir **§2.17**.

### Hotfix qualité (livrés 2026-05-13 bis)

- ✅ **Anti-boucle moteur** — `LoopDetector` strict turn-à-turn : empreinte `(text trimé, sig tool_calls)` ; 1er strike consécutif → nudge `LOOP_DETECTED_NUDGE_PROMPT` ; 2e strike → `EngineError::LoopDetected { kind, turns }`. `reset` après chaque nudge moteur structurel (`MISSING_ANSWERING`, `unfinished_todos`, `OPENING_REASONING`, `DONE_ONLY`, `NUDGE_PROMPT`, `step_by_step_todo`) pour ne pas pénaliser une convergence forcée. Règle prompt « Anti-boucle » ajoutée au `CORE_SYSTEM_PROMPT`. Tests : `repeated_assistant_text_triggers_loop_detected_after_nudge`, `loop_detector_resets_when_intermediate_turn_differs`, `loop_detector_does_not_flag_legitimate_short_run`, `core_prompt_describes_anti_loop_rule`.
- ✅ **Un seul plan par run** — gate moteur anti-recreation : quand le précédent `todo_write` était all-completed et que le nouveau payload contient **uniquement des ids inédits** + au moins un `pending` / `in_progress`, le moteur rejette l'appel via `TODO_RECREATION_BLOCKED` (tool_result `is_error: true`). Le modèle est invité à re-soumettre une liste qui **inclut** les items précédents en `completed` + nouvelles étapes en bout. Règle prompt 7ter « UN SEUL plan par run » ajoutée. Tests : `todo_recreation_after_all_completed_is_blocked`, `todo_extension_with_kept_ids_is_allowed_even_when_previous_was_completed`.
- ✅ **Sticky plan cliquable réducteur** — le sticky compact reste affiché **même quand 100 % des items sont completed** (« Plan terminé ✓ »). Clic = bascule entre `compact` (étape courante / résumé) et `expanded` (mini-liste complète directement dans le sticky, sans scroller). Alt+clic = scroll vers le bloc complet dans le log (comportement précédent préservé). CSS `.todo-sticky.expanded` + `.sticky-list` avec statuts colorés (in_progress bleu, completed vert + strike).

> Note : la colonne « Phases UI agent (P2) » a été absorbée par les sprints **A / A.2 / A.3 / A.5**. La colonne « mémoire » se décompose maintenant en **M1** (sessions archivées `.drox/memory/sessions/`, item `12b`), **mémoire longue V1** (store JSON + embed + `/session_end` + `session_search`, §2.16 / §1), puis **B / C** (objectifs multi-run, items `14–15`).

---

## 6. Références internes repo

- **Convention `[REF-LEAK]` — moteur TS à conserver comme référence** : §2.26.0 (registre complet, fichiers `src/` prioritaires, clôture d’item).
- **Inventaire moteur « ✅ déjà fait »** : §2.0 (liste condensée crates + JSON-RPC).
- **Cycles de session / mémoire longue (backlog)** : §2.16 + §5 n°24.
- **Phase `analyzing` (backlog)** : §2.18 + §5 n°12a.
- ✅ **Outils activables / désactivables** : §2.17 + §5 n°25 (livré 2026-05-19).
- ✅ **Erreurs → chat** : §2.19 + §5 n°26 (livré 2026-05-19).
- **Images jointes — chemins actionnables** : §2.20 + §5 n°27 (**livré**).
- **`ask_user_question` fiabilité (livré V1)** : §2.21 + §5 n°28 — `drox-tools/src/simple/ask.rs`, anti-boucle `agent.rs`.
- **Professeur enforcement (backlog)** : §2.22 + §5 n°29.
- ✅ **Carte structure workspace** : §2.23 + §5 n°30 (livré V1, 2026-05-19).
- ✅ **`.droxignore` (livré V1)** : §2.34 + §5 n°40 — `drox-session/drox_ignore.rs`, post-filtre `glob`, walk `grep`, refus lectures.
- ✅ **Sticky dernier message utilisateur** : §2.24 + §5 n°31 (livré 2026-05-19).
- ✅ **Fidélité objectif / anti-dérive (V1 partielle)** : §2.25 + §5 n°32 — `runObjective.ts`, `scope_defer`, sticky objectif ; suivi §5 n°14 Sprint B (checklist).
- **Réappropriation leak — matrice COEUR / NOISE** : §2.26 ; inventaire détaillé `docs/INVENTAIRE-NOYAU-MOTEUR.md`.
- **Bash classifier (livré V1)** : §2.27 + §5 n°33 — `drox/crates/drox-bash/`, `drox-engine/src/permissions.rs`.
- **MCP tools registre (livré, clos)** : §2.28 + §5 n°34 — `drox-mcp/` (`hub`, `names`), `drox-tools/src/simple/mcp.rs`.
- **Orchestration tools (livré V1)** : §2.29 + §5 n°35 — `drox-engine/src/tool_orchestration.rs`, boucle agent par lots.
- **Hooks pre/post tool (livré V1)** : §2.6 — `drox/crates/drox-hooks/`, `.drox/hooks.json`.
- ✅ **Règles permissions fichier (livré V1)** : §2.30 + §5 n°36 — `drox/crates/drox-permissions/`.
- **Skills locaux (livré V1)** : §2.31 + §5 n°37 — `drox-tools/src/skills/catalog.rs`, tools `skill_read` / `skill_list`.
- **Git worktrees (livré V1)** : §2.32 + §5 n°38 — `drox-tools/src/git_worktree/`.
- **`delete_path` (livré V1)** : §2.33 + §5 n°39 — `drox-tools/src/simple/delete_path.rs`.
- Moteur agent : `drox/crates/drox-engine/`
- Ollama wire : `drox/crates/drox-llm/src/ollama/stream.rs` (`message_to_wire`)
- Contenu message : `drox/crates/drox-types/src/messages.rs`
- Chat VS Code : `extension-vscode/src/chatView.ts`, `extension-vscode/media/chat.js`
- Mémoire racine : `drox/crates/drox-session/src/memdir.rs` (ou équivalent documenté dans `GUIDE-REFONTE-DROX.md`)
- Mémoire sessions (M1) : `drox/crates/drox-session/src/memory_sessions.rs`, `drox/crates/drox-engine/src/{compaction,memory}.rs`, `drox/crates/drox-tools/src/session_notes.rs`, `extension-vscode/media/chat.css` (chip)
