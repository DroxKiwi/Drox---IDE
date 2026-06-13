# Plan 1.4.1.1 — Intent probes & English engine

**Version** : juin 2026 — **refonte routage intention** sur branche `1.4.1`  
**Parent (base « 0 »)** : [PLAN-1.4.1](PLAN-1.4.1.md) (stabilisation dogfood P1–P5 partiellement livrée)  
**Prérequis patch suivant** : [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) puis [PLAN-1.4.1.2](PLAN-1.4.1.2.md) — **après** clôture 1.4.1.1  
**Historique gates** : [gates/ARCHIVE.md](../../1.3/1.3.2/gates/ARCHIVE.md) · [CONDUCTEUR-CODE.md](../../1.3/1.3.2/CONDUCTEUR-CODE.md)

**État doc (juin 2026)** : **clôturé** — voir [CLOSURE-1.4.1.1](finalisation/CLOSURE-1.4.1.1.md). Suite : [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md).

> Remplacer les heuristiques **vocabulaire FR/EN** sur le message utilisateur par une **Intent Probe Layer** : 1–2 tours LLM **boot-only**, JSON strict, **sans outils**. Tous les **prompts système, messages gate et nudges moteur** passent en **anglais**. Le **rail** et les **tool gates** structurels restent le conducteur.

---

## Contexte

### Dette actuelle (heuristiques NL user)

| Fonction | Fichier | Rôle | Limite i18n |
|----------|---------|------|-------------|
| `looks_like_light_conversation` | `orchestration/start_run.rs` | Salut → `DiscussReplyOnly` | Listes `salut` / `hello` — pas DE, etc. |
| `looks_like_mutation_brief` | `orchestration/user_message_scope.rs` | `mutation_expected` au boot edit | ~30 mots FR/EN |
| `answering_claims_no_mutation_needed` | `agent/gates/done.rs` | `done` sans mutation si modèle dit « rien à changer » | Phrases FR/EN sur **texte assistant** |

### Ce qui ne change pas (structurel — garder)

| Zone | Exemples |
|------|----------|
| Rail | stations, hold/advance, `open_todos`, `mutation_count` |
| Tool gates | `done` sans answering, shape `todo_write`, bash pre-check |
| Permissions / paths | globs, segments bash dangereux |
| Extracteur discuss | marqueurs `[discussion: reply]` — format protocole, pas NL user |
| `bash_windows.rs` | stderr cmd.exe, tokens `head`/`tail` dans **commande** |

### Pourquoi pas le GateEngine 1.3

L’ancien système (`gate_engine/`, TOML, chaînes, `ArchitectIntent`, paliers `E-*`) a été retiré pour **latence**, **fiabilité JSON** (petits modèles), **double cerveau** (graphe + rail + tool gates).

**1.4.1.1 ≠ resurrection GateEngine.** C’est une couche **étroite** :

```text
User message (any language)
  → [if needed] Intent probe(s) — max 2, boot only, no tools, English system
  → JSON booleans → RunIntentFlags on architect state
  → existing StartRunKind + rail loop (unchanged workflow)
```

---

## Principes & anti-patterns

| Règle | Détail |
|-------|--------|
| **P1 — Boot only** | Probes uniquement **avant** la boucle outils principale (ou au tout début du run edit/discuss auto). |
| **P2 — Max 2 probes** | `greeting_only` + `expects_workspace_mutation` pour v1. Pas de 3ᵉ probe sans décision documentée. |
| **P3 — JSON strict** | Pas de yes/no en prose. Schéma fixe, `temperature = 0`, tokens courts, 1 retry parse, puis fallback. |
| **P4 — RPC prime** | `architectInteractionMode` UI (`discussion` / `analyze` / `edit`) → **skip probes**, comme aujourd’hui. |
| **P5 — Fallback conservateur** | Parse fail / retry épuisé → `Edit` + `mutation_expected = true` (éviter run outillé manquant sur vrai brief). Salut raté → préférable à bloquer l’édition. |
| **P6 — English engine** | Prompts système, probes, gate messages, nudges, logs moteur orientés dev : **anglais**. Message user : langue libre. |
| **P7 — Pas de graphe** | Pas de `*.gate.toml`, pas de chaînage `discuss.* → entry`, pas de paliers imposés par probe. |
| **P8 — Probe ≠ workflow** | Les probes ne choisissent pas PLAN vs ACT ; elles posent des **flags** consommés par le code existant. |

