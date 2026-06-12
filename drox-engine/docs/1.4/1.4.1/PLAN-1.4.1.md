# Plan 1.4.1 — Stabilisation dogfood

**Version** : juin 2026 — **réaligné post-clôture [1.4.0](../1.4.0/archive/finalisation/CLOSURE-1.4.0.md)**  
**Branche** : `1.4.1`  
**Parent backlog** : [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md)  
**Ouverture** : [OPENING-1.4.1](finalisation/OPENING-1.4.1.md)  
**Hors scope** : polish UI chat → [1.4.2](../1.4.2/README.md) · index/graphe → [1.4.3](../1.4.3/PLAN-1.4.3.md)

> Ce plan a été rédigé **avant** la livraison squelette 1.4.0. Il est **réaligné** sur le dogfood juin 2026 (Qwen 27b, installeur 1.4.0) et sur ce que la refonte a **réellement** changé.

---

## Contexte post-1.4.0

### Ce que la 1.4.0 a livré (ne pas rouvrir)

| Zone | État |
|------|------|
| Run rail | Conducteur unique edit ; stations ; `pre_gate` ; mutations inline ACT |
| Reliquats 1.3 | Executor, `delegate_executor`, segments ACT, Professor, Standard CLI **retirés** |
| VERIFY → ACT | Boucle `verify.rs` sur échec bash/lint (partiel B-MOTOR-02) |
| UI fork P0 | Modules executor/delegate retirés (phase 2d) |
| Tests moteur | `cargo test -p drox-engine` vert (~201 tests) |

### Dogfood juin 2026 — constats pour la 1.4.1

| Verdict | Détail |
|---------|--------|
| **Rail OK** | Runs structurés, rapides, pas de boucles 1.3 flagrantes ; stations visibles (`intent→read→plan→act`) |
| **Pas prod-ready** | UI busy, discuss salut, préambules thinking, double answering, replay lent, VERIFY Windows |
| **Écart produit** | Brief edit concret → **0 `file_edit`** ou clôture sans mutation alors que le code matche déjà le brief |
| **Distribution** | Installeur 1.4.0 : suffixe version dev + réglages dogfood visibles en « prod » |
| **Résidu rail** | Modèle n’émet presque jamais `[gate:]` — auto-advance moteur seulement (B-RAIL-01 résidu → doc / prompt, pas bloquant 1.4.1) |

### Dogfood discuss Qwen 2.7B — transcripts de référence (juin 2026)

Références : [`chat_qwen27b.txt`](../../chat_qwen27b.txt) · [`chat_qwen27b_2.txt`](../../chat_qwen27b_2.txt)

| Cas | Message | Mode UI (supposé) | Résultat | Verdict |
|-----|---------|-------------------|----------|---------|
| **R1a** | `salut` | `auto` → `discuss_reply_only` | 7 steps UI, 0 outil, marqueurs `[discussion: reply/done]`, `userFacingReply` OK | **OK** — ne pas régresser |
| **R1b** | `salut ca va ?` | `discussion` → `discuss_reply_only` (post-fix) | 7 steps UI, 0 outil, marqueurs OK | **OK** — juin 2026 post-P2 |

**Mécanismes identifiés (R1b)** :

1. **Routage** : `architectInteractionMode: discussion` force `DiscussWithReads` même sur salut → prompt contradictoire (`with_reads` dit « not a greeting-only turn » vs `literal_user_message` « no tools »).
2. **Modèle** : à chaque tour, thinking dit « greeting-only, no tools » puis le canal action émet `phase: reading` + tool calls (découplage thinking / `tool_calls` Qwen).
3. **Moteur** : pas de pre-gate exécution ; `discussion_auto_stop_on_reply` ne s’applique que si `tool_calls` vide ; erreurs `memory_read` ne coupent pas le run.
4. **Extracteur** : sans marqueurs, fallback `last_user_facing_line` → affiche le 2ᵉ paragraphe au lieu de la salutation (B-DISC-03).

**Ordre P2** : corriger routage + pre-gate **avant** de juger M-DISC-01 ; valider B-DISC-02 en F5 ; traiter B-DISC-03 si R1b affiche encore mal après pre-gate.

