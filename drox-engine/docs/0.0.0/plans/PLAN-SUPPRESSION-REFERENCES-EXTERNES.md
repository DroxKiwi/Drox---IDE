# Plan de suppression des references externes (Transition d'Anthropic vers Drox)

## Objectif

Supprimer de maniere systematique toute reference a Anthropic, Claude Code, claude.ai et services externes non souhaites, tout en conservant uniquement:

- le noyau de fonctionnement local
- le backend LLM configure (Ollama / endpoint custom)
- les outils de code (read/edit/write/search/shell, etc.)

## Regles de migration

- Pas de domaine externe hardcode (`claude.ai`, `code.claude.com`, `api.anthropic.com`, `github.com/anthropics`, etc.).
- Pas de texte utilisateur mentionnant Anthropic/Claude.
- Pas de fonctionnalite cloud active par defaut.
- Toute fonctionnalite legacy externe doit etre:
  - soit supprimee,
  - soit desactivee + cachee derriere un flag `DROX_ENABLE_LEGACY_*`.
- Les identifiants techniques strictement necessaires (types, compat temporaire) doivent etre documentes puis planifies pour suppression.

### Regles "intelligentes" (obligatoires)

- **Modeles UI/UX**
  - En mode Ollama: afficher uniquement `OLLAMA_MODEL` (sinon `Ollama backend`).
  - Interdire tout fallback visible `Sonnet/Opus/Claude` dans la banniere, notifications et erreurs.
- **URLs**
  - Si aucune URL Drox n'est configuree (`DROX_*_URL`), ne rien afficher (pas de fallback cloud tiers).
  - Remplacer les "Learn more" hardcodes par:
    - soit une URL issue d'une variable d'environnement,
    - soit un message local sans lien.
- **Commandes/fonctions cloud**
  - Si desactivees, ne pas seulement masquer: afficher un message explicite "disabled in Drox fork" si appelees.
- **Nettoyage lexical**
  - Autorise temporairement uniquement pour compat technique interne non visible utilisateur.
  - Interdit dans les textes utilisateurs, labels, docs runtime, placeholders d'aide.

## Perimetre

1. UI/UX (banniere, notices, onboarding, erreurs, tips)
2. Commandes (`/login`, remote setup, marketplace, github app, etc.)
3. Services API/Cloud (oauth, mcp cloud, telemetry, voice cloud)
4. Plugins/marketplace officiel
5. Documentation interne et commentaires
6. Tests/fixtures/scripts CI

## Suivi des vagues

## Vague 1 - Textes visibles utilisateur (priorite haute)

- [x] Supprimer toutes mentions "Anthropic", "Claude", "claude.ai" dans les ecrans utilisateurs.
- [x] Remplacer les libelles de modele par:
  - `OLLAMA_MODEL` si present
  - sinon `Ollama backend`.
- [x] Neutraliser tous liens "Learn more" externes non configures.
- [ ] Uniformiser les messages d'erreur outils (pas de mention ecosysteme Anthropic).

Critere de fin:

- `rg -i "anthropic|claude\\.ai|claude code|sonnet|opus"` sur `src/components` ne retourne plus de texte utilisateur actif.

## Vague 2 - Commandes et features externes

- [ ] Desactiver/cacher definitivement:
  - install github app
  - remote setup
  - login/logout cloud
  - marketplace officiel auto-install/update
- [ ] Verifier qu'elles ne sont plus exposees dans `getCommands()`.
- [ ] Ajouter un message explicite "disabled in Drox fork" si invocation forcee.

Etat courant:

- `install-github-app` et `remote-setup` restent caches par defaut et deja marques "Disabled in Drox fork".
- Les tips de promotion `/install-github-app` et `/install-slack-app` ont ete retires.
- Les messages de scheduling distant ne recommandent plus `/remote-setup` explicitement.

Critere de fin:

- Aucune commande externe visible dans `/help` par defaut.

## Vague 3 - Services reseau externes

- [x] OAuth: aucune URL par defaut (uniquement `DROX_OAUTH_BASE_URL` + `DROX_ENABLE_LEGACY_OAUTH_NETWORK=1` si opt-in).
- [x] MCP cloud proxy: desactive par defaut (`isRemoteCloudMechanicsDisabledForFork`).
- [x] Voice cloud STT: desactive par defaut (`isFirstPartyAuxBlockedWithoutOverride` + `DROX_VOICE_STREAM_BASE_URL`).
- [x] Telemetry/GrowthBook/Statsig externes: analytics no-op, GrowthBook gate `DROX_GROWTHBOOK_ENABLED=1`, pas de client Statsig reseau.

Etat courant (audit 2026-05-10):

