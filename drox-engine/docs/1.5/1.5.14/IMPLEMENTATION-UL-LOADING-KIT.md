# Implémentation UL — Drox Loading Kit

**Version** : 1.5.14 · **Périmètre** : UI workbench uniquement (pas de moteur Rust)

---

## Composants

| Fichier | Rôle |
|---------|------|
| `droxLoadingConstants.ts` | Délai anti-flash unifié `450 ms` |
| `droxLoadingController.ts` | `DroxLoadingGate` — jointure de promesses concurrentes |
| `droxActivityGrid.ts` | Grille 3×3 (existant, réutilisé) |
| `droxLoadingSkeleton.ts` | Bulles skeleton fil chat |
| `droxSessionLoadingOverlay.ts` | Overlay session (grille + label + skeleton) |
| `media/droxLoadingKit.css` | Styles overlay, skeleton, chips composer |
| `droxWarmupPhrase.ts` | Sélection phrase warmup (pool `droxThinkingPhrases`) |
| `chatDroxWarmupContentPart.ts` | Rendu natif grille + phrase dans le fil chat |

---

## Points d’injection

1. **Agents — switch session** : `ChatView.setChat()` → overlay Drox si `DROX_CHAT_SESSION_TYPE`
2. **IDE natif** : `DroxNativeChatViewPane._openDroxSession()` → overlay sur `.drox-ide-native-chat-widget`
3. **Composer panneaux** : `DroxAgentsComposerDroxChatHost._ensureReady()` → `panelBootstrapLoading` sur chips Model / Server
4. **Run agent natif** : `droxAgentsChatSink` → progress `droxWarmup` (grille + phrase) jusqu'au 1er token/tool
5. **Envoi message** : `newChatInput` — délai spinner aligné sur `450 ms`

---

## Tests

`src/vs/workbench/contrib/drox/test/common/droxLoadingController.test.ts`  
`src/vs/workbench/contrib/drox/test/common/droxAgentsChatSink.test.ts` (warmup)

---

## Non livré en 1.5.14 (UL5)

- Lazy history webview + skeleton liste sessions
