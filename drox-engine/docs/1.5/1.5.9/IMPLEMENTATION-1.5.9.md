# Implémentation 1.5.9 — Agents Window + moteur Drox

**Complément du** [PLAN-1.5.9.md](PLAN-1.5.9.md)  
**Public** : développeurs, agents IA  
**Date** : juin 2026

---

## 1. Synthèse exécutive

| Question | Réponse |
|----------|---------|
| Le moteur est-il prêt ? | **Oui** — `IDroxEngineService` + `agent.run` + `agent/event` / `agent/done` sont déjà utilisés par Drox Chat. |
| Le blocage principal ? | **Adaptateur UI** : la fenêtre Agents parle `ISessionsProvider` + modèle `ISession`/`IChat`, pas le protocole webview Drox. |
| Difficulté MVP (1 session, 1 run, texte) | **Moyenne** — ★★★☆☆ — ~**1–2 semaines** (spike) |
| Difficulté release utile (tools, ask, sessions) | **Élevée** — ★★★★☆ — ~**6–10 semaines** cumulées |
| Parité complète Copilot / Changes / multi-chat | **Très élevée** — ★★★★★ — mois + dette merge upstream |
| Recommandation produit | **Option C** : convergence progressive ; webview conservé ; Agents = surface avancée. |
| Recommandation technique | **Extraire** `droxAgentRunBridge` du chat webview ; **ne pas** copier `CopilotChatSessionsProvider` (~2000 lignes). |

---

## 2. État des lieux

### 2.1 Ce qui fonctionne aujourd’hui (Drox Chat)

Chemin nominal déjà en production :

```text
Webview (contrib/drox)
  → droxChatSendRun.ts
      → IDroxEngineService.initialize({ executableTools, interactiveAsk })
      → IDroxEngineService.request('agent.run', buildAgentRunParams(...))
  → onNotification (IPC)
      → handleDroxEngineNotification / dispatchAgentEvent
      → messages webview { delta, tool, phase, userFacingReply, ... }
```

**Fichiers pivots**

| Rôle | Fichier |
|------|---------|
| Envoi run | `src/vs/workbench/contrib/drox/browser/chat/droxChatSendRun.ts` |
| Params RPC | `src/vs/workbench/contrib/drox/common/droxRunSettings.ts` (`buildAgentRunParams`) |
| Mapping événements | `src/vs/workbench/contrib/drox/browser/droxChatAgentEvents.ts` (`dispatchAgentEvent`) |
| Moteur IPC | `src/vs/workbench/contrib/drox/electron-browser/droxEngineService.ts` |
| Tools client | `src/vs/workbench/contrib/drox/electron-browser/droxClientToolsService.ts` |
| Questions bloquantes | `src/vs/workbench/contrib/drox/electron-browser/droxUserAskService.ts` |
| Persistance sessions | `.drox/sessions/` + `droxSessionService.ts` |

### 2.2 Ce qui est masqué (Agents VS Code)

Depuis 1.3.2 — [PLAN-DESACTIVATION-AGENTS](../../1.3/1.3.2/finalisation/PLAN-DESACTIVATION-AGENTS-VSCODE-1.3.2.md) :

| Levier | Valeur | Fichier |
|--------|--------|---------|
| `chat.agent.enabled` | `false` | `droxProductDefaultsConfiguration.ts` |
| `chat.disableAIFeatures` | `true` | idem |
| `github.copilot.enable` | `false` | idem |
| `product.sessionsWindowAllowedExtensions` | `[]` | `product.json` |

Sans provider Drox, réactiver `chat.agent.enabled` rouvrirait **Copilot** — à éviter.

### 2.3 Ce qu’attend la fenêtre Agents

Architecture upstream — [SESSIONS.md](../../../../src/vs/sessions/SESSIONS.md) :

```text
Agents Window (vs/sessions/)
  → SessionsProvidersService (registre)
  → ISessionsProvider (un par « compute environment »)
      → getSessions / createNewSession / sendRequest / ...
  → UI : liste sessions, fil chat, Changes, Files, Customizations
```

