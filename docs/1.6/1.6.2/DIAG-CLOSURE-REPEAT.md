# DIAG — Conclusions répétées en fin de run (cloud-full / GLM)

**Statut** : ouvert · repro utilisateur (GLM-5.3-flash, Ollama Cloud, profil **Full protocol — 1.6.0**)  
**Objectif produit** : [OBJECTIFS.md](OBJECTIFS.md) § **O4**

---

## Symptôme

En fin de run, le chat affiche **plusieurs fois** (souvent 5–6) le **même bilan** (« ✅ … Ce qui a été fait », vérif `tsc`, état git, etc.).

Indices UI (chat natif VS Code) :

- Entre les blocs : libellés du type **« Finished with 1 step »** (bloc *thinking* / raisonnement natif, pas un second run utilisateur).
- **Todos (n/n)** peut afficher « courant / total » — ne pas confondre avec « tout terminé » (voir widget natif vs webview).

---

## Ce que fait le moteur (`cloud-full`)

Clôture **done-driven** (`drive.rs`) :

1. Le run ne s’arrête proprement que sur **`[phase: done]`** après au moins un **`[phase: answering]`**.
2. Si le modèle signe **`done`** trop tôt, des **gates** relancent un tour LLM :
   - todos encore `pending` / `in_progress` → `unfinished_todos_prompt` ;
   - mutation code sans **`[phase: testing]`** → `CODE_MUTATION_TESTING_NUDGE` ;
   - `done` sans `answering` → `MISSING_ANSWERING_PROMPT` (demande explicitement de **réécrire** la réponse).
3. Cas documenté **GLM** : réponse complète en **`answering`** mais **sans** `[phase: done]` → `DONE_ONLY_NUDGE_PROMPT` (« n’écris pas la réponse, émets seulement `[phase: done]` »).
4. Le **LoopDetector** escalade vers `SyntheticDone` sur répétitions **identiques** — mais **pas** sur les gates todo/testing (cf. test `loop_does_not_abort_when_done_blocked_by_open_todo_repeated`). Si GLM **reformule** légèrement le bilan à chaque tour, les empreintes diffèrent → **plusieurs tours** avant escalade.

**Profil local** (`local-9b` / `local-27b`) : clôture moteur au tour sans outil — comportement différent (cf. doublon `LOCAL_SOFT_CLOSE_CHECK` en `local-27b`).

---

## Hypothèses prioritaires (GLM-5.3-flash + cloud-full)

| # | Hypothèse | Vérification |
|---|-----------|--------------|
| H1 | Boucle **answering sans `done`** + modèle qui **ignore** DONE_ONLY et réécrit le bilan | Trace : nudges `gates.done_only` puis texte assistant long identique en substance |
| H2 | Gate **testing** (edit sans `[phase: testing]` ni bash en phase testing) → chaque `[phase: done]` bloqué, modèle re-conclut au lieu d’un `bash` / marqueur testing | Trace : `CODE_MUTATION_TESTING_NUDGE` répété ; `saw_testing_phase_in_run` false |
| H3 | **`done`** avec todos encore ouverts côté moteur (dernier `todo_write` pas tout `completed`) malgré widget | Comparer dernier `todo_write` JSONL vs compteurs `last_todo_*` |
| H4 | Variation de texte → **LoopDetector** lent ; 5–6 tours avant `SyntheticDone` | Compter tours finaux `tool_calls.is_empty()` |

---

## Plan d’enquête (dogfood)

1. **Repro minimal** : petit edit + conclusion ; noter profil moteur, modèle, regulation.
2. **Export** dès dispo sur le fil live : transcript / trace moteur (`droxChatTranscriptExport`, logs RPC `agent.run`).
3. **grep** sur la session : `gates.done_only`, `unfinished_todos`, `CODE_MUTATION_TESTING`, `MISSING_ANSWERING`, `SyntheticDone`, `LoopDecision`.
4. **Test moteur** : étendre scripted LLM « GLM-like » (long answering × N sans `done`, puis avec légères variations) → mesurer nombre de tours avant Stop.

---

## Pistes de stabilisation (à trancher avant code)

1. **Clôture moteur après DONE_ONLY** : si le tour suivant contient encore un long `answering` sans `done`, **ne pas** re-streamer — injecter `Phase::Done` / `SyntheticDone` sans 2e prose (ou tronquer côté UI).
2. **Compteur dédié** `answering_without_done_turns` (indépendant du hash exact) → `SyntheticDone` au 2e ou 3e strike même si le texte varie.
3. **Gate testing** : traiter un **`bash` réussi** post-mutation comme équivalent `[phase: testing]` (si c’est la cause H2).
4. **Annexe modèle GLM** (prompt) : une ligne « après le bilan, ligne seule `[phase: done]` ».
5. **UI** : regrouper ou masquer les blocs thinking « Finished with 1 step » redondants en rafale de clôture (cosmétique, ne remplace pas le fix moteur).

---

## Hors scope immédiat

- Baisser `max_iterations` ou `repeat_penalty` seul (atténue le symptôme, ne corrige pas la boucle protocolaire).
- Changer le paradigme `cloud-full` sans décision produit.
