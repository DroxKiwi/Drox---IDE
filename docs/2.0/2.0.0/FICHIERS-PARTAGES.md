# Fichiers partagés à vérifier

Photo du 9 novembre 2026, arbre de travail de la branche `2.0.0`, comparé au commit déjà intégré `07532d0ec9abb36769bbd44f4779e5f425a44a12`. Ce n’est pas le tag `1.127.0`.

206 fichiers existent des deux côtés et diffèrent. Les fichiers absents de cette base (`contrib/drox`, `drox-engine`, le reste) ne sont pas ici : ils se recopient en bloc.

On ne reformate pas. On ne renomme pas. Un petit écart reste dans le fichier Microsoft. Un gros corps ajouté en fin de classe peut sortir dans un fichier à nous, avec un import et un appel. L’écart laissé sur place s’encadre avec `DROX-BEGIN` / `DROX-END`.

## Déjà repris, pas commité

`src/vs/platform/git/node/localGitService.ts` ne garde plus les méthodes ajoutées. Elles sont dans `src/vs/platform/git/node/droxLocalGitService.ts`, fichier absent de la base. `sharedProcessMain.ts` enregistre la classe fille. Le diff restant de ces deux fichiers Microsoft est petit.

## File de reprise

Un fichier à la fois, dans cet ordre. La colonne `+` / `-` est le volume contre la base. `h` est le nombre de blocs du diff. Tant que `h` est grand, on lit le fichier avant de déplacer quoi que ce soit.

| | Fichier | + | - | h |
|---|---------|--:|--:|--:|
| | `src/vs/platform/git/common/localGitService.ts` | 108 | 0 | 2 |
| | `src/vs/platform/git/test/node/localGitService.test.ts` | 127 | 9 | 10 |
| | `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatSubagentContentPart.ts` | 217 | 57 | 43 |
| | `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media/chatSubagentContent.css` | 179 | 3 | 6 |
| | `src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatSubagentContentPart.test.ts` | 41 | 68 | 31 |
| | `src/vs/sessions/browser/workbench.ts` | 212 | 58 | 27 |
| | `src/vs/workbench/contrib/welcomeGettingStarted/browser/media/gettingStarted.css` | 201 | 1 | 4 |
| | `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts` | 79 | 166 | 38 |
| | `src/vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent.ts` | 74 | 1 | 4 |
| | `src/vs/sessions/contrib/terminal/browser/sessionsTerminalContribution.ts` | 197 | 103 | 33 |
| | `src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts` | 177 | 4 | 23 |
| | `src/vs/workbench/contrib/chat/electron-browser/agentSessions/media/openInAgents.css` | 176 | 8 | 10 |
| | `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.ts` | 110 | 8 | 15 |
| | `src/vs/sessions/contrib/chat/browser/newChatInput.ts` | 100 | 21 | 20 |
| | `build/lib/electron.ts` | 104 | 7 | 8 |
| | `build/lib/preLaunch.ts` | 98 | 3 | 6 |
| | `src/vs/sessions/contrib/sessions/browser/views/sessionsList.ts` | 92 | 7 | 22 |
| | `src/vs/sessions/browser/sessionsSetUpService.ts` | 80 | 5 | 10 |
| | `src/vs/sessions/services/sessions/browser/sessionsService.ts` | 80 | 8 | 23 |
| | `src/vs/sessions/contrib/changes/browser/changesView.ts` | 79 | 13 | 18 |
| | `build/lib/stylelint/vscode-known-variables.json` | 78 | 2 | 4 |
| | `src/vs/sessions/contrib/chat/browser/media/chatInput.css` | 78 | 2 | 3 |
| | `build/gulpfile.vscode.ts` | 76 | 26 | 20 |
| | `src/vs/base/browser/ui/sash/sash.css` | 71 | 2 | 4 |
| | `src/vs/sessions/contrib/chat/browser/chatView.ts` | 66 | 26 | 19 |
| | `src/vs/sessions/contrib/sessions/browser/views/sessionsView.ts` | 59 | 18 | 17 |
| | `src/vs/platform/agentHost/node/copilot/copilotAgent.ts` | 57 | 6 | 5 |
| | `src/vs/sessions/contrib/chat/browser/newChatContextAttachments.ts` | 56 | 28 | 7 |
| | `src/vs/sessions/contrib/chat/browser/runScriptAction.ts` | 53 | 2 | 6 |
| | `build/gulpfile.vscode.linux.ts` | 53 | 6 | 5 |
| | `src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts` | 52 | 5 | 9 |
| | `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupProviders.ts` | 51 | 9 | 12 |
| | `src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts` | 51 | 10 | 8 |
| | `src/vs/sessions/contrib/layout/browser/baseSessionLayoutController.ts` | 51 | 15 | 10 |
| | `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` | 51 | 5 | 5 |
| | `src/vs/sessions/browser/parts/sessionsPart.ts` | 49 | 0 | 4 |
| | `src/vs/sessions/contrib/chat/electron-browser/chat.contribution.ts` | 45 | 23 | 11 |
| | `src/vs/workbench/contrib/chat/test/common/model/chatModel.test.ts` | 43 | 0 | 1 |
| | `src/vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart.ts` | 39 | 2 | 5 |
| | `build/win32/code.iss` | 25 | 16 | 13 |
| | `src/vs/platform/agentHost/common/agentModelPricing.ts` | 0 | 59 | 1 |
| | `README.md` | 109 | 47 | 30 |
| | `.eslint-allowed-javascript-files` | 91 | 0 | 1 |

