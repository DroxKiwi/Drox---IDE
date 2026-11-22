# 03 — Axes d'implémentation proposés

Objectif : éliminer la famille de bugs « le run ne se ferme pas / la réponse finale est
re-générée » en réduisant la négociation entre moteur et modèle à la sortie.

Principe directeur, emprunté à Cline :

> **La fin d'un run est un fait mécanique (tour sans outil = fin), jamais le résultat d'un
> accord entre le modèle et le texte du moteur.** Les gates qui « vérifient que le modèle a bien
> fini » sont des compteurs de boucles déguisés.

Ordre conseillé : **A → C → D → F → E → G** (A règle l'essentiel du symptôme utilisateur).

---

## Axe A — Clôture inconditionnelle sur tour sans outil (P0, effort S)

**Cible** : `run/drive/text_gates.rs` (gates 3 & 5), `loop_close/engine_closure.rs`.

**Action** :
1. Gate 3 (`engine_closure`) devient inconditionnelle pour tout profil parent : tour sans
   `tool_calls` ⇒ clôture, **y compris si `final_phase == Acting`**. La distinction
   « acting sans outil » / « conclusion » disparaît.
2. FX-B (gate 5) est supprimée, ou réduite à 1 nudge max si le texte est *très* court
   (heuristique optionnelle : < 200 caractères — à trancher à l'implémentation ; le défaut
   sain est : supprimer).
3. `LOCAL_FINAL_ANSWER_PROMPT` / `INTENT_ONLY_WRITE_*` / `INTENT_ONLY_WRITE_MAX_NUDGES` :
   plus jamais poussés en chemin nominal (garder un test qui échoue si le chemin redevient
   atteignable sans opt-in explicite).
4. Le contrôle « todo ouverte ⇒ un dernier tour » devient un **avertissement transcript**
   (event type `status-notice`), jamais une gate. (Cline : les todos ne bloquent pas la fin.)


---

## Axe B — Clôture déclarative optionnelle via outil terminal (P2, effort M)

**Cible** : `drox-tools` (nouvel outil, ex. `complete_run`), `drox-engine/loop_close/`,
prompts `drox-prompts`.

**Action** : outil **optionnel** `complete_run { summary }` à sémantique
`lifecycle.completesRun` (terminologie Cline) : quand le modèle l'appelle, le moteur clôt avec
`summary` comme texte final, sans passer par l'inférence de phase. Activation par profil
(d'abord `cloud-full`, les modèles forts l'appellent fiablement ; les petits profils restent
sur l'Axe A).

**Référence Cline** : `submit_and_exit` (`definitions.ts` ~L897, `completesRun: true`),
`findCompletingToolMessage` (`agent-runtime.ts` ~L2410), policy dans `runtime-builder.ts`
(~L855–910). L'alias `attempt_completion` ↔ `submit_and_exit` (`message-translator.ts` ~L903)
montre comment rester compatible avec les habitudes des modèles.

**Non-but** : rendre cet outil **obligatoire** — sinon les petits modèles n'arrivent jamais à
finir (piège Cline, §8 du doc 01).

---

## Axe C — Assainir l'escalade anti-boucle (P1, effort S)

---

## Axe D — Ne jamais détruire une réponse finale pour cause de pseudo-XML (P1, effort S)

**Cible** : `reply_has_textual_tool_call` (`drox-prompts/src/local.rs:199`), usage dans
`text_gates.rs` ~176–221.

**Action** :
1. Distinguer « `<tool_call>` hors fence de code » de « code utilisateur contenant la chaîne ».
   Minimum : ignorer les occurrences dans les fences ``` … ``` ; idéalement parser les fences
   avant le scan.
2. Remplacer le couple (nudge puis **refus de la réponse**) par : conserver la réponse, la
   livrer telle quelle, émettre un `AgentEvent` d'avertissement (« le modèle a imité un outil »)
   — la clôture n'est jamais bloquée par cette détection.
3. Si le tour ne contient aucun vrai `tool_call`, c'est une réponse finale, point.
   (Conséquence directe de l'Axe A.)

**Critères** : réponse finale contenant `<tool_call>…</tool_call>` dans un fence → run clos,
texte livré, warning émis.

---

## Axe E — Une seule émission de la réponse finale (P2, effort S/M)

**Cible** : `loop_close/engine_closure.rs` (`emit_engine_closure`), `consume_llm_stream.rs`
(`reply_already_visible`), événements `TextDelta`.

**Action** : garantir l'invariant « le texte final n'est rendu qu'une fois » :
- si des `TextDelta` ont déjà porté le texte (`reply_already_visible`), `emit_engine_closure`
  n'émet rien ;
- sinon, un seul `PhaseEnter(Answering)` + un seul bloc de texte ;
- test : run complet → concaténer les `TextDelta` UI == réponse attendue, une seule occurrence.

**Référence Cline** : il ne réémet jamais le contenu ; `message-added` est émis exactement une
fois par message (cf. doc 01 §3).

---

## Axe F — Tests comportementaux façon `agent-runtime.test.ts` (P1, effort M)

Porter en test Rust la matrice (nouveau fichier `drox-engine/tests/closure_matrix.rs`
ou dans `agent/tests/`) :


---

## Axe G — Observabilité des décisions de clôture (P2, effort S)

**Cible** : `text_gates.rs`, `loop_close/`, `drive/mod.rs`.

**Action** : chaque sortie de gate log (debug, `tracing`) un événement structuré :
`closure_decision{gate=…, phase=…, had_tools=bool, iterations=n, profile=…, action=close|nudge|warn}`.
Objectif : qu'un rapport utilisateur (« il boucle ») soit diagnosticable en une lecture de log,
sans reproduction.

**Référence Cline** : `status-notice` explicite pour la compaction
(`kind: "context_overflow_recovery"`) et classe d'erreur terminale (`lastErrorClass`) dans le
`run-finished` — la clôture est toujours un fait *loggable*, jamais un chemin silencieux.

---

## Non-buts (explicites)

- **Ne pas** porter le modèle de hooks Cline (`beforeModel`/`afterTool`…) dans Drox : le besoin
  couvert ici est la clôture, pas la généralisation. (Si la télémétrie Drox le demande un jour,
  concevoir un hook `on_closure` minimal — hors scope ici.)
- **Ne pas** importer la compaction Cline ; sa variante déterministe `basic-compaction` peut
  inspirer un filet pour un futur `compact` autonome (note, pas un axe).
- **Ne pas** modifier les prompts CORE (`drox-prompts`) avant que A+C soient mesurés : le
  symptôme est moteur, pas (que) prompt.
- **Ne pas** toucher à la boucle pendant que l'autre chantier d'édition du repo est actif :
  implémenter en une passe dédiée, avec `cargo test -p drox-engine` vert avant merge.

## Ordre d'exécution suggéré & portes de validation

1. **A** (+ tests F1, F2, F10) → mesure sur ~20 runs réels (`RUST_LOG`) → commit.
2. **C** + **D** (+ F3, F4, F5, F6) → `cargo test -p drox-engine` vert.
3. **E** (+ F1 assert unique émission) → vérification UI (bulle unique).
4. **F** complet, incluant non-régression Explore child.
5. **G** en dernier (journalise le comportement stabilisé).
6. **B** uniquement sur décision produit (nouveau contrat d'outil côté modèles) — à ne pas
   mélanger à la correction de bug.

## Risques & corollaires

- **Risque principal de A** : un modèle interrompu (rate-limit) produit un tour vide sans outil →
  clôture prématurée. Mitigation : préserver la voie « tour vide ⇒ nudge unique » existante,
  restreinte au **tour vide** (aucun texte du tout), pas au « texte sans outil ».
- La suppression des gates `done` (effet de bord de A) rend `MISSING_ANSWERING`/`DONE_ONLY`
  inatteignables : les supprimer proprement plutôt que les laisser en code mort.
- Mettre à jour `docs/engine/agent-run-loop.md` **après** merge (il décrit l'ancien comportement).

| Cas | Entrée modèle (mockée) | Attendu |
|---|---|---|
| F1 | réponse texte + `[phase: answering]`, aucun tool | Stop, texte unique |
| F2 | réponse texte + `[phase: acting]`, aucun tool | Stop, aucune ré-émission, aucun nudge FX-B |
| F3 | `[phase: done]` seul, répété N fois | SyntheticDone (escalade), borné |
| F4 | `<tool_call>` dans un fence de code | Stop, réponse livrée, warning |
| F5 | `<tool_call>` nu dans le texte | Stop (post-Axe A), warning |
| F6 | todo ouverte + `[phase: done]` | Stop après au plus 1 avertissement (plus de gate) |
| F7 | tool call valide puis texte | Exécution du tool puis clôture normale |
| F8 | stream interrompu (erreur provider transitoire) | retry borné (`drox-llm/retry.rs`), échec propre |
| F9 | `finishReason=length` sans tool call | nudge concision ×≤3 puis clôture propre |
| F10 | run sans aucune marque de phase | Stop en clôture moteur (cas le plus courant) |

Ces tests sont la **spécification exécutable** du nouveau contrat ; ils remplacent les tests
implicites qui encodent l'ancien comportement FX-B.


**Cible** : `text_gates.rs` (chemins MISSING_ANSWERING ~299, run_objective ~336, todo ouverte
~315–327), `loop_detect/`.

1. Supprimer **tout** `loop_detector.reset()` sur un chemin de nudge. Un nudge n'est pas un
   signe de progrès ; seule l'émission d'un tool call valide ré-arme le compteur.
2. Ajouter un compteur dédié + cap (ex. 3) sur `unfinished_todos_prompt`, avec escalade
   Warn → ForceConclude → SyntheticDone, au lieu de s'en remettre au seul fingerprint.
3. Décision documentée : `loop_detector` survit à la simplification FX-B (Axe A) — c'est le
   filet pour les boucles *avec* outils, là où Cline n'a rien.

**Référence Cline** : branche `toolCalls.length === 0` → `finishRun("completed")`
(`agent-runtime.ts`, ~L990–1030). Aucune analyse du texte.

**Critères d'acceptation**
- Reproducteur de `02-drox-run-gaps.md §5` : 1 tour, réponse émise une fois, `Stop` immédiat.
- Aucun nudge FX-B émis (assert sur transcript).
- `max_iterations` inchangé (12) mais inatteignable dans ce scénario.

**Risque** : un modèle qui voulait appeler un outil mais l'a « oublié » termine plus tôt.
C'est le comportement Cline en production depuis toujours ; le taux de faux positifs est
acceptable et mesurable (Axe G).
