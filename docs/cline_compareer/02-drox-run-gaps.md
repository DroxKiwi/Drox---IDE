# 02 — État des lieux Drox : où se perd la clôture d'un run

Référence code : `drox-engine/drox/crates/drox-engine/src/agent/` (lecture du 2026-11-17).
Les numéros de ligne sont indicatifs — toujours re-localiser par symbole avant édition.

## 1. Chemin réel d'une fin de run (profils parent)

Ordre des gates dans `text_gates()` (`run/drive/text_gates.rs`), tour **sans tool calls** :

| # | Gate | Ligne ~ | Comportement si déclenchée |
|---|---|---|---|
| 1 | `done_only_nudge_sent` (tour non-Done) | 93 | Stop immédiat, le premier libellé affiché reste |
| 2 | Explore child (`explore_execution`) | 109 | Stop immédiat (phase rapport moteur suit) |
| 3 | **`engine_closure`** (`!explore_execution`) | 135 | **Stop** : un tour sans outil clôt, sauf `final_phase == Some(Acting)` sans `final_answer_forced` |
| 4 | (si 3 non déclenchée) `phase == Done` + todo ouverte / `MISSING_ANSWERING` / `run_objective` | 294–357 | Nudges ; certains `loop_detector.reset()` |
| 5 | **FX-B** (`acting` sans outil, ou nudge précédent actif) | 360–405 | Jusqu'à 2 nudges `INTENT_ONLY_WRITE_*` (cap `INTENT_ONLY_WRITE_MAX_NUDGES = 2`), puis `LOCAL_FINAL_ANSWER_PROMPT` + `final_answer_forced = true` → tour suivant clôt via 3 |
| 6 | Loop detector (empreinte) | 412+ | Warn → ForceConclude → `SyntheticDone` (cf. `loop_detect/decision.rs`) |
| 7 | Ni done ni outil (phase ≠ Acting mais gate 3 absente — cas Explore) | 475 | `NUDGE_PROMPT` |

Point d'entrée moteur : `drive/mod.rs` — `engine_closure` calculé ~ligne 59, boucle `for iter in 0..max_iterations` ~ligne 351, `MaxIterations` jeté ~ligne 379.

**Constat n°1 — le chemin nominal clôt bien.** Pour tout profil parent, un tour sans outil et
hors `[phase: acting]` ferme le run immédiatement (gate 3). Le symptôme « boucle sur la réponse
finale » ne vient pas de là.

**Constat n°2 — le chemin de fuite est FX-B (gate 5).** Dès que le modèle produit
`[phase: acting]` (ou garde ce marqueur) sans tool call — massif avec les petits modèles, courant
aussi chez les gros — la gate 3 ne s'applique pas ; la gate 5 redemande l'écriture **deux fois**,
puis force un troisième tour « final answer ». L'utilisateur voit la même conclusion re-streamée
3 à 4 fois, entrecoupée de nudges. C'est le reproducteur le plus probable du symptôme, pour
**tous** les profils (la gate n'est pas profil-scopée).

**Constat n°3 — la clôture dépend du texte, pas d'un événement.** Contrairement à Cline (tour sans
outil ⇒ fin, sans interpréter), Drox *infère* la fin depuis `final_phase`
(`consume_llm_stream.rs` ~63–145), `saw_answering`, `reply_already_visible` (~324) et la todo.
Chaque inférence est un endroit où un modèle légèrement non conforme dévie dans un nudge.

## 2. Défauts identifiés (classés)

| ID | Sévérité | Description | Localisation |
|----|----------|-------------|--------------|
| **G1** | Critique | Réponse finale re-streamée N fois via FX-B : tours 1–2 = nudges `INTENT_ONLY_WRITE_*`, tour 3+ = `LOCAL_FINAL_ANSWER_PROMPT` + `final_answer_forced`. Résultat utilisateur : « le modèle n'arrive pas à conclure ». | `text_gates.rs` ~360–405 ; `drox-prompts/src/gates.rs:165` |

## 3. Ce que Drox fait mieux que Cline (ne pas casser)

- **`loop_detect/`** : empreintes (contenu assistant + tool_calls, normalisation bash/grep) avec
  escalade en 3 paliers — là où Cline n'a aucun anti-boucle intrinsèque.