**Références de code**

| Provider | Lignes (ordre de grandeur) | Pertinence Drox |
|----------|----------------------------|-----------------|
| `CopilotChatSessionsProvider` | ~2000 | Agent host + Claude SDK — **ne pas copier** |
| `LocalChatSessionsProvider` | ~1200 | `IChatService` VS Code — **pas** le moteur Drox |
| **À créer** `DroxSessionsProvider` | cible ~400–800 MVP | Branche sur `IDroxEngineService` |

Le point d’entrée critique du provider :

```typescript
sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession>
```

C’est ici qu’il faut déclencher `agent.run` et alimenter le fil Agents avec les événements retour.

---

## 3. Analyse de difficulté par couche

### 3.1 Couche moteur (JSON-RPC) — **faible**

Déjà résolu. Réutiliser :

- `initialize` avec `executableTools` filtrés (`IDroxRunSettingsService`)
- `buildAgentRunParams` (LLM, mode permissions, MCP, sessionId)
- `request('agent.run')` → `runId`
- `request('agent.cancel', …)` pour stop
- Notifications `agent/event`, `agent/done`

**Risque** : faible — régression si on duplique la logique au lieu d’extraire un module partagé.

### 3.2 Couche adaptateur événements — **moyenne**

`dispatchAgentEvent` mappe ~15 `kind` moteur vers le wire webview. La fenêtre Agents attend un **autre format** (parts chat VS Code / observables session).

| Événement moteur | Webview Drox | Agents (cible) |
|------------------|--------------|----------------|
| `text_delta` | `{ kind: 'delta' }` | incrément message assistant |
| `tool_start` / `tool_finish` | `{ kind: 'tool', … }` | tool invocation parts |
| `phase_enter` | `{ kind: 'phase' }` | optionnel MVP ; thinking UI plus tard |
| `user_facing_reply` | carte dédiée | message structuré |
| `ask_user_question` | `IDroxUserAskService` | **même service** — modal IDE |

**Recommandation** : créer `droxAgentEventToSessionUpdate.ts` qui traduit les événements vers une API interne `IDroxSessionChatSink`, implémentée deux fois :

1. `DroxWebviewChatSink` (existant, refactor)
2. `DroxAgentsChatSink` (nouveau)

### 3.3 Couche tools client — **moyenne–élevée**

Les tools exécutables (`file_write`, `file_edit`, …) passent par `IDroxClientToolsService` et la boucle `onServerRequest` du moteur.

Le webview gère déjà les modales et diffs. La fenêtre Agents a son propre rendu tool + panneau **Changes**.

| Élément | Difficulté | MVP |
|---------|------------|-----|
| Exécution tool (même code) | Faible | Oui — réutiliser `droxClientToolsService` |
| Affichage tool dans le fil Agents | Moyenne | Oui — mapping minimal |
| Panneau Changes (changesets) | **Élevée** | **Non** — post-MVP |
| `IDroxRunRevertService` / undo run | Moyenne | Optionnel MVP |

### 3.4 Couche `ISessionsProvider` — **moyenne**

Méthodes **obligatoires MVP** :

| Méthode | Effort |
|---------|--------|
| `id`, `label`, `icon`, `sessionTypes` | Faible |
| `createNewSession`, `sendRequest` | Cœur |
| `getSessions`, `onDidChangeSessions` | Moyen — lier `.drox/sessions` |
| `getModels`, `setModel` | Moyen — déléguer à `IDroxLlmModelsService` |
| `resolveWorkspace`, `supportsLocalWorkspaces` | Faible |
| `createNewChat`, multi-chat | Reporter phase 2 |
| `archiveSession`, `deleteSession` | Faible |

Méthodes **reportables** après MVP : `renameChat`, checkpoints, git integration (Local provider en a ; pas requis jour 1).

### 3.5 Rebrand + réactivation — **faible–moyenne**

Conditionner les défauts produit :

```text
SI DroxSessionsProvider enregistré ET feature flag drox.agentsWindow.enabled
  ALORS chat.agent.enabled = true (application)
  ET titleBar Open in Agents = true
SINON
  garder masquage actuel
```

