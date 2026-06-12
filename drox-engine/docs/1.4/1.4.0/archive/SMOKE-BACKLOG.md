# Smoke backlog â€” journal dogfood 1.4.0

**Parent** : [README](README.md) Â· **Plan** : [PLAN-ATTAQUE](PLAN-ATTAQUE.md) Â· **Tests** : [09-TEST-PLAN](09-TEST-PLAN.md)

> Archive CLOSURE non signÃ©e : [archive/finalisation/CLOSURE-1.4.0.md](archive/finalisation/CLOSURE-1.4.0.md)

**Tri version (juin 2026)** :

| Version | PÃ©rimÃ¨tre |
|---------|-----------|
| **1.4.0** | Moteur rail (B-RAIL-02, B-SEG-01/02) â€” **bloque la clÃ´ture** Â· B-RAIL-01 partiel |
| **[1.4.1](../../1.4.1/README.md)** | Surface prod (`droxSurface`), bugs moteur/session dogfood post-1.4.0 |
| **[1.4.2](../../1.4.2/README.md)** | Bugs UI chat (B-UI-*) |

Source : transcripts [`chat_qwen27b.txt`](../../../1.3/chat_qwen27b.txt), `chat_qwen9b.txt`, `chat_gemma426b.txt`.

---

## RÃ¨gle

| Champ | Valeur |
|-------|--------|
| PrioritÃ© | B-RAIL-01 avant tag 1.4.0 ; reste selon colonne **Cible** ci-dessous |
| Commit fix | Issue / PR par version cible |

---

## Phase 5 â€” validation auto (2026-06-05)

| Gate | RÃ©sultat |
|------|----------|
| `cargo test -p drox-engine` | â˜‘ 209 tests |
| `cargo test -p drox-tools` | â˜‘ 128 tests |
| `cargo build -p drox-cli` | â˜‘ |
| `npm run compile-check-ts-native` | â˜‘ |
| G-contrat Â§ III.5 (`agent/`) | â˜‘ 0 reliquat |
| G-lignes (`agent/` prod) | âš  `loop/drive/tools.rs` ~530 L â†’ 1.4.1 |
| G-ui Â§ VIII | âš  classes CSS `executor-action-rail` dans `logTools.js` (cosmÃ©tique â†’ 1.4.2) |
| T1â€“T3 smoke manuel | â˜ en attente dogfood site-kdds |

Corrections Phase 5 : tests `todo_write` parallel slots retirÃ©s ; `delete_path` test alignÃ© message EN.

---

## B-UI-01 â€” Fichiers Ã©ditÃ©s repliÃ©s par dÃ©faut

**Cible** : **1.4.2**

**SymptÃ´me** : les cartes `file_edit` / `file_write` apparaissent **repliÃ©es** alors que lâ€™attendu produit est **ouvert** (diff visible).

**Repro** : run architecte solo sur charte CSS (`globals.css`) â€” voir capture smoke test juin 2026.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `src/vs/workbench/contrib/drox/browser/media/droxChat/tools/12-fileChange.js` | Carte crÃ©Ã©e **sans** `is-collapsed` ; `aria-expanded="true"` â€” comportement nominal = ouvert |
| `src/vs/workbench/contrib/drox/browser/media/droxChat/tools/13-collapsibleTray.js` | `tray.open = false` â€” si le diff est montÃ© dans un **tray**, il peut paraÃ®tre repliÃ© |
| `src/vs/workbench/contrib/drox/browser/media/droxChat/stream/tools/logTools.js` | `shouldUseCollapsibleToolTray` â†’ `mountToolBlockInTray` â€” vÃ©rifier si `fileChange` passe par le tray |
| `drox.openModifiedFiles` | RÃ©glage gÃ©nÃ©ral (dÃ©faut `true`) â€” distinct du repli diff, mais Ã  croiser |

**Pistes debug**