---

## Schéma Intent Probe (spec v1)

### Tour probe

- **Role** : tour système dédié `IntentProbe` (ou message user synthétique boot) — **aucun tool** exposé.
- **Input** : message utilisateur assaini (`sanitize_architect_user_prompt`) + éventuellement mode RPC si `auto`.
- **Output attendu** (un objet JSON, première occurrence `{…}` dans la réponse) :

```json
{
  "probe": "run_intent",
  "greeting_only": false,
  "expects_workspace_mutation": true
}
```

| Champ | Type | Sémantique |
|-------|------|------------|
| `probe` | string | Toujours `"run_intent"` en v1 |
| `greeting_only` | bool | Salut / small talk / remerciement **sans** tâche repo |
| `expects_workspace_mutation` | bool | L’utilisateur attend des changements fichiers / config / commandes applicatives |

**Compat legacy** (parseur existant) : accepter aussi `{"gate":"run_intent","value":true}` mappé sur un seul bool si on split en deux tours plus tard — v1 préfère l’objet unique ci-dessus.

### Mapping flags → run

| Condition | `StartRunKind` | `mutation_expected` | Notes |
|-----------|----------------|----------------------|-------|
| RPC `discussion` + `greeting_only` | `DiscussReplyOnly` | — | Remplace `looks_like_light_conversation` |
| RPC `discussion` + ¬`greeting_only` | `DiscussWithReads` | — | Inchangé |
| RPC `edit` | `Edit` | `expects_workspace_mutation` | Probe peut confirmer flag |
| `auto` + `greeting_only` | `DiscussReplyOnly` | — | |
| `auto` + ¬`greeting_only` | `Edit` | `expects_workspace_mutation` | |
| Parse fail (auto) | `Edit` | `true` | Fallback P5 |

### Prompt probe (anglais — extrait spec)

Le prompt système probe (fichier dédié, ex. `prompts/system/blocks/intent/run_intent_probe.md`) doit :

1. Définir les deux booléens avec **exemples multilingues** (DE/FR/EN) dans la spec, pas dans le code Rust.
2. Interdire markdown, tools, et texte hors JSON.
3. Préciser : *greeting with embedded task* → `greeting_only: false` (ex. « Hi, fix the login bug »).

---

## Backlog 1.4.1.1

| ID | Sujet | Phase | Priorité | Statut |
|----|-------|-------|----------|--------|
| **B-INTENT-01** | Infra Intent Probe (tour boot, parse JSON, retry, fallback) | P1 | P0 | ☑ code |
| **B-INTENT-02** | Remplacer `looks_like_light_conversation` par `greeting_only` | P2 | P0 | ☑ code |
| **B-INTENT-03** | Remplacer `looks_like_mutation_brief` par `expects_workspace_mutation` | P2 | P0 | ☑ code |
| **B-INTENT-04** | Retirer / réduire `answering_claims_no_mutation_needed` (structurel) | P3 | P1 | ☑ code |
| **B-I18N-01** | Prompts système moteur → anglais | P4 | P0 | ☑ code (boot edit/discuss/tools/probe) |
| **B-I18N-02** | Messages gate + nudges moteur → anglais | P4 | P1 | ☑ code |
| **B-I18N-03** | Tests & logs moteur → anglais | P5 | P1 | ☑ partiel (logs `intent_probe=*` ; audit FR résiduel non bloquant) |
| **B-INTENT-05** | Probe : briefs composés plan + mutation (post-smoke `ses_3eb8a6d5`) | P6 | P0 | ☑ code |
| **B-INTENT-06** | Garde `no_work_edit` — pas de « light message » sur run Edit | P6 | P0 | ☑ code |
| **B-INTENT-07** | Smoke régression R1c (brief plan+SVG) | P6 | P1 | ☑ `ses_31b9a209` |
| **B-I18N-04** | Doc outils : `web_fetch` 32 KiB ≠ `file_write` | P6 | P2 | ☑ code (`file_write.md`) |

