# Plan 1.4.1.2 — Patch dogfood rail / clôture / outils

**Version** : juin 2026 — **patch incrémental** sur branche `1.4.1`  
**Parent** : [PLAN-1.4.1](PLAN-1.4.1.md) (base « 0 », phases P1–P5 partiellement livrées)  
**Prérequis** : [PLAN-1.4.1.1](PLAN-1.4.1.1.md) clôturé **et** [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) (context diet) livré ou en cours  
**Backlog** : [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md)  
**Transcripts** : [`chat_qwen27b.txt`](../../chat_qwen27b.txt)

> Patch **rail / clôture / VERIFY / messages outil** — constats dogfood juin 2026.  
> **Avant ce plan** : finir [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) (réduire le bruit d’injection) — sinon les patches rail peinent sur petit modèle (cf. famille **F**).

---

## Contexte post-patch 1.4.1 (juin 2026)

### Déjà validé (ne pas rouvrir)

| Zone | Commit / preuve |
|------|-----------------|
| **B-UI-07** | `ef58f637` — busy + resync focus |
| **B-MOTOR-04** | `f8dd47a7` — gate `done` sans mutation |
| **B-MOTOR-02** partiel | `8a8c9d06681` — pre-check bash Windows + rappels VERIFY |
| **todo_write ACT** | `c4644031857` — normalize pre-gate + `todo_write` en station ACT |
| **Discuss P2** | R1a/R1b qwen27b verts (plan 1.4.1) |

### Dogfood de référence (Qwen 2.7B, site-kdds)

| Session | Brief | Verdict run | Problème moteur principal |
|---------|-------|-------------|---------------------------|
| `ses_74e1766a` | Erreur hydration Next.js | Clôture OK, pas de plan | Erreurs `file_edit` schéma ; VERIFY contourné (LSP seul) ; bash `head`/PS |
| `ses_9bd9b48c` | Analyse + sidebar shadcn + **« Fais un plan »** | **Pas de réponse user** | Hold READ→ANSWER prématuré ; `todo_write` bloqué en VERIFY ; todos 5/5 mais pas d'`answering` stream |
| `ses_2bc948b3` | README bilingue + LSP (historique) | Spirale todo (avant fix) | Régression corrigée par `c464403` |
| `ses_3eb8a6d5` | Plan+SVG (pre B-INTENT-06) | **KO** — faux « light message », spirale `file_write` | Boot intent ; confusion quota `file_write` |
| `ses_3c6ec330` | Re-smoke R1c plan+SVG (post B-INTENT-06) | **Partiel** | Boot OK ; B-PROPOSE-01 ; B-CYCLE-01 ; ~78k tokens → 1.4.1.2a |
| `ses_31b9a209` | **R1c clôture** plan+SVG (Qwen 3.6:27b) | **OK intent** — app fonctionnelle | Boot OK ; plan→user→act ; ~116k tokens → 1.4.1.2a |

### Synthèse — six familles

```text
A. Contrat incohérent   rail ↔ policy ↔ snapshot ↔ brief utilisateur
B. Clôture fragile      todos OK / code OK mais pas de réponse ; VERIFY contournable
C. Signal outil + bruit messages gate ; thinking répété (B-MOTOR-01)
D. Plan / validation    demande accord user puis ACT sans réponse (B-PROPOSE-01)
E. Rail linéaire        bug découvert en fin de cycle, pas de retest / reopen (B-CYCLE-01)
F. Surcharge contexte   push snapshots + manuel outil — voir PLAN-1.4.1.2a
```

---

## Backlog 1.4.1.2 (trié)

