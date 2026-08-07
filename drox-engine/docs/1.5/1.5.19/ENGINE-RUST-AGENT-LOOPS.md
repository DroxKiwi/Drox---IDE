# 1.5.19 — Modifications moteur Rust (boucles agent / bash / commit)

**Version** : `droxVersion` **1.5.19** · **Date** : 2026-07-26  
**Périmètre** : crates Rust `drox-engine`, `drox-tools`, `drox-cli` (prompts).  
**Hors périmètre de cette fiche** : correctifs IDE TypeScript (chargement session, label shell `cmd`, skill commit) — mentionnés en annexe pour le contexte produit.

**But** : pouvoir **retracer** précisément pourquoi le moteur a changé (smoke tests : boucle « vérification / done », boucle `git commit` Windows, gate `todo_write` trop large sur `bash`).

---

## Contexte produit (symptômes smoke)

| # | Symptôme utilisateur | Cause racine moteur |
|---|----------------------|---------------------|
| S1 | Le modèle dit avoir fini ; le run **ne clôt pas** / tourne sur « vérification » | Gate `[phase: done]` + nudges ; `git *` comptait comme mutation « code » → gate `testing` ; `loop_detector.reset()` après chaque nudge → retries sans abort |
| S2 | Demande de **commit** : spirale FR/EN (`-m`, heredoc, `-F`, staging) | Host réel = **`cmd.exe /C`** (pas PowerShell) ; prompt / description tool peu explicites |
| S3 | Dès le début d’un `/commit`, le modèle refuse d’appeler `bash` sans `todo_write` (« bash = mutable ») | Gate `todo_write` traitait **tout** `bash` comme mutateur, y compris `git status` |

---

## Fichiers Rust touchés

| Crate / chemin | Rôle |
|----------------|------|
| `drox/crates/drox-engine/src/agent.rs` | Gates done / testing / todos · LoopDetector · consommation `drox-bash` · phase bash inspectif |
| `drox/crates/drox-engine/src/professor.rs` | Gate professeur : bash inspectif exempt |
| `drox/crates/drox-bash/src/classify.rs` | **Source de vérité** inspectif vs mutateur (+ `command_is_inspect_only`) |
| `drox/crates/drox-bash/src/lib.rs` | Réexports API |
| `drox/crates/drox-tools/src/simple/bash.rs` | Description outil `bash` (OS + commit Windows + inspect vs mutate) |
| `drox/crates/drox-cli/src/prompts.rs` | `CORE_SYSTEM_PROMPT` — règle 6 / clarifying / 7bis / note Windows |

---

## Change log détaillé

### E1 — Exclure le plumbing Git de la gate « testing » (mutation code)

**Fichier** : `agent.rs` — `bash_command_counts_as_code_mutation`

**Avant**  
Toute commande bash contenant `git commit` / `git add` / `git push` (entre autres) activait `saw_code_mutation_in_run`. Un run « commit only » ou un `git add`/`git commit` en fin de run **ré-exigeait** `[phase: testing]` avant `[phase: done]`.

**Après**  
Liste d’exclusion VCS : `git commit`, `git add`, `git push`, `git status`, `git diff`, `git log`, `git show`, `git checkout`, `git switch`, `git branch`, `git stash`, `git restore`, `git reset`, `git pull`, `git fetch`, `git rev-parse`.  
Ces commandes **ne** comptent **plus** comme mutation code pour la gate testing.  
Restent mutateurs bash « code » : `npm install`, `pnpm install`, `yarn add`, `cargo fix`, `rm -rf`, `del /f`, `del /s`, etc.

**But**  
Éviter la boucle « j’ai commité / je dois encore tester / done refusé » quand le seul shell restant est du git.

**Tests** : `record_counts_as_code_mutation_heuristic` — asserts `git commit -F …` / `git add -A && git status` → `false` ; `npm install lodash` → `true`.

---

### E6 — Affiner `drox-bash` (source de vérité unique)

**Fichier** : `drox-bash/src/classify.rs` (+ réexports `lib.rs`)

**Avant**  
`cargo` / `npm` / `pnpm` / `yarn` = toujours `Mutating` (premier token).  
`git config` = toujours `ReadOnly` (même les writes).  
Pas d’API « commande entière inspect-only ».

**Après**