**Hors scope 1.4.1.1** :

- `detect_open_user_question` (PROPOSE) → rail / marqueurs ; traité en 1.4.1.2 si besoin
- `architect_gate` meta-lines (extracteur thinking EN) → hors intent
- Probe « plan puis work » / « verify brief » → **interdit** en 1.4.1.1 ; 1.4.1.2 = règles rail structurelles
- Resurrection `GateEngine` / TOML / `RoleId::ArchitectIntent`
- Bump semver `1.4.2`

---

## Synthèse par thème

### P1 — Infra probe — B-INTENT-01

**Livrables** :

1. Module `orchestration/intent_probe.rs` (ou `agent/boot/intent_probe.rs`) :
   - `RunIntentFlags { greeting_only, expects_workspace_mutation, probe_source }`
   - `enum ProbeSource { Llm, RpcOverride, FallbackDefault }`
   - `parse_run_intent_json(text) -> Result<RunIntentFlags>`
   - `run_intent_probe(llm, user_message) -> RunIntentFlags` avec retry ≤ 1
2. Brancher dans `orchestration_run.rs` / `GateChainResult` : remplacer appels directs aux `looks_like_*` quand mode `auto` ou `discussion` sans override explicite de `start_run`.
3. Event / log structuré : `intent_probe=ok|fallback|skipped_rpc`.
4. Tests unitaires parse JSON (valide, invalide, legacy `gate`+`value`, prose polluée).

**Critère** : `cargo test` parse ; pas encore de smoke LLM obligatoire en CI.

---

### P2 — Remplacement heuristiques boot — B-INTENT-02, B-INTENT-03

| Ancien | Nouveau |
|--------|---------|
| `looks_like_light_conversation(prompt)` | `flags.greeting_only` |
| `looks_like_mutation_brief(&req)` dans `boot.rs` | `flags.expects_workspace_mutation` |

**Fichiers** :

- `orchestration/start_run.rs` — `GateChainResult::from_rpc_override` / `default_for_prompt` consomment flags
- `agent/loop/drive/boot.rs` — `mutation_expected` depuis flags
- **DEL** fonctions `looks_like_*` + tests associés (ou garder tests comme **golden mocks** de réponses probe)

**Critère smoke multilingue** :

| Message | Mode | Attendu |
|---------|------|---------|
| `salut` | auto | `DiscussReplyOnly`, 0 outil |
| `Hallo, wie geht's?` | auto | `DiscussReplyOnly` |
| `Bitte ändere die README` | auto | `Edit`, `mutation_expected` |
| `Explique le routing` | auto | `Edit` ou discuss selon probe ; **pas** `mutation_expected` si analyse seule |

---

### P3 — Done gate structurel — B-INTENT-04

**Problème** : `answering_claims_no_mutation_needed` parse le texte assistant FR/EN.

**Patch** :

1. Si `mutation_expected && mutation_count == 0` → refuser `done` (déjà partiellement en place via B-MOTOR-04).
2. Exception : `mutation_expected == false` **ou** `expects_workspace_mutation == false` au boot → autoriser `done` sans mutation.
3. **Retirer** la liste de phrases `answering_claims_no_mutation_needed` ; option : garder uniquement si `!mutation_expected` (double-check structurel, pas NL).

**Fichiers** : `agent/gates/done.rs`, tests `done_gate_*`.

---

### P4 — English engine — B-I18N-01, B-I18N-02

**Périmètre prompts** (`orchestration/prompts/system/blocks/`) :

| Bloc | Action |
|------|--------|
| `edit/01_core_rail_solo.md` | Traduire / réécrire EN |
| `discuss/*`, `gates/discuss_core.md` | EN |
| `common/literal_user_message*.md` | EN (garder citation user verbatim) |
| `tools/*.md` | EN |
| `intent/run_intent_probe.md` | **CREATE** EN |

**Périmètre code** :

