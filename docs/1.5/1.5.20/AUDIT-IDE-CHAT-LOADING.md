# Audit — chat IDE bloqué sur « Loading session… » (1.5.20)

**Statut** : audit · **Date** : 2026-08-11  
**Branche** : `1.5.20`  
**Symptôme confirmé (utilisateur)** : panneau Drox IDE → écran animé de chargement →  
`Timed out loading the chat session. Try New Chat or reopen the panel.`  
→ **impossible d’obtenir un chat utilisable** (pas seulement « pas de réponse modèle »).

Objectif produit rappelé : **même stack de discussion Agents ↔ IDE** (session / modèle / settings partagés). Ici on traite d’abord le **blocage d’ouverture** côté IDE.

---

## 1. Verdict court

| Question | Réponse |
|----------|---------|
| L’overlay animé est-il la **cause racine** du timeout ? | **Non** — il enveloppe seulement la promesse ; `pointer-events: none` (ne bloque pas les clics). |
| L’overlay contribue-t-il au ressenti / au piège UX ? | **Oui** — occupe tout le panneau ~15 s (voire ~30 s avec fallback), cache un widget sans modèle. |
| Pourquoi le message d’erreur exact ? | `acquireOrLoadSession` renvoie `undefined` après `DROX_SESSION_LOAD_TIMEOUT_MS` (15 s) ; le fallback « blank » peut retenter une 2ᵉ fois puis affiche le warn. |
| Première action proposée | **Supprimer l’overlay de chargement IDE** (comme demandé) **et** ouvrir un modèle vide rapidement si le load échoue / timeout — sans attendre un second cycle 15 s opaque. |

---

## 2. Chaîne de chargement IDE (aujourd’hui)

Fichier pivot : [`droxNativeChatViewPane.ts`](../../../../src/vs/workbench/contrib/drox/browser/chat/droxNativeChatViewPane.ts).

```text
renderBody
  ├─ ChatWidget.render (sans modèle encore)
  ├─ new DroxSessionLoadingOverlay(chatRoot)   ← grille 3×3 + « Loading session… »
  └─ _openStartupSession()
        ├─ wait workspace (max 5 s)
        ├─ handoff Agents→IDE ? → _openDroxSession(id)
        ├─ sinon resolve session.list (max 5 s) / ids persistés
        └─ _openDroxSession(sessionId)
              ├─ chatService.acquireOrLoadSession(...)   // soft cancel via CTS
              ├─ raceTimeout(..., 15_000)                // DROX_SESSION_LOAD_TIMEOUT_MS
              ├─ overlay.showWhile(timed)                // UI seulement
              ├─ si !ref && allowBlankFallback
              │     └─ _openDroxSession(newSessionId)    // 2ᵉ tentative, encore 15 s
              └─ sinon notification « Timed out loading… »
```

Constants : [`droxLoadingConstants.ts`](../../../../src/vs/workbench/contrib/drox/browser/droxLoadingConstants.ts)

| Constante | Valeur | Rôle |
|-----------|--------|------|
| `DROX_LOADING_SHOW_DELAY_MS` | 450 ms | Anti-flash avant d’afficher l’overlay |
| `DROX_SESSION_LOAD_TIMEOUT_MS` | **15 000** | Timeout `acquireOrLoadSession` IDE |
| `DROX_NATIVE_WORKSPACE_READY_TIMEOUT_MS` | 5 000 | Attente dossier |
| `DROX_NATIVE_SESSION_LIST_TIMEOUT_MS` | 5 000 | `session.list` au cold start |
| `DROX_SESSION_HISTORY_LOAD_TIMEOUT_MS` | 6 000 | Historique côté provider Agents |

Overlay : [`droxSessionLoadingOverlay.ts`](../../../../src/vs/workbench/contrib/drox/browser/droxSessionLoadingOverlay.ts) + CSS [`droxLoadingKit.css`](../../../../src/vs/workbench/contrib/drox/browser/media/droxLoadingKit.css)  
(`pointer-events: none` — **ne capture pas** la souris).

Message d’erreur : localize `drox.nativeChat.loadTimeout` dans `_openDroxSession` quand `ref` est falsy après échec / timeout (et fallback blank déjà tenté ou désactivé).

---

## 3. Ce que fait vraiment `acquireOrLoadSession`

Dans [`chatServiceImpl.ts`](../../../../src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts) (`loadRemoteSession`) :

1. Cache modèle existant ?
2. `canResolveChatSession(drox-chat)` — activation async du provider + éventuellement `waitForContentProvider` (**5 s**).
3. `getOrCreateChatSession` → `DroxAgentsSessionHandler.provideChatSessionContent`.
4. Construction `ChatModel` avec `canUseTools: **false**` (sessions contribuées — normal VS Code ; le run Drox passe par l’agent dynamique, pas les UI tools Copilot).

Provider : [`droxAgentsSessionHandler.ts`](../../../../src/vs/workbench/contrib/drox/browser/agents/droxAgentsSessionHandler.ts)