1. Tracer le chemin `host.post({ kind: 'fileChange' })` vs `kind: 'tool'` pour une mutation.
2. VÃ©rifier si le CSS `.msg-file-change.is-collapsed` est appliquÃ© Ã  la crÃ©ation (rÃ©gression tray ?).
3. Tester avec fil linÃ©aire architecte ON/OFF (`linearRunUi`).

**CritÃ¨re fix** : aprÃ¨s `file_write` / `file_edit` rÃ©ussi, carte diff **ouverte** sans clic utilisateur.

---

## B-UI-02 â€” Lignes Â« Ran Â» consÃ©cutives Ã©crasent le layout

**Cible** : **1.4.2**

**SymptÃ´me** : plus il y a de lignes **Ran** (bash) Ã  la suite, plus le bloc suivant (thinking / texte / file change) est **verticalement compressÃ©** / illisible (voir capture).

**Repro** : phase VERIFY du transcript â€” steps 20â€“23 (`npx next lint`, `npm run lint`, `node -e`, `type â€¦ find`) en rafale.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `stream/tools/logTools.js` | `details.open = false` Ã  la crÃ©ation ; `finishToolBlock` garde `open = false` |
| `tools/13-collapsibleTray.js` | Accumulation dâ€™outils dans un mÃªme tray â€” suspect **#1** pour lâ€™Ã©crasement |
| `stream/timeline/architect-rail.js` | Rails `executor-action-rail` / `architect-action-rail` â€” `open = false`, compteur de lignes |
| `browser/media/droxChatMvp.css` | RÃ¨gles `.msg-tool`, `.drox-log-indent`, `.msg-file-change` â€” chercher `max-height`, `flex`, `overflow` sur parents communs |

**Pistes debug**

1. Inspecter le DOM aprÃ¨s 4+ `Ran` : hauteur calculÃ©e du parent `#log` / tray.
2. Repro minimal : 5Ã— `bash` echo en sÃ©rie sans mutation.
3. DÃ©sactiver collapsible tray (feature flag ou patch local) et comparer.

**CritÃ¨re fix** : N lignes Ran consÃ©cutives nâ€™affectent pas la hauteur des blocs voisins.

---

## B-UI-03 â€” Plan du run prÃ©cÃ©dent rattachÃ© au nouveau message

**Cible** : **1.4.2**

**SymptÃ´me** : un plan **terminÃ©** (ex. 3/3 barrÃ©) du run dâ€™avant rÃ©apparaÃ®t **sous le nouveau message** utilisateur et dans le **sticky header** (Â« Architect â€” planning and delegation Â»). Il disparaÃ®t seulement quand le modÃ¨le Ã©met un **nouveau** `todo_write`.

**Repro** (smoke juin 2026, charte CSS) :

1. Terminer un run avec plan complet (fix `globals.css` + charte).
2. Envoyer un nouveau message (Â« charte graphique Â», etc.).
3. Le plan 3/3 du run prÃ©cÃ©dent se dÃ©place aprÃ¨s le nouveau message user.
4. MÃªme plan visible en sticky jusquâ€™au prochain plan.

**Cause probable** : le bloc plan (`currentTodoBlockEl`) et le `drox-run-strip` ne sont **pas scellÃ©s par run** â€” `reparentTodoBlockToPlan` / `ensureRunStrip` rÃ©utilisent lâ€™Ã©tat global au lieu de crÃ©er un strip neuf par message user.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `stream/timeline/strip.js` | `onUserMessageForRunStrip` repositionne le strip aprÃ¨s chaque user ; `adopted` strip non scellÃ© rÃ©utilisÃ© ; `reparentTodoBlockToPlan` dÃ©place le **mÃªme** bloc plan |
| `stream/timeline/strip.js` | `sealRunStrip` / `data-sealed="1"` â€” vÃ©rifier si le plan est clÃ´turÃ© **avant** le message user suivant |
| `core/state.js` | `currentTodoBlockEl`, `runStripEl` â€” reset incomplet entre runs dans la mÃªme session |
| `bridge/host-message.js` | `todoUpdate` â€” pas dâ€™ID run / stripId sur le bloc plan |