- `agent/gates/*.rs` — messages `format!(...)` user-facing modèle → EN
- `agent/nudges/` — templates EN
- `drox-cli/prompts/core_standard.rs` — aligner EN

**Hors périmètre** : docs produit FR (`docs/1.4/`), UI IDE localisée, messages utilisateur final chat (langue modèle).

**Critère** : grep audit — plus de chaînes FR dans `drox-engine/src/agent/gates` et blocs prompt boot edit/discuss.

---

### P5 — Tests & observabilité — B-I18N-03

- Renommer tests `light_conversation_detects_salut` → scénarios intent flags mockés
- Ajouter fixture JSON probe multilingue
- Log `tracing` : `intent_probe.greeting_only`, `intent_probe.expects_mutation`, `probe_source`

---

## Tableau d’exécution ordonné

Cocher `☐` → `☑`. Gates **G** après chaque phase concernée.

### Gates de validation

| Gate | Commande / critère | Statut |
|------|-------------------|--------|
| **G-test** | `cargo test -p drox-engine` vert | ☑ 237 tests (juin 2026) |
| **G-build** | `cargo build -p drox-cli` | ☑ |
| **G-probe-parse** | Tests unitaires `intent_probe` — 100 % chemins parse / fallback | ☑ |
| **G-smoke-discuss** | R1a `salut` + `Hallo!` → 0 outil, `userFacingReply` OK | ☑ historique 1.4.1 — à ne pas régresser |
| **G-smoke-edit** | Brief mutation DE/FR → `mutation_expected`, gate done cohérente | ☐ R1c re-smoke post B-INTENT-06 |
| **G-i18n-audit** | Pas de FR dans prompts boot + gate messages listés § P4 | ☑ prompts/gates modèle EN |

---

### Phase 0 — Doc & alignement

| # | ☐ | Action | ID |
|---|-----|--------|-----|
| 0.1 | ☑ | **CREATE** ce plan | — |
| 0.2 | ☑ | README 1.4.1 : ordre `1.4.1 → 1.4.1.1 → 1.4.1.2a → 1.4.1.2` | — |
| 0.3 | ☑ | PLAN-1.4.1.2 : prérequis 1.4.1.1 ; retirer heuristiques NL des patches | — |
| 0.4 | ☐ | SMOKE-BACKLOG : entrées B-INTENT-*, B-I18N-* | — |

---

### Phase 1 — Infra Intent Probe (P1)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 1.1 | ☑ | **CREATE** `RunIntentFlags` + parse JSON + retry | `orchestration/intent_probe/` | B-INTENT-01 |
| 1.2 | ☑ | **CREATE** prompt probe EN | `prompts/.../intent/run_intent_probe.md` | B-INTENT-01 |
| 1.3 | ☑ | Hook LLM boot tour (no tools) | `orchestration_run.rs` | B-INTENT-01 |
| 1.4 | ☑ | Skip probe si RPC mode fixe `start_run` | `intent_probe/mod.rs`, `start_run.rs` | B-INTENT-01 |
| 1.5 | ☑ | Fallback + logging `probe_source` | `intent_probe/runner.rs` | B-INTENT-01 |
| 1.6 | ☑ | Tests parse (valide, invalide, legacy, polluted) | `intent_probe/parse.rs` | B-INTENT-01 |
| | | | | **G-test** · **G-probe-parse** ☑ |

---

### Phase 2 — Brancher flags & retirer heuristiques (P2)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 2.1 | ☑ | `GateChainResult` consomme `greeting_only` | `start_run.rs`, `resolve.rs` | B-INTENT-02 |
| 2.2 | ☑ | `mutation_expected` depuis `expects_workspace_mutation` | `loop/drive/boot.rs` | B-INTENT-03 |
| 2.3 | ☑ | **DEL** `looks_like_light_conversation` | `start_run.rs` | B-INTENT-02 |
| 2.4 | ☑ | **DEL** `looks_like_mutation_brief` | `user_message_scope.rs` | B-INTENT-03 |
| 2.5 | ☑ | Adapter exports `orchestration/mod.rs`, `lib.rs` | pub API | B-INTENT-* |
| 2.6 | ☑ | Tests intégration routage (mocks flags, pas LLM live) | `start_run.rs`, `resolve.rs` | B-INTENT-* |
| | | | | **G-test** ☑ · **G-smoke-discuss** ☑ historique |