Ne pas toucher `github.copilot.enable`.

### 3.6 Dette merge upstream — **continue (élevée sur la durée)**

`vs/sessions/` est une zone active de VS Code 1.127+. Chaque intégration upstream peut casser :

- signatures `ISessionsProvider`
- rendu chat Agents
- customizations

**Mitigation** : provider Drox **isolé** dans `contrib/providers/drox/` ; tests unitaires sur `sendRequest` + mapping événements ; éviter les patches dans `copilotChatSessionsProvider.ts`.

---

## 4. Architecture cible recommandée

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Agents Window (vs/sessions)                  │
│  sessionsList │ chatPane │ changesPane │ customizations          │
└────────────────────────────┬────────────────────────────────────┘
                             │ ISessionsProvider
┌────────────────────────────▼────────────────────────────────────┐
│  DroxSessionsProvider (nouveau)                                    │
│  · DroxSession / DroxChat (état observable)                        │
│  · sendRequest → droxAgentRunBridge.run(...)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  droxAgentRunBridge (extrait — partagé webview + Agents)         │
│  · initializeEngine                                              │
│  · startRun(params) → runId                                      │
│  · subscribeEvents(runId, sink)                                  │
│  · cancelRun(runId)                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  IDroxEngineService (existant)                                   │
│  drox.exe — agent.run / agent/event / agent/done                 │
└─────────────────────────────────────────────────────────────────┘

Services partagés (inchangés) :
  IDroxRunSettingsService, IDroxClientToolsService, IDroxUserAskService,
  IDroxLlmModelsService, IDroxRunRevertService
```

### 4.1 Décision A0 (recommandée)

**Option C — Convergence progressive**

| Surface | Rôle 1.5.9 |
|---------|------------|
| **Drox Chat** (webview) | Canal principal ; zéro régression |
| **Drox Agents** (fenêtre) | Expérience « power user » ; parité fonctionnelle **progressive** |
| Communication | Doc utilisateur : « Agents = même moteur, UI avancée » |

Ne pas supprimer le webview avant parité UX prouvée (phases P3–P4).

---

## 5. Plan d’implémentation par phases

### Phase P0 — Spike (1–2 semaines)

**Objectif** : prouver `sendRequest` → `agent.run` → texte visible dans Agents.

| # | Tâche | Livrable |
|---|--------|----------|
| P0-1 | Créer `contrib/providers/drox/` squelette | `DroxSessionsProvider` enregistré |
| P0-2 | Feature flag `drox.agentsWindow.enabled` (défaut `false`) | pas d’impact release |
| P0-3 | Extraire `droxAgentRunBridge.ts` depuis `droxChatSendRun` | webview utilise le bridge (refactor sans régression) |
| P0-4 | `sendRequest` : 1 workspace local, 1 chat, stream `text_delta` | smoke manuel |
| P0-5 | Désenregistrer / bloquer Copilot provider si flag Drox actif | pas de login GitHub |

**Critère done** : prompt « Bonjour » → réponse streamée dans Agents, `drox.exe` dans le process monitor, sans Copilot.

**Hors P0** : Changes, phases, multi-chat, customizations.

### Phase P1 — Run utilisable (2–3 semaines)

| # | Tâche |
|---|--------|
| P1-1 | Tools : `tool_start` / `tool_finish` dans le fil Agents |
| P1-2 | `IDroxUserAskService` branché (questions bloquantes) |
| P1-3 | Stop / cancel run |
| P1-4 | `getModels` / `setModel` via réglages Drox existants |
| P1-5 | Liste sessions depuis `.drox/sessions` + `onDidChangeSessions` |
| P1-6 | Réactivation UI conditionnelle (A1 du plan) |

### Phase P2 — Rebrand & onboarding (1–2 semaines)

| # | Tâche |
|---|--------|
| P2-1 | Chaînes nls Drox (pas de « Copilot » nominal) |
| P2-2 | Welcome Agents : modèle local, workspace |
| P2-3 | `Open in Agents` titlebar |
| P2-4 | Doc utilisateur + [AGENTS.md](../../operations/AGENTS.md) |

### Phase P3 — Changes & parité (3–4 semaines, optionnel 1.5.9)

| # | Tâche |
|---|--------|
| P3-1 | Mapper mutations fichiers → `ISessionFileChange` / changesets |
| P3-2 | Panneau Changes alimenté |
| P3-3 | Intégration `IDroxRunRevertService` |

Peut être reporté en **1.5.10** si la release 1.5.9 doit rester courte.

### Phase P4 — Customizations (après 1.5.8 MCP)

| # | Tâche |
|---|--------|
| P4-1 | Lien panneau MCP → [1.5.8](../1.5.8/PLAN-1.5.8.md) |
| P4-2 | Skills / instructions Drox dans panneau latéral |

---

## 6. Fichiers à créer / modifier

### 6.1 Nouveaux (cible)

```text
src/vs/sessions/contrib/providers/drox/
  browser/
    droxSessionsProvider.ts          # ISessionsProvider
    droxSession.ts                     # état session + chats
    droxSessionsProvider.contribution.ts  # enregistrement
  test/browser/
    droxSessionsProvider.test.ts

