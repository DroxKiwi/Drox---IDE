# Comparaison — Webview Drox vs chat natif (Copilot chassis)

**Version** : juin 2026 · **1.5.11 / P5**  
**Contexte** : [PLAN 1.5.11](PLAN-1.5.11.md) — pilier **M2** (portage sélectif webview → chat natif `ChatWidget`).

---

## En une phrase

Les **deux surfaces** parlent au **même moteur** (`drox.exe` via `droxAgentRunBridge` + `IDroxClientToolsService`). La webview Drox est une **UI sur mesure** pour le protocole agent Drox ; le chat natif réutilise le **châssis Copilot/VS Code** (`ChatWidget`, `ChatInputPart`, rendu upstream) avec un **sink Drox** (`droxAgentsChatSink`). Les plus-values du natif sont surtout **l’intégration IDE** (drag & drop, contexte éditeur, diff éditeur upstream) — pas un second moteur.

---

## Surfaces comparées

| Surface | Fichier / entrée | Rôle produit 1.5.11 |
|---------|------------------|---------------------|
| **Webview Drox** (onglet 1 panneau IDE) | `DroxChatViewPane` · `media/droxChat/*` | Canal **nominal** · zéro régression |
| **Chat natif IDE** (onglet 2, flag `drox.ideNativeChatTab.enabled`) | `DroxNativeChatViewPane` · `ChatWidget` | Spike **P5** · convergence progressive |
| **Fenêtre Agents** | `vs/sessions/` · `DroxSessionsProvider` | UI avancée multi-session · Customizations |

```text
                    ┌─────────────────────────────────────┐
                    │         drox.exe (JSON-RPC)         │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │     droxAgentRunBridge (partagé)      │
                    │  IDroxClientToolsService · UserAsk    │
                    └──────────┬─────────────┬──────────────┘
                               │             │
              ┌────────────────▼──┐    ┌─────▼────────────────────┐
              │ Webview router     │    │ droxAgentsSessionHandler │
              │ droxChatController │    │ + droxAgentsChatSink     │
              └────────────────┬───┘    └─────┬────────────────────┘
                               │              │
                    UI custom JS/CSS    ChatWidget (upstream VS Code)
```

---

## 1. Outils visuels (UX fil de discussion)

Légende : ✅ mature · 🟡 partiel / spike · ❌ absent · 🔵 upstream natif (hors branding Drox)

### 1.1 Fil de conversation & rendu agent

| Capacité | Webview Drox | Chat natif IDE (P5) | Fenêtre Agents |
|----------|:------------:|:-------------------:|:--------------:|
| Stream texte réponse | ✅ phases + strip WORK | 🟡 `markdownContent` via sink | 🟡 idem sink |
| Thinking / phases moteur | ✅ timeline TUI (`internal_reasoning`, `acting`, …) | 🟡 blocs `thinking` (sans strip WORK rétro) | 🟡 idem |
| Strip « run » / chronologie outils | ✅ `drox-run-strip`, stats WORK | ❌ | ❌ |
| `[phase: answering]` / `user_facing_reply` | ✅ logique dédiée webview | 🟡 portée sink (`extractDroxAgentsAnsweringOnlyText`) | 🟡 idem |
| Markdown riche (code, liens) | ✅ renderer custom | 🔵 renderer chat VS Code | 🔵 idem |
| Replay historique `.drox/sessions/` | ✅ `.ui-replay.jsonl` + transcript | 🟡 `droxAgentsUiReplayHistory` (basique) | 🟡 idem |
| Multi-onglets conversation (UI) | ✅ tabs webview | ❌ (1 session / ouverture) | 🔵 liste sessions upstream |
| Thème rétro KDDS | ✅ CSS/TUI complet | 🟡 `droxIdeNativeChat.css` (partiel) | 🟡 `droxAgentsRetroTheme.css` |
| Export transcript | ✅ (dev flag) | ❌ | ❌ |

### 1.2 Outils & mutations fichier (affichage)

| Capacité | Webview Drox | Chat natif IDE (P5) | Fenêtre Agents |
|----------|:------------:|:-------------------:|:--------------:|
| Carte **file change** + diff inline | ✅ `12-fileChange.js` (lignes +/- , hunks) | ❌ sink **ignore** `file_edit` / `file_write` / `notebook_edit` | ❌ idem |
| Undo / redo changement fichier (UI) | ✅ boutons carte → `droxRunRevertService` | ❌ (réversibilité disque via service, pas de carte) | ❌ |
| Ouvrir diff VS Code (`vscode.diff`) | ✅ depuis host outil (`DroxFileToolHost`) | 🔵 possible côté outil, **pas** exposé dans le fil | 🔵 idem |
| Cartes shell / terminal | ✅ `shellCard.js` | 🟡 `externalToolInvocationUpdate` kind `terminal` | 🟡 idem |
| Tray outils repliable | ✅ `13-collapsibleTray.js` | 🔵 rendu tool invocation upstream | 🔵 idem |
| Liste todos (`todo_write`) | ✅ chrome todos | 🟡 `todoList` toolSpecificData | 🟡 idem |
| Outils masqués (`delegate_executor`, …) | ✅ | ✅ même `SKIP_TOOL_UI` | ✅ |