---

### Phase 3 — Done gate structurel (P3)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 3.1 | ☑ | Clôture `done` : s’appuyer sur `mutation_expected` + `mutation_count` | `gates/done.rs` | B-INTENT-04 |
| 3.2 | ☑ | Retirer `answering_claims_no_mutation_needed` (ou réduire) | `gates/done.rs` | B-INTENT-04 |
| 3.3 | ☑ | Tests `done_gate_missing_mutation_when_expected` + no-mutation autorisé | `gates/done.rs` | B-INTENT-04 |
| | | | | **G-test** ☑ · **G-smoke-edit** ☐ R1c |

---

### Phase 4 — English prompts & messages (P4)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 4.1 | ☑ | Traduire `01_core_rail_solo.md` | `prompts/system/blocks/edit/` | B-I18N-01 |
| 4.2 | ☑ | Traduire blocs discuss + `discuss_core.md` | `prompts/.../discuss/`, `gates/` | B-I18N-01 |
| 4.3 | ☑ | Traduire `literal_user_message*.md`, `tools/*.md` | `prompts/.../common/`, `tools/` | B-I18N-01 |
| 4.4 | ☑ | Gate messages → EN | `agent/gates/*.rs` | B-I18N-02 |
| 4.5 | ☑ | Nudges → EN | `agent/nudges/` | B-I18N-02 |
| 4.6 | ☑ | `core_standard.rs` aligné | `drox-cli/prompts/` | B-I18N-01 |
| | | | | **G-i18n-audit** ☑ · **G-test** ☑ |

---

### Phase 5 — Tests & smoke (P5)

| # | ☐ | Action | Gate |
|---|-----|--------|------|
| 5.1 | ☑ | Dogfood R1a/R1b + `Hallo!` (qwen27b) | **G-smoke-discuss** — historique 1.4.1 |
| 5.2 | ☑ | Brief mutation FR — R1c `ses_31b9a209` (Qwen 3.6:27b) | **G-smoke-edit** |
| 5.3 | ☑ | Export transcript ; smoke boot validé | doc |
| 5.4 | ☑ | SMOKE-BACKLOG + critères clôture | doc |
| 5.5 | ☑ | **CREATE** `CLOSURE-1.4.1.1.md` | — |

---

## Ordre recommandé

```text
P0 doc
  → P1 B-INTENT-01   (infra parse + tour boot)
  → P2 B-INTENT-02/03 (brancher + DEL looks_like_*)
  → P3 B-INTENT-04   (done structurel)
  → P4 B-I18N-*      (anglais — peut chevaucher P2–P3 sur fichiers disjoints)
  → P5 smoke + clôture
  → P6 B-INTENT-05/06 (patch post-smoke ses_3eb8a6d5) + re-smoke R1c
  → ensuite PLAN-1.4.1.2a (context diet) puis PLAN-1.4.1.2 (rail)
```

**Quick win review** : P1.1–1.6 + P2.1–2.4 (probe + flags) avant traduction complète P4.

---

## Critères de clôture 1.4.1.1

- [x] Plus de `looks_like_light_conversation` ni `looks_like_mutation_brief` dans le crate moteur
- [x] `answering_claims_no_mutation_needed` retiré ou réduit au cas `!mutation_expected`
- [x] Intent probe : max 2 champs bool, boot only, skip RPC, fallback documenté
- [x] Prompts boot edit/discuss + probe : **anglais**
- [x] Messages gate principaux : **anglais**
- [x] **G-smoke-discuss** : `salut` + `Hallo!` → 0 outil (historique 1.4.1)
- [x] **G-smoke-edit** : brief R1c `ses_31b9a209` (plan+SVG `site-kdds`, Qwen 3.6:27b)
- [x] `cargo test -p drox-engine` vert (237 tests, juin 2026)
- [x] PLAN-1.4.1.2 révisé : pas de nouvelles heuristiques NL user

---