**CritÃ¨re fix** : Ã  lâ€™envoi dâ€™un nouveau message user, le plan du run **prÃ©cÃ©dent** reste ancrÃ© dans le strip scellÃ© de ce run ; le nouveau run dÃ©marre sans plan (ou avec un plan vide) jusquâ€™au prochain `todo_write`.

---

## B-UI-04 â€” Questionnaire `ask_user` : markdown brut + trop haut

**Cible** : **1.4.2**

**SymptÃ´me** : dans la carte **Questions**, le prompt affiche le markdown **brut** (`**gras**`, listes, tableaux) via `textContent`. Le bloc question occupe toute la hauteur disponible.

**Repro** : run charte CSS â€” `ask_user` avec 3 directions visuelles + tableau (capture smoke juin 2026).

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `user-ask/06-userAsk.js` | L.126â€“128 : `promptLine.textContent = â€¦` â€” pas de rendu markdown |
| `droxChatMvp.css` | `.user-ask-prompt` â€” ajouter `max-height` (~8 lignes) + `overflow-y: auto` |
| RÃ©utiliser | `fn.renderMarkdown` / classe `markdown` comme les messages assistant |

**CritÃ¨re fix** : prompt rendu en markdown ; zone question **â‰¤ 8 lignes** visibles puis scroll interne.

---

## B-UI-05 â€” Phase thinking active toujours en tÃªte du fil

**Cible** : **1.4.2**

**SymptÃ´me** : pendant tout le run, la section **thinking** reste **en haut** du strip linÃ©aire (`work` â†’ `thinking` â†’ `verify` â†’ `answer` ordre fixe). Seul le contenu thinking est mis Ã  jour ; les phases ultÃ©rieures (lecture, plan, rÃ©ponse) sâ€™affichent **en dessous**, alors que lâ€™utilisateur attend que **la phase en cours** soit la **derniÃ¨re** visible (ordre chronologique).

**Attendu produit** : sÃ©quence visuelle append-only par **Ã©vÃ©nement** â€” ex. thinking â†’ lecture fichier â†’ plan â†’ rÃ©ponse â†’ nouveau thinking â€” la partie animÃ©e / active toujours **en bas**.

**Repro** : run charte CSS multi-phases ; bandeau Â« â€¦negotiation with the linterâ€¦ Â» reste en haut pendant que plan et rÃ©ponse sâ€™accumulent dessous.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `stream/timeline/strip.js` | Ordre DOM fixe : sticky `plan` puis sections `work`, `thinking`, `verify`, `answer` |
| `stream/timeline/thinking.js` | Un seul panneau thinking canonique dans `[data-section="thinking"]` |
| `stream/timeline/phases.js` | Routage `internal_reasoning` â†’ section thinking |
| `stream/timeline/overrides.js` | `agent-activity-sticky` / inline activity en tÃªte sticky |

**Pistes design**

1. **Timeline append-only** : chaque phase = bloc chronologique dans `#log` ou strip, pas sections fixes.
2. **Promotion** : Ã  la fermeture dâ€™une phase, la replier et append la suivante en bas.
3. **Run Rail U2/U3** : blocs station pourraient remplacer partiellement ce modÃ¨le â€” Ã  croiser avec `run-rail-stations.js`.

**CritÃ¨re fix** : Ã  tout instant, le bloc Â« en cours Â» (thinking animÃ©, outil, plan actif) est le **dernier** Ã©lÃ©ment du fil du run courant.

---

## B-UI-06 â€” Chargement session Ã  la rÃ©ouverture de Drox

**Cible** : **1.4.1** (compaction / API) Â· affichage **1.4.2**

**SymptÃ´me** : Ã  la rÃ©ouverture de lâ€™app, le fil dâ€™une session existante **ne charge pas** ou sâ€™affiche **incorrectement** ; dÃ©lai trÃ¨s long.

