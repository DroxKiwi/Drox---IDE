# Chantier webview — exécution dette 1.3.2

**Dette** : [DETTES-WEBVIEW-1.3.2.md](DETTES-WEBVIEW-1.3.2.md)  
**Démarré** : 2026-06-07

---

## Ordre d’attaque

```
Phase W0 (contrat)  →  Phase W1 (session lazy L1)  →  Phase W2 (état)  →  Phase W3 (bundle)
         ↑ en cours
```

| Phase | Dette # | Livrable | Statut |
|-------|---------|----------|--------|
| **W0** | #2 Host↔webview | Registre `kind` + test parité TS/JS | 🔄 |
| **W1** | #3 + R1 session | Tail-first restore ([PLAN-CHARGEMENT-SESSION-LAZY](PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md) L1) | ✅ L1 |
| **W2** | #1 État global | Façades `D.state.stream` / `D.state.settings` (shim) | ☐ |
| **W3** | #4 Scripts | Bundle esbuild `drox-chat.bundle.js` | ☐ |

---

## W0 — Registre messages host (en cours)

**Fichiers** :
- `src/vs/workbench/contrib/drox/common/droxChatHostMessageKinds.ts` — liste exhaustive `DroxHostToWebviewMessage.kind`
- `src/vs/workbench/contrib/drox/test/common/droxChatHostMessageKinds.test.ts` — parité avec `bridge/host-message.js`

**Règle** : tout nouveau `kind` → ajout union `droxChatBridge.ts` + registre + test + case `host-message.js`.

**Suite W0** :
- [ ] Router host typé `switch` exhaustif avec `assertNever` en TS
- [ ] JSDoc `@typedef` généré depuis registre (script `scripts/drox-sync-host-kinds.mjs`)

---

## W1 — Prérequis session lazy

Voir checklist [PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md](PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md).

**Blocage actuel** : `replayUiJournalMessages` rejoue 100 % du jsonl — W1 débloque la pré-release stable.

---

## W2 — État par domaine

Sans framework externe :
1. `core/state-stream.js` — champs timeline, tools, discussion
2. `core/state-settings.js` — modèles, permission, engine strictness
3. `state.js` — `Object.defineProperty` proxies vers sous-objets

Migration fichier par fichier ; tests smoke chat après chaque lot.

---

## W3 — Bundle

- Entrée : `media/droxChat/entry.js` → `import` ordre actuel de `DROX_CHAT_SCRIPT_FILES`
- Build : `npm run drox:bundle-webview` (à ajouter)
- Runtime : `droxChatWebview.ts` charge 1 script + source maps dev

---

## Smoke après chaque phase

- [ ] « Salut » discussion
- [ ] Run edit avec outil
- [ ] Réouverture session (W1)
- [ ] Export transcript
- [ ] Reload Window

---

## Liens

- [DECOUPAGE-CHAT-WEBVIEW.md](../DECOUPAGE-CHAT-WEBVIEW.md)
- [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md)
