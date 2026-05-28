# Inventaire du noyau moteur Drox — cartographie pour rewrite Rust

**Date** : 2026-05-11  
**Statut** : Sprint 1.0 terminé, feuille de route des sprints 1.2 à 1.10.  
**Plan parent** : [`PLAN-MOTEUR-RUST.md`](../plans/PLAN-MOTEUR-RUST.md).

Ce document liste les fichiers TypeScript de `src/` qui doivent être portés en Rust, regroupés par crate Rust cible. Il sert de référence pour les sprints d'implémentation.

---

## 1. Méthodologie

Cartographie réalisée par exploration ciblée du dossier `src/` (~2000 fichiers TS) avec une lecture détaillée d'environ 45 fichiers représentatifs. Classement de chaque fichier en :

- **COEUR** — à porter en Rust pour avoir un moteur agent autonome fonctionnel.
- **SECONDAIRE** — utile mais portable plus tard ou de manière allégée.
- **NOISE** — à ne pas porter (UI Ink, telemetry first-party, features Anthropic-spécifiques sans intérêt général, plugins/marketplace, voice, computer use, etc.).

Échelle de difficulté de port : **Triviale** (copie texte / constantes), **Facile** (struct serde + logique simple), **Moyenne** (logique métier substantielle), **Élevée** (algorithmes complexes ou parsing).

### Totaux globaux (estimation)

| Catégorie | Estimation |
|---:|---:|
| Total fichiers `src/` | ~2000 |
| **COEUR** (à porter en Rust) | **~210-240** |
| **SECONDAIRE** | ~150-180 |
| **NOISE** | ~1600 |

Le ratio cœur sur total = **~10-12 %**. Ce qui confirme l'estimation initiale (~120-200 fichiers vraiment intéressants pour la réappropriation).

---

## 2. Vue par crate Rust cible

### 2.1 `drox-types` — types partagés et schémas

**Rôle** : fondations utilisées par toutes les autres crates. Pas de logique runtime, surtout des `struct` serde, des enums, des contrats. Codé en premier ou en parallèle de chaque crate qui en a besoin.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/Tool.ts` (667 lignes) | Interface fondamentale de tout tool (input/output, contexte d'exécution, validation, progress) | **Élevée** — impose les choix de design Rust (traits, async, génériques, lifetime) |
| `src/types/message.ts` | Union des messages (user, assistant, tool, system, attachments) | **Élevée** — alignement strict avec wire format providers |
| `src/types/tools.ts` | Types liés aux tools côté conversation | Moyenne |
| `src/types/permissions.ts` | Modes et règles de permission (types + constantes) | Moyenne |
| `src/types/ids.ts` | Newtypes d'identifiants (SessionId, MessageId, AgentId, etc.) | Facile |
| `src/types/notebook.ts` | Types Jupyter notebook | Facile |
| `src/types/messageQueueTypes.ts` | File de messages | Moyenne |
| `src/types/llm/messagesApi.ts` | Types Messages API | **Élevée** |
| `src/types/llm/messagesStandardApi.ts` | Variante API standard | **Élevée** |
| `src/types/llm/streaming.ts` | Événements streaming SSE | **Élevée** |
| `src/types/llm/apiErrors.ts` | Hiérarchie d'erreurs API LLM | Moyenne |
| `src/types/llm/harnessClient.ts` + `harnessAnthropicClient.ts` | Interfaces client harness | **Élevée** |
| `src/entrypoints/sdk/coreSchemas.ts` | Schémas Zod « source of truth » SDK (massif) | **Élevée** — choisir entre `serde`+`schemars`, codegen, ou réécriture à la main |
| `src/entrypoints/sdk/controlSchemas.ts` | Schémas de contrôle SDK | Moyenne |
| `src/entrypoints/sdk/coreTypes.ts` + `runtimeTypes.ts` + `controlTypes.ts` + `sdkUtilityTypes.ts` | Types SDK | Facile-Moyenne |
| `src/entrypoints/sdk/coreTypes.generated.ts` + `settingsTypes.generated.ts` | Types générés depuis schemas | Facile (regénération depuis schemas) |
| `src/entrypoints/agentSdkTypes.ts` | Types SDK agent | Moyenne |
| `src/utils/permissions/PermissionMode.ts` + `PermissionResult.ts` + `PermissionRule.ts` + `PermissionUpdate.ts` + `PermissionUpdateSchema.ts` + `PermissionPromptToolResultSchema.ts` + `classifierDecision.ts` | Types et schemas de permissions | Facile-Moyenne |
| `src/utils/bash/ParsedCommand.ts` | Structure de commande parsée | Moyenne |
| `src/utils/errors.ts` | Hiérarchie d'erreurs applicatives | Moyenne |
| `src/utils/json.ts` | Parse JSON robuste | Moyenne |
| `src/utils/path.ts` | Manipulation chemins cross-OS | Facile |
| `src/utils/abortController.ts` + `combinedAbortSignal.ts` | Annulation / signaux combinés | Facile |
| `src/utils/memoize.ts` | Mémoïsation générique | Facile |
| `src/utils/zodToJsonSchema.ts` | Conversion schemas → JSON Schema (pour MCP/tools) | Moyenne |
| `src/utils/messages/mappers.ts` | Mapping messages API ↔ interne | **Élevée** |
| `src/utils/filePersistence/types.ts` | Types persistance | Triviale |
| `src/tools/FileEditTool/types.ts` | Types d'édition | Facile |
| `src/constants/keys.ts` + `xml.ts` + `common.ts` + `errorIds.ts` + `betas.ts` + `files.ts` + `tools.ts` + `toolLimits.ts` + `apiLimits.ts` | Constantes diverses | Triviale-Facile |

**Estimation** : ~40 fichiers cœur, transversaux à toutes les autres crates.

### 2.2 `drox-llm` — client LLM, streaming, providers

**Rôle** : façade vers le LLM. Streaming SSE / NDJSON, retry/backoff, abstraction provider (Ollama d'abord, Anthropic shim si activé, OpenAI-compatible plus tard).

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/services/api/llmClient.ts` | Façade client LLM (actuellement Ollama-only via shim) | Facile |
| `src/services/api/ollamaAnthropicShim.ts` | Shim Anthropic → `/api/chat` Ollama (NDJSON) | **Élevée** |
| `src/services/api/claude.ts` | Métadonnées / corps requêtes (legacy mais référencé) | **Élevée** |
| `src/services/api/client.ts` | Fabrique client API | Moyenne |
| `src/services/api/withRetry.ts` | Retry + backoff réseau | **Élevée** |
| `src/services/api/errors.ts` + `errorUtils.ts` | Erreurs API | Moyenne |
| `src/services/api/apiConstants.ts` | Constantes API | Triviale |
| `src/types/llm/*` | Cf. `drox-types` § 2.1 | — |
| `src/utils/model/model.ts` | Résolution modèle + aliases | **Élevée** |
| `src/utils/model/aliases.ts` | Aliases noms modèles | Facile |
| `src/utils/model/configs.ts` | Configs modèles | Moyenne |
| `src/utils/model/providers.ts` | Détection provider API | Facile |
| `src/utils/model/validateModel.ts` | Validation choix modèle | Moyenne |
| `src/utils/model/modelCapabilities.ts` | Capacités (vision, tools, etc.) | Moyenne |
| `src/utils/model/modelOptions.ts` | Options modèle | Moyenne |
| `src/utils/model/agent.ts` | Config modèle pour agents | Moyenne |
| `src/utils/ollamaConnection.ts` | Vérification connexion Ollama locale | Facile |