- Garde unifiee via `isOAuthNetworkDisabledForFork` / `isRemoteCloudMechanicsDisabledForFork` / `isFirstPartyAuxHttpDisabledForFork` / `isThirdPartyCliUpdateDisabledForFork` (`src/utils/envUtils.ts`).
- 35+ surfaces gardees (oauth/*, mcp/*, services/api/client, voiceStreamSTT, referral, WebFetchTool, Feedback, FeedbackSurvey, teleport, remote-setup, marketplace, useReplBridge, REPL/REPLBody, RemoteTriggerTool, scheduleRemoteAgents, etc.).
- Bootstrap, prefetch passes, official MCP registry, fast mode status: tous no-op reseau.
- Voice (capture audio): purement local (cpal/SoX/arecord), pas de reseau externe.
- `tsc --noEmit` vert.

Critere de fin:

- [x] Sans flags legacy, aucune requete sortante vers domaines tiers historiques cote code.
- [ ] Validation runtime: lancer le CLI sans variables `DROX_*` reseau, capturer trafic, confirmer 0 requete hors LLM configure.

## Vague 4 - Code mort et renommage structurel

- [x] Renommer le service `claudeAiLimits` -> `modelQuotaLimits` (+ hook). *(2026-05-10)*
- [x] Renommer infrastructure MCP cloud `claudeai.ts` -> `cloudMcp.ts`, exports `*ClaudeAi*` -> `*CloudMcp*`. *(2026-05-10)*
- [x] Renommer fonctions billing/console (`hasClaudeAiBillingAccess` -> `hasSubscriptionBillingAccess`, `getClaudeAiUsageSettingsUrl` -> `getSubscriptionUsageSettingsUrl`, `getClaudeAiUpgradeMaxUrl` -> `getSubscriptionUpgradeUrl`, `getClaudeAiBaseUrl` -> `getRemoteSessionBaseUrl`, `getClaudeAiWebOrigin` -> `getCloudConsoleWebOrigin`). Anciens noms conserves comme alias `@deprecated`. *(2026-05-10)*
- [x] Renommer `getClaudeAiUserDefaultModelDescription` -> `getSubscriptionDefaultModelDescription` + neutralisation du libelle hors `USER_TYPE=ant` (plus de fallback `Sonnet 4.6` / `Opus 4.6`). *(2026-05-10)*
- [x] Renommer flux OAuth: `shouldUseClaudeAIAuth` -> `shouldUseSubscriptionTokenAuth`, `checkNeedsClaudeAiLogin` -> `checkNeedsSubscriptionLogin`. Aliases `@deprecated` pour transition. *(2026-05-10)*
- [x] Sweep des strings utilisateurs `claude.ai` restantes hors wire-format: bridge login error, remote-control prompt, channels notification, RemoteTriggerTool, McpAuthTool, prompts/init, coreSchemas describe, chrome extension URL (devient `DROX_CHROME_EXTENSION_URL`), WebFetchTool error. *(2026-05-10)*
- [ ] Supprimer modules devenus inutiles (marketplace cloud, auth cloud, helpers associes) - non bloquant tant que gardes legacy actifs.

Etat courant (audit 2026-05-10) :

- Wire-format conserve volontairement (compat) : literal `'claudeai-proxy'` (zod schema + discriminated union sur 30+ sites), scope `'claudeai'`, cle de config disque `claudeAiMcpEverConnected`, prefixe d'affichage MCP `claude.ai <name>` (compat noms persistes). Documente dans `src/services/mcp/cloudMcp.ts` en tete.
- Champ IPC `loginWithClaudeAi` (request schema bridge / OAuth flow) conserve : c'est un contrat reseau. Renomme uniquement la fonction `shouldUseSubscriptionTokenAuth`.
- Comments / log debug interne mentionnant `claude.ai` : conserves (non runtime, contexte historique pour devs).

Critere de fin:

- `rg -i "anthropic|claude"` dans `src` limite aux traces strictement justifiees (wire-format + comments dev).

## Vague 5 - Documentation et gouvernance

- [x] Mettre a jour `GUIDE-REFONTE-DROX.md` avec etat reel (entree journal 2026-05-10 ajoutee).
- [x] Nettoyer les prompts de travail (`prompts/*`) pour supprimer les references explicites Anthropic/Claude en documentation non runtime.
- [x] Nettoyer `README.md` pour retirer les references explicites Anthropic/Claude et renommer les exemples vers Drox.
- [x] Ajouter section "variables obligatoires" et "flags legacy" documentes (cf. fin du plan).
- [x] Ajouter checklist de regression avant release (cf. fin du plan).

Etat courant:

- Passe "docs/prompts" effectuee: neutralisation de terminologie provider historique et variables `ANTHROPIC_*`/`CLAUDE_*` dans les prompts guides.
- `README.md` aligne sur Drox (noms d'exemple, alias MCP, texte de disclaimer neutralise).
- `GUIDE-REFONTE-DROX.md`: journal a jour avec audit Vague 3 (2026-05-10).
- Prochaine passe recommandee: redaction d'une section reference unique "DROX_* obligatoires + DROX_ENABLE_LEGACY_* opt-in" + checklist regression release (lancement CLI sans reseau, capture trafic, lint, tsc).

## Matrice de verification rapide

- [ ] Lancement CLI: pas de mention Sonnet/Opus/Anthropic.
- [ ] Prompt "lis vercel.json": tool call execute completement.
- [ ] Aucun lien externe non configure dans UI.
- [x] `npx tsc --noEmit` OK (verifie 2026-05-10).
- [ ] Lint des fichiers modifies OK.

## Variables d'environnement de reference

### Variables Drox runtime (obligatoires si activation)

| Variable | Role | Defaut |
|---|---|---|
| `DROX_CODE_USE_OLLAMA` | Active le mode Ollama (sinon detection automatique sur build externe) | auto |
| `OLLAMA_HOST` | Endpoint Ollama-compatible (URL complete) | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modele a interroger | aucun (echoue si non defini) |
| `OLLAMA_API_KEY` | Cle envoyee en `Authorization: Bearer ...` | aucune |
| `DROX_OLLAMA_EXTRA_HEADERS_JSON` | Headers HTTP additionnels (JSON serialise) | aucun |
| `DROX_API_KEY` | Cle API (mode endpoint Messages-compatible) | aucune |
| `DROX_API_BASE_URL` | URL Messages-compatible custom | aucune |
| `CLAUDE_CONFIG_DIR` | Dossier config local | `~/.drox` |

### Flags legacy (opt-in cloud / mecaniques historiques)

| Flag | Reactive | Defaut |
|---|---|---|
| `DROX_ENABLE_LEGACY_OAUTH_NETWORK` | OAuth navigateur + refresh + profil distant | `0` (off) |
| `DROX_OAUTH_BASE_URL` | URL de base OAuth (requise si OAuth opt-in, pas de fallback) | aucune |
| `DROX_ENABLE_LEGACY_REMOTE_CLOUD` | Teleport/marketplace cloud/MCP cloud/Sessions WS/RemoteTrigger | `0` (off) |
| `DROX_ENABLE_LEGACY_AUX_HTTP` | Feedback API/transcripts/voice STT/referral/preflight WebFetch | `0` (off) |
| `DROX_ENABLE_LEGACY_UPDATER` | Auto-update upstream npm/GCS | `0` (off) |
| `DROX_GROWTHBOOK_ENABLED` | Client GrowthBook (necessite peer `@growthbook/growthbook` installee) | `0` (off) |
| `DROX_VOICE_STREAM_BASE_URL` | Override endpoint STT (active sans flag global aux HTTP) | aucun |
| `DROX_REFERRAL_API_BASE_URL` | Override referral (idem) | aucun |
| `DROX_API_CLIENT_BASE_URL` | Override client API (sinon fallback shim Ollama si remote disabled) | aucun |
| `DROX_MCP_PROXY_URL` / `DROX_MCP_PROXY_PATH` | Override proxy MCP cloud | aucun |
| `DROX_MCP_CLIENT_METADATA_URL` | URL CIMD pour OAuth MCP | aucune |
| `DROX_GUEST_PASSES_TERMS_URL` | Lien « Terms » guest passes (`Passes.tsx`) si referral actif | aucun |
| `DROX_LEGAL_POLICY_NEWS_URL` | Lien « Learn more » (dialogue Grove / conditions) | `DROX_PRODUCT_URL` |
| `DROX_LEGAL_TERMS_URL` | Lien conditions consommateur (Grove) | `DROX_PRODUCT_URL` |
| `DROX_LEGAL_PRIVACY_URL` | Lien politique de confidentialite (Grove) | `DROX_CLOUD_DATA_PRIVACY_URL` / console / `DROX_PRODUCT_URL` |
| `DROX_ENABLE_CLOUD_MCP_SERVERS` | Force-enable cloud MCP registry meme avec `isRemoteCloudMechanicsDisabledForFork` | `0` (off) |
| `DROX_MCP_CLOUD_BASE_URL` | Override base URL du registre MCP cloud | resolveFirstPartyBaseUrl() |
| `DROX_CHROME_EXTENSION_URL` | URL d'installation de l'extension navigateur (commande `/chrome`) | aucune (commande inerte sans l'env) |

## Checklist de regression avant release

- [x] `npx tsc --noEmit` retourne exit 0. *(verifie 2026-05-10)*
- [x] Lint global propre sur fichiers modifies. *(verifie 2026-05-10 sur `main.tsx`, `cli/handlers/util.tsx`, `scripts/network-sniff.mjs`)*
- [x] Lancement `drox --version` sans aucune variable `DROX_*`/`OLLAMA_*` reseau: aucune requete sortante. *(verifie 2026-05-10 via `scripts/network-sniff.mjs`: 0 host contacte, sortie `0.0.0-leaked (Drox Code)`)*
- [x] `drox auth status` sans flag legacy: aucune requete sortante. *(verifie 2026-05-10: 0 host contacte, retourne `loggedIn: false, authMethod: none`)*
- [x] `drox auth login` sans `DROX_OAUTH_BASE_URL` + `DROX_ENABLE_LEGACY_OAUTH_NETWORK`: echec propre sans contacter le reseau. *(message explicite FR depuis 2026-05-10 : garde `assertForkOAuthConfiguredForLogin` dans `cli/handlers/auth.ts`)*
- [x] `drox update` sans `DROX_CLI_UPDATE_ENABLED=1`: aucune requete sortante. *(verifie 2026-05-10: 0 host contacte, message `Checking or installing releases from the upstream channel is disabled on this build by default.`)*
- [x] `drox -p` avec `OLLAMA_HOST=http://127.0.0.1:54321` factice: **uniquement** `127.0.0.1:54321` est contacte. *(verifie 2026-05-10: 1 host contacte, aucune fuite vers anthropic.com / claude.ai / console.anthropic.com / mcp-proxy.anthropic.com / statsig.com / growthbook.io / datadoghq.com)*
- [x] `--help` racine: aucune mention `install-github-app`, `install-slack-app`, `remote-setup` (la commande `auth` reste listee mais ses sous-commandes sont neutralisees sans `DROX_OAUTH_BASE_URL`).
- [x] `--help` racine: descriptions `--bare`, `--model`, `setup-token` ne mentionnent plus `CLAUDE.md auto-discovery`, `'sonnet'/'opus'/'claude-sonnet-4-6'`, `Drox subscription`. *(corrige 2026-05-10 dans `main.tsx` + `cli/handlers/util.tsx`)*
- [ ] Lancement REPL avec `OLLAMA_HOST` + `OLLAMA_MODEL` reels: bannière affiche `OLLAMA_MODEL` (pas `Sonnet`/`Opus`/`Claude`). *(non testable sans Ollama installe localement)*
- [ ] Test prompt simple avec tool call (`lis README.md`): execution complete jusqu'au resultat. *(idem)*
- [x] Documentation `GUIDE-REFONTE-DROX.md` synchro avec dernier commit majeur.

### Outils de validation runtime

Le script `scripts/network-sniff.mjs` est un preload Bun qui patche `globalThis.fetch`,
`undici`, `node:http(s)` et `node:dns` pour journaliser sur stderr tout host contacte
puis afficher la liste recapitulative a la sortie. Usage:

```sh
bun --preload ./scripts/network-sniff.mjs src/entrypoints/cli.tsx <command>
# Sous Windows / PowerShell, encapsuler avec cmd /c pour rediriger stdin:
cmd /c "bun --preload .\\scripts\\network-sniff.mjs src\\entrypoints\\cli.tsx --version < nul 2>&1"
```

Les lignes `[NET] fetch:<host>`, `[NET] dns:<host>`, etc. doivent rester limitees au
backend LLM configure (par defaut `localhost:11434` pour Ollama). Toute apparition de
`anthropic.com`, `claude.ai`, `console.anthropic.com`, `mcp-proxy.anthropic.com`,
`statsig.com`, `growthbook.io`, `datadoghq.com` ou `events.api.segment.io` est une
regression bloquante.

## Commandes de controle utiles

```bash
rg -i "anthropic|claude\\.ai|code\\.claude|claude code|sonnet|opus" src docs
rg -i "github\\.com/anthropics|api\\.anthropic\\.com|console\\.anthropic\\.com" src docs
rg -i "mcp-proxy\\.anthropic\\.com|statsig\\.com|growthbook\\.io|datadoghq" src
npx tsc --noEmit
```

## Notes de pilotage

- Prioriser les suppressions visibles utilisateur avant les refactors profonds.
- Travailler en petites vagues testables.
- Eviter les remplacements globaux aveugles: faire des patches cibles + verification runtime.
- Apres chaque vague majeure, mettre a jour le journal de `GUIDE-REFONTE-DROX.md` (entree datee).
