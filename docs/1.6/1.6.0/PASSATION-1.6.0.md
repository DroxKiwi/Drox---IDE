# Passation 1.6.0 — obstacles face à la feature

**Pour** : un autre modèle qui reprend le chantier **sans** relire tout le chat.  
**Date** : 2026-10-20 · branche `1.6.0` · **freeze** ([CLOSURE](CLOSURE-1.6.0.md)) · **pas shippé**. Suite profils : [1.6.1](../1.6.1/README.md).  
**Règle** : [pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc) — proposer, ne coder que ce qui est validé. Binaire dogfood : `drox-engine/drox/target/debug/drox.exe` ([hygiène](../../../.cursor/rules/binaire-drox-hygiene.mdc)).

Ce n’est **pas** un journal de lots (déjà [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md)). C’est la **chaîne historique** : intention produit → chaque obstacle → faux diagnostic fréquent → cause réelle → fix → ce que ça a débloqué / ce qui a cassé ensuite.

---

## 1. Ce que 1.6.0 devait être

**Cap figé** ([README](README.md)) : un agent qui **termine un run de travail réel** sans :

1. **Boucler** (mêmes réponses, mêmes tools, run qui ne s’arrête pas) — tous modèles, pas seulement GLM.
2. **Exploser le contexte** (jauge type ~78k → ~162k, puis millions de tokens in en dogfood).
3. **Être opaque** (savoir ce que le modèle a vraiment reçu).
4. **Noyer le prompt** (situation card, snip, CORE plus léger) — **sans** RAG vectoriel sur le transcript.

**Sans changer le paradigme** : phases, tools, MEMORY/DROX, L1–L5.

**Scénario dogfood répété** (preuve que la feature « marche ») : workspace type `site-kdds` ; source docs hors ou à côté (`docs/pedagogie` puis `docs/engine`) ; vérifier diffs / pages ; **démarrer le projet**. Tant que ce run n’aboutit pas (Explore → acting → writes → bash fiable → Stop propre), 1.6.0 n’est pas clos.

**Méthode voulue ensuite** ([APPROCHE](APPROCHE-CONTRATS-ETAPE.md)) : contrats d’étape + recovery moteur, **pas** un énième Prefer pour que le modèle « comprenne ». Soft nudges OK ; hard gates seulement si brief explicite.

---

## 2. Fil directeur (lire ça d’abord)

Les symptômes dogfood ont **toujours l’air** d’être « le modèle est bête / boucle / n’écrit pas ».  
Presque chaque fois, **le moteur mentait ou tuait le run** en amont : detector reset, compaction non persistée, merge Explore spillé, shell qui rend `stdout: ""`, kill IDE mid-run, faux gate mutating, client RPC fermé, 422 provider.

Ordre mental pour un nouveau run cassé :

```text
1. Le run s’est-il arrêté ?     → DIAG-RUN-STOP (IDE vs moteur vs loop vs export)
2. Les tools ont-ils dit vrai ? → bash stdout / spill / hors-WS
3. Explore a-t-il survécu ?     → merge / kinds / F1-F2 / covered
4. Le parent a-t-il agi ?       → E1/E2 / D4 / todo
5. Anti-loop a-t-il clôturé ?   → ForceConclude / SyntheticDone
6. Provider / réseau ?          → Mistral 422, Ollama transport, client closed
```

Ne **pas** commencer par durcir les prompts.

---

## 3. Chronologie des obstacles

### Vague A — Boucles & contexte « moteur cassé » (intention d’origine)

**Symptôme.** Réponses identiques 2–3× ; runs qui n’aboutissent pas ; jauge qui double ; locaux / flash.