| API | Rôle |
|-----|------|
| `classify_toolchain` | `cargo check\|test\|clippy|…`, `npm/pnpm/yarn test`, `tsc`, `gh auth status|pr view|…` → **ReadOnly** |
| `classify_git` | `config --get/--list` → ReadOnly ; `config user.email x` → Mutating ; skip `ENV=` leading |
| `command_is_inspect_only(cmd)` | Tous segments `ReadOnly` (via `split_command_segments`) ; redirects fichier → false |
| `has_file_redirect` | Helper redirects (voir **E13** pour fd-merge) |

**But**  
Une seule classification pour permissions **et** gates agent (fin des whitelists divergentes).

**Tests** : `cargo_check_and_npm_test_are_read_only`, `git_config_get_vs_write`, `command_is_inspect_only_chains`.

---

### E13 — `2>&1` n’est pas une écriture fichier (hotfix smoke ornith)

**Fichier** : `drox-bash/src/classify.rs` — `has_file_redirect`

**Contexte**  
Smoke `chat.json` (ornith:35b) : `ls … 2>&1` bloqué *MUTATING_TOOL_BEFORE_TODO_WRITE* alors que `ls … 2>/dev/null` passait. Le modèle notait explicitement l’incohérence.

**Avant (régression E6)**  
Tout `>` (hors `nul` / `/dev/null`) ⇒ `has_file_redirect = true` ⇒ `command_is_inspect_only = false`.  
`2>&1` / `1>&2` / `>&1` étaient donc traités comme mutateurs.

**Après**  
Ignorer les merges fd→fd (`N>&M` / `>&M` avec M digit). Conserver `> fichier` / `>> fichier` / `1>out.txt` comme écriture.

**But**  
Restaurer l’exploration shell courante sans affaiblir la détection des redirections disque.

**Tests** : `fd_merge_redirects_are_not_file_writes`.

---

### E14 — Pipelines `grep`/`awk`/`findstr` inspectifs + alignement prompts

**Fichiers**
| Chemin | Rôle |
|--------|------|
| `drox-bash/src/classify.rs` | Classifieur (source de vérité) |
| `drox-engine/src/agent.rs` | Message `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` |
| `drox-tools/src/simple/bash.rs` | Description outil `bash` |
| `drox-cli/src/prompts.rs` | `CORE_SYSTEM_PROMPT` règle 6 / clarifying / Tools |

**Contexte**  
Smoke post-E13 : `ls … \| grep … \| awk …` encore bloqué → le modèle « apprend » qu’il faut un `todo_write` avant **tout** bash (comportement non naturel).

**Avant**  
`grep` / `findstr` / `rg` → **Unknown** (absents de `READ_ONLY`).  
`awk` / `sed` → toujours **Mutating**.  
Prompt / description tool / message de gate citaient `ls` mais pas les filtres → contrat modèle ≠ runtime.

**Après**

| Règle | Détail |
|-------|--------|
| `READ_ONLY` | + `grep`, `egrep`, `fgrep`, `rg`, `findstr`, `cd` |
| `sed` / `awk` | `classify_stream_filter` : **ReadOnly** sauf `-i` / `--in-place` / `awk -i inplace` |
| Prompt + tool desc + gate error | Exemples pipelines ; **interdit** d’ouvrir un plan seulement pour débloquer le shell inspectif |

**But**  
Explorer (listing + filtres) sans plan ; plan seulement avant vraies mutations. Instructions reçues par le LLM = comportement `command_is_inspect_only`.

**Tests** : `stream_filters_and_pipelines_are_inspect_only` ; `core_prompt_allows_read_only_exploration_before_todo_write` (assertions E14).

---

### E15 — Cohérence nudges clôture (texte = gates)

**Fichier** : `drox-engine/src/agent.rs` (+ `prompts.rs` 7quater / question→done)  
**Plan** : [PLAN-INSTRUCTION-RUNTIME-COHERENCE.md](PLAN-INSTRUCTION-RUNTIME-COHERENCE.md)

**Avant (mensonge C-03)**  
Après `[phase: answering]` sans `done`, todos fermés, **mutation code** déjà faite → le moteur envoyait `DONE_ONLY` (« émets SEULEMENT `[phase: done]` »). Au tour suivant, `done` était **refusé** par `CODE_MUTATION_TESTING_NUDGE`. Le modèle « désobéissait » en relançant une vérif — en réalité le contrat était contradictoire.