- **`drox-bash`** : parsing AST des commandes (classificateur read-only vs mutation) — Cline matche
  des préfixes.
- **Permissions/sandbox** (`drox-permissions`), **hooks outillage** granulaires.
- Fermeture moteur en tour sans outil **déjà en place** (gate 3) — la base saine sur laquelle
  simplifier.

## 4. Comment diagnostiquer un run qui boucle (sans toucher au code)

1. Activer les logs : `RUST_LOG=drox_engine=debug` (cf. `drox-cli/src/main/setup.rs`, `EnvFilter`).
   Chercher `intent-only write`, `final answer`, `textual tool envelope`, `engine closure`.
2. Inspecter le transcript `.drox/` du run : compter les messages système intercalés entre deux
   copies de la même réponse → identifie la gate déclenchée (FX-B ⇒ `INTENT_ONLY_WRITE_*` /
   `LOCAL_FINAL_ANSWER_PROMPT` ; textuel ⇒ `ENGINE_CLOSURE_TEXTUAL_TOOL_REPLY`).
3. Vérifier `final_phase` du dernier tour dans les logs : `acting` récurrent = G1/G2 quasi certain ;
   `done` sans `answering` répété = G3.
4. Comparer `iterations` consommées vs `max_iterations` effectif (extension : défaut 12 via
   `drox.maxIterations`, rpc `max_iterations` ; subagents : 25).

## 5. Reproducteur minimal (pour l'agent implémenteur)

Un test d'intégration (`drox-engine/tests/` ou `agent/tests/`) suffit pour verrouiller le bug :

1. Scripteur LLM renvoyant : tour 1 = `[phase: acting]\nVoici la réponse complète de 400 mots.`
   sans aucun `tool_call`.
2. Attendu actuel (bug) : ≥ 2 tours supplémentaires, nudges injectés, réponse re-streamée.
3. Attendu cible (cf. axes) : clôture immédiate, un seul rendu de la réponse, `Stop`.

Variantes à couvrir : (a) avec `[phase: answering]` (contrôle), (b) avec `<tool_call>` inclus dans
un bloc de code dans la réponse (G5), (c) `[phase: done]` seul répété (G3).

| **G2** | Haute | Un tour `[phase: acting]` **avec** réponse complète et sans outil est traité comme une intention d'écriture non aboutie — jamais comme une conclusion. Aucune heuristique « longueur/densité ⇒ c'est la réponse » | idem G1 |
| **G3** | Moyenne | `[phase: done]` sans `answering` → `MISSING_ANSWERING_PROMPT` **+ `loop_detector.reset()`** : l'escalade Warn→ForceConclude→SyntheticDone est annulée à chaque tour → boucle possible jusqu'à `max_iterations` (12 par défaut, 25 subagents ; l'IDE peut en envoyer plus — cf. `docs/engine/agent-run-loop.md`) | `text_gates.rs` ~294–308 |
| **G4** | Moyenne | `unfinished_todos_prompt` réinjecté **sans compteur** ; seul le fingerprint protège, et il casse si le modèle reformule. Atteignable surtout en Explore (gate 3 clôt avant côté parent) — dette latente | `text_gates.rs` ~309–327 |
| **G5** | Moyenne | Refus de la réponse finale : un tour contenant `<tool_call` ou `<function=` (y compris dans un bloc de code d'exemple !) déclenche `ENGINE_CLOSURE_TEXTUAL_TOOL_REPLY` après 1 nudge → réponse **jetée**, run clos avec un message de refus. Un snippet XML/JSON dans la réponse suffit | `reply_has_textual_tool_call` (`drox-prompts/src/local.rs:199`) ; usage `text_gates.rs` ~176–221 |
| **G6** | Faible | `surface_reply` (`!saw_answering && !reply_already_visible`) peut ré-émettre un texte déjà streamé → doublon dans la bulle selon le profil | `loop_close/engine_closure.rs` ; `consume_llm_stream.rs` ~324 |
| **G7** | Faible | `loop_detector.reset()` aussi sur `run_objective_done_nudge` (one-shot, bénin) — auditer tout reset systématiquement | `text_gates.rs` ~336 |
| **G8** | Cosmétique | `docs/engine/agent-run-loop.md` décrit des gates `done` comme actives alors qu'elles sont quasi inatteignables côté parent → dette de compréhension | doc vs code |