src/vs/workbench/contrib/drox/common/
  droxAgentRunBridge.ts                # logique run partagée
  droxAgentEventSink.ts                # interface sink
  droxAgentsConfiguration.ts           # drox.agentsWindow.enabled

src/vs/workbench/contrib/drox/browser/agents/
  droxAgentsChatSink.ts                # mapping → UI Agents
```

### 6.2 Modifications existantes

| Fichier | Changement |
|---------|------------|
| `droxChatSendRun.ts` | déléguer à `droxAgentRunBridge` |
| `droxProductDefaultsConfiguration.ts` | réactivation **conditionnelle** `chat.agent.enabled` |
| `drox.contribution.ts` | enregistrer contribution Agents si electron |
| `product.json` | optionnel : métadonnées sessions Drox |
| Build Drox | exclure ou `when: false` sur `CopilotChatSessionsProvider` nominal |

### 6.3 À ne pas modifier (sauf merge upstream)

- `copilotChatSessionsProvider.ts` — fork minimal
- `vs/sessions/contrib/sessions/` core UI — préférer provider + sink

---

## 7. Mapping événements moteur → Agents (spec)

Référence moteur : [GUIDE-MOTEUR-DROX § événements](../../0.0/guides/GUIDE-MOTEUR-DROX.md).

| `event.kind` | Action sink Agents (MVP) | Post-MVP |
|--------------|--------------------------|----------|
| `text_delta` | append assistant text | — |
| `user_facing_reply` | replace / append bloc dédié | — |
| `tool_start` | afficher carte tool (nom + args résumé) | progress |
| `tool_finish` | résultat / erreur | lien fichier si mutation |
| `phase_enter` | ignoré ou badge discret | rail phases |
| `phase_close` | — | — |
| `role_enter` | ignoré MVP | orchestration |
| `agent/done` (notification) | fin busy, persist session | métriques |

Outils **masqués** au fil (comme webview) — réutiliser `SKIP_TOOL_UI`, `delegate_executor`, etc. depuis `droxChatAgentEvents.ts`.

---

## 8. Réactivation produit (checklist technique)

Ordre recommandé :

1. Implémenter `DroxSessionsProvider` + flag `drox.agentsWindow.enabled=false`
2. Tests spike avec flag **manuel** `true` en dev
3. Enregistrer provider dans `SessionsProvidersService`
4. Basculer défauts :
   - `chat.agent.enabled` → `true` **uniquement si** provider Drox actif (contribution dynamique ou override conditionnel)
   - `chat.disableAIFeatures` → laisser `true` pour Copilot MS, mais **ne pas** bloquer Agents Drox (auditer effet — peut nécessiter séparation des clés)
5. `chat.titleBar.openInAgentsWindow.enabled` → `true` quand feature livrée
6. Vérifier `sessionsWindowAllowedExtensions` reste restrictif

**Point d’attention** : `chat.disableAIFeatures` masque peut-être toute l’AI Microsoft — valider en F5 que la fenêtre Agents Drox reste accessible quand le flag Drox est on.

---

## 9. Tests & smoke

### 9.1 Automatisés (cible)

| Test | Fichier |
|------|---------|
| Provider : create + sendRequest mock engine | `droxSessionsProvider.test.ts` |
| Bridge : params identiques webview / Agents | `droxAgentRunBridge.test.ts` |
| Mapping événement → sink | reprendre patterns `droxChatAgentEvents` tests |

### 9.2 Manuels release

| # | Scénario | Attendu |
|---|----------|---------|
| M1 | Install frais, pas de compte GitHub | Pas d’écran login Copilot |
| M2 | Ouvrir Agents, workspace local | Provider Drox listé |
| M3 | Run simple Ollama | Réponse affichée |
| M4 | Tool `grep` ou `file_read` | Carte tool + résultat |
| M5 | `ask_user_question` | Modal répond → run continue |
| M6 | Stop run | Annulation propre |
| M7 | Drox Chat webview | Inchangé (non-régression) |
| M8 | Sans réseau | Run local OK |

---

## 10. Risques & anti-patterns

| Risque | Mitigation |
|--------|------------|
| Copier `CopilotChatSessionsProvider` | Bridge moteur + provider mince |
| Dupliquer `buildAgentRunParams` | Module partagé unique |
| Réactiver Copilot par erreur | Flag + tests A1 + pas de `chatExtensionId` promo |
| Merge upstream casse provider | Tests + dossier isolé `providers/drox/` |
| Deux vérités session (webview vs Agents) | Même `sessionId` / `.drox/sessions` |
| MVP trop large (Changes inclus) | P0–P1 stricts ; P3 optionnel |

**Anti-patterns à éviter**

1. Brancher Drox sur `IChatService` / Language Model API VS Code pour le run agent (double stack LLM).
2. Lancer `agent.run` depuis la webview **et** Agents sur le même `sessionId` sans verrou (race).
3. Réécrire la permission UI — réutiliser `IDroxUserAskService`.

---

## 11. Estimation effort (indicative)

| Phase | Durée (1 dev familiarisé) | Cumul |
|-------|---------------------------|-------|
| P0 Spike | 1–2 sem. | 2 sem. |
| P1 Run utilisable | 2–3 sem. | 5 sem. |
| P2 Rebrand | 1–2 sem. | 7 sem. |
| P3 Changes | 3–4 sem. | 11 sem. |
| P4 Customizations | 2 sem. | 13 sem. |

**Release 1.5.9 réaliste** : P0 + P1 + P2 (**~5–7 sem.**). P3 peut passer en 1.5.10.

Comparatif : [1.5.8 MCP](../1.5.8/PLAN-1.5.8.md) ~★★☆ — **2–4 sem.** — moins risqué, à livrer avant ou en parallèle début P0.

---

## 12. Ordre de travail recommandé (agent IA)

```text
1. Lire SESSIONS.md + ISessionsProvider + LocalChatSessionsProvider (structure)
2. Lire droxChatSendRun + dispatchAgentEvent (comportement moteur)
3. Extraire droxAgentRunBridge ; faire passer les tests webview existants
4. Implémenter DroxSessionsProvider.sendRequest (P0)
5. Feature flag + réactivation conditionnelle (A1)
6. P1 tools + ask + models
7. P2 rebrand
8. Doc operations + notes release OR
```

---

## 13. Liens

- [PLAN-1.5.9.md](PLAN-1.5.9.md) — checklist release
- [README 1.5.9](README.md)
- [13-agents-window-kdds-drox.md](../../feature-brainstorm/13-agents-window-kdds-drox.md)
- [PLAN désactivation 1.3.2](../../1.3/1.3.2/finalisation/PLAN-DESACTIVATION-AGENTS-VSCODE-1.3.2.md)
- [PLAN 1.5.8 MCP](../1.5.8/PLAN-1.5.8.md)
- [SESSIONS.md](../../../../src/vs/sessions/SESSIONS.md)