**Après**
- Answering sans done + todos OK + **testing dû** → injecter tout de suite `CODE_MUTATION_TESTING_NUDGE` (pas DONE_ONLY).  
- Answering sans done + todos OK + testing déjà satisfait → `DONE_ONLY` (texte mis à jour : gates déjà claires).  
- `NUDGE_PROMPT` générique : checklist **dans l’ordre réel** des gates (answering → todos → testing → done).  
- `step_by_step_todo_nudge` : « mutating bash » + inspect-only ne compte pas.  
- Prompt MEMORY 7quater : **recommended, not engine-gated** (le moteur ne refuse pas `done` sans MEMORY).

**But**  
Plus de rappel qui dit A pendant que la porte suivante exige B.

**Tests** : `forgotten_done_after_answering_uses_minimal_nudge` ; `step_by_step_nudge_message_mentions_counters_and_principle` ; prompt MEMORY.

---

### E7 — Agent : gate todo / step-tracking via `drox_bash`

**Fichier** : `agent.rs`

**Avant**  
Whitelist maison `bash_command_is_read_only` / `bash_segment_is_read_only` (dupliquée).

**Après**  
`requires_todo_write_gate` et `counts_as_mutating_for_step_tracking` appellent `command_is_inspect_only`.  
Whitelist locale **supprimée**.

**But**  
Alignement permissions ↔ todo gate ; `cargo check` / `git fetch` cohérents.

**Tests** : `bash_inspect_only_via_drox_bash`.

---

### E8 — Gate testing branchée sur `BashCommandKind`

**Fichier** : `agent.rs` — `bash_command_counts_as_code_mutation`

**Après**  
Par segment : si premier token exécutable = `git` → **jamais** mutation code (plumbing VCS).  
Sinon `ReadOnly|Network` → false ; `Mutating|Destructive|Unknown` → true.

**But**  
Garder l’intention E1 (commit-only ne réarme pas testing) sans liste opaque de needles.

---

### E9 — `copy_path` dans le step-tracking

**Fichier** : `agent.rs` — `counts_as_mutating_for_step_tracking`

**Avant**  
`copy_path` gated par todo mais **non** compté pour le nudge « ≥2 mutateurs ».

**Après**  
`copy_path` compte comme les autres mutateurs fichier.

---

### E10 — Professeur : bash inspectif exempt

**Fichier** : `professor.rs`

**Avant**  
Tout `bash` dans `PROFESSOR_GATED_TOOLS` → bloqué hors exercice actif (même `git status` en lesson).

**Après**  
Si `command_is_inspect_only` → `None` (autorisé comme lecture).  
Bash mutateur : inchangé (plan + exercice/checkpoint).

**Tests** : `allows_inspect_bash_during_lesson`.

---

### E11 — Phase UI : bash inspectif → Reading

**Fichier** : `agent.rs` — `phase_for_tool_call`

**Avant**  
Tout `bash` hors `testing` → `Acting`.

**Après**  
Inspect-only → `Reading` / `Analyzing` ; mutateur → `Acting`.  
Branché dans `consume_stream` à l’émission `ToolCall`.

**But**  
Trace UI cohérente avec « exploration libre ».

---

### E12 — Prompts alignés

**Fichier** : `drox-cli/src/prompts.rs`

- En-tête module : mutateurs listés sans « tout bash ».  
- `clarifying` : ask avant mutation ; inspect bash OK.  
- 7bis : `copy_path` + « mutating bash » dans le seuil ≥2.

---

### E2 — Ne plus resetter le LoopDetector sur nudges todos / testing

**Fichier** : `agent.rs` — branche `[phase: done]` (gates `unfinished_todos` + `CODE_MUTATION_TESTING_NUDGE`)

**Avant**  
Chaque refus de `done` (todos ouverts **ou** mutation sans phase `testing`) injectait un system nudge puis appelait `loop_detector.reset()`.  
Conséquence : le modèle pouvait répéter des tours quasi-identiques (même prose « je vérifie… ») **sans jamais** atteindre `LoopDecision::Abort`.

**Après**  
Sur ces deux gates uniquement : nudge **conservé**, **`loop_detector.reset()` retiré**.  
Les autres resets structurels (ex. rappel objectif, course plan, etc.) restent inchangés sauf mention contraire dans le diff.

