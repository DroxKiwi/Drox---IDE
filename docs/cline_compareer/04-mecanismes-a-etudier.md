# 04 — Mécanismes Cline dignes d'étude pour Drox

Synthèse de l'exploration du clone `cline @ 4cdfb19` (2026-11-17). Chaque entrée : ce que c'est,
où c'est (fichier), ce que Drox a déjà, verdict provisoire. Compilé à partir d'un survol —
les « à vérifier » listent les points à confirmer dans le code Drox avant de trancher.

---

## A. Moteur de requête & contexte

### A1. `prepareTurn` — point d'injection unique avant chaque requête LLM
- **Cline** : `sdk/packages/agents/src/agent-runtime.ts` (~L1712, ~L2254–2320). Avant chaque appel, un
  `config.prepareTurn` reçoit `messages`, `tools`, `model`, `iteration`,
  `previousRequestInputTokens` (compte réel provider du tour précédent) et peut renvoyer un
  historique remplacé. C'est **le** point d'entrée de la compaction et des injections de
  contexte. `previousRequestInputTokens` sert de plancher pour l'estimateur.
- **Drox** : la compaction vit dans le flux de `drive/` (pas de point d'extension nommé unique).
  Vérifier où l'estimation de tokens est calculée côté `drox-context`.
- **Intérêt** : unifier « budget contexte, troncature tool results, injection mémoire » en un
  middleware testable. Pré-requis propre pour A2.

### A2. Compaction à deux moteurs + budget ancré provider
- **Cline** : `sdk/packages/core/src/extensions/context/compaction.ts` (+ `compaction-shared.ts`) :
  - `COMPACTION_TRIGGER_RATIO = 0.9` du budget, `DEFAULT_TARGET_RATIO = 0.7`,
    `DEFAULT_PRESERVE_RECENT_TOKENS = 20 000`, `DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS = 8192`
    (dimensionné pour les modèles « thinking » qui consomment le budget en raisonnement).
  - `basic-compaction.ts` (déterministe, sans LLM) vs `agentic-compaction.ts` (LLM). Le
    déterministe sert de **filet de sécurité** en cas d'overflow.
  - Plancher : `previousRequestInputTokens` confronté à l'estimateur via
    `MAX_INPUT_UNDERESTIMATE_FACTOR = 4` → force la compaction même si l'estimation
    char-based sous-estime (contenu dense).
- **Drox** : `compaction/{live,summarize}.rs` + `LIVE_COMPACT_*`. À confirmer : (a) variante sans
  LLM, (b) plancher ancré provider, (c) budget résumé explicite (~8192).
- **Intérêt** : le trou n°1 pour les runs longs sur 9B locaux (résumé raté = contexte plein =
  crash). Crash prévisible aujourd'hui : plausible.
- **Vérifier Drox** : `drox-context` — le `usage` provider est-il propagé jusqu'au compaction ?

### A3. Classification d'erreurs provider
- **Cline** : `sdk/packages/llms/src/providers/error-classification.ts` :
  codes explicites (`context_length_exceeded`), statuts 400/413/422 = candidat overflow, 429 =
  rate-limit, 401/403 = auth ; **veto anti faux-positif** : « tokens … exceeded » matche
  rate-limit avant overflow ; walk borné (profondeur ≤ 8) de l'objet erreur.
- **Drox** : `drox-llm/src/retry.rs` + `error.rs` — vérifier si la classification va au-delà du
  statut HTTP.
- **Intérêt** : petit périmètre, testable, impact immédiat (fin des retry sur 401/400).
  Effet boule de neige : alimente A2 (déclencher la compaction sur `context_window_exceeded`)
  et les métriques.

### A4. Tolérance aux arguments d'outils défaillants
- **Cline** : `normalizeJsonLikeStringsForSchema` appliqué avant validation — coercion des
  scalaires JSON-like vers le schéma cible (un petit modèle qui envoie `"true"` au lieu de `true`
  passe).
- **Drox** : voir `drox-tools/src/…` — validation serde directe = probable rejet sec.
- **Intérêt** : critique pour local-9b ; mesurable via les échecs `tool error` des runs réels.

### A5. Hooks de cycle de vie unifiés
- **Cline** : `sdk/packages/shared/src/hooks/contracts.ts` — `HookControl`
  `{ cancel?, review?, context?, overrideInput?, systemPrompt?, appendMessages?, replaceMessages? }`.
  Un seul mécanisme pour approuver/muter/injecter/annuler, à chaque point (`beforeRun/Run/Model/Tool/after…`).
  Le `completionGuard` (bloquer `submit_and_exit` tant qu'une tâche d'équipe est ouverte) est un
  hook, pas du code en dur.
- **Drox** : `drox-hooks` + gates éparses dans `text_gates.rs`.
- **Intérêt moyen** : extraire le contrôle de flux des gates vers des hooks nommés → testabilité.
  (cf. Axe A du doc 03 : simplifier d'abord, extraire ensuite.)

### A6. Exécution parallèle déclarée par l'outil
- **Cline** : `executionMode: "sequential" | "parallel"` par outil + regroupement des appels
  parallèles contigus (`Promise.all`).
- **Drox** : `max_parallel_tool_calls` global + `parallel.rs`/`serial.rs`. Une déclaration par
  outil est plus fine (un `file_read` en parallèle, un `bash` séquentiel).
- **Intérêt** : moyen ; peu risqué, joli gain de latence.

### A7. Outil terminal déclaré (`completesRun`)
Déjà couvert dans `03-axes-dimplementation.md` (Axe B). `definitions.ts` `submit_and_exit`,
détection `findCompletingToolMessage`.

---

## B. Produit / UX

### B1. Checkpoints de workspace (snapshot par tour, restore granulaire)
- **Cline** : `apps/vscode/src/sdk/sdk-checkpoints.ts` + `core/controller/checkpoints/*` —
  snapshot du workspace attaché aux messages utilisateur ; restauration partielle
  (fichier / tour / run), typiquement via un shadow git.
- **Drox** : rien d'équivalent identifié. **Énorme** levier UX « agent réversible » — cohérent
  avec ton positionnement local-first (le shadow repo reste local).
- **Coût** : élevé (intégration UI + stockage), à cadrer séparément. Ne pas mélanger avec la
  correction de clôture.

### B2. Règles projet togglables
- **Cline** : `.clinerules/` (+ toggles UI par fichier) — règles versionnées par projet,
  activables/désactivables sans éditer le fichier.
- **Drox** : `.drox/` + règles SDTCM ; manque le toggle fin et la découverte auto ?
- **Intérêt** : moyen ; surtout utile si Drox vise des équipes.

### B3. Mentions de contexte (`@file`, `@folder`, `@url`, `@problems`)
- **Cline** : `apps/vscode/src/core/mentions/` — injection *explicite et déterministe* de contexte
  par l'utilisateur.
- **Drox** : Codebase/SDTCM = retrieval automatique. Complémentaire, pas concurrent : l'injection
  explicite reste plus prévisible pour « je sais quel fichier compte ».

### B4. `status-notice` typés
- **Cline** : événements `status-notice` (ex. `kind: "context_overflow_recovery"`) rendus tels
  quels par l'UI ; la fin de run et les récupérations sont *visibles*.
- **Drox** : `AgentEvent` riche mais sémantique variable selon le chemin ; standardiser un
  sous-type « notice » rend le diagnostic user-side immédiat (cf. Axe G, doc 03).

---

## C. Écosystème / processus

### C1. Banc d'évaluation du moteur (`evals/`)
- **Cline** : dossier `evals/` à la racine + `apps/vscode/src/test/scenarios/` — tâches
  scriptées + scoring.
- **Drox** : rien d'équivalent. **C'est le prérequis de toute refonte de la clôture** : sans
  harnais, chaque « fix » de boucle est une régression possible invisible. À faire *avant*
  l'Axe A de `03-axes-dimplementation.md` si possible.

### C2. Multi-agent « teams »
- **Cline** : `core/src/extensions/tools/team/*` (~30 fichiers), `shared/team` — mailbox,
  tâches d'équipe, fragments d'outcome, `spawn_agent`, `await_runs`, guard de complétion.
- **Drox** : `drox-engine/src/subagent/` + outil `task` + Explore — plus simple. Le *pattern*
  intéressant : le guard de complétion d'équipe (`teamCompletionGuard`) qui bloque l'outil
  terminal tant que des sous-tâches sont `pending`/`in_progress` — transposable conceptuellement
  à ton orchestration de subagents.

### C3. Télémétrie structurée par événement (opt-in)
- **Cline** : `core/src/services/telemetry/core-events.ts` — taxonomie d'événements
  (run/turn/tool/compaction/checkpoint…) → métriques type « % runs finis sans nudge ».
- **Drox** : `drox-cli` a des logs `tracing` ; pas de taxonomie produit. Aligner avec Axe G.

### C4. Cron / agents planifiés, connecteurs (Slack, Telegram)
- **Cline** : `shared/cron`, `apps/cli`, `cline schedule …`. Hors scope IDE aujourd'hui ; à
  connaître si Drox vise l'automation.

---

## Priorisation proposée (à discuter)

| Rang | Item | Raison |
|---|---|---|
| 1 | C1 — evals minimal (10–20 tâches scriptées, asserts sur events) | Sécurise toute la suite |
| 2 | A2 — compaction déterministe de secours + plancher provider | Supprime la classe "crash en plein run" |
| 3 | A3 — classification d'erreurs | Petit, pur, immédiatement utile aux retries |
| 4 | A4 — normalization args outils | Débloque les petits modèles locaux |
| 5 | B1 — checkpoints | Le plus gros différenciateur UX visible |
| 6 | A1/A5 — refactor `prepareTurn` / hooks | Seulement après A2–A4, pour ne pas réécrire deux fois |
| 7 | A6, A7, B2–B4, C2–C4 | Au fil de l'eau |

## Vérifications Drox à faire avant de trancher
- `drox-context` : existe-t-il un `input_tokens` provider propagé jusqu'à la compaction ?
- `drox-llm` : granularité réelle de `is_retryable` (lire `error.rs` / `retry.rs`) ?
- `drox-tools` : validation des arguments (serde direct ou coercion) ?
- `drox-engine` : `usage` (tokens) est-il remonté dans `AgentEvent` ?
- IDE : mécanisme actuel proche de §B2 (`.drox/` togglable) ?

## Limite de cette étude

Le survol a couvert le runtime (agents/core), le contexte, les outils et le host VS Code.
Non couverts : la télémétrie détaillée, le protocole hub/RPC, l'i18n, le système de build —
aucun intérêt direct pour le moteur. Les références de lignes sont indicatives (clone
`4cdfb19`).