| ID | Sujet | Phase | Priorité |
|----|-------|-------|----------|
| **B-RAIL-02** | Hold / advance vs brief « plan puis implémenter » | P1 | P0 |
| **B-MOTOR-05** | `todo_write` vs station VERIFY + snapshot unifié | P2 | P0 |
| **B-MOTOR-06** | Run sans `answering` malgré todos fermés + mutations OK | P3 | P0 |
| **B-MOTOR-07** | Messages gate/tool orientés schéma (`file_edit`, `todo_write`, bash) | P4 | P1 |
| **B-MOTOR-08** | VERIFY : advance / `done` sans `verify_outcome` Pass | P5 | P1 |
| **B-MOTOR-01** | Préambules thinking / snapshot redondant (report 1.4.1 P4) | P6 | P1 |
| **B-MOTOR-03** | Double answering / answering dans thinking seulement | P6 | P1 |
| **B-MOTOR-02** | Bash VERIFY Windows — exécution `head` encore tentée | P7 | P2 |
| **G-CTX-01** | Troncature erreurs user massives avant moteur | P9 | P2 — frontière IDE |
| **B-PROPOSE-01** | Validation plan : demande accord user puis implémentation sans réponse | P1bis | P1 — encadrer |
| **B-CYCLE-01** | Rail linéaire : découverte tardive d’un bug sans reopen VERIFY→ACT / retest | P5bis | P1 — noter |

→ **B-CTX-02** (context diet) : plan dédié **[PLAN-1.4.1.2a](PLAN-1.4.1.2a.md)** — **prérequis de ce plan**.

**Hors scope 1.4.1.2** : B-UI-01…06 polish · B-RAIL-01 résidu `[gate:]` modèle (prompt 1.4.2) · G-DEBT-01 split `tools.rs`.

---

## Constats smoke en cours (juin 2026)

> Détail **rail** (B-PROPOSE-01, B-CYCLE-01) ci-dessous. Surcharge contexte (~78k tokens) → **[PLAN-1.4.1.2a](PLAN-1.4.1.2a.md)**. Constats pris pendant re-smoke 1.4.1.1 — pas de patch immédiat.

### B-PROPOSE-01 — « Tu valides ? » puis implémentation auto (2ᵉ occurrence)

**Pattern observé** (Qwen 2.7B, `site-kdds`, brief plan + SVG — sessions `ses_3eb8a6d5` et re-smoke post B-INTENT-06) :

1. Le modèle présente un plan structuré avec section *« Prochaines étapes »* et une **question explicite** à l’utilisateur : *« Souhaites-tu que je procède à l'implémentation ? »* / choix d’ajustements.
2. **Sans message user intermédiaire**, le tour suivant enchaîne : *« Le plan est validé — je passe à l'implémentation directement »* + `file_write` / mutations.

| Facette | Verdict | Piste |
|---------|---------|-------|
| **Demande d’accord** | ✅ **Bonne chose** (produit) — respect du brief « dresse un plan », ton collaboratif, évite de muter à l’aveugle | **Encadrer** : quand le brief dit déjà « fais-le » / mutation explicite → pas besoin de re-demander ; quand « plan seulement » → rester en PROPOSE/ANSWER sans ACT |
| **Auto-validation** | ❌ **Problématique** — le modèle s’attribue une réponse utilisateur inexistante | **Moteur** : en station PROPOSE/PLAN après question ouverte, bloquer advance ACT tant qu’aucun tour `user` n’a suivi ; ou nudge « wait for user reply / use `ask_user_question` » |

**Ce n’est pas** un bug intent boot (1.4.1.1) — c’est rail / clôture de phase plan → act.

**Patch envisagé (1.4.1.2, pas urgent pour smoke en cours)** :

1. Prompt edit : si tu poses une question de validation, **ne pas** muter au tour suivant sans réponse user.
2. Rail structurel : détecter question ouverte en fin de `[phase: answering]` (ou marqueur PROPOSE) → `propose_hold` / pas d’advance ACT.
3. Option : `ask_user_question` quand le modèle veut vraiment un choix (au lieu de prose « Souhaites-tu… ? » sans outil).

**Smoke actuel** : noter dans l’export si le pattern se reproduit ; ne pas bloquer la clôture 1.4.1.1 sur ce point seul.

---

### B-CYCLE-01 — Rail linéaire : découverte tardive sans second cycle

**Pattern observé** (`ses_3c6ec330`, Qwen 2.7B, brief plan+SVG — re-smoke juin 2026) :

