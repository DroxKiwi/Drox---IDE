# 01 — Anatomie d'un run Cline

Source : `cline/cline @ 4cdfb19`. Fichiers cités :

- `sdk/packages/agents/src/agent-runtime.ts` (~2900 lignes) — la boucle
- `sdk/packages/agents/src/agent-runtime.test.ts` — la spec comportementale
- `sdk/packages/core/src/extensions/context/{compaction,basic-compaction,agentic-compaction,compaction-shared}.ts` — compaction
- `sdk/packages/core/src/extensions/tools/definitions.ts` — outil terminal `submit_and_exit`
- `sdk/packages/core/src/runtime/orchestration/runtime-builder.ts` — policy de complétion
- `apps/vscode/src/sdk/message-translator.ts` — pont SDK ↔ UI VS Code

## 1. Vue d'ensemble : 3 couches, 1 sens de dépendance

```
apps/vscode (host)   UI webview, permissions, intégration workbench
      │  AgentRunInput → AgentRunResult, événement par événement
@cline/core          stateful : sessions, storage, compaction, orchestrator, plugins, télémétrie
      │  outils résolus, prepareTurn (compaction), config finale
@cline/agents        STATELESS : la boucle modèle↔outils (agent-runtime.ts)
```

`@cline/agents` n'importe rien de la VS Code API. La boucle est un estimateur pur d'`AgentRunInput`
→ flux d'événements + `AgentRunResult`. C'est ce qui la rend testable sans IDE.

## 2. Le contrat de fin (le point clé)

**Règle unique** : un tour **sans tool call** termine le run — sauf si une *completion policy*
exige un outil terminal.