**Cause probable** : rejeu du **journal UI** Ã©vÃ©nement par Ã©vÃ©nement (`replayUiJournalMessages`) â€” coÃ»t O(n) sur les `delta` / `phase` / `tool`. Ex. smoke qwen27b : **10â€¯387 events** pour 161 messages moteur.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `chat/droxChatTabsManager.ts` | `readUiReplayTail` / `readUiReplay` puis replay sÃ©quentiel |
| `common/droxUiReplayJournal.ts` | Journal JSONL par event ; pas de snapshot par tour |
| `session/lazy-history.js` | Pagination scroll-up â€” ne rÃ©sout pas le cold start |
| `session/04-history.js` | `finalizeSessionReplayUi` â€” Ã©tat strip/plan pas toujours rÃ©initialisÃ© |

**Pistes design (1.4.0.x)**

1. **Snapshot par tour** Ã  la persistance (Ã©tat DOM ou rÃ©sumÃ© compact).
2. **Cold start** : afficher transcript moteur dâ€™abord, journal UI en lazy.
3. **Compaction Ã  lâ€™Ã©criture** : fusionner `delta` consÃ©cutifs.

**CritÃ¨re fix** : rÃ©ouverture session 10k events â†’ affichage < 2 s, fil fidÃ¨le Ã  lâ€™historique.

---

## B-UI-07 — RÉSOLU 1.4.1 — Run « busy » après fin modèle (focus app / fin de run)

**Cible** : **1.4.1**

**SymptÃ´me** : le modÃ¨le a terminÃ© (`[phase: done]`, rÃ©ponse affichÃ©e) mais lâ€™UI reste en **run en cours** (bouton stop, busy) â€” observÃ© en revenant dâ€™une autre application.

**DonnÃ©es transcript** (`chat_qwen27b.txt`) : aprÃ¨s nettoyage, tour LSP annulÃ© `run cancelled by user` alors que le run semblait fini ; messages user **triplÃ©s** (steps 48â€“50) suggÃ¨rent re-envoi ou Ã©tat dÃ©synchronisÃ©.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `droxChatAgentEvents.ts` | `notifyRunCycleFinished` + `busy: false` sur event Stop |
| `droxChatAgentHost.ts` | `getSuppressedRunId` â€” run ignorÃ© ? |
| `media/droxChat/core/state.js` | `busy` ; flag attente `userFacingReply` |
| `droxChatSendRun.ts` | chemins erreur / cancel qui omettent `busy: false` |

**Pistes** : fenÃªtre Electron perd le dernier event SSE/JSON-RPC ; runId stale ; cancel utilisateur implicite au blur.

**CritÃ¨re fix** : aprÃ¨s `done` ou cancel explicite, `busy: false` garanti mÃªme si lâ€™app a Ã©tÃ© en arriÃ¨re-plan.

**Fix** : `ef58f637` (resync focus, garde double envoi, `busy` sur `done`). **Validation** : dogfood alt-tab fin de cycle juin 2026.

---

## M-DISC-01 â€” Salut discuss : outils malgrÃ© rÃ¨gle greeting-only

**Cible** : **1.4.1** (peut Ãªtre durci en 1.4.0 si gate discuss simple)

**SymptÃ´me** : Â« Salut Â» â†’ `architect_discussion` ; le modÃ¨le appelle `file_read` + `memory_list` alors que le prompt interdit les outils sur greeting-only.

**Repro** : `chat_qwen27b.txt` session `ses_5f0a049a` â€” thinking reconnaÃ®t la rÃ¨gle, outils quand mÃªme.

**Pistes** : pre_gate discuss ; bloquer tools cÃ´tÃ© moteur si `StartRunKind::DiscussReplyOnly` + message light.

**CritÃ¨re fix** : R1 discuss â€” 0 outil, 1 tour, `[phase: done]`.

---

## B-RAIL-01 â€” Aucun marqueur `[gate:]` / pas dâ€™events station en dogfood

**Cible** : **1.4.0**