**Estimation** : ~15 fichiers cœur. **Difficulté principale** : `ollamaAnthropicShim.ts`, `withRetry.ts`, `messagesApi.ts`. Choix de libs Rust : `reqwest` (HTTP) + `tokio` (async) + `eventsource-client` ou parsing SSE custom + `futures` (streaming).

### 2.3 `drox-tools` — implémentations des tools (sans I/O bloquant côté UI)

**Rôle** : chaque tool de l'agent (FileRead, FileWrite, Bash, etc.). Les `UI.tsx` sont **exclus** (Ink). Le mode `propose` vs `apply` (décision actée pour `WorkspaceEdit`) sera implémenté ici.

#### Tools COEUR (à porter en Phase 1)

| Tool | Fichiers principaux | Difficulté |
|---|---|---|
| **BashTool** | `BashTool.tsx` (impl), `prompt.ts`, `toolName.ts`, `shouldUseSandbox.ts`, `utils.ts` | **Élevée** |
| **FileReadTool** | `FileReadTool.ts`, `prompt.ts`, `imageProcessor.ts`, `limits.ts` | Moyenne |
| **FileWriteTool** | `FileWriteTool.ts`, `prompt.ts` | Moyenne (+ mode `propose`/`apply`) |
| **FileEditTool** | `FileEditTool.ts`, `utils.ts`, `prompt.ts`, `constants.ts`, `types.ts` | **Élevée** (matching + patches) |
| **GrepTool** | `GrepTool.ts`, `prompt.ts` | Moyenne |
| **GlobTool** | `GlobTool.ts`, `prompt.ts` | Moyenne |
| **WebFetchTool** | `WebFetchTool.ts`, `prompt.ts`, `utils.ts`, `preapproved.ts` | Moyenne |
| **AskUserQuestionTool** | `AskUserQuestionTool.tsx` (impl), `prompt.ts` | Moyenne |
| **EnterPlanModeTool** | `EnterPlanModeTool.ts`, `prompt.ts`, `constants.ts` | Moyenne |
| **ExitPlanModeTool** | `ExitPlanModeV2Tool.ts`, `prompt.ts`, `constants.ts` | Moyenne |
| **NotebookEditTool** | `NotebookEditTool.ts`, `prompt.ts`, `constants.ts` | **Élevée** |
| **MCPTool** | `MCPTool.ts`, `prompt.ts`, `classifyForCollapse.ts` | **Élevée** (relie à `drox-mcp`) |
| **McpAuthTool** | `McpAuthTool.ts` | **Élevée** (OAuth) |
| **ReadMcpResourceTool** | `ReadMcpResourceTool.ts`, `prompt.ts` | Moyenne |
| **ListMcpResourcesTool** | `ListMcpResourcesTool.ts`, `prompt.ts` | Moyenne |
| **AgentTool** | `AgentTool.tsx` (impl), `prompt.ts`, `constants.ts`, `agentToolUtils.ts`, `runAgent.ts`, `forkSubagent.ts`, `resumeAgent.ts`, `agentMemory.ts`, `agentMemorySnapshot.ts`, `loadAgentsDir.ts`, `builtInAgents.ts`, et les built-in agents (`generalPurposeAgent`, `planAgent`, `exploreAgent`, `verificationAgent`) | **Élevée** (orchestration multi-agent) |

#### Tools SECONDAIRES (à porter Phase 1.10+ ou plus tard)

| Tool | Justification |
|---|---|
| BriefTool | Pièces jointes / contexte structuré |
| ConfigTool | Lecture/écriture settings via tool |
| WebSearchTool | Recherche web (provider dépendant) |
| LSPTool | Dialogue LSP (VS Code apporte déjà du LSP) |
| SkillTool | Système de skills |
| ToolSearchTool | Recherche dans catalogue d'outils |
| RemoteTriggerTool | Déclenchement distant |
| EnterWorktreeTool / ExitWorktreeTool | Worktrees git |
| Task* (Create/Get/List/Update/Output/Stop) | Tasks background |
| ScheduleCronTool* | Cron tasks |
| SendMessageTool | Communication coordinateur/pair |
| TeamCreateTool / TeamDeleteTool | Gestion d'équipes |
| TodoWriteTool | Todo lists structurées |
| PowerShellTool (et sa stack) | Équivalent BashTool pour Windows — à mutualiser avec `drox-bash` |
| REPLTool, WorkflowTool, TungstenTool | Outils expérimentaux |

