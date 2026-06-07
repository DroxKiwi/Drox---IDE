# Plan — chargement session lazy (tail-first)

**Problème** : à la réouverture de l’app, `tryRestoreChatLayout()` appelle `activateChatTab(..., { loadMessages: true })`, qui rejoue **tout** le journal UI (`.ui-replay.jsonl`) — parfois des milliers d’événements (`delta`, `tool`, `phase`, …). Résultat : UI **bordélique**, lent, scroll incohérent.

**Référence dogfood** : [chat.txt](../chat.txt) session `ses_7f5d7903`.

---

## Comportement cible

1. **Au restore** (layout persisté ou onglet actif) : afficher **uniquement le dernier tour** utilisateur → assistant (réponse finale + contexte minimal du tour).
2. **Scroll vers le haut** dans le log : charger dynamiquement les tours précédents (par **pages** ou par **tour**).
3. **Indicateur** : bandeau discret « Historique tronqué — remonter pour charger » + spinner pendant fetch.
4. **Export / revert** : toujours sur le **fichier session complet** (pas le slice UI).

---

## État actuel (code)

| Étape | Fichier | Comportement |
|-------|---------|--------------|
| Restore layout | `droxChatTabsManager.ts` → `tryRestoreChatLayout` | `loadMessages: true` |
| Lecture disque | `droxSessionService.readUiReplay` | **Fichier entier** en mémoire |
| Rejeu | `droxSessionReplay.ts` → `replayUiJournalMessages` | Post **tous** les messages host, délai 12 ms / 12 events |
| Webview | `host-message.js` | `replayPrepare` → handlers → `sessionReplayDone` |
| Fallback | `replayTranscriptMessages` | Transcript moteur si pas de ui-replay |

---

## Design proposé

### 1. Index par « tour »

Définir un **tour** = bloc délimité par un message `append` `role: user` (nouveau prompt) jusqu’au prochain `user` ou fin de journal.

Persistance optionnelle (phase 2) : `ses_xxx.ui-replay.index.json` avec offsets ligne → tour.  
Phase 1 : scan **depuis la fin** du jsonl (pas d’index disque).

### 2. API host

```typescript
// droxSessionService.ts
readUiReplayTail(id, workspace, opts: { maxTurns: number }): Promise<DroxHostToWebviewMessage[]>;
readUiReplayBefore(id, workspace, opts: { beforeLine: number; maxTurns: number }): Promise<{ messages; hasMore; firstLine }>;
```

Implémentation dans `droxSessionService.ts` / `droxUiReplayJournal.ts` :
- Lire le fichier en **reverse** par lignes (ou mmap + offsets)
- Grouper en tours
- Retourner le slice demandé

### 3. Flux restore

```
tryRestoreChatLayout()
  → activateChatTab(id, { loadMessages: 'tail', maxTurns: 1 })
  → readUiReplayTail(..., 1)
  → replayUiJournalMessages(slice)
  → post { kind: 'sessionHistory', hasOlder: true, oldestLoadedTurn: N }
```

`syncWebviewAfterAttach` (déjà `loadMessages: false` au cold start) : **aligner** avec tail-first quand on charge l’onglet actif explicitement.

### 4. Webview scroll-back

| Composant | Action |
|-----------|--------|
| `session/04-history.js` ou nouveau `session/lazy-history.js` | Listener `scroll` sur `D.dom.logEl` ; seuil top 80 px |
| Message webview→host | `{ type: 'loadSessionOlder', sessionId, beforeLine }` |
| `droxChatWebviewRouter.ts` | Délègue à `DroxChatTabsManager.loadOlderMessages` |
| Host→webview | Batch `replayPrepare` + messages + `sessionHistoryPageDone` |

Garde-fous :
- Debounce 300 ms
- Ne pas charger si `D.state.busy` ou `uiReplayActive`
- Préserver `logStickToBottom` quand l’utilisateur est en bas

### 5. Rendu « dernier tour » seul

Pour le tour courant au restore :
- Rejouer les events ui-replay du tour **sans** animation inter-tours
- Appeler `finalizeSessionReplayUi` à la fin
- **Ne pas** afficher le message système « Restoring session UI (N events)… » si N &lt; seuil (ex. 200)

### 6. Transcript fallback

Si pas de `.ui-replay.jsonl` : tail sur **transcript** (`readSession`) — dernier couple user/assistant via `replayTranscriptMessageRich` uniquement.

---

## Phases d’implémentation

| Phase | Livrable | Critère |
|-------|----------|---------|
| **L1** | `readUiReplayTail` + restore 1 tour | Réouverture app &lt; 2 s sur session 2k events | ✅ **100 %** (`DROX_CHAT_TAB_LOAD_TAIL`) |
| **L2** | Scroll-back + `loadSessionOlder` | 3 tours chargés en remontant |
| **L3** | Index json optionnel + tests | Pas de full-scan à chaque scroll |
| **L4** | Virtualisation DOM (dette #3) | Long run live + historique paginé |

---

## Tests manuels

| # | Scénario | Attendu |
|---|----------|---------|
| H1 | Session longue → fermer IDE → rouvrir | Dernier échange visible, pas de rafale thinking/tools anciens |
| H2 | Scroll haut | Tours précédents apparaissent par batch |
| H3 | Switch onglet pendant load | Pas de mélange sessions |
| H4 | Export transcript | Contenu **complet** inchangé |
| H5 | Revert to message | Cible correcte malgré UI tronquée |

---

## Fichiers à toucher (checklist)

- [x] `droxUiReplayTail.ts` — `sliceUiReplayTailTurns` / `sliceTranscriptTailTurns`
- [x] `droxSessionService.ts` + `readUiReplayTail`
- [x] `droxChatTabsManager.ts` — mode `tail` / `full`, défaut tail 1 tour
- [ ] `droxSessionReplay.ts` — replay batch sans yield excessif
- [ ] `droxChatBridge.ts` — types `sessionHistory`, `loadSessionOlder`
- [ ] `droxChatWebviewRouter.ts`
- [ ] `host-message.js` + module scroll lazy
- [x] Tests unitaires : `droxUiReplayTail.test.ts`

---

## Liens

- [DETTES-WEBVIEW-1.3.2.md](DETTES-WEBVIEW-1.3.2.md) (#3 virtualisation)
- [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md)