Dans `agent-runtime.ts`, après exécution des outils (ou absence d'outils) :

```text
if (toolCalls.length === 0) {
    const completionReminderMessages = this.getCompletionReminderMessages();
    if (completionReminderMessages.length > 0) {      // policy active → réinjecter, continuer
        for (const m of completionReminderMessages) await this.addUserReminderMessage(m);
        continue;
    }
    const result = this.finishRun("completed", finalAssistantMessage);  // sinon : FIN
    return result;
}
```

## 3. Anatomie d'un tour (ordre réel d'exécution)

1. `run(input)` → `execute()` : reset état (`runId`, `iteration=0`, usage, erreurs), hooks
   `beforeRun`, événement `run-started`, push des messages d'entrée, puis reminder de complétion
   éventuel.
2. Boucle `while (maxIterations === undefined || iteration < maxIterations)` :
   - `turn-started`, `iteration++`, slate d'erreurs vierge ;
   - `beforeModel` hooks → appel provider (streaming) via `generateAssistantMessage()` ;
   - wrappers de résilience (§4) ;
   - `afterModel` hooks ;
   - **registre d'événements** : chaque message est émis (`message-added`) avec snapshot complet —
     l'UI se reconstruit par flux d'événements, jamais en scrutant l'état interne ;
   - tri du tour :
     - `finishReason === "length"` sans tool call → récupération max-tokens (§4) ;
     - `finishReason === "error"` sans tool call → throw → `run-finished{status:"failed"}` ;
     - tool calls présents → exécution (§5) → branche « outil terminal » ;
     - pas de tool calls → branche « fin ou reminder » (§2).
3. Sortie de boucle sans clôture → `throw new Error("Agent runtime exceeded maxIterations")`.
4. Tout throw est capturé : `status = aborted | failed`, `AgentRunResult` construit avec le
   dernier message assistant préservé (`outputText`), hooks `afterRun`, `run-finished` émis.
   L'erreur n'est jamais perdue silencieusement.


## 4. Résilience : ce qui est budgété, ce qui est fatal

| Situation | Traitement | Budget |
|---|---|---|
| Erreur provider transitoire (429/5xx/réseau) | retry avec backoff exp. 1 s → cap 15 s, uniquement erreurs transitoires (`isRetryableProviderError`) | 3 retries (4 requêtes max) |
| `finishReason === "length"` sans tool call | ré-émission avec consigne concision (`MAX_TOKENS_RECOVERY_NUDGE`) | 3 tours consécutifs max ; reset dès un tour avec tool calls |
| Dépassement fenêtre de contexte | `overflowRecovery` : compaction **déterministe** (`basic-compaction`) puis **1** retry ; si ça re-pète → `ContextWindowOverflowError` avec message actionnable | 1 tentative |
| Erreur 4xx / auth / context-overflow définitif | pas de retry, throw | 0 |
| Tour vide répété | non traité spécialement : sans tool call → fin (§2) ou reminder de complétion | — |
| Content-filter | message terminal dédié, aucun retry (reproduire ne servirait à rien) | 0 |

Point clé pour le parallèle avec Drox : **la récupération de débordement ne dépend pas d'un appel
LLM réussi** (`basic-compaction` est déterministe). Un tour raté parce que le contexte est plein ne
peut pas empêcher sa propre récupération. Le seuil de déclenchement utilise le **compteur de tokens
rapporté par le provider** comme plancher sur l'estimation char-based, pas l'inverse.

## 5. Exécution des outils

- Parsing : entrée filtrée par `normalizeJsonLikeStringsForSchema` (coercion JSON-like avant
  validation contre `inputSchema`) — tolère les arguments « presque valides » des petits modèles.
- `beforeTool` hooks : peuvent modifier l'entrée, **sauter** l'outil (`skipReason`) ou retourner un
  résultat anticipé ; c'est là que vivent approbation/policy côté core.
- Exécution : `sequential` par défaut ; appels `parallel` contigus regroupés (`Promise.all`).
- Résultat d'erreur → message `tool-result` avec `isError: true` renvoyé au modèle (le run
  continue ; le modèle voit l'erreur).
- Outil terminal reconnu par `findCompletingToolMessage` (cf. §2).

## 6. Système de hooks (le mécanisme d'extension réel)

`beforeRun / afterRun / beforeModel / afterModel / beforeTool / afterTool / onEvent` — chaque hook
reçoit `snapshot` + contexte typé. La télémétrie core, les checkpoints, le guard d'équipe
(`completionGuard` bloquant `submit_and_exit` tant que des tâches d'équipe sont
`pending`/`in_progress`) passent tous par là. **Aucune de ces préoccupations n'est dans la boucle
principale.**

## 7. Ce que Cline ne fait PAS (volontairement)

- Pas de détection de boucle par empreinte. En échange, le contrat de fin est trivial à satisfaire.
- Pas de todo gate : la todo est un outil ordinaire (et un guard d'équipe optionnel, pas une
  condition générale de fermeture).
- Pas de réécriture/rejet du texte final du modèle.
- Pas de « phase » dans le protocole. Le contrat est entièrement côté outils.

## 8. Ce que ça coûte (à ne pas importer tel quel)

- Sans policy de complétion, un modèle qui ne veut pas finir boucle jusqu'à `maxIterations`
  (et il n'y en a pas par défaut) — la fin « tour sans outil » ne se déclenche pas si le modèle
  émet un outil bidon à chaque tour.
- Le contrat « outil terminal obligatoire » marche bien avec des modèles forts (Claude, GPT) ;
  les petits modèles locaux appellent `submit_and_exit` moins fiablement. Drox cible précisément
  ces modèles : copier ce contrat tel quel serait contre-productif.
- Le tout est adossé à un SDK dense (multi-tenant, cloud, télémétrie) — la complexité est ailleurs,
  pas dans la boucle.

**À retenir pour Drox** : ce qui fait la robustesse de Cline n'est pas sa richesse, c'est
l'**absence de négociation** — la fin du run n'est jamais *décidée en analysant le texte*.


La **completion policy** (`runtime-builder.ts`) n'existe que si un outil déclaré
`lifecycle.completesRun === true` est effectivement disponible :

```ts
const requiresCompletionTool = finalTools.some(t =>
    t.name === "submit_and_exit" && t.lifecycle?.completesRun === true);
const completionPolicy = requiresCompletionTool
    ? { requireCompletionTool: true, completionGuard: teamCompletionGuard? }
    : undefined;
```

Conséquences :

- **Pas de gate textuelle**. Le contenu du texte n'est jamais analysé pour décider de la fin.
  Pas de marqueur de phase, pas de détection de « réponse finale », pas de refus de contenu.
- La fin est un **événement déclaré** : soit « pas d'outils ce tour », soit « l'outil terminal a
  été appelé avec succès » (`findCompletingToolMessage`, ~L2410 : cherche un `tool-result`
  non-erreur pour un outil `completesRun`). Dans les deux cas, `finishRun("completed")` émet
  `run-finished` et c'est tout.
- `maxIterations` est **optionnel et sans défaut** (`packages/shared/src/agent.ts:601`,
  `agents/types.ts:941` — `z.number().positive().optional()`). La boucle elle-même n'a pas de
  compteur forcé ; sans policy de complétion, seul le modèle décide de s'arrêter (tour sans outil).