#### Tools NOISE

- `MonitorTool/` (stub vide)
- `WebBrowserTool/WebBrowserPanel.tsx` (UI navigateur Ink)
- `testing/TestingPermissionTool.tsx` (Ink tests)
- `AgentTool/built-in/claudeCodeGuideAgent.ts` (URLs Claude Code / Anthropic)
- Tous les `UI.tsx`, `BashToolResultMessage.tsx`, `WorkflowPermissionRequest.tsx`, `TungstenLiveMonitor.tsx`

#### Dépendances de tools

Les tools s'appuient sur `drox-types`, `drox-permissions`, `drox-bash` (pour BashTool), `drox-mcp` (pour MCPTool/McpAuthTool/Read/List), et pour le runtime :

| Fichier TS source (utils consommés par tools) | Crate cible | Difficulté |
|---|---|---|
| `src/utils/fsOperations.ts` | `drox-tools` | **Élevée** |
| `src/utils/notebook.ts` | `drox-tools` | Moyenne |
| `src/utils/markdown.ts` | `drox-tools` | Moyenne |
| `src/utils/attachments.ts` | `drox-tools` / `drox-types` | **Élevée** |
| `src/tools/shared/gitOperationTracking.ts` | `drox-tools` | Moyenne |
| `src/services/tools/toolHooks.ts` | `drox-engine` | Moyenne |

**Estimation totale `drox-tools`** : ~60 fichiers cœur (en excluant UI.tsx).

### 2.4 `drox-mcp` — wrapper autour de `rmcp` (SDK Rust officiel)

**Rôle** : connexion aux serveurs MCP, transport, OAuth, configuration. On s'appuie sur `rmcp` (SDK officiel Anthropic en Rust) pour le protocole, et on écrit la couche d'orchestration et de gestion des serveurs autour.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/services/mcp/client.ts` | Client MCP (transports, sessions, erreurs) | **Élevée** |
| `src/services/mcp/auth.ts` | Flux OAuth / tokens / cache | **Élevée** |
| `src/services/mcp/config.ts` | Schémas + persistance + résolution config | **Élevée** |
| `src/services/mcp/useManageMCPConnections.ts` | Logique gestion connexions (ignorer la partie React) | **Élevée** |
| `src/services/mcp/utils.ts` | Helpers MCP | Moyenne |
| `src/services/mcp/normalization.ts` | Normalisation noms de serveurs | Triviale |
| `src/services/mcp/types.ts` | Types config / transport | Facile |
| `src/services/mcp/channelNotification.ts` + `channelPermissions.ts` + `channelAllowlist.ts` | Notifications et permissions canaux | Moyenne |
| `src/services/mcp/elicitationHandler.ts` | Gestion réponses "elicitation" | Moyenne |
| `src/services/mcp/headersHelper.ts` | Construction headers | Facile |
| `src/services/mcp/envExpansion.ts` | Expansion variables d'environnement config | Facile |
| `src/services/mcp/oauthPort.ts` | Port loopback OAuth | Moyenne |
| `src/services/mcp/mcpStringUtils.ts` | Concat noms outils MCP | Triviale |
| `src/services/mcp/InProcessTransport.ts` | Transport in-process | Moyenne |
| `src/services/oauth/index.ts` + `client.ts` + `auth-code-listener.ts` + `crypto.ts` + `types.ts` | Stack OAuth complète | **Élevée** |
| `src/utils/mcpValidation.ts` + `mcpInstructionsDelta.ts` | Validation / delta instructions MCP | Moyenne |

#### NOISE (à ne pas porter)

- `src/services/mcp/cloudMcp.ts` (first-party + analytics + persistance legacy)
- `src/services/mcp/xaa.ts`, `xaaIdpLogin.ts` (auth IDP Anthropic enterprise)
- `src/services/mcp/MCPConnectionManager.tsx` (UI Ink)

**Estimation** : ~22 fichiers cœur. **Choix techniques** : utiliser `rmcp` pour le protocole, écrire la couche orchestration et persistance config en propre.

### 2.5 `drox-bash` — bash classifier, parser, safety rules

**Rôle** : parser Bash + classification readonly/destructive + intégration `tree-sitter-bash` optionnelle. Probablement la crate la plus complexe à porter.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/utils/bash/bashParser.ts` | Parser bash principal (volumineux) | **Élevée** |
| `src/utils/bash/ast.ts` | AST / transformations commandes | **Élevée** |
| `src/utils/bash/parser.ts` | Parser surface | **Élevée** |
| `src/utils/bash/commands.ts` | Tables de commandes / dispatch | **Élevée** |
| `src/utils/bash/heredoc.ts` | Support heredocs | **Élevée** |
| `src/utils/bash/bashPipeCommand.ts` | Pipelines | **Élevée** |
| `src/utils/bash/shellQuote.ts` + `shellQuoting.ts` | Quoting / déquotage | Moyenne |
| `src/utils/bash/prefix.ts` + `shellPrefix.ts` | Préfixes shell (`env`, `time`, etc.) | Moyenne |
| `src/utils/bash/registry.ts` | Registre handlers commandes | Moyenne |
| `src/utils/bash/treeSitterAnalysis.ts` | Analyse Tree-sitter | **Élevée** |
| `src/utils/bash/specs/*.ts` | Specs commandes (sleep, timeout, alias, etc.) | Facile-Moyenne |
| `src/utils/Shell.ts` | Exécution shell abstraite | **Élevée** |
| `src/utils/shellConfig.ts` | Détection shell utilisateur | Moyenne |
| `src/tools/BashTool/commandSemantics.ts` | Analyse sémantique des commandes | Moyenne |
| `src/tools/BashTool/bashCommandHelpers.ts` | Helpers construction/normalisation | Moyenne |
| `src/tools/BashTool/sedEditParser.ts` | Parsing éditions sed | **Élevée** |
| `src/tools/BashTool/sedValidation.ts` | Validation blocs sed | Moyenne |
| `src/tools/BashTool/bashSecurity.ts` | Garde-fous sécurité | Moyenne |
| `src/tools/BashTool/destructiveCommandWarning.ts` | Détection destructive | Moyenne |
| `src/tools/BashTool/pathValidation.ts` | Validation chemins | Moyenne |
| `src/utils/powershell/parser.ts` + `staticPrefix.ts` | Parser PowerShell (mutualisable à terme) | **Élevée** |

