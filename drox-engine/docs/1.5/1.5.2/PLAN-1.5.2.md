# Plan 1.5.2 — Configuration moteur Drox depuis l’IDE

**Version** : juin 2026  
**Base** : [1.5.1](../1.5.1/CLOSURE-1.5.1.md) · moteur `tui_mono` · shim RPC  
**Branche** : `1.5.2`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **M1** Paramètres moteur IDE | 0 % (spec) | config agent |

**Hors scope** : diffs fil, UX chat, splash, release Linux → [1.5.3](../1.5.3/PLAN-1.5.3.md) · [1.5.4](../1.5.4/PLAN-1.5.4.md).

---

## Principe directeur — moteur d’abord

> **L’IDE s’adapte au contrat moteur 1.5 (`tui_mono` + `agent.run`). On ne réintroduit pas de surface 1.4.**

| Règle | Détail |
|-------|--------|
| **Source de vérité** | [`AgentRunParams`](../../../drox/crates/drox-cli/src/jsonrpc/protocol.rs) + application dans [`handlers.rs`](../../../drox/crates/drox-cli/src/jsonrpc/handlers.rs) |
| **Référence UX** | TUI / CLI — pas le registre Settings historique IDE |
| **Interdit** | Réexposer orchestration `role_split`, `engine.tuning.*` 1.4, champs RPC **ignorés** par le moteur |
| **Wire** | Tout paramètre modèle / sampling utile part dans **`agent.run` à chaque message** (pas seulement env au spawn) |

Référence shim : [SHIM-MOTEUR-IDE](../1.5.0/SHIM-MOTEUR-IDE.md).

### Champs RPC explicitement ignorés par le moteur (ne plus envoyer depuis l’IDE)

| Champ | Statut |
|-------|--------|
| `orchestrationMode` | Ignoré — log debug |
| `orchestrationMaxParallelExecutors` | Ignoré |
| `architectInteractionMode` | Ignoré |
| Objet `engineTuning` (legacy wire 1.4) | Non consommé — **ne pas recâbler** |

---

## Problème utilisateur (1.5.1 → 1.5.2)

| Constat | Cause |
|---------|--------|
| Wizard connexion OK | 1.5.1 livré |
| Sampling invisible en release | Gate `advancedLlmSettings` + champs HTML masqués |
| `max_iterations` bloqué à **12** | Défaut produit + non exposé en release |
| Settings VS Code trompeurs | Clés 1.4 (`interactionMode`, `engine.tuning.*`) encore présentes ou documentées |
| Sampling partiellement inactif | `buildAgentRunParams` n’envoie pas `topP`, `repeatPenalty`, etc. dans le JSON RPC |

---

## Cartographie UI cible

### Onglet **Architecte** (vignette 🏛) — « comment tourne le modèle »

Tout le **sampling** + **`keep_alive`** vit ici. Visible en **release** (fin du gate dev-only sur ces champs).

| # | Paramètre | Clé settings | Champ `agent.run` | Notes |
|---|-----------|--------------|-------------------|--------|
| A1 | Modèle | `drox.architect.model` | `model` | Liste depuis `drox.server` |
| A2 | Fenêtre de contexte | `drox.numCtx` | `numCtx` | Presets + custom (déjà en place) |
| A3 | Température | `drox.temperature` | `temperature` | Optionnel — défaut serveur si vide |
| A4 | Top-p | `drox.topP` | `topP` | Ollama / compatible |
| A5 | Top-k | `drox.topK` | `topK` | |
| A6 | Repeat penalty | `drox.repeatPenalty` | `repeatPenalty` | Important pour le code |
| A7 | Min-p | `drox.minP` | `minP` | Modèles récents |
| A8 | Seed | `drox.seed` | `seed` | Reproductibilité |
| A9 | Presence penalty | `drox.presencePenalty` | `presencePenalty` | Si backend supporte |
| A10 | Frequency penalty | `drox.frequencyPenalty` | `frequencyPenalty` | Si backend supporte |
| A11 | Max tokens (tour) | `drox.maxTokens` | `maxTokens` | **Seul** plafond de sortie — moteur mappe vers `num_predict` Ollama |
| A12 | **Keep alive** | `drox.keepAlive` | `keepAlive` | Ex. `30m`, `0`, `-1` — modèle reste chargé Ollama |

**Organisation panneau (spec UX)**