### Vision

Rendre le moteur et la session **fiables au dogfood quotidien** sans refonte rail ni polish UI complet.

```text
1.4.0 squelette rail clôturé
    → 1.4.1 surface prod + bugs smoke (discuss, busy, boucles, ACT, VERIFY, replay)
        → 1.4.2 UI chat
            → 1.4.3 index/graphe
```

---

## Backlog 1.4.1 (trié)

| ID | Sujet | Phase | Priorité |
|----|-------|-------|----------|
| **B-REL-01** | `droxSurface` + registre features dev ; version prod sans suffixe | P1 | P0 — visible installateurs |
| **B-DISC-02** | Extracteur `[discussion: reply]` : marqueurs inline dans thinking | P2 | P0 |
| **M-DISC-01** | Salut discuss → outils interdits + routage `reply_only` | P2 | P0 |
| **B-DISC-03** | Fallback `userFacingReply` sans marqueurs (salutation, pas dernière ligne) | P2 | P1 |
| **B-UI-07** | Run `busy` stale après `done` / blur app | P3 | P0 |
| **B-MOTOR-04** | Run edit sans mutation (`file_edit` absent) ou clôture prématurée | P4 | P0 |
| **B-MOTOR-01** | Préambules thinking / re-plan à chaque micro-avancée | P4 | P1 |
| **B-MOTOR-03** | Double `[phase: answering]` | P4 | P1 |
| **B-MOTOR-02** | Spirale bash VERIFY Windows (`head`, quoting, timeout) | P5 | P1 |
| **B-UI-06** | Replay session lent (compaction journal / cold start) | P6 | P1 |
| **G-DEBT-01** | `loop/drive/tools.rs` ~530 L (> plafond FOI 500) | P7 | P2 |
| **B-UI-01…05** | Trays, plan sticky, ask_user markdown, ordre thinking | — | **1.4.2** |
| **B-RAIL-01 résidu** | Pas de `[gate:]` modèle | — | doc / 1.4.2 prompt |

---

## Synthèse par thème (référence rapide)

### P1 — Surface prod vs dev (`droxSurface`) — B-REL-01

**Problème** : installeur 1.4.0+ affiche `1.4.0.xxxxxx` ; `droxEngineDevBuild` packagé ; `DROX_DEV_BUILD` dans `drox.exe` ; export transcript / `simulateLatest*` accessibles en release.

**Principe** : `droxSurface` (`dev` | `release`) figé au `drox:ship` ; registre `DROX_DEV_FEATURES` + `isDroxDevFeatureEnabled()`.

**Critère** : `drox:ship` → header **`1.4.0`** seul ; watch garde le suffixe ; `drox-bundle-readiness` refuse surface ≠ release.

**État code (juin 2026)** : implémenté sur `1.4.1` (`b548b33`) — **clôture** après validation `drox:ship` installé (G-ship manuel).

### P2 — Discuss — B-DISC-02 · M-DISC-01 · B-DISC-03

**Problèmes** :

| ID | Symptôme | Cause |
|----|----------|-------|
| **B-DISC-02** | `userFacingReply` = `, short answer, then ` | Extracteur prenait le 1ᵉʳ `[discussion: reply]` **inline** dans le thinking (citation des instructions) |
| **M-DISC-01** | R1b : 11 tool calls sur salut | `discussion` → `with_reads` + pas de pre-gate exécution + boucle erreurs |
| **B-DISC-03** | Salutation générée mais UI n’affiche que le 2ᵉ paragraphe | Réponse finale sans marqueurs → fallback `last_user_facing_line` |

**Critères smoke discuss** (rejouer après chaque sous-étape P2) :

| ID | Scénario | Critère clôture |
|----|----------|-----------------|
| **R1a** | `salut` · mode `auto` | 0 outil · ≤ 2 messages moteur · `userFacingReply` = salutation · export UI < 50 events |
| **R1b** | `salut ! tu vas bien ?` · mode `discussion` | 0 outil · ≤ 2 messages moteur · `userFacingReply` contient la salutation · export UI < 50 events |
| **R1c** | `salut ! tu vas bien ?` · mode `auto` | Idem R1b (routage `reply_only` déjà attendu) |