## Non-objectifs 1.4.1.1

- Chaîne de gates TOML ou tours `ArchitectIntent` illimités
- Probes mid-run (après premier tool call)
- Classifier externe / second modèle (sauf décision ultérieure)
- Traduire toute la doc produit FR
- Remplacer le rail par des probes de workflow (PLAN / ACT / VERIFY)
- Implémenter [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) (B-CTX-02) puis patches rail [PLAN-1.4.1.2](PLAN-1.4.1.2.md) (B-RAIL-02, B-MOTOR-05…)

---

## Liens

- [PLAN-1.4.1](PLAN-1.4.1.md) — base « 0 »
- [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) — context diet (après clôture 1.4.1.1)
- [PLAN-1.4.1.2](PLAN-1.4.1.2.md) — patch rail (après 1.4.1.2a)
- [README 1.4.1](README.md)
- [ARCHIVE gates 1.3](../../1.3/1.3.2/gates/ARCHIVE.md)
- [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md)

---

## Post-impl — dogfood smoke `ses_3eb8a6d5` (juin 2026)

> Synthèse symptômes F1–F11 ci-dessus. Détail rail (F6–F7, F9–F10) → [PLAN-1.4.1.2](PLAN-1.4.1.2.md). Contexte (F11) → [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md).

**Transcript** : [`chat_qwen27b.txt`](../../chat_qwen27b.txt) (export `2026-06-13`, build `1.4.0.340742`)  
**Brief** : analyser le projet + transition SVG animée entre deux sections scrollables + « dresse un plan stp »  
**Verdict** : **KO** — pas de livrable intégré ; clôture sans réponse user.

### Ce qui a marché

| Signal | Détail |
|--------|--------|
| Build à jour | Stamp `340742` ≠ ancien `242273` |
| Récupération mid-run | Après le faux départ, `workspace_map_read` + lectures repo → plan contextualisé correct |
| Infra outils | `file_read` sur gros fichiers (~9,5 Ko) OK ; pas de plafond moteur sur `file_write` |

### Échecs observés (classés par couche)