| # | Obstacle (ce qu’on croyait / ce que c’était) | Fix | Doc |
|---|-----------------------------------------------|-----|-----|
| **A1** | LoopDetector **reset** sur DONE_ONLY / nudge → le filet oublie les strikes | **L-1** plus de reset | [DIAGNOSTIC-BOUCLES](DIAGNOSTIC-BOUCLES-CONTEXTE.md) |
| **A2** | Même body text-only, thinking qui varie → pas de match strict | **L-2** hash body sans thinking, warn@2 hard@3 puis escalade clôture | idem · [ANTI-LOOP](ANTI-LOOP-METHODES.md) |
| **A3** | Compaction **RAM** IDE, JSONL encore plein → reload = ×2 contexte (**H1**) | **C-1/C-3** rewrite JSONL + curseur | [ETAPES](ETAPES-IMPLEMENTATION-LOOPS.md) |
| **A4** | Gros tool results inline (**H5**) | **T-1** spill `.drox/tool-outputs/` | idem |
| **A5** | Répétition `(tool, args)` non vue | **L-tools** hash progress-aware | idem |
| **A6** | Jauge illisible estim. vs provider (**H4**) | **G-1** labels status bar | idem |
| **A7** | Compact manuel sans persistance | **C-2** `try_live_compact` + write transcript | idem |
| **A8** | Nudges injectés en faux `user` `[System reminder]` (**H3**) → modèles locaux se perdent | **L-3** fold system unique | idem |
| **A9** | Annonce « j’écris la page » sans `tool_calls` → abort opaque | **FX-B+** `intent_only_write` + chunk write | DIAGNOSTIC § dogfood |

**OBS-1/2** (export `messages[]` prod) : **reporté** — on dogfood via transcript export, pas via unlock debug.

**État.** Filets A ✅ en code. Smokes S1–S4 **encore dûs**. Ça n’a **pas** suffi : le dogfood pédagogie/docs a ouvert une autre classe de bugs.

---

### Vague B — Curation prompt (Vague 4)

**Symptôme.** Même avec filets, le prompt chaud est un dump (skills, map, archives, tool blobs). Dumps `Get-Content` + écriture monolithique.

**Obstacle B1.** Tentation RAG / embeddings sur le transcript → **refus produit** ([DIAGNOSTIC-CONTEXTE-SERIEUX](DIAGNOSTIC-CONTEXTE-SERIEUX.md)).

**Fix.** Situation card + snip chaud + CORE plus léger (**S-1…S-5**). [PLAN-CONTEXT-SITUATION](PLAN-CONTEXT-SITUATION.md).

**Ensuite.** Concentration C1–C5 (volume vs ordre) : spill lecture, slim `task`, blob A index, card 3 lignes, synth Explore légère. [PLAN-CONCENTRATION](PLAN-CONCENTRATION-CONTEXTE.md).

---

### Vague C — Dogfood « vrai travail » : Plan / Explore / hors-WS

Brief répété `site-kdds` ← docs pédagogie / `docs/engine`. [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) § Dogfood.

| Run | Ce qui a planté la feature |
|-----|----------------------------|
| V1 | 0 `todo` / 0 `task` · spam tools parent |
| Mid | Plan+Explore mieux pensés ; **orphan Sync** `task` |
| Post-orphan | Explore OK, hors-WS partiel, **boucle `file_read` rotative**, 0 mutation, ~23 M tokens in |
| Option A kinds | Kinds copié-collé puis OK ; parent **same-path** `file_read` → loop detector |
| post-inline `ses_bd54123b` | Explore site OK ; inventaire **incomplete** vide ; **~3,5 M in** ; 0 pages livrées |
| post-D4 `ses_d4220fc4` | 2 Explore OK riches ; **~9,2 M in** ; **~271 `file_read`** ; **0 write** ; merge **spillé** |