**Clôture par item** :

- **B-DISC-02** : ☑ si `cargo test` extracteur vert + R1a F5 OK (déjà le cas sur transcript) — committer le fix `architect_gate.rs`.
- **M-DISC-01** : ☑ si R1a + R1b + R1c passent après 2.1–2.3 ; sinon garder ouvert et documenter échec dans SMOKE-BACKLOG.
- **B-DISC-03** : ☑ si R1b (ou run sans marqueurs forcé) affiche la 1ʳᵉ réponse utilisateur ; sinon report 1.4.2 si pré-gate élimine le cas.

### P3 — Busy & sync session — B-UI-07 ☑

**Problème** : modèle terminé mais UI `busy` ; events perdus au blur ; messages user triplés.

**Critère** : run terminé → `busy: false` < 2 s après alt-tab ; pas de message user dupliqué.

**Dogfood juin 2026** : validé (alt-tab fin de cycle, `ef58f637`).

### P4 — Boucles, answering, ACT — B-MOTOR-01/03/04

**Problèmes** :

- Préambules thinking répétés ; snapshot redondant mid-run (B-MOTOR-01).
- Double promotion `[phase: answering]` (B-MOTOR-03).
- Brief edit → lecture seule ou `done` sans `file_edit` quand mutation attendue (B-MOTOR-04 — dogfood post-1.4.0). **☑ corrigé** (`f8dd47a7` gate `done` + `looks_like_mutation_brief`).

**Pistes** : `final_answer_guard.rs` ; fingerprint loop ; `stall_act` ; nudge ACT si station PLAN/READ trop longue sans mutation ; vérifier `pre_gate` + promotion VERIFY→ANSWER sans passage ACT.

**Critère** : run charte < 80 steps moteur ; une réponse finale ; au moins une mutation si le brief l’exige explicitement.

**Dogfood juin 2026** : README + LSP (`chat_qwen27b.txt`, session `ses_4792b6b9`) — `file_write` OK, rail VERIFY bloque mutation, réponse finale stable (`dcc24d320` UI).

### P5 — VERIFY Windows — B-MOTOR-02

**Problème** : `head`, lint timeout, quoting `node -e` (steps 20–23 qwen27b). Partiellement atténué par VERIFY→ACT en 1.4.0.

**Pistes** : rappel OS Windows dans blocs VERIFY / nudges ; pre-check bash incompatible.

**Critère** : smoke VERIFY Next.js Windows ≤ 2 bash utiles ; retour ACT structuré après erreur compile.

### P6 — Replay session — B-UI-06

**Problème** : réouverture → replay 10k events UI (~10 s).

**Pistes** : fusion `delta` à l’écriture ; cold-start transcript moteur + UI lazy.

**Critère** : session 5k events → chargement perçu < 2 s (affichage fin → 1.4.2).

### P7 — Dette structure — G-DEBT-01

**Problème** : `loop/drive/tools.rs` ~530 L (gate G-lignes Phase 5).

**Critère** : split sans changement comportement ; tests verts.

### P8 — Validation & clôture

Rejouer smoke R1 (salut) + R3/R4 (charte CSS) sur **qwen27b** ; matrice modèles ; mettre à jour SMOKE-BACKLOG et [09-TEST-PLAN](../1.4.0/archive/09-TEST-PLAN.md).

---

## XIV — Tableau d’exécution ordonné

Faire les étapes **dans l’ordre**. Cocher `☐` → `☑`. Ne pas sauter une gate **G** sans justification documentée.

### Gates de validation (répéter après chaque phase)

| Gate | Commande / critère |
|------|-------------------|
| **G-test** | `cargo test -p drox-engine` vert |
| **G-build** | `cargo build -p drox-cli` sans warning |
| **G-ts** | `npm run compile-check-ts-native` OK |
| **G-smoke-discuss** | R1a `salut` + R1b `salut ! tu vas bien ?` (modes `auto` et `discussion`) → 0 outil, ≤ 2 tours moteur, `userFacingReply` salutation |
| **G-smoke-edit** | Charte CSS qwen27b : rail visible, mutation si brief l’exige, pas de double answering |
| **G-ship** | (P1 seulement) `drox:ship` dry-run / readiness : `droxSurface: release`, pas de `droxEngineDevBuild` packagé |