Le modèle enchaîne la **séquence rail imposée** (INTENT → READ → … → ACT → VERIFY → ANSWER → `done`) comme un **pipeline à sens unique**. Quand il découvre un problème d’implémentation — souvent **tard** dans le cycle — il le **dit** (thinking ou stream) mais **ne relance pas** un cycle de qualité :

| Moment | Ce que fait le modèle | Ce qu’il ne fait pas |
|--------|----------------------|----------------------|
| **Mi-ACT** (step ~91) | « `useTransform` dans attributs SVG ne marchera pas » → tente des réécritures | Pas de pause plan / pas de `todo_write` « fix architecture SVG » |
| **VERIFY** (step ~168+) | `lsp` → 0 diagnostic → rail `done·act` → advance VERIFY | Pas de `bash` / `npm run dev` / `tsc` ; VERIFY traité comme LSP-only |
| **Tous todos completed** (step ~181) | Marque 3/3 `completed` alors que le composant a déjà été réécrit plusieurs fois | Pas de rouvrir todo « corriger API framer-motion » |
| **Pré-ANSWER** (step ~183) | Redécouvre `motion.useTransform` vs import direct → **un** `file_edit` | Pas de second VERIFY ; pas de re-plan |
| **Clôture** (step ~204) | Réponse « ✅ Implémentée ! » + invite user à `npm run dev` | Le moteur considère le run **terminé** ; pas de reopen ACT |

**Diagnostic** (produit + moteur) :

| Facette | Verdict |
|---------|---------|
| **Découverte du bug** | ✅ Le modèle *voit* le problème — bon signe de réflexion |
| **Rail linéaire** | ❌ Une fois en VERIFY/ANSWER, la pression `done` + todos fermés **empêche** un vrai second passage ACT→VERIFY |
| **VERIFY faible** | ❌ LSP clean ≠ composant React/SVG correct au runtime (famille B, B-MOTOR-08) |
| **Livraison** | ⚠️ « Correct sur le papier » (fichiers présents, LSP OK) — **qualité réelle non prouvée** |

**Ce n’est pas** un bug intent boot — c’est **workflow rail** + **critères VERIFY** + **absence de reopen** après découverte tardive.

**Patch envisagé (1.4.1.2+, pas urgent)** :

1. **Reopen structurel** : si thinking/post-tool signale « must fix before ship » après VERIFY Pass LSP-only → autoriser `reopen_work_from_answer` ou regress VERIFY→ACT (existerait partiellement — à renforcer).
2. **VERIFY front** : pour brief UI/React, exiger au moins `bash` (`npm run build` / `tsc --noEmit`) en plus de LSP — lien B-MOTOR-08.
3. **Todos** : interdire `completed` sur une tâche si mutation ultérieure sur le même path dans le même run (stale todo gate — chevauche B-MOTOR-05).
4. **Prompt** : « If you discover a blocking implementation flaw after VERIFY, reopen work — do not close on LSP alone. »
5. **Option** : découpler « séquence affichée » et « obligation de ne passer qu’une fois » — le rail guide, il ne doit pas **piéger** le modèle en fin de cycle.

**Smoke actuel** : noter ; ne pas bloquer clôture 1.4.1.1. À croiser avec **B-PROPOSE-01** et **B-MOTOR-08** lors du patch 1.4.1.2.

---

## Synthèse par thème — patch proposé

### P1 — Rail vs brief plan — B-RAIL-02

**Problème** : `[gate: hold]` en READ saute en ANSWER alors que le brief exige encore implémentation ; le modèle présente un plan puis repart en ACT sans validation ; VERIFY atteint avant mutation sur le sujet (sidebar).

**Patch moteur** (règles **structurelles** — pas de probe NL user, cf. [PLAN-1.4.1.1](PLAN-1.4.1.1.md)) :

