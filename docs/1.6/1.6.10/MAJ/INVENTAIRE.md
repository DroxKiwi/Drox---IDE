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

## À couper

Pas de compte dans le produit. Pas de service tiers payant branché par Drox.

| | Piste | Où | Pourquoi |
|---|-------|----|----------|
| 🟢 | Chat et monitoring Copilot | `extensions/copilot` | Retiré du suivi Git. L’install et l’hygiène ne le réclament plus. Les connecteurs BYOK de ce dossier partent avec lui. Reste local possible : `node_modules` si le watch verrouille `esbuild.exe`. Pas encore commité |
| 🔴 | Compte Copilot | `product.json` `trustedExtensionAuthAccess` pour `github.copilot` et `github.copilot-chat` | Donne à ces extensions le jeton GitHub. Drox n’a pas de compte Copilot |
| 🔴 | Identités du chat agent | `defaultChatAgent.provider` : `github-enterprise`, `google`, `apple` à côté de `drox` | Connexion de compte, pas un provider de modèle |
| 🔴 | Abonnements | `managePlanUrl`, `upgradePlanUrl`, `signUpUrl`, `skusDocumentationUrl`, quotas `entitlementUrl` | Vocabulaire de plan payant. Les URL pointent déjà vers `NOTICE.md`, le schéma reste |
| 🔴 | Envoi de télémétrie | `src/vs/platform/telemetry/common/1dsAppender.ts` → `https://mobile.events.data.microsoft.com/OneCollector/1.0` | Inerte aujourd’hui. Si `enableTelemetry` repasse à vrai, les événements partent chez Microsoft |
| 🔴 | Réglage visible | `telemetry.telemetryLevel` dans `telemetryService.ts` | L’écran de paramètres parle encore d’une télémétrie produit |

Les connexions OpenAI-compatible, Ollama ou autre serveur que l’utilisateur configure dans le moteur ne sont pas dans cette liste.

## À réfléchir

Nécessaire au fonctionnement du fork, ou trop lié au rebase pour le trancher ici.

| | Piste | Où | Question |
|---|-------|----|----------|
| 🔴 | Webviews | `webviewContentExternalBaseUrlTemplate` → `{{uuid}}.vscode-cdn.net` | Les webviews en ont besoin pour charger leur socle. Faut-il le servir depuis le disque local à la place du CDN Microsoft ? |
| 🔴 | Code de télémétrie et crash reporter | `src/vs/platform/telemetry/` | Le coupe-circuit suffit-il, ou retire-t-on l’appel quand un rebase le permettra ? |
| 🔴 | Gallery d’extensions | pas de clé `extensionsGallery` dans `product.json`. Le service reste dans `src/vs/workbench/services/extensionManagement/` | On n’appelle pas le marketplace. Le code upstream reste. Une gallery choisie par le dev (Open VSX ou autre) est un écosystème utile, pas un compte |
| 🔴 | Tunnel distant | `tunnelApplicationName`, mutex dans `product.json` | Outil remote du fork. Utile à certains devs, inutile au flux Drox local |
