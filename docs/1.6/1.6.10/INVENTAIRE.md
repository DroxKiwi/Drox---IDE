# 1.6.10 — inventaire de nettoyage

**Statut** : liste vivante. Chaque ligne a une pastille. Vert : on garde, ou c’est déjà retiré. Rouge : à retirer, ou pas encore tranché.
**Base** : Drox `1.6.9` / VS Code `1.127.0`, branche `1.6.10`.

Le but n’est pas de couper Drox des écosystèmes extérieurs. Git, les fournisseurs de modèles, le registre MCP, le dépôt du projet restent. On retire ce qui ne sert pas un dev : comptes Copilot, abonnements, connexion à un service tiers payant, télémétrie imposée.

## À garder

Drox, et les outils pour travailler avec l’extérieur.

| | Piste | Où | Pourquoi |
|---|-------|----|----------|
| 🟢 | Liens du projet | `product.json` : issues, README, NOTICE | C’est le dépôt Drox |
| 🟢 | Mises à jour proposées par Drox | `src/vs/platform/update/electron-main/` lit `productService.updateUrl` | Le canal sert dès qu’on y met une URL Drox. Aujourd’hui `updateUrl` est vide : aucun appel Microsoft |
| 🟢 | Git | contributeur git du workbench | Outil de dev |
| 🟢 | Fournisseurs de modèles | `defaultChatAgent.openAiCompatibleProviderBaseUrl` (`http://localhost:11434/v1`), moteur Drox, outil qui parle à un serveur choisi par l’utilisateur | Connexion à un provider, pas un compte produit |
| 🟢 | Registre MCP | `product.json` `mcpGallery` vers le fichier du dépôt Drox | Écosystème d’outils, pas un abonnement |
| 🟢 | Éditeur, terminal, debug JS | `src/vs/editor`, terminal, `ms-vscode.js-debug` et ses deux compagnons dans `builtInExtensions` | Ils font tourner l’IDE. Le debug vient de dépôts Microsoft, il ne gère pas de compte |
| 🟢 | Agent Drox | `defaultChatAgent.extensionId` = `drox.agents`, `skipCopilotGitHubSignIn: true`, `droxMicrosoftAgentsSurfaceEnabled: false` | Le chat produit n’ouvre pas de session Copilot |
| 🟢 | Coupe-circuit télémétrie | `enableTelemetry: false`, `removeTelemetryMachineId: true`, `agentsTelemetryAppName` vide | Empêche l’envoi |
| 🟢 | Gallery d’extensions | pas de clé `extensionsGallery`. Le service reste dans `src/vs/workbench/services/extensionManagement/` | On la garde pour pouvoir brancher plus tard un magasin choisi par le dev (Open VSX ou autre). Aujourd’hui aucun magasin n’est appelé |

## À couper

Pas de compte dans le produit. Pas de service tiers payant branché par Drox.

| | Piste | Où | Pourquoi |
|---|-------|----|----------|
| 🟢 | Chat et monitoring Copilot | `extensions/copilot` | Retiré du suivi Git. L’install et l’hygiène ne le réclament plus. Les connecteurs BYOK de ce dossier partent avec lui. Reste local possible : `node_modules` si le watch verrouille `esbuild.exe` |
| 🟢 | Compte Copilot | `product.json` `trustedExtensionAuthAccess` vide. Boutons retirés du walkthrough, de l’onboarding et de la carte « Try GitHub Copilot » | Plus d’autorisation de jeton GitHub pour `github.copilot`. Les menus Sign in restent masqués par `droxCopilotSignInHidden` |
| 🟢 | Identités du chat agent | `defaultChatAgent.provider` ne garde que `drox` | Plus de boutons Continue with Google, Apple ou GitHub Enterprise |
| 🟢 | Abonnements | `managePlanUrl`, `upgradePlanUrl`, `signUpUrl`, `skusDocumentationUrl` vides. `upgradePlan` n’ouvre plus le paiement GitHub | Boutons Upgrade, Manage Budget et liens Pro retirés du sélecteur, du quota et du menu |
| 🟢 | Envoi de télémétrie | `src/vs/platform/telemetry/common/1dsAppender.ts` | Plus d’URL OneCollector. L’appender n’ouvre pas de connexion, même si `enableTelemetry` repasse à vrai |
| 🟢 | Réglage visible | `telemetry.telemetryLevel` dans `telemetryService.ts` | Retiré de l’écran de paramètres. Le défaut reste `off` |
| 🟢 | Socle des webviews | `src/vs/workbench/contrib/webview/browser/pre/` servi par `vscode-webview://` | Plus d’URL `vscode-cdn.net` pour ce socle. Les fichiers `index.html`, `fake.html` et `service-worker.js` sont dans l’application |
| 🟢 | Télémétrie et crash reporter | réglages `telemetry.*` masqués, `enable-crash-reporter` forcé à faux | L’envoi, le réglage, l’ancien interrupteur et le crash reporter ne sont plus des fonctions du produit. `telemetry.feedback.enabled` reste : c’est le rapporteur de problème, pas un envoi Microsoft |
| 🔴 | Tunnel distant | `tunnelApplicationName`, mutex dans `product.json` | Remplacé par le panneau Ports de Drox (`src/vs/workbench/contrib/drox/browser/ports/`). Le code du tunnel Microsoft est encore dans le dépôt |

Les connexions OpenAI-compatible, Ollama ou autre serveur que l’utilisateur configure dans le moteur ne sont pas dans cette liste.