| # | Obstacle | Faux diagnostic | Cause réelle | Fix |
|---|----------|-----------------|--------------|-----|
| **C1** | Parent ne planifie / n’Explore pas | « Le modèle ignore CORE » | Playbook noyé + pas de kickoff runtime | Soft work/plan/step Explore + catalog `drox-prompts` · plus tard **P1–P3** désempilage |
| **C2** | Sync Explore « Run ended without tool result » | Kill IDE / D6 | **Panic UTF-8** troncature mid-char live notes | `floor_char_boundary` + `catch_unwind` sur `task` |
| **C3** | 60 bash / `path escapes` pour lire la doc hors WS | Agent têtu | Inventaire RO bloqué hors-WS | `file_read` always `allow_outside` ; glob/grep selon toggle ; mutations = write toggle |
| **C4** | Relecture 3 fichiers UI en rotation | LoopDetector aveugle (paths changent) | Fenêtre rotative ≠ empreinte stricte | Soft `rotating_file_read` puis **R4** stub `[already_read]` ≥3× same path + **R1** Prefer réinjecté |
| **C5** | Kinds Explore copiés / CoT / `conclusion.md` | Qualité LLM | Assemble prose + pas de contrat fichier | **Option A** `explore_commit` + journal L0 · mono-kind · plus de `conclusion.md` · `artifacts_inline` |
| **C6** | Inventaire truncated → C2 off → parent relit tout | « Prefer pas assez dur » | `explore_covered` seulement si `truncated=false` | **D3** armer C2 si paths/artefacts même truncated · **D2** abort empty / `partial` |
| **C7** | Stubs spill qui **invitent** à re-lire | Compaction trop agressive | Texte stub « re-read this path » | **D1** « Do NOT file_read this spill » |
| **C8** | Après `ask_user`, 0 acting | Modèle prudent | Pas de transition runtime | **D4** `post_ask_acting` |
| **C9** | Merge Explore disparaît (8 KiB spill) puis parent relit kinds | Anti-loop / modèle | Seuil spill trop bas + snip 512 B | **F1** 64 KiB Explore · **F2** `EXPLORE MERGE PRESERVED` |
| **C10** | Parent `file_read` des artefacts kind après Explore OK | Idem C9 | Covered ne trackait pas `artifacts.*` | **E1** covered kinds · **E2/E2b** stall-act · **A** fail `explore_artifact_read` → Prefer anti-`file_read` |
| **C11** | Prompts empilés ~11k tok boot, redites Plan→Assign | Besoin de plus d’instructions | Volume vs une source de vérité | Inventaire + **P1–P3** |

**Leçon C.** Explore **mécaniquement OK** ≠ livraison. Si le merge est spillé ou C2 désarmé, le parent **relit** et n’écrit jamais. Soft Prefer se **brûlent**.

---

### Vague D — Le run meurt « tout seul » (IDE / host)

**Symptôme.** Stop mid-run, « engine disposed », fear of reload/export.

| # | Obstacle | Faux diagnostic | Cause réelle | Fix |
|---|----------|-----------------|--------------|-----|
| **D-run1** | Arrêt pendant `agent.run` | Explore / anti-loop | Dispose EH / respawn settings / rebuild `drox.exe` **tue le host** | **Survie A** : defer dispose/respawn mid-run ; `start()` réutilise host ; logs `reason=` |
| **D-run2** | `disposed … reason=shutdown` | Kill mid-turn | Souvent **fermeture fenêtre après export** | [DIAG-RUN-STOP](DIAG-RUN-STOP.md) — ignorer si timestamp **après** `Exported:` |
| **D-run3** | `drox client closed` / Retry UI | Réseau | Process mort, état RPC stale | Exit → `resetEngineState` ; stale → restart + **1** retry |
| **D-run4** | Ack « Je vais d’abord… » invisible | Pas de answering | Phase `null` pliée dans thinking (Agents) | **AMB-09** `isDroxThinkingRoute(null)` visible |
| **D-run5** | Clic chemin file-change no-op | UI chat | `OpenSessionFile` dépendait de Sessions | Handler IDE sans `ISessionsService` |

**Procédure.** Export immédiat + `.\scripts\diag-drox-run-stop.ps1`. Ne pas F5 / fermer pendant busy. Lot B (host partagé reload) **seulement si A insuffisant**.

---

### Vague E — Anti-loop trop brutal vs chantier incomplet

**Symptôme.** Loop abort opaque ; user voit un run « mort » alors que le travail n’a pas commencé (writes).

**Exemple.** `ses_e424f7a6` : classé kill IDE → en fait **loop bash** (pager + faux mutating), **pas** survie A.

| # | Obstacle | Fix |
|---|----------|-----|
| **E1** | `EngineError::LoopDetected` coupe sans livrer un Stop propre | Escalade **Warn → ForceConclude** (tools off) → **SyntheticDone** (Stop, pas EngineError sur M1–M4) |
| **E2** | `git --no-pager` / `-c` / `-C` = mutating → gate todo **avant** inspect | Classifieur `classify_git` inspect-only si subcommand read |
| **E3** | Rotation multi-fichiers = angle mort M1 | R1/R4 (Vague C) |

Produit : **finir le run** ; le chantier se négocie au tour suivant. Backlog : shell-poison → ForceConclude anticipé. [ANTI-LOOP](ANTI-LOOP-METHODES.md).

---