---

### Phase 0 — Alignement doc

| # | ☐ | Action | ID | Gate |
|---|-----|--------|-----|------|
| 0.1 | ☑ | Réaligner PLAN-1.4.1 post-clôture 1.4.0 + dogfood juin 2026 | — | — |
| 0.2 | ☐ | Mettre à jour README 1.4.1 + OPENING si écart | — | — |
| 0.3 | ☐ | Journal SMOKE-BACKLOG : statuts 1.4.1, ajout B-MOTOR-04 / B-REL-01 | — | — |

---

### Phase 1 — Surface prod vs dev (P1)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 1.1 | ☑ | Ajouter `droxSurface` + `getDroxSurface()` | `product.json`, `product.ts` | B-REL-01 |
| 1.2 | ☑ | **CREATE** `droxDevSurface.ts` : `DROX_DEV_FEATURES` + `isDroxDevFeatureEnabled()` | `contrib/drox/common/` | B-REL-01 |
| 1.3 | ☑ | Version chat / About : pas de suffixe si `release` | `droxProductVersion.ts`, `droxChatController.ts` | B-REL-01 |
| 1.4 | ☑ | Packaging : `droxSurface: release`, retirer `droxEngineDevBuild` du product packagé | `build/gulpfile.vscode.ts` | B-REL-01 |
| 1.5 | ☑ | `DROX_OMIT_DEV_BUILD=1` au ship ; pas de stamp dans `drox.exe` release | `drox-cli/build.rs`, `package-drox.ps1` | B-REL-01 |
| 1.6 | ☑ | Masquer settings dev (`simulateLatest*`, etc.) | `droxConfiguration.ts`, settings webview | B-REL-01 |
| 1.7 | ☑ | Masquer UI dev (export transcript, toggles dogfood) | `droxChatWebview.ts`, `bridge/` | B-REL-01 |
| 1.8 | ☑ | Garde-fou `drox-bundle-readiness` | `scripts/lib/drox-bundle-readiness.ps1` | B-REL-01 |
| 1.9 | ☑ | Tests `droxProductVersion.test.ts`, `droxDevSurface.test.ts` | `contrib/drox/test/` | B-REL-01 |
| 1.10 | ☑ | Doc release RULES + GUIDE-PUBLICATION | `RULES.md`, `GUIDE-PUBLICATION-WIN32.md` | B-REL-01 |
| | | | | **G-ts** · **G-ship** |

---

### Phase 2 — Discuss (P2)

> **Prochaine passe** : exécuter 2.0 → 2.1 → 2.2 → dogfood R1a/R1b/R1c → clôturer ou rouvrir selon résultat.