1. **Hold informatif** : en READ/INTENT, si `open_todos` non vide ou station PLAN attendue → `hold` mène à **PLAN** (ou reste READ) avec nudge EN « present plan in `[phase: answering]` », pas clôture ANSWER prématurée.
2. **Advance VERIFY** : bloquer passage ACT→VERIFY si `mutation_count == 0` sur le scope run (ou chemins objectif verrouillé) — complète `advance_blocked_by_open_todos`.
3. Option : si `expects_workspace_mutation` (flag probe 1.4.1.1) et aucune mutation avant VERIFY → bloquer advance.
4. Tests : transcript sidebar rejoué en unit (`transition.rs`, `propose_hold`).

**Critère smoke** : brief « fais un plan puis sidebar » → plan visible user **avant** premier `file_write` ; pas de VERIFY avant mutation sidebar.

---

### P2 — Policy todo vs VERIFY — B-MOTOR-05

**Problème** : snapshot dit « update `todo_write` on ACT » ; en VERIFY `todo_write` est interdit → notice step 83 sidebar.

**Patch moteur** (choix **A** recommandé) :

| Option | Action |
|--------|--------|
| **A** | Autoriser `todo_write` en station **VERIFY** (statuts seulement — même allowlist qu’ANSWER) |
| B | Garder interdit + reformuler snapshot : « return to ACT to update todos » |

**Implémentation A** :

- `policy.rs` : `RunStation::Verify` inclut `todo_write`.
- `snapshot_block.rs` : ligne todos cohérente (« update statuses here or on ACT »).
- Test : pre-gate `todo_write` en VERIFY passe ; mutation tools toujours bloqués.

**Critère** : sidebar — zéro notice « todo_write blocked at verify » lors de clôture tâche 5.

**Residual todo_write** (step 72) :

- Pre-gate : log payload tronqué dans message gate (debug modèle).
- Test variantes : `{}`, item plat, tableau nu (déjà partiellement couvert).

---

### P3 — Clôture sans réponse — B-MOTOR-06

**Problème** : todos 5/5, mutations OK, thinking contient `[phase: answering]` / `[phase: done]` sans stream UI ; run finit sur `file_edit` vides (fixed→absolute).

**Patch moteur** :

1. **Gate post-todos** : si `last_todo_pending == 0 && last_todo_in_progress == 0 && mutation_count > 0 && !seen_answering_in_run` après N tours idle → nudge `done_only` ou auto-promotion `userFacingReply` (réutiliser `outcome.rs` chemin answering sans done).
2. **Plafond tours post-clôture todo** : après todos terminal, refuser nouvelles mutations **cosmétiques** sans signal user (gate `done.rs` ou pre-gate `file_edit` si objectif run déjà satisfait) — option **souple** : nudge « answer now, do not re-edit ».
3. **`FinalAnswerGuard`** : lier B-MOTOR-03 — une seule promotion answering ; détecter answering **uniquement** dans thinking native ≠ answering vu.
4. Tests drive : script todos all completed + mutation + pas de `[phase: answering]` stream → moteur nudge ou auto-close.

**Critère smoke** : sidebar rejoué → `[phase: answering]` visible UI + `busy: false` + `userFacingReply` non vide.

---

### P4 — Messages outil — B-MOTOR-07

**Problème** : Qwen boucle sur mauvaise interprétation (`path` vs `edits[]`, `edits must not be empty`, `todo_write` todos).

**Patch moteur** :

| Outil | Message gate enrichi |
|-------|----------------------|
| `file_edit` | Exemple minimal `{ "path": "…", "edits": [{ "old_string": "…", "new_string": "…" }] }` ; distinguer « missing path » vs « empty edits » |
| `todo_write` | Rappeler normalize (flat item, bare array) + lien vers dernier plan snapshot |
| `bash` | Rappel Windows si stderr matche `bash_windows.rs` hints |

**Fichiers** : `gates/tool_pre.rs`, `agent/nudges/schema_error.rs`, éventuellement wrapper message `tool_finish` côté IDE (`droxChatAgentEvents.ts` — optionnel).

**Critère** : test unit messages contiennent `example` ; dogfood : ≤ 2 échecs `file_edit` consécutifs même schéma sur run sidebar.

---

### P5 — VERIFY Pass obligatoire — B-MOTOR-08

**Problème** : bash échoue (`head`, PS) ; LSP clean ; modèle répond quand même ; `verify_outcome` ≠ Pass.