**Statut** : **partiellement rÃ©solu** (juin 2026) â€” session `ses_a131c190` : `intentâ†’readâ†’planâ†’act` visibles aprÃ¨s Phase 5 / C12.

**SymptÃ´me initial** : zÃ©ro `RAIL STATION` malgrÃ© mutations.

**RÃ©sidu** : modÃ¨le nâ€™Ã©met toujours pas `[gate:]` ; progression = auto-advance moteur uniquement.

**CritÃ¨re fix** : âœ… events `railStation*` sur run edit README ; fermÃ© pour CLOSURE sauf rÃ©gression rebuild.

---

## B-RAIL-02 â€” `pre_gate` jamais observable en dogfood

**Cible** : **1.4.0 â€” BLOQUANT CLOSURE** (avec B-SEG-01)

**SymptÃ´me** : `file_edit` rÃ©ussi en station **PLAN** (step 101, `chat_qwen27b.txt`) ; export sans message `Run rail: tool â€¦ not allowed`.

**Cause** : `infer` rail aprÃ¨s tour assistant ; `pre_gate` lit station **avant** mise Ã  jour â†’ mutations passent en READ/PLAN.

**Fix** : **C17** â€” [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md) Ã©tape F2.

**CritÃ¨re fix** : tentative `file_edit` en READ/PLAN â†’ blocage + nudge ; mutations seulement en ACT/VERIFY.

---

## B-SEG-01 â€” Brief segment Â« pending mutation Â» sans payload

**Cible** : **1.4.0 â€” BLOQUANT CLOSURE**

**SymptÃ´me** : segment ACT ~150 steps, fouille `.drox/rail-segments/`, grep sessions â€” pas dâ€™edit appliquÃ©. Brief = `Apply the architect's pending mutation for â€¦` (`segment/trigger.rs`).

**Fix** : **C16** â€” brief inclut `edits[]` / `contents` du tool call parent.

**CritÃ¨re fix** : segment â‰¤ ~15 steps ou rapport `completed` avec diff attendu ; D4 dogfood [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md).

---

## B-SEG-02 â€” Double travail parent + segment mÃªme tÃ¢che

**Cible** : **1.4.0**

**SymptÃ´me** : architecte mute aprÃ¨s `file_edit` PLAN ; segment respawn mÃªme `task_id` ; 2áµ‰ segment aprÃ¨s reprise user.

**Fix** : **C18** + **C19** â€” skip segment si path dÃ©jÃ  mutÃ© ; PLAN = `todo_write` seulement.

**CritÃ¨re fix** : une seule chaÃ®ne mutation par path/todo ; pas de segment dupliquÃ© sur reprise.

---

## B-MOTOR-01 â€” RÃ©flexion qui Â« recommence Â» Ã  chaque micro-avancÃ©e

**Cible** : **1.4.1**

**SymptÃ´me** : Ã  chaque tour (lecture fichier, petit fix), le modÃ¨le **reformule tout le plan** depuis le dÃ©but (Â« Let me first fixâ€¦ Â», Â« I already have a good pictureâ€¦ Â», Â« Le problÃ¨me est clairâ€¦ Â») au lieu dâ€™incrÃ©menter.

**Repro** : [`chat.txt`](../../../1.3/chat.txt) steps ~11â€“26 â€” phase rÃ©glage `globals.css`.

**Ce nâ€™est probablement pas quâ€™un bug UI** : le texte de rÃ©flexion est souvent le **nouveau tour** `thinking` / prÃ©ambule du modÃ¨le, pas une rÃ©injection verbatim de lâ€™historique.

**HypothÃ¨ses (Ã  valider)**