| # | ☐ | Action | Fichier / zone | ID | Clôture si… |
|---|-----|--------|----------------|-----|-------------|
| 2.0 | ☑ | Extracteur : marqueurs `[discussion: …]` **ligne seule** ; dernier `[discussion: reply]` avant `[discussion: done]` | `architect_gate.rs` | B-DISC-02 | `cargo test` + R1a F5 OK |
| 2.0b | ☑ | Committer fix B-DISC-02 (si 2.0 validé) | git `1.4.1` | B-DISC-02 | commit sur branche |
| 2.1 | ☑ | Routage : `discussion` RPC + `looks_like_light_conversation` → `DiscussReplyOnly` (réutiliser heuristique existante, pas nouvelle liste) | `start_run.rs`, `orchestration_run.rs` | M-DISC-01 | test unitaire + logs `start_run=discuss_reply_only` sur R1b |
| 2.2 | ☑ | Pre-gate exécution : bloquer tout tool si `!discussion_allow_reads` **ou** `DiscussReplyOnly` | `agent/gates/tool_pre.rs` | M-DISC-01 | tool call greeting → erreur gate, pas d’I/O |
| 2.3 | ☐ | (Optionnel si 2.1–2.2 suffisent) Circuit-breaker discuss : N erreurs tool consécutives sur greeting → Stop | `loop/drive/outcome.rs` | M-DISC-01 | reporté — R1b OK sans |
| 2.4 | ☑ | Fallback extracteur : prose sans marqueurs → bloc avant double saut de ligne / 1ʳᵉ phrase salutation | `architect_gate.rs` | B-DISC-03 | `userFacingReply` R1b = salutation |
| 2.5 | ☑ | Tests `cargo` : routage `salut ! tu vas bien ?`, pre-gate reply_only, extracteur sans marqueurs | `start_run.rs`, `architect_gate.rs`, `gates/` | M-DISC-01, B-DISC-03 | **G-test** vert |
| 2.6 | ☑ | Dogfood : exporter transcripts → `docs/chat_qwen27b*.txt` ; noter verdict R1a/R1b/R1c | manuel qwen27b | — | **G-smoke-discuss** |
| 2.7 | ☐ | Journal SMOKE-BACKLOG : statut B-DISC-02 / M-DISC-01 / B-DISC-03 | `SMOKE-BACKLOG.md` | — | items ☑ ou report justifié |
| | | | | | **G-test** · **G-smoke-discuss** |

---

### Phase 3 — Busy & sync IDE (P3)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 3.1 | ☑ | Garantir `busy: false` sur Stop / erreur / cancel / `done` | `droxChatAgentEvents.ts`, `droxChatSendRun.ts` | B-UI-07 |
| 3.2 | ☑ | Réconcilier runId au retour focus (heartbeat ou poll moteur) | `droxChatAgentHost.ts` | B-UI-07 |
| 3.3 | ☑ | Bloquer double envoi user pendant `busy` stale | webview router / composer | B-UI-07 |
| 3.4 | ☑ | Test manuel : alt-tab pendant run + après `done` | smoke | B-UI-07 |
| | | | | **G-ts** · **G-smoke-edit** (partiel) |

---

### Phase 4 — Boucles, answering, mutations (P4)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 4.1 | ☐ | Réduire réinjection snapshot redondante mid-run | `state/`, `run_snapshot.rs` | B-MOTOR-01 |
| 4.2 | ☐ | `FinalAnswerGuard` : une seule promotion `answering` | `final_answer_guard.rs` | B-MOTOR-03 |
| 4.3 | ☐ | Fingerprint loop : ignorer préambules stables | `stream/`, `phases.rs` | B-MOTOR-01 |
| 4.4 | ☑ | Diagnostiquer runs 0 `file_edit` : log station + tool reject | dogfood transcript | B-MOTOR-04 |
| 4.5 | ☑ | Nudge / gate : brief mutation explicite → forcer passage ACT ou refuser `done` sans mutation | `rail/`, `gates/done.rs`, `stall_act` | B-MOTOR-04 |
| 4.6 | ☑ | Vérifier clôture « code déjà OK » : answering honnête sans faux `file_edit` | prompt / `done` gate | B-MOTOR-04 |
| | | | | **G-test** · **G-smoke-edit** |

---

### Phase 5 — VERIFY Windows (P5)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 5.1 | ☐ | Rappel OS Windows dans blocs VERIFY / nudges | `prompts/`, `nudges/` | B-MOTOR-02 |
| 5.2 | ☐ | Suggestions PowerShell-compat (`Get-Content` vs `head`) | nudges verify | B-MOTOR-02 |
| 5.3 | ☐ | (Optionnel) pre-check bash `head`/`tail` avant exec | permissions ou wrapper | B-MOTOR-02 |
| 5.4 | ☐ | Smoke VERIFY Next.js Windows | manuel | B-MOTOR-02 |
| | | | | **G-test** · **G-smoke-edit** |

---

### Phase 6 — Replay session (P6)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 6.1 | ☐ | Compaction journal : fusion `delta` consécutifs à l’écriture | `droxUiReplayJournal.ts` | B-UI-06 |
| 6.2 | ☐ | Cold-start : transcript moteur d’abord, UI replay lazy | `droxChatTabsManager.ts` | B-UI-06 |
| 6.3 | ☐ | (Option v1.1) snapshot compact par tour | `.drox/sessions/` | B-UI-06 |
| 6.4 | ☐ | Mesurer cold start session 5k events | smoke | B-UI-06 |
| | | | | **G-ts** |