### Vague F — Bash IDE : le shell ment (bloque encore le dogfood « le projet démarre »)

C’est **D5** dans l’approche, devenu le chantier plateforme dominant **2026-10-14 → 16**.  
Sans stdout fiable, le modèle **ne peut pas** `git status` / build / vérifier le démarrage — exactement la 2ᵉ moitié du brief dogfood.

Chaîne (chaque fix a révélé le suivant) :

| Ordre | Ce qu’on voyait | Ce qu’on a cru | Cause | Fix | Session / note |
|-------|-----------------|----------------|-------|-----|----------------|
| **F1** | Bash coincé, Skip inutile (Agents) | Hang modèle | ExecBash sans kill ; Skip UI seulement IDE | Track+kill ExecBash, Skip carte + F1, latch instance tools | 2026-10-14 |
| **F2** | Timeout 60s jamais, O/N `cmd` | Timer trop long | Deadline **après** `runCommand` ; SI attend un prompt pourri | Timer **avant** `runCommand` ; recycle terminal Skip/timeout | 2026-10-16 |
| **F3** | Skip « nothing to skip » | Latch cassé | `settled` vide court-circuite ; finishes SI fantômes | Fallthrough recycle/ExecBash ; filtre `onCommandFinished` marker/user-cmd | |
| **F4** | stdout = bannière Windows / prompt | Régression anti-loop | `bufferBefore` avant banner ; chrome pris pour git | n+1 `droxIdeBashTerminal/` · `shellReady` · strip chrome · marker | `ses_4eea1041` |
| **F5** | cwd `\\?\` / scrollback stale | Idem | Isolation commande absente | Sanitize cwd + marker + delta « jamais le before » | [PLAN-DOGFOOD-TERMINAL](PLAN-DOGFOOD-TERMINAL-EXPLORE.md) |
| **F6** | Humain voit le live, modèle a `stdout: ""` | Capture OK | SI `getOutput()` a le marker **vide** → court-circuit jette le buffer | **P0** meilleur slice marker SI/buffer puis delta ; settle 3×80 ms | export mid-run ~2026-10-16 |
| **F7** | Encore vide après P0 (inspect) | — | Buffer/SI ratent encore | **P1** un retry **ExecBash** si IDE vide, non-reveal, non-mutateur | tests `droxBashCapture.test.ts` 11 passing |
| **F8** | `powershell -Command` + Get-Content bloqué todo | Gate mutation | Classifieur trop naïf | Préfixes `[Console]::` + Get-Content = inspect-only | PLAN-DOGFOOD |
| **F9** | n+1 `out/` stale au F5 | « Code pas pris » | Dev out pas rebuild | `scripts/ensure-dev-out.ps1` · `npm run code-dogfood` | |

**Pas fait (P2 réserve).** Wrap Windows → fichier temp + `type` si P0+P1 insuffisant. `GIT_PAGER=cat` défaut (D5 restant). D6 orphan `tool_finish`.

**Ne pas** « fixer » un bash vide par ForceConclude / « n’utilise pas bash » — le modèle a raison d’attendre du stdout.

---

### Vague G — Providers / réseau (hors moteur agent)

| # | Obstacle | Cause | Fix / lecture |
|---|----------|-------|----------------|
| **G1** | Mistral chat **422** après liste modèles OK | `seed` vs `random_seed` ; `top_p: 0` interdit | Dialecte Mistral [BACKLOG-PROVIDERS](BACKLOG-PROVIDERS.md) ✅ |
| **G2** | `LLM error: HTTP transport error` `https://ollama.com/api/chat` | Transport (réseau, VPN, cloud injoignable) **avant** tokens | Pas le bash ; Retry ; vérifier connectivité Ollama Cloud |

---

## 4. Carte « symptôme → dossier »