**Patch moteur** :

1. `transition.rs` : `advance_blocked_until_verify_passed` — déjà présent ; vérifier chemin **sans** `[gate: advance]` explicite (infer advance).
2. `outcome.rs` / `gates/done.rs` : refuser `[phase: done]` si `verify_outcome` Failed/Unknown **et** (`mutation_count > 0` sur extensions code ou flag `expects_workspace_mutation` depuis probe 1.4.1.1) — **pas** de heuristique NL sur le brief.
3. Nudge VERIFY fail : « fix in ACT or run `npm run build` / `tsc` without Unix-only pipes ».
4. **B-MOTOR-02 suite** : pre-check `head`/`Select-Object` **avant** exec (extension `bash_windows.rs`) — rejeter avec hint avant spawn.

**Critère** : hydration rerun — pas de `done` sans bash Pass **ou** waiver explicite answering (« verify skipped: … »).

---

### P6 — Thinking & answering — B-MOTOR-01 / B-MOTOR-03

**Problème** : thinking répète analyse stack ; answering planifié dans thinking sans canal content.

**Patch moteur** (scope réduit 1.4.1.2) :

1. **B-MOTOR-01** : fingerprint 3 lignes stables thinking → ne pas réinjecter snapshot rail identique ; test compteur snapshots mid-run.
2. **B-MOTOR-03** : `FinalAnswerGuard` + test « answering marker in thinking only » ne compte pas comme `seen_answering_in_run` pour clôture (ou compte si texte promotable extrait).

**Critère** : run sidebar — moins de 50 % blocs thinking dupliquant « Next.js + shadcn + Abyss » (mesure manuelle transcript) ; une seule bulle answering finale.

---

### P7 — Bash Windows residual — B-MOTOR-02

**Problème** : pre-check heredoc OK ; `head -50` encore **exécuté** (hydration step 117).

**Patch** :

- Étendre `bash_windows_precheck` : `Select-Object`, pipe vers PowerShell depuis cmd.
- Option : nudge après 2e échec bash même pattern → suggestion script `package.json`.

**Critère** : ≤ 1 bash inutile sur smoke VERIFY Windows.

---

### P8 — Contexte user — G-CTX-01

**Problème** : dump hydration React → 48k tokens in.

**Patch IDE** (hors `drox-engine`, couplé release) :

- Tronquer clipboard erreur > N lignes avant envoi moteur ; conserver en-tête + 20 lignes + « … truncated ».
- Fichiers : `droxChatSendRun.ts` ou normalisation message user.

**Critère** : même brief hydration → tokens in < 8k.

---

## XIV — Tableau d’exécution ordonné

Cocher `☐` → `☑`. Gates **G** après chaque phase.

### Gates

| Gate | Critère |
|------|---------|
| **G-test** | `cargo test -p drox-engine` vert |
| **G-build** | `cargo build -p drox-cli` |
| **G-ts** | `npm run compile-check-ts-native` (si touch IDE G-CTX-01) |
| **G-smoke-plan** | Brief sidebar + plan explicite → plan UI → impl → **réponse finale** ; todos 5/5 |
| **G-smoke-hydration** | Brief erreur hydration → fix + verify honnête + réponse |
| **G-smoke-discuss** | R1a/R1b non régression |

---

### Phase 0 — Doc & backlog

| # | ☐ | Action | ID |
|---|-----|--------|-----|
| 0.1 | ☑ | **CREATE** ce plan ; lien depuis [README 1.4.1](README.md) ; [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) extrait (context diet) | — |
| 0.2 | ☐ | SMOKE-BACKLOG : entrées B-RAIL-02, B-MOTOR-05…08, G-CTX-01, B-CTX-02 | — |
| 0.3 | ☑ | PLAN-1.4.1 : renvoi chaîne `1.4.1 → 1.4.1.1 → 1.4.1.2a → 1.4.1.2` | — |

---