| # | HypothÃ¨se | Piste |
|---|-----------|-------|
| H1 | **Pas de rail** (run solo prÃ©-1.4.0) â€” pas de segment / pas de station VERIFY isolÃ©e | Activer `runRailEnabled` + dogfood mÃªme scÃ©nario |
| H2 | **Snapshot architecte rÃ©injectÃ© chaque tour** (`architect_run_context_block_per_turn`) â€” le modÃ¨le Â« relit Â» le plan et resynthÃ©tise | Logger taille snapshot ; A/B sans refresh mid-run |
| H3 | **Ã‰checs outil â†’ nouveau tour complet** (bash Windows steps 20â€“23) â€” chaque erreur relance une boucle LLM avec re-planification | CorrÃ©ler steps avec `ToolFinish is_error` |
| H4 | **Pas de marqueur `[phase: done]`** â€” le moteur relance via nudge Â« continue Â» | Compter iterations avant clÃ´ture |
| H5 | **Thinking natif** affichÃ© intÃ©gralement Ã  chaque tour â€” donne lâ€™impression de boucle sÃ©mantique mÃªme si le travail avance | UI : replier thinking passÃ© ? |
| H6 | **Loop detector** ne fingerprint pas les prÃ©ambules de plan (texte diffÃ©rent Ã  chaque fois) | `normalize_for_loop_fingerprint` â€” Ã©tendre ? |

**DonnÃ©es transcript**

- Steps 24â€“25 : **double** `file_read` du mÃªme `globals.css` dÃ©jÃ  corrigÃ©.
- Steps 27 vs 29 : **double** bloc `[phase: answering]` quasi identique.
- Steps 20â€“23 : spirale bash (lint timeout, `head` absent sur Windows, `node -e` quoting cassÃ©).

**CritÃ¨re fix (moteur)** : aprÃ¨s mutation rÃ©ussie sur un path, pas de re-lecture complÃ¨te + re-plan identique sans nouveau signal user (heuristique ou rail ACT/VERIFY).

---

## B-MOTOR-02 â€” Spirale bash VERIFY sur Windows

**Cible** : **1.4.1** (prompt/bash) Â· **boucle VERIFYâ†’ACT** : **1.4.0** (juin 2026)

**SymptÃ´me** : tentatives `head`, `npm run lint` (timeout 30s), `node -e` avec guillemets cassÃ©s â€” 4+ tours perdus ; aprÃ¨s Ã©chec TS2322 (`chat_qwen27b.txt`), blocage VERIFY sans retour ACT structurÃ©.

**Repro** : chat.txt steps 20â€“23 ; qwen27b `ses_0ad98f9e`.

**Fix moteur 1.4.0** : `verify.rs` â€” fail `bash`/`lsp` â†’ ACT ; advance VERIFYâ†’ANSWER bloquÃ© sans `Pass` ; snapshot verify.

**Pistes restantes (1.4.1)**

| Piste | DÃ©tail |
|-------|--------|
| Prompt VERIFY | Rappeler environnement **Windows** + commandes PowerShell-compatibles |
| Pre-check bash | DÃ©tecter `head`/`tail` et suggÃ©rer alternative avant exÃ©cution |

**CritÃ¨re fix** : smoke VERIFY Windows â€” au plus 1â€“2 bash ; aprÃ¨s erreur compile/lint, retour ACT + `file_edit` sans spirale.

---

## B-MOTOR-03 â€” Double livrable answering

**Cible** : **1.4.1**

**SymptÃ´me** : rÃ©ponse utilisateur finale envoyÃ©e **deux fois** (steps 27 et 29) + LSP diagnostics redondant.

**Pistes** : `done_without_answering` promotion, `FinalAnswerGuard`, ou modÃ¨le qui Ã©met `[phase: done]` puis continue.

---

## B-MOTOR-04 — RÉSOLU 1.4.1 — Run edit sans mutation (`file_edit` absent)

**Cible** : **1.4.1**

**SymptÃ´me** : brief edit explicite mais run terminÃ© avec **0 `file_edit`** ; ou clÃ´ture en `answering` sans mutation alors que le brief lâ€™exigeait (dogfood juin 2026 post-1.4.0).

**Plan** : [PLAN-1.4.1](../../1.4.1/PLAN-1.4.1.md) phase P4.