`agentModelPricing.ts` est une suppression, pas un ajout. `.eslint-allowed-javascript-files` est un seul ajout en fin de liste : on le marque, on n’en fait pas un module.

`gettingStarted.ts` retire plus de lignes qu’il n’en ajoute. On le lit avant de toucher au CSS du même dossier.

## Petits écarts

40 lignes ou moins, ajouts et retraits cumulés. On ne les déplace pas. Le passage sert à vérifier que l’écart est un bloc, puis à l’encadrer s’il ne l’est pas.

`build/linux/debian/dep-lists.ts` se régénère. On ne le rejoue pas comme un patch à la main.

```text
.eslint-ignore
.gitignore
AGENTS.md
build/.moduleignore
build/.moduleignore.linux
build/filters.ts
build/gulpfile.extensions.ts
build/gulpfile.vscode.win32.ts
build/linux/debian/calculate-deps.ts
build/linux/debian/dep-lists.ts
build/linux/dependencies-generator.ts
build/next/index.ts
build/npm/postinstall.ts
build/win32/i18n/messages.de.isl
build/win32/i18n/messages.en.isl
build/win32/i18n/messages.es.isl
build/win32/i18n/messages.fr.isl
build/win32/i18n/messages.hu.isl
build/win32/i18n/messages.it.isl
build/win32/i18n/messages.ja.isl
build/win32/i18n/messages.ko.isl
build/win32/i18n/messages.pt-br.isl
build/win32/i18n/messages.ru.isl
build/win32/i18n/messages.tr.isl
build/win32/i18n/messages.zh-cn.isl
build/win32/i18n/messages.zh-tw.isl
extensions/theme-defaults/package.json
extensions/theme-defaults/package.nls.json
src/vs/base/browser/markdownRenderer.ts
src/vs/base/common/product.ts
src/vs/code/electron-browser/workbench/workbench-dev.html
src/vs/code/electron-browser/workbench/workbench.html
src/vs/code/electron-main/app.ts
src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts
src/vs/platform/agentHost/node/claude/claudeAgent.ts
src/vs/platform/agentHost/node/codex/codexAgent.ts
src/vs/platform/agentHost/test/node/claudeAgent.test.ts
src/vs/platform/agentHost/test/node/copilotAgent.test.ts
src/vs/platform/git/node/localGitService.ts
src/vs/platform/mcp/common/mcpGalleryManifestService.ts
src/vs/platform/product/common/product.ts
src/vs/sessions/browser/accountTitleBarState.ts
src/vs/sessions/browser/media/openInVSCode.css
src/vs/sessions/browser/menus.ts
src/vs/sessions/browser/parts/chatView.ts
src/vs/sessions/browser/parts/mobile/mobileTitlebarPart.ts
src/vs/sessions/browser/parts/sessionHeader.ts
src/vs/sessions/browser/parts/sessionView.ts
src/vs/sessions/browser/sessionStatusIcon.ts
src/vs/sessions/common/sessionsTelemetry.ts
src/vs/sessions/common/theme.ts
src/vs/sessions/contrib/accountMenu/browser/account.contribution.ts
src/vs/sessions/contrib/changes/browser/changesActions.ts
src/vs/sessions/contrib/changes/browser/media/changesView.css
src/vs/sessions/contrib/chat/browser/chat.contribution.ts
src/vs/sessions/contrib/chat/browser/media/chatWidget.css
src/vs/sessions/contrib/chat/browser/modelPicker.ts
src/vs/sessions/contrib/chat/browser/newChatWidget.ts
src/vs/sessions/contrib/chat/browser/sessionWorkspacePicker.ts
src/vs/sessions/contrib/chat/browser/webWorkspacePicker.ts
src/vs/sessions/contrib/chat/test/browser/sessionWorkspacePicker.test.ts
src/vs/sessions/contrib/editor/browser/editor.contribution.ts
src/vs/sessions/contrib/editor/test/browser/editor.contribution.test.ts
src/vs/sessions/contrib/providers/agentHost/browser/agentHostPermissionPickerDelegate.ts
src/vs/sessions/contrib/providers/copilotChatSessions/browser/copilotChatSessions.contribution.ts
src/vs/sessions/contrib/providers/localChatSessions/browser/localChatSessions.contribution.ts
src/vs/sessions/contrib/sessions/browser/media/sessionsList.css
src/vs/sessions/contrib/sessions/browser/media/sessionsViewPane.css
src/vs/sessions/contrib/sessions/browser/sessionsActions.ts
src/vs/sessions/contrib/sessions/browser/views/sessionsViewActions.ts
src/vs/sessions/contrib/terminal/browser/agentHostSessionTaskRunner.ts
src/vs/sessions/contrib/terminal/test/browser/sessionsTerminalContribution.test.ts
src/vs/sessions/contrib/tunnelHost/electron-browser/tunnelHost.contribution.ts
src/vs/sessions/contrib/tunnelHost/test/electron-browser/tunnelHost.contribution.test.ts
src/vs/sessions/electron-browser/actions/vscodeActions.ts
src/vs/sessions/electron-browser/sessions-dev.html
src/vs/sessions/electron-browser/sessions.html
src/vs/sessions/services/sessions/browser/sessionNavigation.ts
src/vs/sessions/services/sessions/browser/sessionsListModelService.ts
src/vs/sessions/services/sessions/browser/sessionsRecencyHistory.ts
src/vs/sessions/services/sessions/common/sessionsProvider.ts
src/vs/sessions/services/sessions/test/browser/sessionNavigation.test.ts
src/vs/sessions/sessions.common.main.ts
src/vs/sessions/skills/commit/SKILL.md
src/vs/workbench/browser/layout.ts
src/vs/workbench/browser/parts/auxiliarybar/media/auxiliaryBarPart.css
src/vs/workbench/browser/parts/banner/media/bannerpart.css
src/vs/workbench/browser/parts/compositeBarActions.ts
src/vs/workbench/browser/parts/globalCompositeBar.ts
src/vs/workbench/browser/parts/paneCompositeBar.ts
src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css
src/vs/workbench/common/views.ts
src/vs/workbench/contrib/authentication/browser/actions/manageAccountPreferencesForExtensionAction.ts
src/vs/workbench/contrib/chat/browser/actions/chatActions.ts
src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts
src/vs/workbench/contrib/chat/browser/actions/chatLanguageModelActions.ts
src/vs/workbench/contrib/chat/browser/actions/chatQuickInputActions.ts
src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.ts
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationListWidget.ts
src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts
src/vs/workbench/contrib/chat/browser/chat.ts
src/vs/workbench/contrib/chat/browser/chatDebug/chatDebugFlowChartView.ts
src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingActions.ts
src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts
src/vs/workbench/contrib/chat/browser/chatQuotaNotification.ts
src/vs/workbench/contrib/chat/browser/chatSessions/chatSessionDescription.ts
src/vs/workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.ts
src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts
src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupRunner.ts
src/vs/workbench/contrib/chat/browser/chatStatus/chatStatusEntry.ts
src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatAttachmentsContentPart.ts
src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatCollapsibleMarkdownContentPart.ts
src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.ts
src/vs/workbench/contrib/chat/browser/widget/chatContentParts/media/chatThinkingContent.css
src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts
src/vs/workbench/contrib/chat/browser/widget/input/permissionPickerActionItem.ts
src/vs/workbench/contrib/chat/common/actions/chatContextKeys.ts
src/vs/workbench/contrib/chat/common/chatService/chatService.ts
src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts
src/vs/workbench/contrib/chat/common/chatSessionsService.ts
src/vs/workbench/contrib/chat/common/languageModels.ts
src/vs/workbench/contrib/chat/common/model/chatModel.ts
src/vs/workbench/contrib/chat/common/model/chatSessionOperationLog.ts
src/vs/workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.ts
src/vs/workbench/contrib/chat/common/promptSyntax/promptTypes.ts
src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts
src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsServiceImpl.ts
src/vs/workbench/contrib/chat/electron-browser/agentSessions/agentSessionsActions.ts
src/vs/workbench/contrib/chat/electron-browser/tunnelHost.contribution.ts
src/vs/workbench/contrib/chat/electron-browser/tunnelHostService.ts
src/vs/workbench/contrib/chat/test/common/mockChatSessionsService.ts
src/vs/workbench/contrib/inlineChat/browser/inlineChatActions.ts
src/vs/workbench/contrib/terminal/browser/chatTerminalCommandMirror.ts
src/vs/workbench/contrib/update/browser/media/updateTooltip.css
src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts
src/vs/workbench/contrib/welcomeWalkthrough/browser/media/walkThroughPart.css
src/vs/workbench/services/mcp/browser/mcpGalleryManifestService.ts
src/vs/workbench/services/mcp/electron-browser/mcpGalleryManifestService.ts
src/vs/workbench/services/themes/common/workbenchThemeService.ts
src/vs/workbench/services/themes/test/common/workbenchThemeService.test.ts
src/vs/workbench/test/browser/componentFixtures/sessions/sessionHeader.fixture.ts
src/vs/workbench/workbench.common.main.ts
src/vs/workbench/workbench.desktop.main.ts
```

## Manifestes

On ne les traite pas comme un diff de code.

- `package.json` : +302 / -286. On garde `droxVersion` et `droxSurface`. On prend `version` et `distro` de la nouvelle base.
- `product.json` : +97 / -85. On garde les clés de marque.
- `package-lock.json` : +220 / -94. Il se régénère.

## Binaires

On les replace tels quels.

```text
resources/win32/code.ico
resources/win32/code_150x150.png
resources/win32/code_70x70.png
resources/win32/inno-big-100.bmp
resources/win32/inno-big-125.bmp
resources/win32/inno-big-150.bmp
resources/win32/inno-big-175.bmp
resources/win32/inno-big-200.bmp
resources/win32/inno-big-225.bmp
resources/win32/inno-big-250.bmp
resources/win32/inno-small-100.bmp
resources/win32/inno-small-125.bmp
resources/win32/inno-small-150.bmp
resources/win32/inno-small-175.bmp
resources/win32/inno-small-200.bmp
resources/win32/inno-small-225.bmp
resources/win32/inno-small-250.bmp
```