### Phase 1 — Rail vs plan (P1)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 1.1 | ☐ | Hold READ/INTENT → PLAN ou READ (pas ANSWER) si todos / scope run l’exigent | `rail/transition.rs`, `propose_hold.rs` | B-RAIL-02 |
| 1.2 | ☐ | Bloquer VERIFY si `mutation_count == 0` (+ flag `expects_workspace_mutation` si pertinent) | `rail/transition.rs` | B-RAIL-02 |
| 1.3 | ☐ | Tests transition + hold sidebar scenario | `rail/transition.rs`, `tests/` | B-RAIL-02 |
| | | | | **G-test** · **G-smoke-plan** (partiel) |

---

### Phase 2 — todo_write VERIFY (P2)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 2.1 | ☐ | Autoriser `todo_write` en VERIFY | `rail/policy.rs` | B-MOTOR-05 |
| 2.2 | ☐ | Aligner texte snapshot todos | `rail/snapshot_block.rs` | B-MOTOR-05 |
| 2.3 | ☐ | Gate message : payload tronqué si shape fail | `gates/todo_shape.rs` | B-MOTOR-05 |
| 2.4 | ☐ | Tests pre-gate VERIFY + variantes payload | `gates/mod.rs`, `rail/policy.rs` | B-MOTOR-05 |
| | | | | **G-test** · **G-smoke-plan** |

---

### Phase 3 — Clôture answering (P3)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 3.1 | ☐ | Nudge / auto-close si todos terminal + mutations sans answering | `loop/drive/outcome.rs` | B-MOTOR-06 |
| 3.2 | ☐ | Nudge post-todos : « answer now, avoid cosmetic edits » | `nudges/` ou `stall_act.rs` | B-MOTOR-06 |
| 3.3 | ☐ | Test drive : todos completed → force answering path | `agent/tests/` | B-MOTOR-06 |
| | | | | **G-test** · **G-smoke-plan** |

---

### Phase 4 — Tool error shaping (P4)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 4.1 | ☐ | Messages `file_edit` avec exemple JSON minimal | `gates/tool_pre.rs` ou tool remote hint | B-MOTOR-07 |
| 4.2 | ☐ | Distinction empty edits / missing path | idem + tests | B-MOTOR-07 |
| 4.3 | ☐ | `todo_write` gate : rappel formats normalisés | `gates/todo_shape.rs`, `nudges/schema_error.rs` | B-MOTOR-07 |
| 4.4 | ☐ | Bash fail hint chain (verify summary déjà partiel) | `bash_windows.rs`, `verify.rs` | B-MOTOR-07 |
| | | | | **G-test** |

---

### Phase 5 — VERIFY Pass (P5)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 5.1 | ☐ | Audit chemins `done` / advance sans verify Pass | `outcome.rs`, `transition.rs`, `infer.rs` | B-MOTOR-08 |
| 5.2 | ☐ | Gate `done` si verify requis et outcome Failed | `gates/done.rs` | B-MOTOR-08 |
| 5.3 | ☐ | Pre-check bash `head`, `Select-Object`, pipes PS | `gates/bash_windows.rs` | B-MOTOR-02, B-MOTOR-08 |
| 5.4 | ☐ | Tests verify block + bash pre-check | `verify.rs`, `bash_windows.rs` | B-MOTOR-08 |
| | | | | **G-test** · **G-smoke-hydration** |

---

### Phase 6 — Thinking / answering (P6)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 6.1 | ☐ | Fingerprint préambule thinking stable | `stream/`, `compaction.rs` ou snapshot | B-MOTOR-01 |
| 6.2 | ☐ | Réduire réinjection snapshot rail identique | `rail/snapshot_block.rs`, `refresh_snapshot` | B-MOTOR-01 |
| 6.3 | ☐ | `FinalAnswerGuard` : answering thinking ≠ canal ; une promotion | `final_answer_guard.rs`, `stream/` | B-MOTOR-03 |
| 6.4 | ☐ | Tests answering / dedup | `final_answer_guard.rs`, drive tests | B-MOTOR-01, B-MOTOR-03 |
| | | | | **G-test** · **G-smoke-plan** |

---