| # | Symptôme | Cause probable | Scope plan |
|---|----------|----------------|------------|
| **F1** | Steps 12–16 : modèle cite nudge **« light message »**, plan générique sans repo, `[phase: done]` | Routage boot trop restrictif (`greeting_only` probe raté **ou** `NO_WORK_PROMPT` via `no_work_edit` sur tour Edit sans `todo_write`) | **1.4.1.1** |
| **F2** | Brief « analyse + plan + implémentation » traité comme small talk | Prompt probe : pas d’exemples **brief composé** (« dresse un plan » + mutation implicite) | **1.4.1.1** |
| **F3** | 2× `file_write` ERROR : `path` et `content` manquants | JSON tool call **tronqué** à la génération (`num_predict` / petit modèle) — pas gate `file_write` | Hors scope moteur (config modèle) ; noter en smoke |
| **F4** | `file_write` OK ~1468 B puis fichier SVG/TSX incomplet | Même famille F3 : contenu partiel écrit tel quel | Idem |
| **F5** | Modèle hallucine limite 32 KiB sur `file_write` | Confusion avec `web_fetch` dans la spec outils | Doc prompt outils (P4) |
| **F6** | `Rail · done · act` alors que `bash` / `file_edit` viennent d’échouer | Clôture station verify non liée au succès outil | **1.4.1.2** (B-RAIL-02 / VERIFY) |
| **F7** | Spirale ~4486 events journal, todos 0/3 completed, `busy: false` sans `USER-FACING REPLY` | Clôture fragile + pas d’advance cohérent post-échec | **1.4.1.2** (B-MOTOR-06…) |
| **F8** | Pas de log `intent_probe=*` visible dans l’export UI | Observabilité export / Output moteur | **1.4.1.1** (P5) |
| **F9** | Plan + *« Souhaites-tu que je procède ? »* puis *« Le plan est validé »* sans message user | Auto-validation modèle ; rail PROPOSE→ACT non bloqué | **1.4.1.2** [**B-PROPOSE-01**](PLAN-1.4.1.2.md#b-propose-01--tu-valides--puis-implémentation-auto-2ᵉ-occurrence) — **noté, pas bloquant clôture 1.4.1.1** |
| **F10** | Bug `useTransform`/SVG verbalisé en fin de cycle, pas de retest ni reopen VERIFY→ACT | Rail linéaire + VERIFY=LSP seul + todos fermés trop tôt | **1.4.1.2** [**B-CYCLE-01**](PLAN-1.4.1.2.md#b-cycle-01--rail-linéaire--découverte-tardive-sans-second-cycle) — **noté, pas bloquant clôture 1.4.1.1** |
| **F11** | ~78k tokens in / snapshots réinjectés chaque tour (`ses_3c6ec330`) | Push excessif architect+rail+9 protocoles outil | **1.4.1.2a** [**B-CTX-02**](PLAN-1.4.1.2a.md) — **priorité avant rail** |

**Note** : la limite « contenu trop long pour `file_write` » est une **inférence modèle**, pas une erreur retournée par le handler `file_write` (aucun quota `content` côté Rust / IDE).

---

## Patch post-smoke — backlog complémentaire (1.4.1.1)

À traiter **avant clôture** 1.4.1.1 — ne pas reporter en 1.4.1.2 (ce sont des bugs de la couche intent / nudge boot, pas du rail).

| ID | Sujet | Priorité |
|----|-------|----------|
| **B-INTENT-05** | Probe : briefs composés « analyse / plan / puis travail » | P0 |
| **B-INTENT-06** | Nudge `no_work_edit` : ne pas classer un run **Edit** mutation en « light message » | P0 |
| **B-INTENT-07** | Smoke + fixture transcript `ses_3eb8a6d5` (routage boot) | P1 |
| **B-I18N-04** | Clarifier dans `tools/*.md` : `web_fetch` 32 KiB ≠ `file_write` sans plafond | P2 |

### B-INTENT-05 — Brief composé (probe prompt + tests)

**Problème** : message du type *« analyse le projet, ajoute X, dresse un plan »* doit **jamais** produire `greeting_only: true` ni `DiscussReplyOnly`.

**Patch** :

1. **`run_intent_probe.md`** — ajouter exemples multilingues explicites :
   - FR : *« Tu peux analyser le projet et ajouter … ? Pour le faire, dresse un plan »* → `greeting_only: false`, `expects_workspace_mutation: true`
   - EN : *« Analyze the repo and add … — start with a plan »* → idem
   - DE : *« Analysiere das Projekt und füge … hinzu, mach zuerst einen Plan »* → idem
2. Règle : **« plan » / « dresse un plan » / « start with a plan »** avec une tâche repo concrète → `expects_workspace_mutation: true` (le plan précède l’édition, il ne retire pas la mutation).
3. Règle : analyse seule sans changement attendu → `expects_workspace_mutation: false` mais **`greeting_only: false`** si question repo.
4. Tests parse : fixtures JSON + messages pollués reprenant le brief `ses_3eb8a6d5`.

**Critère** : re-smoke même brief → **pas** de nudge `NO_WORK_PROMPT` au premier tour ; premier tour avec outils lecture (`workspace_map_read` / `file_read`) autorisés.

---

### B-INTENT-06 — Garde `no_work_edit` (nudge schema_error)

**Problème** : `outcome.rs` pose `no_work_edit = true` quand Architect + todos vides + pas de `todo_write` réussi → envoie `NO_WORK_PROMPT` (« light message »). Sur un run **`StartRunKind::Edit`** avec `expects_workspace_mutation: true`, ce nudge **contredit** le brief et bloque l’exploration initiale.

**Patch** :

1. Dans `schema_error_continue_nudge` / appelant `outcome.rs` : `no_work_edit` **uniquement** si :
   - `StartRunKind::DiscussReplyOnly`, **ou**
   - probe `greeting_only == true` (flag boot persisté sur l’état architecte), **ou**
   - RPC `discussion` + salut explicite.
2. Sinon → `CONTINUE_PROMPT` (outils complets, pas « light message »).
3. Test unitaire : tour sans tool ni `done` sur run Edit + `mutation_expected` → nudge **≠** `NO_WORK_PROMPT`.

**Fichiers** : `agent/loop/drive/outcome.rs`, `agent/nudges/schema_error.rs`, tests.

---

### B-INTENT-07 — Smoke de régression boot

| ID scénario | Message | Mode | Attendu |
|-------------|---------|------|---------|
| **R1c** | Brief `ses_3eb8a6d5` (FR, plan + SVG) | `auto` | `Edit`, outils lecture dès le 1er tour utile, **pas** `DiscussReplyOnly` |
| **R1d** | `Explique le routing du moteur` | `auto` | `Edit` ou discuss reads ; `expects_workspace_mutation: false` |
| **R1a/R1b** | `salut` / `Hallo!` | `auto` | Inchangé — `DiscussReplyOnly`, 0 outil |

Documenter `probe_source` + flags dans Output → Drox (moteur) et noter dans `CLOSURE-1.4.1.1.md`.

---

### Phase 6 — Patch post-smoke (après P1–P5 code initial)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 6.1 | ☑ | Enrichir prompt probe (briefs composés) | `intent/run_intent_probe.md` | B-INTENT-05 |
| 6.2 | ☑ | Fixtures parse + tests brief FR plan+mutation | `intent_probe/parse.rs` tests | B-INTENT-05 |
| 6.3 | ☑ | Garde `no_work_edit` vs Edit / `expects_workspace_mutation` | `outcome.rs`, `schema_error.rs` | B-INTENT-06 |
| 6.4 | ☑ | Test unitaire nudge (pas light message sur Edit) | `nudges/schema_error.rs` | B-INTENT-06 |
| 6.5 | ☑ | Re-smoke R1c `ses_31b9a209` (Qwen 3.6:27b) | `chat_qwen27b.txt` | B-INTENT-07 |
| 6.6 | ☑ | Clarifier limite `web_fetch` vs `file_write` dans tools EN | `prompts/.../tools/file_write.md` | B-I18N-04 |
| | | | | **G-smoke-edit** ☑ · **G-test** ☑ |

**Reporté 1.4.1.2** (ne pas mélanger avec clôture intent) : F6 rail `done·act` sur échec, F7 spirale post-todos, hold READ→ANSWER (B-RAIL-02, B-MOTOR-05…06).

---

## Critères de clôture 1.4.1.1 — addendum post-smoke

- [x] **B-INTENT-05** : brief plan+mutation FR → probe `greeting_only: false`, `expects_workspace_mutation: true` (prompt + tests unitaires)
- [x] **B-INTENT-06** : run Edit sans `todo_write` au 1er tour → nudge **pas** `NO_WORK_PROMPT` (tests `schema_error.rs`)
- [x] **R1c** re-smoke : pas de faux `done` + exploration avant plan (`ses_31b9a209`)
- [x] Logs probe : boot validé (non exportés UI ; comportement Edit OK)

---

## Statut & ordre recommandé (juin 2026)

```text
État (juin 2026) — CLÔTURÉ
  Smoke R1c ses_31b9a209 (Qwen 3.6:27b) → OK boot intent
  CLOSURE-1.4.1.1.md livré

Suite
  → PLAN-1.4.1.2a  context diet (B-CTX-02) — EN COURS
  → PLAN-1.4.1.2   rail / clôture / VERIFY
  → bump semver 1.4.1 en fin de chaîne (cf. PLAN-1.4.1 §8.6)
```

**Cross-ref constats smoke** (détail dans [PLAN-1.4.1.2](PLAN-1.4.1.2.md) et [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md)) :

| ID | Sujet | Plan |
|----|-------|------|
| F9 / B-PROPOSE-01 | « Tu valides ? » puis ACT sans réponse user | 1.4.1.2 |
| F10 / B-CYCLE-01 | Rail linéaire, pas de reopen VERIFY | 1.4.1.2 |
| F / B-CTX-02 | ~78k tokens in, snapshots répétés | **1.4.1.2a** |

**Convention** : à chaque patch mergé ou smoke validé, mettre à jour les `☑` de ce plan et la colonne **Statut** du backlog.