| Tu vois | Dossier | Ne pas |
|---------|---------|--------|
| Même texte 2–3×, pas de tools | A2 / E (M2) | Ajouter du CORE |
| Same tool same args | L-tools / M3 | |
| 271 `file_read`, 0 write, Explore déjà fait | C9–C10 F1/F2 E1/E2 | Plus de Prefer empilés |
| `artifacts_inline: {}` truncated | C6 D2/D3 | Relancer le même brief tel quel |
| Orphan Sync Explore | C2 UTF-8 d’abord, puis D6 | Accuser survie IDE trop tôt |
| Stop + `reason=shutdown` après export | D-run2 | « l’export tue le run » |
| `client closed` | D-run3 | Rebuild aveugle |
| Gate mutating avant `todo_write` sur `git status`/`--no-pager` | E2 classifieur | Forcer todo pour inspect |
| `stdout: ""` `exit_code: 0` `terminal_instance_id` | F6–F7 capture | Anti-loop |
| Bannière cmd comme stdout | F4 chrome/ready | |
| Skip no-op / hang O/N | F1–F3 | |
| 422 Mistral | G1 | |
| transport ollama.com | G2 | |

---

## 5. Où est le code (aujourd’hui)

| Zone | Chemin |
|------|--------|
| Loop / clôture | `drox-engine/.../agent/loop_detect/` · `loop_close/` · `drive.rs` · `nudges.rs` |
| Spill / snip | `agent/tool_result_spill/` |
| Situation / covered | `agent/situation/` |
| Explore | `drox-tools` `task` / explore_commit · `explore_executor` |
| Prompts | crate `drox-prompts` (`inventory-instructions.md`, `injection-map.md`) |
| Classifieur bash | `drox-bash/src/classify.rs` |
| LLM dialectes | `drox-llm` `openai/dialect.rs` · `adapters/mistral.rs` |
| Bash IDE | `src/.../drox/electron-browser/tools/droxIdeBashTerminal/` · `droxBashTool.ts` |
| Capture pure | `common/droxBashCapture.ts` · `droxBashToolResult.ts` · tests `test/common/droxBashCapture.test.ts` |
| Survie host | `droxEngineLifecycle.ts` · `droxEngineService` · [DIAG-RUN-STOP](DIAG-RUN-STOP.md) |
| Launch out/ | `scripts/ensure-dev-out.ps1` · `scripts/code-dogfood.bat` |

Tests unitaires bash : `node test/unit/node/index.js --runGlob "**/droxBashCapture.test.js"` (évite le loader CSS de `test-node --grep`).

---

## 6. Ouvert pour le successeur (priorité)

1. **Dogfood P0+P1 bash** — `echo hello` / `git status` → **tool-result** non vide (pas seulement live card). Puis Skip, recycle, ForceConclude. Relancer avec `npm run code-dogfood`.
2. Si encore vide → **P2** wrap fichier temp (validé avant code).
3. Revalider **acting après Explore** (brief docs ← `docs/engine`) : ≥1 write, pas 271 reads.
4. Smokes S1–S4 [DIAGNOSTIC-BOUCLES](DIAGNOSTIC-BOUCLES-CONTEXTE.md) §8.
5. D5 pager / D6 orphan / kind `rewrite_plan` seulement si merge intact et acting encore flou.
6. Ship : RELEASE_NOTES / CLOSURE / popup / win32+linux — **après** dogfood, pas avant.

**Interdit sans accord.** Gates durs nouveaux, policy « forcer Explore/todo », refactor hors obstacle nommé, ForceConclude comme rustine bash vide.

---

## 7. Index docs (ne pas tout lire)

| Lire | Quand |
|------|--------|
| **Cette passation** | Onboarding |
| [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) | Détail lots + dates |
| [APPROCHE](APPROCHE-CONTRATS-ETAPE.md) | D1–D6, F1/F2, E1/E2 |
| [PLAN-DOGFOOD-TERMINAL-EXPLORE](PLAN-DOGFOOD-TERMINAL-EXPLORE.md) | Shell + Explore dogfood |
| [ANTI-LOOP](ANTI-LOOP-METHODES.md) | M1–M4 état actuel |
| [DIAG-RUN-STOP](DIAG-RUN-STOP.md) | Arrêt soudain |
| [PLAN-EXPLORE-RETURN-CONTRACTS](PLAN-EXPLORE-RETURN-CONTRACTS.md) | Option A kinds |
| [CLOSURE](CLOSURE-1.6.0.md) | Freeze (pas ship) |
| [README](README.md) | Cap + avancement tableau |

---

## 8. Une phrase à retenir

**1.6.0 n’est pas « plus de prompts anti-boucle ».** C’est : *le drive dit la vérité (contexte, Explore, shell, host), puis il clôture proprement.* Chaque obstacle ci-dessus a été un **mensonge d’infra** pris pour une faille du modèle.