1. Modèle + recharger la liste  
2. Contexte (`num_ctx`)  
3. Sampling (température, top_p, repeat_penalty, min_p, top_k, seed, pénalités)  
4. Sortie — **max tokens** (un seul champ ; pas de `drox.numPredict` séparé)  
5. Keep alive  

Champs vides = **ne pas envoyer** la clé RPC (défaut serveur / modèle), pas `0` arbitraire.

### Panneau **Général** (vignette ⚙) — « comment tourne le run / l’IDE »

Pas de sampling ici (déplacé Architecte).

| # | Paramètre | Clé settings | Champ `agent.run` / effet |
|---|-----------|--------------|---------------------------|
| G1 | Connexion LLM | wizard + `drox.server`, `drox.apiKey`, `drox.llmHeaders`, `drox.llmProvider`, `drox.llmHosting` | `server`, `apiKey`, `headers` |
| G2 | **Max iterations** | `drox.maxIterations` | `maxIterations` — défaut **50** |
| G3 | Native thinking | `drox.nativeThinking` | `nativeThinking` |
| G4 | Langue | `drox.primaryLanguage` | env / prompt (comme aujourd’hui) |
| G5 | Outils désactivés | `drox.tools.disabled` | `disabledTools` |
| G6 | MCP | `drox.tools.mcp.enabled` | `mcpToolsEnabled` |
| G7 | Warm start | `drox.warmStart` | IDE seulement |
| G8 | Confirm file writes | `drox.confirmFileWrites` | IDE seulement |
| G9 | Open modified files | `drox.openModifiedFiles` | IDE seulement |
| G10 | Diagnostics hover | `drox.addDiagnosticOnHover` | IDE seulement |
| G11 | Erreurs dans le fil | `drox.chat.showErrorsAndWarnings` | IDE seulement |

### Composer (vignettes mode) — inchangé

| Paramètre | Clé | `agent.run` |
|-----------|-----|-------------|
| Analyze / Trust edit / I'm not crazy | `drox.permissionMode` | `mode` + `applyEdits` |

Pas de doublon dans Settings pour un mode « architecte discuss/action » 1.4.

### Settings VS Code — onglet **Drox**

Miroir des clés ci-dessus + MAJ / notifications. **Même périmètre** que les panneaux chat — pas de section tuning 1.4.

---

## Paramètres moteur valides mais hors UI 1.5.2

Présents dans `AgentRunParams`, utilisables plus tard — **pas** dans Settings ni panneaux cette version :

| Champ | Raison report |
|-------|----------------|
| `subagentsEnabled`, `subagentsMaxIterations`, `subagentsMaxConcurrent` | Feature `task` — pas prioritaire config utilisateur 1.5.2 |
| `runObjective` | Heuristique client interne |
| `allow` / `ask` / `deny` | Permissions CLI — `.drox/settings.json` |

---

## Purge — legacy 1.4 et faux réglages

### À retirer du registre Settings (et ne plus documenter)

| Clé | Motif |
|-----|--------|
| `drox.architect.interactionMode` | Orchestration 1.4 — RPC ignoré |
| `drox.executor.model` | Rôle exécuteur 1.4 |
| `drox.orchestration.maxParallelExecutors` | Orchestration 1.4 |
| `drox.subagents.*` (toute la famille) | Hors UI 1.5.2 ; pas de réglage orphelin dans Settings |
| `drox.engine.strictness` | Jamais wire moteur TUI |
| `drox.numPredict` | Doublon de `drox.maxTokens` — **supprimer** ; migration lecture → `maxTokens` |
| **`drox.engine.tuning.*`** (≈ 45 clés) | Profil moteur 1.4 — `wireEngineTuningForRpc` mort |

### `drox.engine.tuning.*` — liste complète à purger

Non enregistrées aujourd’hui dans le registre VS Code, mais clés et schémas encore dans le code — **supprimer** (enum, fichiers config, tests) :