**Estimation** : ~25-35 fichiers cœur. **Choix techniques** : utiliser le crate `tree-sitter-bash` officiel pour l'AST, écrire le classifier au-dessus.

### 2.6 `drox-permissions` — modèle de permissions et plan mode

**Rôle** : décide pour chaque tool call si l'agent peut l'exécuter (allow/ask/deny), gère le plan mode, les règles utilisateur, le sandbox.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/utils/permissions/bashClassifier.ts` | Classification bash (**actuellement stub fork**) | **Élevée** (à réimplémenter complet) |
| `src/utils/permissions/yoloClassifier.ts` | Heuristiques permissions | **Élevée** |
| `src/utils/permissions/permissions.ts` | Modèle permissions runtime | **Élevée** |
| `src/utils/permissions/permissionRuleParser.ts` | Parse règles `.claude` / patterns | **Élevée** |
| `src/utils/permissions/permissionsLoader.ts` | Chargement règles | Moyenne |
| `src/utils/permissions/permissionSetup.ts` | Initialisation état permissions | **Élevée** |
| `src/utils/permissions/filesystem.ts` | Règles chemins / glob fichiers | **Élevée** |
| `src/utils/permissions/pathValidation.ts` | Validation chemins sensibles | Moyenne |
| `src/utils/permissions/shellRuleMatching.ts` | Matching règles shell vs commande | **Élevée** |
| `src/utils/permissions/dangerousPatterns.ts` | Patterns dangereux génériques | Moyenne |
| `src/utils/permissions/shadowedRuleDetection.ts` | Détection règles masquées | Moyenne |
| `src/utils/permissions/classifierShared.ts` | Partagés entre classifieurs | Facile |
| `src/utils/permissions/getNextPermissionMode.ts` | Transition modes permission | Moyenne |
| `src/tools/BashTool/bashPermissions.ts` | Règles permissions bash | Moyenne |
| `src/tools/BashTool/modeValidation.ts` + `readOnlyValidation.ts` | Validation mode | Moyenne |
| `src/tools/WebFetchTool/preapproved.ts` | Domaines préapprouvés | Facile |
| `src/utils/powershell/dangerousCmdlets.ts` | Cmdlets PS sensibles | Facile |
| Schemas et types | Cf. `drox-types` § 2.1 | — |

**Estimation** : ~22 fichiers cœur. **Difficulté principale** : la cartographie révèle que **`bashClassifier.ts` est un stub** dans ce fork — il faudra réimplémenter la logique attendue from scratch en Rust (voir § 5 surprises).

### 2.7 `drox-context` — compaction, token estimation, gestion du contexte long

**Rôle** : décide quand et comment compresser le contexte qui devient trop long, estime les tokens, gère les snip et microcompactions.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/services/compact/compact.ts` | Orchestration compaction principale | **Élevée** |
| `src/services/compact/microCompact.ts` | Micro-compaction / résumés intermédiaires | **Élevée** |
| `src/services/compact/snipCompact.ts` | Snip / réduction ciblée | Moyenne |
| `src/services/compact/sessionMemoryCompact.ts` | Compaction mémoire session longue | **Élevée** |
| `src/services/compact/autoCompact.ts` | Déclencheurs auto-compact | Moyenne |
| `src/services/compact/reactiveCompact.ts` | Compaction réactive | Moyenne |
| `src/services/compact/cachedMicrocompact.ts` + `cachedMCConfig.ts` | Cache | Facile-Triviale |
| `src/services/compact/snipProjection.ts` | Projection état snip | Moyenne |
| `src/services/compact/postCompactCleanup.ts` | Nettoyage caches post-compact | Moyenne |
| `src/services/compact/prompt.ts` | Prompts compaction | Moyenne |
| `src/services/compact/grouping.ts` | Regroupement messages | Moyenne |
| `src/services/compact/timeBasedMCConfig.ts` | Config temporelle | Facile |
| `src/services/tokenEstimation.ts` | Comptage tokens (couplé providers, à découpler) | **Élevée** |
| `src/utils/tokenBudget.ts` | Budgétisation tokens tour courant | Moyenne |
| `src/tools/MCPTool/classifyForCollapse.ts` | Classification résultats MCP pour compaction | Moyenne |
| `src/tools/FileReadTool/limits.ts` | Limites taille / troncature | Facile |
| `src/services/SessionMemory/sessionMemory.ts` + `sessionMemoryUtils.ts` + `prompts.ts` | Mémoire longue de session (SECONDAIRE) | **Élevée** |
| `src/services/contextCollapse/index.ts` + `persist.ts` + `operations.ts` | Collapse de contexte (SECONDAIRE) | **Élevée** |

**Estimation** : ~18 fichiers cœur + ~6 secondaires. **Point d'attention** : `tokenEstimation.ts` est couplé à Bedrock/Vertex alors que `llmClient.ts` ne fait que Ollama. À découpler proprement.