**But**  
Laisser l’anti-boucle fingerprint (warn → abort) **converger** quand le modèle insiste sur le même tour après un nudge done.  
Complète la logique documentée en 1.5.14 ([IMPLEMENTATION-L1-LOOP-DETECTOR.md](../1.5.14/IMPLEMENTATION-L1-LOOP-DETECTOR.md)) : les nudges done ne doivent pas **anéantir** le détecteur.

**Risque accepté**  
Un modèle qui change légèrement le texte à chaque tour contourne encore le fingerprint — hors scope ; l’objectif ici est de couper les répétitions strictes.

---

### E3 — Gate `todo_write` : bash inspectif autorisé avant plan *(historique → remplacé par E6/E7)*

**Note** : la première livraison utilisait une whitelist locale dans `agent.rs`. **E6/E7** la remplacent par `drox_bash::command_is_inspect_only`. Conserver cette section pour l’historique smoke.

**Fichier** : `agent.rs`

| Symbole | Rôle |
|---------|------|
| `requires_todo_write_gate(name, arguments)` | Prend désormais les **args** ; pour `bash`, gate seulement si **non** inspectif |
| `bash_command_is_read_only` | Whitelist par segment (`&&` / `\|` / `;`) |
| `bash_has_file_redirect` | `>` / `>>` → non inspectif (sauf `2>`/`1>` vers nul/null) |
| `bash_segment_is_read_only` | Préfixes autorisés (voir tableau) |
| `counts_as_mutating_for_step_tracking` | Remplace le match aveugle sur `"bash"` pour le compteur « ≥2 mutateurs sans todo » |
| `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` | Message mis à jour (inspect-only bash OK) |

**Whitelist inspectif (résumé)**

| Famille | Exemples autorisés sans `todo_write` |
|---------|--------------------------------------|
| Git | `status`, `log`, `diff`, `show`, `branch`, `rev-parse`, `ls-files`, `ls-tree`, `describe`, `remote`, `tag`, `blame`, `shortlog`, `version`, `help`, `name-rev`, `symbolic-ref`, `rev-list` ; `config` seulement avec `--get` / `--list` / `-l` / … |
| Listing / echo | `ls`, `dir`, `pwd`, `echo`, `cat`, `type`, `head`, `tail`, `where`, `which`, … |
| Build check | `cargo check` / `test` / `clippy` / `tree` / `metadata` / `version` ; `cargo fmt --check` |
| Node | `npm|pnpm|yarn test` ; `run test|typecheck|lint|check` ; `tsc` ; `npx tsc` |
| `gh` | `auth status`, `--version`, `pr view|list|status`, `repo view` |

**Toujours gated** (exemples) : `git add`, `git commit`, `git push`, `rm`, redirections fichier, commandes hors whitelist.

**But**  
Permettre un `/commit` (ou toute tâche) de commencer par `git status` / `git log` / `git diff` **sans** forcer un plan fictif. Le plan reste obligatoire avant staging / commit / écritures.

**Tests**

| Test | Attendu |
|------|---------|
| `bash_command_is_read_only_whitelist` | unitaires whitelist / chaînes / redirects |
| `read_only_bash_allowed_before_todo_write` | `git status --short` OK sans todo |
| `mutating_tool_before_todo_write_still_blocked` | `git add -A` bloqué sans todo (remplace l’ancien `ls` bloqué) |

---

### E4 — Description outil `bash` (drox-tools)

**Fichier** : `drox-tools/src/simple/bash.rs` — `BashTool::description`

**Ajouts explicites pour le LLM**

1. Host Windows = **`cmd.exe /C`**, **pas** PowerShell ; pas de stdin.  
2. Inspect-only autorisé avant `todo_write` ; mutateurs shell exigent un plan.  
3. Commit Windows : pas de heredoc / guillemets imbriqués dans `-m` → `file_write` + `git commit -F <file>`.

**But**  
Aligner le contrat outil avec le runtime réel et la gate E3, pour réduire les retries « PowerShell / heredoc » observés en smoke.

---

### E5 — `CORE_SYSTEM_PROMPT` (drox-cli)

**Fichier** : `drox-cli/src/prompts.rs`