- `readBudgetPercent`, `maxReadsBeforeDelegate`, `maxMutationsBeforeDelegateNudge`, `minDelegateInstructionsLen`, `maxDelegateScopePaths`, `delegateScopeMaxFiles`
- `promotableAnswerMinChars`, `discussionPromotableMinChars`, `discussionAutoStopOnReply`
- `intentMaxIterations`, `discussionMaxIterations`, `loopStrikesBeforeAbort`, `maxDelegationsPerTask`
- `maxToolsPerTurnArchitect`, `maxToolsPerTurnDiscussion`, `maxToolsPerTurnIntent`, `maxToolsPerTurnExecutor`, `maxParallelToolCalls`, `maxConsecutiveAskUserFailures`
- `maxTodoItems`, `memoryBudgetTokens`, `requireDelegateBeforeTodoComplete`, `requireWorkspaceMapBeforeDelegate`
- `minDeliverableBytes`, `executorDeliverableExcerptMaxChars`, `executorSubrunMaxIterations`
- `liveCompactTailKeepMessages`, `liveCompactMaxTailRatio`, `liveCompactMinPrefixTokens`, `liveCompactMaxPasses`
- `checkpointMaxChars`, `anchorUserRequestMaxChars`, `anchorPlanMaxItems`
- `summarizeToolResultTruncate`, `reinjectToolResultTruncate`, `contextSnipEnabled`
- `executorGlobHeavyBlocked`, `executorAskUserBlocked`, `executorTodoWriteBlocked`, `executorDeliverableMetBlocked`
- `gateDoneRequiresAnswering`, `gateTestingAfterCodeMutation`, `gateTodoRecreationBlocked`, `gateProfessorCoursePlan`, `gateTodoStaleBeforeDone`

Fichiers concernés (implémentation future) : `droxEngineTuning.ts`, `droxEngineTuningConfiguration.ts`, entrées `DroxSetting.EngineTuning*` dans `droxConfiguration.ts`.

### Dépréciation douce (lecture seule)

| Clé | Traitement |
|-----|------------|
| `drox.model` | Conserver **lecture** repli → `drox.architect.model` ; retirer du registre UI |

### Code IDE à nettoyer (implémentation future)

- Supprimer envoi `orchestrationMode: 'role_split'` dans `buildAgentRunParams`
- Supprimer gate `advancedLlmSettings` pour les clés **Architecte** et **max_iterations** (release = même surface qu’en dev)
- Passer **tous** les champs Architecte dans `buildAgentRunParams` (pas uniquement `llmSettingsToEnv` au spawn)
- Fusionner `drox.numPredict` → `drox.maxTokens` (wire RPC `maxTokens` uniquement)

---

## Defaults produit 1.5.2

| Paramètre | Aujourd’hui | Cible |
|-----------|-------------|--------|
| `max_iterations` | 12 | **50** |
| Sampling Architecte | dev-only / non wire | **release**, wire RPC |
| `keep_alive` | dev-only General | **Architecte**, release |
| Moteur défaut interne (`handlers` `unwrap_or(12)`) | 12 | **Aligner doc** ; l’IDE envoie 50 — évolution moteur optionnelle hors 1.5.2 |

---

## Checklist M1 (après validation spec)

- [x] **M1-1** — Valider cette spec (pas de code avant accord)
- [ ] **M1-2** — Panneau Architecte : sampling complet + `keep_alive` en release
- [ ] **M1-3** — Panneau Général : `max_iterations` 50, sans sampling
- [ ] **M1-4** — `buildAgentRunParams` : wire complet sampling + `keepAlive` ; retirer champs 1.4
- [ ] **M1-5** — Purge registre Settings + code `engine.tuning` / orchestration 1.4
- [ ] **M1-6** — `droxConfiguration.ts` : descriptions alignées `tui_mono` (plus de `role_split`)
- [ ] **M1-7** — Tests + smoke release : changer `top_p` + `max_iterations` → prochain run conforme

**Critère d’acceptation** : installeur release → Architecte expose tout le sampling + keep_alive → Général expose max iterations 50 → Settings Drox sans entrée `engine.tuning` ni `interactionMode` → `agent.run` JSON contient les valeurs modifiées.

---

## Livrables

| # | Livrable | Critère |
|---|----------|---------|
| M1 | Config moteur IDE | spec ci-dessus implémentée |
| L3 | `droxVersion` **1.5.2** au ship | `package.json` |

---

## Séquence

```text
1.5.1 livrée
    → 1.5.2 spec config (ce document) → implémentation M1 → tag v1.5.2
        → 1.5.3 diffs + UX + splash
            → 1.5.4 Linux + Authenticode
```

---

## Liens

- [README 1.5.2](README.md)
- [SHIM-MOTEUR-IDE](../1.5.0/SHIM-MOTEUR-IDE.md)
- [PLAN 1.5.3](../1.5.3/PLAN-1.5.3.md)
- [PLAN 1.5.4](../1.5.4/PLAN-1.5.4.md)