- Historique : `raceTimeout(..., 6 s)` → en théorie **session vide** si lent, pas un hang infini.
- Donc un hang **15 s** côté IDE suggère surtout :
  - `canResolveChatSession` lent / qui échoue puis retries ;
  - promesse `acquireOrLoadSession` qui ne se résout pas (ex. race cancel mal propagée, double await) ;
  - **enchaînement** workspace + list + load + **fallback blank** (jusqu’à ~30 s d’overlay ressenti) ;
  - ou le load « réussit » trop tard après cancel → UI déjà en erreur.

À vérifier en repro via logs DevTools / `ILogService` :

- `[Drox IDE native chat] acquire …`
- `[Drox IDE native chat] session load timed out after 15000ms …`
- `[Drox Agents] history ready …` / `session history load timed out`
- `[ChatSessionsService] Timed out waiting for content provider "…"`

---

## 4. Overlay : responsabilité réelle

### Ce qu’il **ne** fait pas

- Ne prolonge **pas** le timeout (15 s sont dans `raceTimeout`, pas dans le gate).
- N’empêche **pas** les clics (`pointer-events: none`).
- N’appelle **pas** le moteur.

### Ce qu’il **fait** de problématique

1. **Masque** le `ChatWidget` pendant tout le load → l’utilisateur croit que « le chargement » est le produit.
2. Après 450 ms, grille animée + skeleton = signal fort de « attends » alors que le vrai bug est **pas de modèle attaché**.
3. Si le load échoue, l’overlay disparaît **en même temps** que l’erreur — pas de chat utilisable dessous (composer sans `setModel`).
4. Le **fallback blank** relance un 2ᵉ load sous le même overlay → double peine.

Conclusion alignée avec ta proposition : **retirer l’overlay IDE** est une bonne **première étape** (clarifier l’état réel du panneau) — **insuffisante seule** pour restaurer le dialogue modèle.

---

## 5. Écart Agents vs IDE (même stack ?)

| Aspect | Agents | IDE Native Chat |
|--------|--------|-----------------|
| Provider contenu | `DroxAgentsSessionHandler` | **Le même** via `acquireOrLoadSession` |
| Run agent | `_invokeAgent` / `drox.exe` | Même agent dynamique |
| Settings modèle | `IDroxRunSettingsService` (partagé) | Même service (picker IDE) |
| UI chargement session | Pas le même overlay full-pane | Overlay session + timeout 15 s + fallback |
| Ouverture | Sessions UI / provider workspace | Cold start + layout `.last` + handoff |

Le **contrat** « même discussion » est déjà l’intention (handoff `sessionId`, settings partagés). Le **chemin d’ouverture IDE** est plus fragile (timeouts empilés + overlay + fallback).

---

## 6. Proposition de solution (par phases)

### Phase 0 — Retirer l’écran animé IDE *(demande utilisateur, rapide)*

- Ne plus instancier `DroxSessionLoadingOverlay` dans `DroxNativeChatViewPane.renderBody` (ou `showWhile` = identité).
- Conserver le kit overlay pour d’autres surfaces si utile ; **pas** sur le leaf IDE.
- Effet attendu : on **voit** le widget (vide / cassé) pendant le load ; logs plus faciles à corréler au ressenti.

### Phase 1 — Composer-first / fail soft *(cœur du fix)*

Principe : **ne jamais laisser le panneau sans modèle plus de quelques centaines de ms**.

Options (trancher à l’implémentation) :

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Empty-first** | `setModel` session vide immédiatement, hydrate l’historique en arrière-plan | Chat tout de suite | Historique peut arriver après |
| **B. Soft-fail court** | Timeout load ↓ (ex. 3–5 s) ; si échec → `newSessionId` **sans** 2ᵉ timeout long ; pas d’overlay | Simple | Peut perdre reprise MRU si load lent |
| **C. Hybride** | Empty-first + swap model quand history prête (si même `sessionId`) | Meilleur des deux | Un peu plus de code |

Recommandation : **C** (ou **A** si swap trop risqué) + timeout IDE ramené à **~5 s** aligné historique Agents.

Critères done Phase 1 :

- Plus de message timeout après 15–30 s d’overlay.
- Composer utilisable rapidement ; envoi « Salut » démarre un run (ou erreur LLM claire).
- Agents non régressé.

### Phase 2 — Diagnostic root cause du hang 15 s

Une fois l’UI débloquée :

1. Repro + coller les lignes log `acquire` / `timed out` / `history ready` / content provider.
2. Si provider absent : registration `droxAgentsChatContribution` (flag native stack).
3. Si history / RPC moteur : `session.list` / `readUiReplayTail` / spawn `drox.exe`.
4. Vérifier que `cts.cancel()` après timeout **libère** vraiment `getOrCreateChatSession` (évite files d’attente Agent→IDE).

### Phase 3 — Parité Agents ↔ IDE (après chat ouvert)