**Fix** : `looks_like_mutation_brief` + `done_gate_missing_mutation_when_expected` (`f8dd47a7`). **Validation** : dogfood README+LSP juin 2026 (`ses_4792b6b9`, `file_write` + rail VERIFY OK).

**CritÃ¨re fix** : mutation explicite demandÃ©e â†’ au moins un `file_edit`/`file_write` rÃ©ussi ou answering honnÃªte expliquant lâ€™absence de patch.

---

## B-REL-01 â€” Surface prod vs dev (`droxSurface`)

**Cible** : **1.4.1**

**SymptÃ´me** : installeur 1.4.0 affiche `1.4.0.xxxxxx` ; rÃ©glages dogfood visibles en release.

**Plan** : [PLAN-1.4.1](../../1.4.1/PLAN-1.4.1.md) phase P1.

**CritÃ¨re fix** : `drox:ship` â†’ semver produit seul ; features dev masquÃ©es ; readiness OK.

---

## Lien avec Run Rail 1.4.0

| Backlog | AttÃ©nuation attendue du rail (pas encore prouvÃ©e en dogfood) |
|---------|---------------------------------------------------------------|
| B-MOTOR-01 | Segments ACT + stations â€” moins de contexte parent en boucle mutation |
| B-MOTOR-02 | Boucle VERIFYâ†’ACT (`verify.rs`) |
| B-UI-03 | Sceller plan + strip par run (session multi-tours) |
| B-UI-04 | Polish questionnaire â€” indÃ©pendant du rail |
| B-UI-05 | Ordre chronologique phases â€” complÃ©mentaire aux blocs station rail |
| B-UI-06 | Replay journal â€” bloque rÃ©ouverture app |
| B-UI-07 | `busy` stale aprÃ¨s fin run / blur app |
| B-RAIL-01 | Marqueurs `[gate:]` absents â€” rail invisible â€” **fix Phase 5** [11-PHASE-RAIL-CONVERGENCE.md](11-PHASE-RAIL-CONVERGENCE.md) (C11â€“C12) |
| B-UI-01/02 | Collapsible tray / Ran layout â€” hors scope moteur |

**Action post-Phase 4** : rejouer **mÃªme prompt** charte CSS avec `runRailEnabled: true` et cocher quels IDs persistent.

---

## Journal

| Date | Note |
|------|------|
| 2026-06-08 | CrÃ©ation backlog depuis smoke test utilisateur (pre-commit Phase 3 local) |
| 2026-06-05 | Smoke Phase 4 : B-UI-03 plan orphelin, B-UI-04 ask_user markdown, B-UI-05 ordre thinking |
| 2026-06-09 | Smoke qwen27b complet : B-UI-06/07, B-RAIL-01 ; bench modÃ¨les gemma/qwen9b/qwen27b |
| 2026-06-09 | Tri versions 1.4.0 moteur / 1.4.1 bugs / 1.4.2 UI ; salut simple â†’ M-DISC-01 |
| 2026-06-05 | Phase 4 VERIFY loop : `verify.rs`, transition gate, snapshot ; B-MOTOR-02 partiel |
| 2026-06-05 | Clôture squelette 1.4.0 ; PLAN-1.4.1 réaligné post-dogfood ; B-MOTOR-04, B-REL-01 ajoutés |
| 2026-06-12 | B-MOTOR-04 résolu (`f8dd47a7`) ; B-UI-07 validé dogfood ; P3/P4 plan cochés |

---

## Benchmark modÃ¨les (smoke juin 2026, site-kdds)

| ModÃ¨le | Events UI | Msgs moteur | RÃ´le 1er tour | Verdict |
|--------|-----------|-------------|---------------|---------|
| Gemma 4 26b | 1740 | 10 | `architect_discussion` | Friction discuss, thinking mÃ©ta EN |
| Qwen 3.5 9b | 992 | 11 | `architect` | Efficace, bon pour R1/R3 rapides |
| Qwen 3.6 27b | 10387 (session longue) | 161 | `architect` | Fiable edit ; rail non observable (B-RAIL-01) |