---

### Phase 7 — Dette structure (P7)

| # | ☐ | Action | Fichier / zone | ID |
|---|-----|--------|----------------|-----|
| 7.1 | ☐ | **SPLIT** `loop/drive/tools.rs` sous plafond 500 L | `loop/drive/tools/` | G-DEBT-01 |
| 7.2 | ☐ | Aucun autre fichier `agent/` > 500 L après split | `agent/` | G-DEBT-01 |
| | | | | **G-test** · **G-build** |

---

### Phase 8 — Validation & clôture

| # | ☐ | Action | ID | Gate |
|---|-----|--------|-----|------|
| 8.1 | ☐ | Matrice modèles : Qwen 27b = dogfood D3 ; Gemma 26b = hors scope edit | S6 | doc |
| 8.1b | ☐ | Rejouer R1a + R1b + R1c discuss (transcripts archivés) | S6 | **G-smoke-discuss** |
| 8.2 | ☐ | Rejouer R16 post-1.4.0 : charte CSS `runRailEnabled: true` | S6 | **G-smoke-edit** |
| 8.3 | ☐ | Mettre à jour sign-off [09-TEST-PLAN](../1.4.0/archive/09-TEST-PLAN.md) | S6 | — |
| 8.4 | ☐ | Journal [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md) à jour | — | — |
| 8.5 | ☐ | **CREATE** CLOSURE-1.4.1.md | — | toutes gates |
| 8.6 | ☐ | Bump `droxVersion` → **1.4.1** + ship si critères prod OK | B-REL-01 | **G-ship** |

---

## Ordre recommandé (résumé)

```text
P0  Phase 1  droxSurface (prod crédible)
  → P2 discuss
  → P3 busy
  → P4 boucles + ACT + answering
  → P5 VERIFY Windows
  → P6 replay
  → P7 split tools.rs (si marge)
  → P8 smoke + clôture
```

---

## Critères de clôture 1.4.1

- [x] **B-REL-01** : prod sans suffixe dev ; features dogfood coupées en release ; readiness OK (code — valider au prochain `drox:ship`)
- [x] **B-DISC-02** : extracteur validé — dogfood R1a/R1b qwen27b
- [x] **M-DISC-01** : R1a + R1b + R1c verts (auto + discussion)
- [x] **B-DISC-03** : fallback extracteur — non reproduit post-fix, code en place
- [ ] **B-UI-07** + **B-MOTOR-01/02/03/04** fermés ou reportés en 1.4.2 **avec justification**
- [ ] **B-UI-06** compaction livrée (polish affichage replay → 1.4.2)
- [ ] **G-DEBT-01** ou report explicite
- [ ] `cargo test -p drox-engine` vert ; `compile-check-ts-native` OK
- [ ] Smoke : R1a/R1b/R1c discuss + charte CSS qwen27b sans régression rail 1.4.0
- [ ] SMOKE-BACKLOG journal à jour

---

## Non-objectifs 1.4.1

- B-UI-01 à 05 (layout trays, plan sticky, ask_user markdown, ordre thinking) → **1.4.2**
- Conducteur UI stations complet → **1.4.2** ([UI-CONDUCTEUR](../1.4.0/UI-CONDUCTEUR.md))
- Index / graphe / fast path / onboarding → **1.4.3**
- Nouveau paradigme rail ou retour Executor / segments → interdit (figé 1.4.0)
- Listes heuristiques message pour routage discuss/edit → interdit ([RULES.md](../../../../RULES.md) §6)

---

## Liens

- [README 1.4.1](README.md)
- [CLOSURE 1.4.0](../1.4.0/archive/finalisation/CLOSURE-1.4.0.md)
- [FOI-REFONTE](../1.4.0/FOI-REFONTE.md)
- [1.4.2 UI](../1.4.2/README.md)
- [1.4.3 index](../1.4.3/PLAN-1.4.3.md)