1. **Règle 6** : explore librement avec read-only **et** bash inspectif ; mutateurs listés explicitement (`git add` / `git commit` / `rm`, …).  
2. Section **Tools** / `bash` : note Windows `cmd.exe /C` + recipe commit `.drox/COMMIT_MSG` + `-F` + `delete_path`.

**But**  
Le prompt système et le moteur doivent dire la **même** chose (sinon le modèle « croit » encore que tout bash est mutable).

---

## Schéma décisionnel (après E6–E14)

```text
Tool call bash?
├─ drox_bash::command_is_inspect_only ? (E6/E7)
│   └─ oui ──► exécuter sans todo_write ; phase Reading (E11) ; OK en Professeur (E10)
└─ sinon ──► todo_write déjà OK ?
             ├─ non ──► MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED
             └─ oui ──► exécuter
                        │
                        ├─ mutation CODE (E1/E8) ?
                        │   └─ tout git* → non ; bash Mutating|Destructive hors VCS /
                        │       file_edit / copy_path (E9) → oui → gate testing pour [phase: done]
                        │
[phase: done] ?
├─ todos ouverts ──► nudge (E2, sans reset LD)
├─ mutation code sans testing ──► nudge testing (E2, sans reset LD)
└─ OK ──► Stop
```

---

## Rebuild / validation

1. Rebuild `drox.exe` depuis `drox-engine/drox` (le client IDE charge le binaire pointé par `drox.executablePath`).  
2. Smoke mutateurs :
   - Nouveau chat → `git status` **sans** `todo_write` → passe.  
   - `ls … 2>&1` / `pwd 2>&1` **sans** `todo_write` → passe (E13).  
   - `ls \| grep … \| awk …` / `dir \| findstr` **sans** `todo_write` → passe (E14).  
   - `sed -i 's/a/b/' f` sans todo → bloqué.  
   - `cargo check` / `npm test` sans todo → passe.  
   - `git add` / `git commit` / `git config user.email x` sans todo → bloqué Planning.  
   - `echo hi > file.txt` sans todo → bloqué.  
   - Après edits code + todos clos → `git commit` ne réarme **pas** la gate testing seule.  
   - Répétition stricte après nudge done → warn puis abort LD (pas de reset).  
3. Smoke export (surface **dev**) : action **Export Full Transcript (Dev)** → fichier `.drox/exports/` + presse-papiers (thinking + tools + réponse).  
4. Surface **release** : export absent / warn only.

---

## Annexe — Compagnons IDE (hors Rust, même tranche smoke)

À documenter côté workbench si besoin d’une fiche dédiée ; listés ici pour traçabilité produit :

| Zone | Changement | Lien avec moteur |
|------|------------|------------------|
| `droxShellToolWire.ts` | `shellKind: 'cmd'` sur Windows (plus `powershell`) | Aligné E4 (host réel) |
| `commit/SKILL.md` + `buildDroxCommitAgentPrompt` | Recipe `file_write` + `git commit -F` | Aligné E4 / E5 |
| Chargement session IDE (`droxNativeChatViewPane`, historique, timeouts) | Évite hang « Loading session… » | Indépendant des gates agent |
| Export transcript natif (`drox.nativeChat.exportTranscript`) | Copie/écrit thinking + tools + réponse (dev) | [FEATURES-DEV-TRANSCRIPT-EXPORT.md](FEATURES-DEV-TRANSCRIPT-EXPORT.md) |

---

## Historique lié

| Version | Fiche | Lien |
|---------|-------|------|
| 1.5.14 | LoopDetector × clôture plan | [IMPLEMENTATION-L1-LOOP-DETECTOR.md](../1.5.14/IMPLEMENTATION-L1-LOOP-DETECTOR.md) |
| 1.4.x | Spirale VERIFY Windows (historique) | `docs/1.4/1.4.0/archive/SMOKE-BACKLOG.md` (B-MOTOR-02) |
| 1.5.18 | Session resume / overlay IDE | [IMPLEMENTATION-S0-S3.md](../1.5.18/IMPLEMENTATION-S0-S3.md) |
| 1.5.19 | Ollama wire + LoopDetector thinking (KAT-Coder) | [ENGINE-OLLAMA-THINKING-AND-LOOPS.md](ENGINE-OLLAMA-THINKING-AND-LOOPS.md) |