### 2.8 `drox-session` — storage JSONL, transcript, resume, mémoire fichier

**Rôle** : persistance des sessions sur disque (JSONL), reprise (`drox --resume`), gestion des fichiers `MEMORY.md` / `DROX.md` injectés dans le contexte.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/utils/sessionStorage.ts` | Stockage session JSONL (très gros) | **Élevée** |
| `src/utils/sessionEnvironment.ts` | Environnement process lié session | Moyenne |
| `src/utils/listSessionsImpl.ts` | Liste sessions sur disque | Moyenne |
| `src/utils/sessionRestore.ts` | Restauration session | Moyenne |
| `src/utils/sessionStart.ts` | Démarrage session | Moyenne |
| `src/utils/sessionState.ts` | État session runtime | Facile |
| `src/services/sessionTranscript/sessionTranscript.ts` | Écriture transcript (**actuellement stub no-op**) | Triviale (impl) ou **Élevée** (réécriture réelle) |
| `src/utils/filePersistence/filePersistence.ts` | Persistance fichiers outputs agent | Moyenne |
| `src/tools/AgentTool/agentMemory.ts` + `agentMemorySnapshot.ts` | Mémoire / état conversationnel agent | Moyenne |
| `src/memdir/memdir.ts` + `memoryScan.ts` + `findRelevantMemories.ts` + `paths.ts` + `memoryAge.ts` + `memoryTypes.ts` | Système MEMORY.md / DROX.md (injection contexte) | **Élevée** |

#### NOISE

- `src/memdir/memoryShapeTelemetry.ts`, `teamMemPaths.ts`, `teamMemPrompts.ts` (telemetry + team memory)
- `src/services/SessionMemory/*` (gros mais SECONDAIRE, Phase 1.10+)

**Estimation** : ~15 fichiers cœur. **Surprises** : `sessionTranscript.ts` est un stub vide (le contrat est COEUR mais l'impl actuelle est triviale). La logique de transcript JSONL semble incluse directement dans `sessionStorage.ts`.

### 2.9 `drox-engine` — boucle agent et orchestration

**Rôle** : c'est le cœur du moteur. Reçoit un prompt utilisateur, appelle le LLM, route les tool calls vers leurs implémentations, gère le streaming, les permissions au runtime, le multi-agent.

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/QueryEngine.ts` | Moteur principal | **Élevée** |
| `src/query.ts` | Boucle de query | **Élevée** |
| `src/tasks.ts` + `src/Task.ts` | Task system (DreamTask, LocalAgentTask, etc.) | Moyenne (filter NOISE pour DreamTask) |
| `src/tools.ts` | Registry des tools | Moyenne |
| `src/context.ts` | Gestion du contexte courant | Moyenne |
| `src/setup.ts` | Setup du moteur au démarrage | Moyenne |
| `src/bootstrap/state.ts` | State global du process (singleton Rust) | Facile |
| `src/services/tools/toolOrchestration.ts` | Partitionnement tool calls read-only vs exclusif + ordre | **Élevée** |
| `src/services/tools/StreamingToolExecutor.ts` | Exécution concurrente des tools au fil du streaming | **Élevée** |
| `src/services/tools/toolExecution.ts` | Cœur `runToolUse` / dispatch vers impls tools | **Élevée** |
| `src/utils/queryHelpers.ts` | Helpers requêtes agent (contexte, troncatures) | **Élevée** |
| `src/utils/queryContext.ts` | Assemblage contexte requête | Moyenne |
| `src/utils/systemPrompt.ts` | Construction prompt système effectif | **Élevée** (couplé analytics — à découpler) |
| `src/utils/messages.ts` | Construction / normalisation messages | **Élevée** |
| `src/utils/groupToolUses.ts` | Regroupement tool_use | Moyenne |
| `src/utils/messages/systemInit.ts` | Init messages système outils | Moyenne |
| `src/utils/toolSchemaCache.ts` | Cache schémas outils | Facile |
| `src/cli/structuredIO.ts` (757 lignes) | Couche control messages stdin/stdout, permissions hooks | **Élevée** (très important pour JSON-RPC) |
| `src/constants/system.ts` + `systemPromptSections.ts` + `prompts.ts` | Prompts système (texte) | Triviale (copie) + **Élevée** (assemblage) |
| `src/constants/cyberRiskInstruction.ts` | Bloc instruction sécurité | Triviale |
| `src/tools/AgentTool/runAgent.ts` + `forkSubagent.ts` + `resumeAgent.ts` + `loadAgentsDir.ts` + `builtInAgents.ts` | Orchestration multi-agent | **Élevée** |
| `src/tools/AgentTool/built-in/{generalPurpose,plan,explore,verification}Agent.ts` | Agents intégrés (prompts) | Moyenne |
| `src/tools/shared/spawnMultiAgent.ts` | Lancement multi-agent | **Élevée** |
| `src/tools/utils.ts` | Marquage messages avec sourceToolUseID | Facile |

**Estimation** : ~22 fichiers cœur, dont une bonne moitié en difficulté Élevée. C'est la crate la plus dense de toute la cartographie.

### 2.10 `drox-cli` — binaire principal et CLI/JSON-RPC

**Rôle** : entrée du binaire `drox`. Parse les args, configure le moteur, expose une CLI utilisable + un mode JSON-RPC sur stdio pour les clients (extension VS Code).

| Fichier TS source | Rôle | Difficulté |
|---|---|---|
| `src/entrypoints/cli.tsx` | Entry point CLI (à **simplifier énormément** pour le port) | Moyenne |
| `src/entrypoints/init.ts` | Init de projet | Moyenne |
| `src/cli/ndjsonSafeStringify.ts` | NDJSON safe stringify | Triviale |
| `src/cli/exit.ts` | Gestion exit codes | Facile |
| `src/utils/processUserInput/processUserInput.ts` | Routage entrée utilisateur | **Élevée** |
| `src/utils/processUserInput/processTextPrompt.ts` | Normalisation prompt texte | Moyenne |
| `src/utils/which.ts` | Résolution binaire `which` | Facile |
| `src/utils/process.ts` | Helpers process OS | Facile |
| `src/utils/execFileNoThrow.ts` + variantes | Wrappers `child_process` | Moyenne |
| `src/utils/tempfile.ts` | Fichiers temporaires | Triviale |
| `src/utils/crypto.ts` | Petits utilitaires crypto | Triviale |
| `src/utils/env.ts` + `envUtils.ts` + `envDynamic.ts` | Variables d'environnement | Moyenne |
| `src/utils/config.ts` (gros) | Config globale CLI | **Élevée** (à simplifier) |
| `src/utils/git/gitFilesystem.ts` + `gitConfigParser.ts` + `gitignore.ts` | Helpers git | **Élevée** |
| `src/utils/git.ts` | Helpers git haut niveau | **Élevée** |

**Estimation** : ~15 fichiers cœur. **Choix techniques** : `clap` pour le parsing CLI, `tokio` pour async, `serde_json` pour JSON-RPC sur stdio.

---

## 3. Vue par zone du repo (récap rapide)

| Zone | Total fichiers | COEUR | SECONDAIRE | NOISE | Commentaire |
|---|---:|---:|---:|---:|---|
| `src/tools/` | 198 | ~75 | ~86 | ~37 | Le cœur des tools, UI à exclure |
| `src/services/` | 154 | ~70 | ~30 | ~54 | MCP, API, compact, sessionTranscript, tools/* sont COEUR ; analytics/x402/autoDream/MagicDocs/extractMemories/skillSearch/teamMemorySync/remoteManagedSettings/plugins/lsp/voice = NOISE |
| `src/utils/` | 582 | ~80 | ~40 | ~460 | Cœur : permissions/, bash/, powershell/, git/, model/, messages/, processUserInput/, filePersistence/, queryHelpers, systemPrompt, sessionStorage, messages, attachments, mcp validation. NOISE : claudeInChrome, computerUse, swarm, plugins, dxt, nativeInstaller, secureStorage, sandbox, hooks, telemetry, voice, etc. |
| `src/constants/` | 23 | ~12 | ~6 | ~5 | Prompts, system, tools, limits = COEUR ; figures/spinnerVerbs/outputStyles = NOISE |
| `src/entrypoints/sdk/` | 9 | ~8 | 0 | 1 | Schemas SDK source-of-truth |
| `src/types/` | 41 | ~14 | ~12 | ~15 | llm/* + message + permissions + tools + ids = COEUR ; .d.ts shims + generated/* = NOISE |
| `src/components/` | 407 | 0 | 0 | 407 | Composants Ink TUI |
| `src/hooks/` | 105 | ~1-2 | ~3 | ~100 | Hooks React Ink |
| `src/commands/` | 199 | ~5 | ~15 | ~179 | Sous-commandes shell CLI |
| `src/bridge/` | 35 | 0 | 0 | 35 | Remote control Claude desktop |
| `src/cli/` | 25 | ~3 | ~5 | ~17 | Plumbing CLI shell |
| `src/ink/` | 97 | 0 | 0 | 97 | Fork d'Ink (renderer terminal) |
| `src/screens/` | 4 | 0 | 0 | 4 | Composants Ink |
| `src/migrations/` | 11 | 0 | 0 | 11 | Migrations settings Anthropic-specific |
| `src/shims/` | 6 | 0 | 0 | 6 | Shims Anthropic/Bun |
| `src/memdir/` | 9 | ~6 | 0 | 3 | Système MEMORY.md (cœur partiel) |
| `src/keybindings/` | 15 | 0 | 0 | 15 | Clavier TUI |
| `src/moreright/` | 1 | 0 | 0 | 1 | UI Ink |
| `src/bootstrap/` | 1 | 1 | 0 | 0 | `state.ts` (singleton) |
| `src/*.ts` (racine) | 22 | ~7 | ~3 | ~12 | `Tool.ts`, `QueryEngine.ts`, `query.ts`, `tasks.ts`, `tools.ts`, `Task.ts`, `context.ts`, `setup.ts` = COEUR |

---

## 4. Top 15 fichiers les plus difficiles à porter (difficulté **Élevée**)

Classés par importance critique pour le moteur :

1. **`src/Tool.ts`** (667 lignes) — interface fondamentale. Choix de design Rust (traits, async, génériques) à acter en premier.
2. **`src/constants/prompts.ts`** — graphe d'imports massif et composition du system prompt.
3. **`src/entrypoints/sdk/coreSchemas.ts`** — surface Zod énorme. Stratégie `serde` + `schemars` à décider.
4. **`src/cli/structuredIO.ts`** (757 lignes) — couche control messages stdin/stdout, base de notre futur JSON-RPC.
5. **`src/utils/queryHelpers.ts`** (420+ lignes) — boucle d'orchestration runtime.
6. **`src/utils/systemPrompt.ts`** — construction du prompt système final (couplé analytics, à découpler).
7. **`src/utils/messages.ts`** — construction et normalisation des messages.
8. **`src/utils/sessionStorage.ts`** — stockage session JSONL.
9. **`src/services/api/ollamaAnthropicShim.ts`** — shim Anthropic → Ollama NDJSON.
10. **`src/services/api/withRetry.ts`** — retry/backoff réseau (subtilités sur les conditions de retry).
11. **`src/services/tools/toolOrchestration.ts`** + **`StreamingToolExecutor.ts`** + **`toolExecution.ts`** — orchestration des tools en streaming.
12. **`src/services/mcp/client.ts`** + **`auth.ts`** + **`config.ts`** — stack MCP complète.
13. **`src/services/compact/compact.ts`** + **`microCompact.ts`** + **`sessionMemoryCompact.ts`** — compaction.
14. **`src/utils/bash/bashParser.ts`** + **`ast.ts`** + **`commands.ts`** + **`heredoc.ts`** — parser bash.
15. **`src/utils/permissions/permissions.ts`** + **`yoloClassifier.ts`** + **`permissionRuleParser.ts`** + **`filesystem.ts`** + **`shellRuleMatching.ts`** — modèle de permissions complet.

---

## 5. Surprises et décisions à acter

### 5.1 Stubs à réimplémenter from scratch (et non porter)

- **`src/utils/permissions/bashClassifier.ts`** — c'est un stub "ANT-ONLY" dans ce fork. Le classifier complet n'existe pas dans le code disponible. **Décision** : on devra **réimplémenter from scratch** en Rust à partir d'une spec, pas porter. Conséquence : sprint 1.8 (Bash) sera plus long que prévu.

- **`src/services/sessionTranscript/sessionTranscript.ts`** — fonctions vides (no-op). Le **contrat** est COEUR mais l'**impl** est triviale. La vraie logique de transcript JSONL semble incluse dans `src/utils/sessionStorage.ts`. **Décision** : porter le contrat tel quel + déléguer à la logique de `sessionStorage`.

### 5.2 Couplages legacy à découpler pendant le port

- **`src/utils/systemPrompt.ts`** tire `services/analytics/*` (`logEvent`). **Décision** : découpler — le système d'analytics ne sera pas porté en Rust, donc on coupe simplement les appels lors du port.

- **`src/services/tokenEstimation.ts`** est couplé à des types/chemins providers hérités (imports Bedrock / Vertex visibles) alors que `llmClient.ts` ne sert qu'Ollama. **Décision** : à clarifier en sprint 1.2 — soit on porte uniquement la partie Ollama, soit on conserve une abstraction multi-provider mais on n'implémente que Ollama.

- **`src/services/mcp/cloudMcp.ts`** mélange first-party + analytics + persistance config. **Décision** : ne pas porter du tout. Si on veut un MCP cloud à terme, ce sera une couche séparée et opt-in.

### 5.3 Choix d'architecture à acter en début de sprint

| Décision | Sprint concerné | Options |
|---|---|---|
| Stratégie pour `coreSchemas.ts` (Zod massif) | 1.1 / 1.2 | (a) Réécriture à la main `serde` + `schemars` ; (b) Codegen depuis schemas TS ; (c) Génération `schemars` au runtime |
| Design Rust pour `Tool` (l'interface) | 1.1 / 1.3 | (a) Trait `Tool` async ; (b) Enum exhaustif `ToolKind` ; (c) Combinaison trait + dispatch enum |
| Architecture multi-agent | 1.4 / 1.5 | (a) Process séparés (un binaire par agent) ; (b) Tâches tokio (cohabitation in-process) ; (c) Acteurs (actor framework type `actix` ou `tokio-rs/axum`) |
| Mode `propose` vs `apply` pour FileEdit/FileWrite | 1.5 | Confirmer le format `WorkspaceEdit`-like retourné, et le sérialiseur JSON-RPC associé |
| Stratégie de tests d'intégration | 1.4 | Snapshot tests (`insta`) + suite end-to-end via JSON-RPC mock LLM |

### 5.4 Stubs ou trous dans le leak

Plusieurs tools n'ont qu'un `prompt.ts` sans implémentation co-localisée dans l'arbre disponible. Cela peut indiquer un build conditionnel ou des sous-modules absents :

- `src/tools/DiscoverSkillsTool/` (seulement prompt)
- `src/tools/TerminalCaptureTool/` (seulement prompt)
- `src/tools/SendUserFileTool/` (seulement prompt)
- `src/tools/SleepTool/` (seulement prompt)
- `src/tools/VerifyPlanExecutionTool/` (seulement constants)

**Décision** : ces tools sont **hors scope Phase 1** (SECONDAIRE). À réimplémenter au cas par cas plus tard si pertinent.

### 5.5 Mutualisation PowerShell ↔ Bash

`PowerShellTool` a une stack complète (parser, classifier, security) symétrique à `BashTool`. **Décision** : en Rust, la crate `drox-bash` aura un module `bash` et un module `powershell`, partageant les abstractions communes (`ShellAnalyzer`, `CommandValidator`, etc.). Pas une nouvelle crate à part.

---

## 6. Ordre de portage recommandé (avec dépendances)

```
Sprint 1.1  Setup workspace + drox-types (squelette)
            │
            ├─→ Sprint 1.2  drox-llm (dépend de drox-types)
            │       │
            │       └─→ Sprint 1.3  drox-tools (tools simples : Read/Write/Grep/Glob)
            │                       (dépend de drox-types, drox-llm partiellement)
            │
            └─→ Sprint 1.4  drox-engine (squelette de la boucle agent)
                            (dépend de drox-types, drox-llm, drox-tools simples)
                            ╞══ LIVRABLE INTERMÉDIAIRE : prompt → tool calls → réponse en CLI

Sprint 1.5  drox-tools (tools moyens : FileEdit, WebFetch, AskUserQuestion, PlanMode)
            (dépend de drox-types, drox-tools simples)

Sprint 1.6  drox-mcp (dépend de drox-types)
            └─→ tools MCP (MCPTool, McpAuthTool, Read/ListMcpResource)

Sprint 1.7  drox-permissions (dépend de drox-types, drox-bash partiel)
            └─→ se branche au runtime tools dans drox-engine

Sprint 1.8  drox-bash (dépend de drox-types)
            ├─→ unblock BashTool complet dans drox-tools
            └─→ unblock bashClassifier dans drox-permissions

Sprint 1.9  drox-context (dépend de drox-types, drox-llm pour token estimation)
            └─→ se branche au runtime dans drox-engine

Sprint 1.10 drox-session (dépend de drox-types)
            └─→ se branche au runtime dans drox-engine
            ╞══ LIVRABLE Phase 1 : drox-cli fonctionnellement équivalent au TS

Sprint 1.11 JSON-RPC sur stdio (interface stable pour clients UI)
            (dépend de tout)
            ╞══ LIVRABLE FINAL Phase 1 : drox-cli + interface JSON-RPC documentée
```

**Premier livrable utilisable** : fin du sprint 1.4. À ce moment, `drox-cli` accepte un prompt en CLI, fait un round-trip LLM, exécute des tool calls simples (Read/Write/Grep/Glob), et renvoie une réponse. Ce livrable suffit déjà à valider la chaîne complète et donne une base de test pour les sprints suivants.

---

## 7. Annexe — fichiers NOISE en bulk (pour traçabilité)

Liste non exhaustive des familles et dossiers explicitement **NOT TO PORT** :

### Services Anthropic-specific (NOISE total)
- `services/analytics/` (growthbook, metadata, firstPartyEventLogger, config)
- `services/x402/` (paiements)
- `services/autoDream/`
- `services/MagicDocs/`
- `services/extractMemories/`
- `services/skillSearch/`
- `services/teamMemorySync/`
- `services/remoteManagedSettings/`
- `services/plugins/` (plugin marketplace)
- `services/lsp/` (LSP — VS Code apporte déjà du LSP)
- `services/tips/`
- `services/voice.ts`, `voiceStreamSTT.ts`, `voiceKeyterms.ts`
- `services/notifier.ts`, `diagnosticTracking.ts`, `internalLogging.ts`, `vcr.ts`, `preventSleep.ts`, `firstPartyBaseUrl.ts`
- `services/api/{dumpPrompts,referral,grove,bootstrap,adminRequests,ultrareviewQuota,overageCreditGrant,usage,sessionIngress,firstPartyAuxGuards,firstTokenDate,promptCacheBreakDetection,filesApi,emptyUsage}.ts`
- `services/mcp/{cloudMcp,xaa,xaaIdpLogin}.ts`, `MCPConnectionManager.tsx`

### Utils Anthropic-specific ou UI (NOISE)
- `utils/claudeInChrome/`, `utils/computerUse/`
- `utils/swarm/`, `utils/inProcessTeammateHelpers.ts`, `utils/teammate*.ts`, `utils/teamMemoryOps.ts`, `utils/teamDiscovery.ts`
- `utils/plugins/`, `utils/dxt/`, `utils/nativeInstaller/`
- `utils/secureStorage/`, `utils/authPortable.ts`, `utils/sessionStoragePortable.ts`
- `utils/sandbox/`, `utils/hooks/`, `utils/memory/`, `utils/todo/`, `utils/task/`
- `utils/telemetry/`, `utils/heapDumpService.ts`, `utils/sdkHeapDumpMonitor.ts`, `utils/headlessProfiler.ts`, `utils/backgroundHousekeeping.ts`, `utils/sessionDataUploader.ts`, `utils/externalProductMetrics.ts`, `utils/userAgent.ts`, `utils/fingerprint.ts`
- `utils/cron*.ts`, `utils/managedEnvConstants.ts`, `utils/worktreeModeEnabled.ts`, `utils/jetbrains.ts`, `utils/ide.ts`, `utils/idePathConversion.ts`, `utils/autoUpdater.ts`, `utils/localInstaller.ts`, `utils/preflightChecks.tsx`
- Tous les `.tsx` UI (Ink) : `highlightMatch.tsx`, `teleport.tsx`, `status.tsx`, `exportRenderer.tsx`, `staticRender.tsx`, etc.

### Dossiers entiers NOISE
- `src/components/` (407 fichiers Ink TUI)
- `src/hooks/` (105 fichiers React Ink, ~2-3 exceptions non critiques)
- `src/commands/` (199 fichiers sous-commandes CLI shell)
- `src/bridge/` (35 fichiers remote control)
- `src/ink/` (97 fichiers fork d'Ink)
- `src/screens/`, `src/migrations/`, `src/shims/`, `src/keybindings/`, `src/moreright/`

### Tools NOISE
- `MonitorTool/`, `WebBrowserTool/`, `testing/TestingPermissionTool.tsx`
- Tous les `UI.tsx`, `BashToolResultMessage.tsx`, `WorkflowPermissionRequest.tsx`, `TungstenLiveMonitor.tsx`
- `AgentTool/built-in/claudeCodeGuideAgent.ts`

### Types NOISE
- `types/generated/events_mono/**` (telemetry growthbook / claude_code_internal_event)
- `types/*.d.ts` shims (vscode-lsp, aws-sdk, bun, etc.)

---

## 8. Conclusion et prochaine étape

**Cartographie terminée**. Le scope du moteur Rust est clair :
- ~210-240 fichiers cœur à porter sur ~2000 (10-12 %)
- 10 crates Rust bien définis, avec dépendances claires
- ~15 fichiers en difficulté **Élevée** identifiés (les "ennemis principaux")
- Surprises documentées (stubs `bashClassifier` et `sessionTranscript`, couplage analytics dans `systemPrompt`, scope `cloudMcp`)
- Ordre de portage recommandé avec livrables intermédiaires

**Prochaine étape** : sprint 1.1 — setup du workspace cargo `drox/` avec les 10 crates, configuration de la CI (rustfmt + clippy), choix des dépendances clés (`tokio`, `reqwest`, `serde`, `schemars`, `clap`, `rmcp`, `tree-sitter-bash`, etc.) et premier "hello world" qui compile.