### 1.3 Composer & paramètres

| Capacité | Webview Drox | Chat natif IDE (P5) | Fenêtre Agents |
|----------|:------------:|:-------------------:|:--------------:|
| Wizard connexion cloud (5 prestataires) | ✅ panneau general-settings | 🟡 même panneaux via `DroxAgentsComposerDroxChatHost` | 🟡 idem |
| Paramètres modèle (num_ctx, sampling, …) | ✅ role-models panel | 🟡 chip Model settings (scripts partagés) | 🟡 idem |
| Modes permission (Plan / Trust Edit / I'm Not Crazy) | ✅ composer webview | 🟡 `DroxAgentsPermissionModePicker` | 🟡 idem |
| Picker modèle | ✅ toolbar webview | 🔵 picker VS Code + `DroxAgentsLanguageModelProvider` | 🔵 idem |
| Barre stats tokens (↑↓ cycle ctx) | ✅ footer webview | 🟡 `DroxAgentsChatStatusBar` | 🟡 idem |
| Complétion chemin dans prompt | ✅ `path-complete.js` | ❌ | ❌ |
| Slash commands (`/new`, …) | ✅ | ❌ | 🔵 partiel upstream |

### 1.4 Entrées utilisateur & contexte

| Capacité | Webview Drox | Chat natif IDE (P5) | Fenêtre Agents |
|----------|:------------:|:-------------------:|:--------------:|
| Images en pièce jointe (drag & drop) | ✅ zone attachments + data URL | ❌ contribution `supportsImageAttachments: false` | ❌ idem |
| Fichiers / dossiers en contexte | ✅ references `@` + pick host | 🟡 `enableWorkingSet: 'explicit'` · drag natif **si** capacités étendues | 🔵 working set upstream |
| Collage extrait de code / terminal | ✅ paste chips (`pasteAttachments`) | 🔵 `PasteAttachmentWidget` + DnD éditeur (`ChatDragAndDrop`) | 🔵 idem |
| Contexte implicite (fichier actif) | 🟡 via references manuelles | 🔵 `enableImplicitContext: true` | 🔵 idem |
| `@` workspace / symboles | 🟡 references Drox | 🔵 variable picker chat VS Code | 🔵 idem |
| Question utilisateur (`ask_user_question`) | ✅ modal webview `06-userAsk.js` | 🟡 question carousel chat upstream | 🟡 idem |
| Annulation run | ✅ | 🟡 | 🟡 |

### 1.5 Layout IDE & panneaux (hors fil)

| Capacité | Webview Drox | Chat natif IDE (P5) | Fenêtre Agents |
|----------|:------------:|:-------------------:|:--------------:|
| Panneau **Changes** (fichiers modifiés session) | ❌ | ❌ | 🔵 **P3** (post-MVP) · upstream |
| Panneau **Files** | ❌ | ❌ | 🔵 P3 |
| Customizations (Skills, Instructions, MCP) | ❌ (settings Drox séparés) | ❌ | ✅ harness `drox` |
| Open in Agents depuis IDE | ✅ | ✅ | — |

---

## 2. Outils branchés au moteur (exécution)

**Couche commune** — identique webview, natif IDE et fenêtre Agents :

| Outil client (`tool/exec`) | Handler IDE | Visible webview | Visible sink natif |
|----------------------------|-------------|:---------------:|:------------------:|
| `bash` | `droxBashTool` | ✅ shell card | 🟡 terminal invocation |
| `file_write` | `droxFileWriteTool` | ✅ carte diff | ❌ (mutation filtrée) |
| `file_edit` | `droxFileEditTool` | ✅ carte diff + undo | ❌ |
| `notebook_edit` | `droxNotebookEditTool` | ✅ carte diff | ❌ |
| `lsp` | `droxLspTool` | ✅ tray / log | 🟡 texte tool result |
| `session_compact` | session services | ✅ | 🟡 |
| `session_end` | session services | ✅ | 🟡 |
| `session_search` | long memory | ✅ | 🟡 |

**Services moteur partagés** (non exhaustif) :

| Service | Webview | Natif / Agents |
|---------|:-------:|:--------------:|
| `IDroxEngineService` (`agent.run`, events) | ✅ | ✅ |
| `IDroxRunSettingsService` (permission mode, general settings) | ✅ | ✅ |
| `IDroxUserAskService` | ✅ webview answers | ✅ carousel Agents API |
| `IDroxRunRevertService` (undo fichier) | ✅ UI webview | ✅ exécution · ❌ UI natif |
| Persistance `.drox/sessions/` | ✅ | ✅ même `sessionId` |

**Point clé** : le natif **exécute** les mêmes mutations disque ; il ne les **montre** pas encore comme la webview (gap P5-d / P5-e).

---

## 3. Plus-values du chat natif (Copilot chassis)

### 3.1 Intérêt **immédiat** (déjà ou partiellement disponible)

| Plus-value | Détail | Webview équivalent |
|------------|--------|-------------------|
| **Drag & drop depuis l’explorateur / éditeur** | `ChatDragAndDrop` sur `ChatInputPart` — fichiers, sélections | DnD images + `@` references (modèle différent) |
| **Collage structuré depuis l’éditeur** | `PasteAttachmentWidget` (plage de lignes, langage) | paste chips custom |
| **Contexte implicite fichier actif** | `enableImplicitContext` | manuel |
| **Intégration keybindings / accessibilité chat VS Code** | focus, navigation liste, ARIA upstream | custom webview |
| **Tool invocations upstream** | cartes terminal, todos natifs | équivalent custom |
| **Question carousel** | pattern standard VS Code pour `ask_user` | modal custom |
| **Picker modèle unifié workbench** | même UX que fenêtre Agents | toolbar Drox |

### 3.2 Intérêt **moyen terme** (upstream Copilot/VS Code — effort d’activation)

| Plus-value | Condition pour Drox | Effort |
|------------|---------------------|--------|
| **Diff fichier dans l’éditeur** (`IChatEditingService`, overlay Accept/Reject) | Brancher mutations Drox sur session editing · ou mapper `file_edit` → editing session | **Élevé** — modèle Copilot ≠ cartes Drox |
| **Panneau Changes / Files** (fenêtre Agents) | **P3** — alimenter depuis `.drox/` ou editing session | **Moyen** — post-MVP |
| **Checkpoints / restore conversation** | `supportsCheckpoints: true` + persistance Drox | **Moyen** |
| **Attachments images / PDF upstream** | `supportsImageAttachments` + pipeline vers moteur | **Moyen** — moteur multimodal |
| **Working set riche** (multi-fichiers épinglés) | Déjà `enableWorkingSet: 'explicit'` · relier au prompt moteur | **Faible–moyen** |

### 3.3 Ce que le natif **n’apporte pas** seul

- **Strip WORK / phases TUI rétro** — spécifique webview Drox.
- **Cartes diff inline + undo** maison — à porter ou remplacer par editing upstream (UX différente).
- **Wizard / panels settings** — déjà **réutilisés** via `DroxAgentsComposerDroxChatHost` (pas un gain « natif », un gain « partage de code »).
- **Copilot cloud / LM API** — **hors scope** Drox (décision A1).

---

## 4. Stratégie de convergence (recommandation — **figée A0-quater**)

**Direction retenue** : **natif d’abord** (visuel Copilot/VS Code) + **outils Drox** portés depuis la webview · webview IDE = référence gelée jusqu’à parité ≥ 80 %.

### Stack unique IDE Native + fenêtre Agents

```text
                    droxAgentsSessionHandler
                    droxAgentsChatSink
                    droxAgentsComposerDroxChatHost
                    droxAgentsChatInputIntegration
                              │
              ┌───────────────┴───────────────┐
              │                               │
    DroxNativeChatViewPane          vs/sessions/chatView.ts
    (onglet 2 panneau IDE)          (fenêtre Agents)
```

| Module partagé | IDE Native | Agents Window |
|----------------|:----------:|:-------------:|
| `droxAgentsSessionHandler` | ✅ | ✅ |
| `droxAgentsChatSink` | ✅ | ✅ |
| Composer (Server / Model / modes) | ✅ | ✅ |
| `droxAgentRunBridge` + tools client | ✅ | ✅ |
| Layout sessions / Customizations | — | ✅ (hors fil chat) |
| CSS scope | `.drox-ide-native-chat` | `.agent-sessions-workbench` → **P5-g** factoriser |

**Règle P5-f** : avant de merger une PR P5, smoke **IDE Native** **et** fil principal **fenêtre Agents** (même prompt, même modèle, même tool visible).

**Règle CFG** : avant de merger une PR touchant connexion/modèle, smoke **CFG-6** (changement IDE → visible Agents, et inverse).

### Option A — **Hybride long terme** (aligné A0-ter + A0-quater)

| Garder webview | Porter / activer sur natif |
|---------------|----------------------------|
| TUI phases, strip WORK, branding fort | Drag & drop · implicit context · paste éditeur |
| Cartes file-change + undo (tant que P3 absent) | Question carousel · tool terminal upstream |
| Multi-tabs webview IDE | Panneau Changes (via Agents ou IDE) en P3 |
| | Stats + composer (déjà partagés) |

### Option B — **Natif dominant** (1.5.12+ — **cible A0-quater**)

Prérequis avant bascule canal nominal :

1. **P5-d** — run complet visible (stream, tools non-mutation, ask, cancel).
2. **Diff / fichiers** — soit port cartes webview dans sink, soit **Chat Editing** Drox + panneau Changes.
3. **Attachments** — images / fichiers alignés moteur.
4. **Replay** — parité `.ui-replay.jsonl` dans fil natif.
5. **Non-régression** smoke webview jusqu’à retrait explicite.

### Matrice décision rapide

| Besoin utilisateur | Surface recommandée aujourd’hui |
|--------------------|---------------------------------|
| Run agent + diff fichier lisible + undo | **Webview** |
| Tester intégration IDE (DnD, contexte éditeur) | **Native** (P5) |
| Multi-workspace + Customizations + layout pro | **Fenêtre Agents** |
| Paramètres serveur / modèle / Trust Edit | **Les trois** (composer partagé — **CFG** : scopes à unifier) |

---

## 5. Checklist P5-e (écart documenté → action)

À cocher au fil des itérations ([PLAN § P5-e](PLAN-1.5.11.md#phasage-p5--fil-ide-natif-post-ship-1511-nominal)) :

| # | Feature webview | Natif IDE | Agents | Action cible |
|---|-----------------|:---------:|:------:|--------------|
| E1 | Carte file change + diff | ❌ | ❌ | Sink **ou** Chat Editing — **les deux surfaces** |
| E2 | Undo/redo fichier UI | ❌ | ❌ | `droxRunRevertService` + fil natif |
| E3 | Images attachments | ❌ | ❌ | Capacités contribution session `drox` |
| E4 | Multi-tabs session | ❌ | 🔵 | Webview IDE · liste sessions Agents |
| E5 | Strip WORK / phases TUI | ❌ | ❌ | Écart accepté **ou** widget contrib |
| E6 | Drag & drop / paste éditeur | 🔵 | 🔵 | Plus-value natif — tester IDE **+** Agents |
| E7 | Implicit context | 🔵 | 🔵 | Actif P5 — les deux |
| E8 | Replay `.ui-replay` | 🟡 | 🟡 | `droxAgentsUiReplayHistory` |
| E9 | Export transcript | ❌ | ❌ | Basse priorité |
| E10 | Composer settings | 🟡 | 🟡 | **Fait** UI · **CFG** : unifier scopes IDE/Agents |
| E11 | **Parité IDE ↔ Agents** (P5-f) | — | — | Smoke croisé obligatoire par PR P5 |
| E12 | **Config serveur/modèles** (CFG) | 🟡 | 🟡 | Même source de vérité USER · smoke CFG-6 |

---

## 6. Fichiers de référence

| Domaine | Webview | Natif / Agents |
|---------|---------|----------------|
| UI fil | `browser/media/droxChat/**` | `agents/droxAgentsChatSink.ts` |
| Run | `chat/droxChatSendRun.ts` | `agents/droxAgentsSessionHandler.ts` |
| Bridge moteur | `common/droxAgentRunBridge.ts` | idem |
| Tools disque | `electron-browser/droxClientToolsService.ts` | idem |
| Diff / undo UI | `media/droxChat/tools/12-fileChange.js` | — |
| Diff éditeur | `tools/droxFileToolHost.ts` (`vscode.diff`) | upstream editing P3 |
| Panneau IDE natif | — | `chat/droxNativeChatViewPane.ts` |
| Composer params | webview + `droxAgentsComposerDroxChatHost` | `droxAgentsComposerToolbar.ts` |

---

## Liens

- [PLAN-1.5.11.md](PLAN-1.5.11.md) · [IMPLEMENTATION-1.5.11.md](IMPLEMENTATION-1.5.11.md)
- [13-agents-window-kdds-drox.md](../../feature-brainstorm/13-agents-window-kdds-drox.md)
- [SESSIONS.md](../../../../src/vs/sessions/SESSIONS.md)