### Phase 7 — Bash Windows suite (P7)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 7.1 | ☐ | Pre-check patterns observés dogfood | `bash_windows.rs` | B-MOTOR-02 |
| 7.2 | ☐ | Cocher PLAN-1.4.1 §5.4 smoke VERIFY si vert | manuel | B-MOTOR-02 |
| | | | | **G-test** |

---

### Phase 8 — Contexte user IDE (P8)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 8.1 | ☐ | Tronquer erreurs / stack traces user > N lignes | `droxChatSendRun.ts` ou normalizer | G-CTX-01 |
| 8.2 | ☐ | Test unit troncature | `droxCommon.test.ts` | G-CTX-01 |
| | | | | **G-ts** |

---

### Phase 9 — Validation patch 1.4.1.2

| # | ☐ | Action | Gate |
|---|-----|--------|------|
| 9.1 | ☐ | Dogfood **R-plan** : sidebar + plan (qwen27b) | **G-smoke-plan** |
| 9.2 | ☐ | Dogfood **R-hydration** : erreur SSR (qwen27b) | **G-smoke-hydration** |
| 9.3 | ☐ | Non-régression R1a/R1b discuss | **G-smoke-discuss** |
| 9.4 | ☐ | Export transcript → `chat_qwen27b.txt` ; journal SMOKE-BACKLOG | doc |
| 9.5 | ☐ | Tag git / note release « 1.4.1.2 patch » (sans bump semver obligatoire) | — |

---

## Ordre recommandé (rail — après 1.4.1.2a)

```text
Prérequis : PLAN-1.4.1.1 clôturé + PLAN-1.4.1.2a (context diet) livré

P0 doc
  → P1 B-RAIL-02       (sémantique hold / VERIFY prématuré)
  → P2 B-MOTOR-05      (todo_write VERIFY)
  → P3 B-MOTOR-06      (clôture answering)
  → P4 B-MOTOR-07      (messages outil)
  → P5 B-MOTOR-08      (+ bash pre-check)
  → P6 B-PROPOSE-01 / B-CYCLE-01
  → P7 B-MOTOR-02      (fermeture bash Windows)
  → P8 G-CTX-01        (troncature erreurs IDE)
  → P9 smoke
```

**Quick wins** (1–2 jours) : P2 + P3 + P4.1–4.2.  
**Impact rail** : P1 + P5 (review plus longue).

**Context diet** : voir [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) — **à faire avant** P1 ci-dessus.

---

## Critères de clôture 1.4.1.2

- [ ] [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) clôturé (context diet)
- [ ] **B-RAIL-02**, **B-MOTOR-05**, **B-MOTOR-06** : smoke plan sidebar vert
- [ ] **B-MOTOR-07** : ≤ 2 boucles `file_edit` même erreur sur run référence
- [ ] **B-MOTOR-08** : pas de `done` avec verify Failed sur brief code TS
- [ ] **B-MOTOR-01/03** : fermés via [1.4.1.2a](PLAN-1.4.1.2a.md) ou report 1.4.2 **avec justification**
- [ ] **G-CTX-01** : livré ou report explicite
- [ ] `cargo test -p drox-engine` vert ; discuss R1a/R1b OK
- [ ] SMOKE-BACKLOG + extrait PLAN-1.4.1 mis à jour

---

## Non-objectifs 1.4.1.2

- Nouveau paradigme rail ou stations supplémentaires
- Forcer le modèle à émettre `[gate:]` (B-RAIL-01 → 1.4.2 prompt)
- Polish UI trays / replay affichage (1.4.2)
- Garantir Qwen 2.7B 100 % JSON outils parfait — **atténuation** seulement
- Bump semver **1.4.2** — rester patch **1.4.1.x** jusqu’à clôture PLAN-1.4.1 §8

---

## Liens

- [PLAN-1.4.1](PLAN-1.4.1.md)
- [PLAN-1.4.1.1](PLAN-1.4.1.1.md) — prérequis intent
- [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) — prérequis context diet
- [README 1.4.1](README.md)
- [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md)
- [1.4.2 UI](../1.4.2/README.md)