- Confirmer sync modèle (deux fenêtres) — déjà cible produit.
- Handoff session + même `sessionId` moteur.
- Hors scope immédiat si Phase 1 suffit pour « parler au modèle ».

---

## 9. Diagnostic code (2026-09-25) — capture Agents → IDE

**Contexte** : Agents OK via `code.bat` ; « Open in Editor » → panneau Drox IDE vide + composer style Copilot + toast  
`Timed out loading the chat session…` + section CHANGES (`MEMORY.md`).

### Verdict

| Question | Réponse |
|----------|---------|
| L’overlay est-il encore la cause ? | **Non** (déjà retiré). Le toast vient du soft-fail quand **les deux** loads échouent. |
| Le look « Copilot » est-il un bug ? | **Non** — IDE = `ChatWidget` workbench (choix 1.5.11). Agents = autre chrome `vs/sessions`. |
| Le chat Drox se charge-t-il ? | **Non** — `setModel` n’arrive pas ; composer flottant = widget sans modèle. |
| Pourquoi CHANGES en dessous ? | Vue `workbench.view.drox.changes` (1.5.20) dans le même container — visible même si le chat échoue. |

### Chaîne qui casse

```text
Open in Editor
  → drox.prepareIdeSessionHandoff (APPLICATION_SHARED)
  → openWindow(folder)  // IDE = workbench.desktop, pas sessions.desktop
  → DroxNativeChatViewPane._doOpenStartupSession
       → consumeHandoff → _openDroxSession(ses_*)
            → chatService.acquireOrLoadSession  // remote type "drox"
                 → canResolveChatSession("drox")
                      → asyncActivator.waitForActivation = setting only (immédiat)
                      → waitForContentProvider ≤ 5 s   ← suspect #1
                 → getOrCreateChatSession
                      → provideChatSessionContent (history raceTimeout 6 s)
            → raceTimeout IDE 5 s + cts.cancel()
       → soft-fail blank newSessionId (2ᵉ tentative, même chemin)
       → si 2ᵉ échec → toast timeout
```

### Causes racines probables (ordre)

1. **`canResolveChatSession` / content provider** — l’async activator Drox retourne `true` dès que le setting est on, **sans attendre** que `DroxAgentsChatContribution` ait enregistré le provider. Si la registration arrive trop tard → wait 5 s → `false` → `acquireOrLoadSession` → `undefined`. Même échec pour la session blank.
2. **Cancel / file d’attente** — timeout IDE annule via `CancellationToken` ; si `whenInstalledExtensionsRegistered` / wait provider ignore le cancel, le soft-fail enchaîne un 2ᵉ wait plein (ressenti ~10 s + toast).
3. **Moins probable** — hang `readUiReplay` (fichier, catch → `[]`) ou spawn moteur : l’historique Agents est déjà soft-timeouté à 6 s et ne devrait pas bloquer une session **vide**.

### Correctifs prioritaires (après ce diagnostic)

| Prio | Action |
|------|--------|
| **P0** | **Empty-first** : attacher un `ChatModel` vide immédiatement ; hydrater handoff en arrière-plan (plus de panneau sans modèle). |
| **P1** | Faire attendre l’async activator la **vraie** registration du content provider `drox` (pas seulement le setting). |
| **P2** | Logs horodatés : `canResolve` / `waitForProvider` / `provideContent` / `setModel` pour valider en repro. |
| **P3** | Ne pas toast « Timed out » si un modèle vide a pu être attaché ; Changes hors du leaf chat ou collapsed si chat non prêt. |

### Non-objectif de ce diagnostic

Réutiliser le chrome UI Agents tel quel dans l’IDE — deux workbenches (`sessions.desktop.main` vs `workbench.desktop.main`). La parité utile = handler / session / modèle / tools, pas le même DOM.

- Ne pas casser le load d’historique long sur Agents (timeouts 6 s déjà soft).
- Ne pas réintroduire un overlay bloquant « pour faire joli ».
- Tool calling universel / shell discussion → 1.5.21 / 1.5.22.

---

## 8. Plan d’implémentation suggéré (ordre)

1. **P0** — supprimer overlay IDE + doc README 1.5.20.
2. **P1** — empty-first ou soft-fail (plus de double 15 s) ; smoke « New Chat » + cold start workspace.
3. **P2** — logs / fix provider ou moteur si le hang reste.
4. Smoke Agents + IDE côte à côte (changement de modèle partagé).

---

## 9. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `browser/chat/droxNativeChatViewPane.ts` | Overlay, `_openDroxSession`, timeout, fallback |
| `browser/droxSessionLoadingOverlay.ts` | UI grille |
| `browser/droxLoadingConstants.ts` | Délais |
| `browser/agents/droxAgentsSessionHandler.ts` | Provider + history soft-timeout |
| `chat/common/chatService/chatServiceImpl.ts` | `acquireOrLoadSession` / `loadRemoteSession` |
| `chat/browser/chatSessions/chatSessions.contribution.ts` | `canResolve` / `getOrCreateChatSession` |
