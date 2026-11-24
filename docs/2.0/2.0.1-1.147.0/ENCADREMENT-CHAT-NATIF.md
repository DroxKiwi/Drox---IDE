# Encadrement — chat natif Drox (UI + Playwright + rebase)

Objectif : limiter les **coupures dans le code Microsoft** à des blocs `DROX-BEGIN` / `DROX-END`, et regrouper la logique / constantes / hooks de test dans `contrib/drox`.

## Couches

| Couche | Rôle |
|--------|------|
| **`contrib/drox/...`** | Comportement, CSS, options widget, constantes Playwright, « seams » appelées depuis le chat MS |
| **`contrib/chat/...` (blocs DROX)** | Options de type, imports d’un helper Drox, 1–3 lignes d’appel |
| **`docs/2.0/...`** | Inventaire rebase + sélecteurs pour les scénarios Playwright |

## Fichiers Drox (source de vérité)

| Fichier | Contenu |
|---------|---------|
| `browser/chat/droxNativeChatUiConstants.ts` | Ratio scroll transcript (`DROX_NATIVE_CHAT_TRANSCRIPT_TAIL_PADDING_RATIO`), `data-testid`, `DROX_NATIVE_CHAT_PLAYWRIGHT` |
| `browser/chat/droxChatWidgetSeams.ts` | `getDroxChatListPaddingBottom`, `resolveDroxStickyProgressEnabled` — **seul** point d’intégration appelé depuis `chatWidget.ts` |
| `browser/discussion/droxDiscussionChatWidgetOptions.ts` | `droxNativeComposer`, ratio, placeholders — fabrique `IChatWidgetViewOptions` |
| `browser/chat/droxNativeChatViewPane.ts` | Pane IDE, pose les `data-testid` sur le panneau et le shell discussion |
| `browser/chat/droxNativeChatWorkingProgress.ts` | Grille 3×3 run / warmup |
| `browser/chat/media/droxIdeNativeChat.css` | Styles shell IDE |
| `browser/chat/chatDroxWarmupContentPart.ts` | Part warmup transcript (via renderer) |

## Coupures upstream (`DROX-BEGIN` / `DROX-END`)

Lors d’un rebase VS Code, revisiter **dans l’ordre** :

1. `src/vs/workbench/contrib/chat/browser/chat.ts` — champs optionnels `droxNativeComposer`, `droxTranscriptTailPaddingRatio`
2. `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` — import seams + `stickyProgress` + `_getListPaddingBottom`
3. `src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts` — compositeur natif, toolbars
4. `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts` — masquage onglet Chat MS (`droxHideMicrosoftChatSurface`)
5. `src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts` — part `droxWarmup` si besoin
6. Autres blocs Drox listés par `rg "DROX-BEGIN" src/vs/workbench/contrib/chat`

Règle : **ne pas** réétaler la logique dans `chatWidget.ts` — ajuster `droxChatWidgetSeams.ts` ou les options Drox.

## Playwright

Constantes exportées (importer depuis le package workbench ou recopier les sélecteurs dans les tests smoke/scenario) :

```ts
import {
	DROX_NATIVE_CHAT_PLAYWRIGHT,
	DROX_NATIVE_CHAT_TEST_IDS,
} from '…/drox/browser/chat/droxNativeChatUiConstants.js';
```

| Ancre | Usage |
|-------|--------|
| `data-testid="drox-ide-native-chat"` | Racine du view pane IDE (onglet Chat Drox) |
| `data-testid="drox-discussion-shell"` | Conteneur `ChatWidget` (transcript + compositeur) |
| `DROX_NATIVE_CHAT_PLAYWRIGHT.transcriptList` | Liste messages |
| `DROX_NATIVE_CHAT_PLAYWRIGHT.composer` | Zone de saisie |
| `DROX_NATIVE_CHAT_PLAYWRIGHT.runWarmup` | Warmup run |
| `DROX_NATIVE_CHAT_PLAYWRIGHT.responseLoadingGrid` | Grille chargement réponse |

Exemple minimal (Playwright) :

```ts
await page.locator(DROX_NATIVE_CHAT_PLAYWRIGHT.idePanel).waitFor();
await page.locator(DROX_NATIVE_CHAT_PLAYWRIGHT.composer).locator('textarea').fill('ping');
```

Les tests E2E dédiés restent à ajouter sous `test/smoke` ou `test/scenario` quand le lot UI est figé ; cette doc + les `data-testid` évitent les sélecteurs fragiles sur les classes Monaco.

## Checklist après rebase 1.14x

- [ ] `rg DROX-BEGIN src/vs/workbench/contrib/chat` — chaque conflit résolu, blocs préservés
- [ ] `chatWidget.ts` importe toujours `droxChatWidgetSeams.js`
- [ ] Dogfood F5 : transcript scroll (ratio 0.48), pas de bandeau sticky Shaw, grille run OK
- [ ] Optionnel : smoke Playwright sur `DROX_NATIVE_CHAT_PLAYWRIGHT.idePanel`

## Références

- Branche : `2.0.1-1.147.0` — [README](./README.md)
- Rebase global : `docs/Drox---IDE---rebase/LIEUX.md`