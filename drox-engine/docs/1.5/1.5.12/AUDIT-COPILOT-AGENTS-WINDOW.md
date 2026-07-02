# Audit — surfaces Copilot (fenêtre Agents + éditeur) vs Drox

**Version** : juin 2026 · **1.5.12**  
**Objectif** : recenser ce que le chassis **Microsoft Copilot Agents** expose dans Drox IDE, ce qui est déjà branché sur **`drox.exe`**, et ce qui reste à brancher, masquer ou reporter.

**Complète** : [PLAN-1.5.12.md](PLAN-1.5.12.md) (P3–P5)

---

## Contexte

La **fenêtre Agents** (`drox.exe` / `vs/sessions`) réutilise l’UI sessions Copilot : layout chat + sidebar **Changes / Files**, barre titre (terminal, sidebar, **antenne remote**), écran **Agent Customizations**, picker workspace, etc.

Drox a remplacé le **provider de sessions** (`droxSessionsProvider`) et le **run** (`droxAgentsSessionHandler` + bridge moteur), mais de nombreuses **vues et flux** restent calqués sur Copilot/GitHub sans données Drox.

---

## Légende

| Symbole | Signification |
|---------|---------------|
| ✅ | Branché / fonctionnel avec Drox |
| 🟡 | Partiellement (UI visible, données incomplètes ou scopes à unifier) |
| ❌ | Non branché ou stub vide |
| 🚫 | À masquer / désactiver pour Drox (vestige Copilot) |
| 🔵 | À auditer en smoke (statut incertain) |
| 📅 | Report version ultérieure |

---

## 1. Fil de chat et exécution agent

| Surface | Copilot | Drox | Fichiers clés | Action |
|---------|:-------:|:----:|---------------|--------|
| Envoi message + streaming | ✅ | ✅ | `droxAgentsSessionHandler`, `droxAgentRunBridge` | — |
| Tools client (read/write/shell…) | ✅ | ✅ | `droxClientTools.ts`, `drox.exe` | — |
| Carte diff fichier **dans le fil** | ✅ | ✅ | `droxNativeFileChangeMarkdown.ts` | — |
| Undo/redo fichier **depuis le fil** | ✅ | 🟡 | `droxRunRevertService` | Renforcer UX natif (COMPARE E2) |
| Ask / permission modes | ✅ | ✅ | `droxAgentsPermissionModePicker` | — |
| Model picker + ctx stats | ✅ | ✅ | composer Drox, `droxNumCtx` | — |
| Phrases thinking / Working | Copilot | 🟡 | `droxThinkingPhrases`, `chatThinkingContentPart` | **P2** |
| Libellés « Copilot » (footers, hovers, compte) | Copilot | 🟡 | voir [§11](#11-branding--libellés-copilot--drox) | **P6** |
| Replay `.ui-replay.jsonl` | ✅ | 🟡 | `droxAgentsUiReplayHistory` | 📅 |
| Attachments images | ✅ | ❌ | — | 📅 (COMPARE E3) |
| Multi-chat par session | ✅ | ❌ | `supportsMultipleChats: false` | 📅 |

---

## 2. Sidebar droite — Changes & Files

| Surface | Copilot | Drox | Fichiers clés | Action |
|---------|:-------:|:----:|---------------|--------|
| Panneau **Changes** | ✅ | ❌ stub | `droxSessionsProvider` | **P6-A/B** |
| **Working Set** tree + diff | 🟡 partiel | ❌ | `baseSessionLayoutController` | **P6-C** |
| **Onglets unifiés** (file·terminal·browser) | Cursor | 🟡 editor only | panel terminal séparé | **P6-E** |
| Actions **Commit & Push** | ✅ Copilot | ❌ | toolbar Copilot | **P6-D** git natif |
| Changesets (branch / uncommitted / last turn) | ✅ | ❌ | `copilotChatSessionsChangesets.ts` | P3 minimal : 1 changeset session ; GitHub 📅 |
| Stats +/- par fichier | ✅ | ❌ | `ISessionFileChange` | **P3** |
| Onglet **Files** (artefacts session) | ✅ | 🔵 | sessions view | Smoke + brancher si vide |
| Lien PR / branch dans Changes | ✅ GitHub | ❌ | — | 🚫 ou 📅 |
| Undo depuis Changes | ✅ | ❌ | — | P3+ / `droxRunRevertService` |

**Note** : le diff est **visible dans le chat** mais pas agrégé pour la vue Changes — c’est un **wiring provider**, pas un manque de données moteur.

---

## 3. Barre titre fenêtre Agents

| Surface | Copilot | Drox | Fichiers clés | Action |
|---------|:-------:|:----:|---------------|--------|
| Terminal intégré | ✅ | 🔵 | sessions terminal contrib | Smoke |
| Toggle sidebar | ✅ | ✅ | — | — |
| **Antenne** « Allow remote session access » | ✅ | 🚫 encore visible | `toggleRemoteConnectionsActionViewItem.ts`, `chat.remoteAgentHosts.enabled` | **P4** |
| Connexion SSH / dev tunnel hosts | ✅ | 🚫 | `remoteAgentHost.contribution.ts`, `tunnelAgentHost.contribution.ts` | **P4** default off |
| Picker workspace / dossiers récents | ✅ | ✅ | `sessionWorkspacePicker`, MRU Drox | — |

---

## 4. Agent Customizations (écran dédié)

| Section | Copilot | Drox harness | Action |
|---------|:-------:|:--------------:|--------|
| **Overview** | ✅ | ✅ | — |
| **Agents** (personas `.md`) | `.github/agents`, `.claude/agents` | 🟡 harness + picker Copilot | **P5** → `.drox/agents` |
| **Skills** | multi-root | 🟡 `.drox/skills`, `~/.drox/skills` | Smoke contenu réel |
| **Instructions** | Copilot rules | 🟡 `DROX.md`, `MEMORY.md`, `.drox/rules` | Smoke |
| **MCP Servers** | UI Copilot registry | ❌ galerie vide | `mcpListWidget.ts` · [MCP-MARKETPLACE-DROX.md](MCP-MARKETPLACE-DROX.md) | **P7** |
| **Plugins** | ✅ | 🚫 masqué | OK |
| **Tools** (Copilot marketplace) | ✅ | 🚫 masqué | OK |
| **Hooks** | `.github/hooks` | 🚫 masqué | OK |
| Bouton Generate | ✅ | 🚫 `hideGenerateButton` | OK |
| Picker création (`.claude` / `.github`) | ✅ | ❌ incohérent | **P5** filtrer pour session Drox |

**Fichiers** : `droxCustomizationHarness.ts`, `promptFileLocations.ts`, `customizationCreatorService.ts`

---

## 5. Éditeur IDE (hors fenêtre Agents)

| Surface | Copilot | Drox | Action |
|---------|:-------:|:----:|--------|
| Chat natif panneau IDE | ✅ | ✅ | `DroxNativeChatViewPane`, `droxIdeChatViewRoute` |
| Webview legacy chat | ✅ | 🚫 masquée default | flag `drox.ideLegacyWebviewChat.enabled` |
| Reset workspace UI | webview ✅ | ❌ natif | **P1** |
| Panneau Changes IDE | 🔵 | ❌ | Partage P3 si même provider |
| Sign-in Copilot title bar | ✅ | 🚫 | `droxMicrosoftAgentsSurfaceContribution` |
| Barre Agents unifiée Copilot | ✅ | 🚫 | idem |

---

## 6. Intégrations GitHub / CI (vestiges)

| Surface | Copilot | Drox | Action |
|---------|:-------:|:----:|--------|
| Session liée à repo GitHub | ✅ | ❌ | 🚫 / 📅 |
| PR creation depuis session | ✅ | ❌ | 🚫 |
| CI checks sidebar | ✅ | ❌ | 🚫 |
| Checkpoints Git refs | ✅ | ❌ | Lié P3 si un jour |

Ces flux supposent **Copilot + GitHub** ; Drox self-hosted (Ollama, etc.) n’a pas d’équivalent — **masquer** plutôt que laisser des UI mortes.

---

## 7. Provider Drox — stubs connus

```typescript
// src/vs/sessions/contrib/providers/drox/browser/droxSessionsProvider.ts
readonly changes = constObservable([]);
readonly changesets = constObservable([]);
```

Autres champs session déjà alimentés : titre, workspace, modèle, statut, liste chats, envoi requête.

---

## 8. Plan d’action par version

| Version | Items |
|---------|-------|
| **1.5.12** | P1 reset · P2 phrases · P3 Copilot→Drox · P4 MCP spec · P5 browser ✅ |
| **1.5.13+** | **P6 Workspace Cursor** (phases A–E : changes, tree+diff, onglets unifiés, git composer) · MCP registry |

> Anciens libellés fusionnés dans **P6** : ex-P3 données, ex-P9 Changes enrichi, ex-P10 Commit composer, ex-P11 tree+diff, **onglets unifiés** (Phase E).
| **Long terme** | Parité COMPARE E1–E12 · retrait webview |

---

## 9. Smoke checklist audit (à cocher)

- [ ] Run modifie fichier → **Changes** peuplé (**P6-A**)
- [ ] Onglets multiples (terminal + fichier + browser) — **P6-E**
- [ ] Composer Commit & Push — **P6-D**
- [ ] Antenne remote off · `.drox/agents` · pas de « Copilot » visible (**P3**)

---

## 11. Branding — libellés Copilot → Drox

**Pilier PLAN** : **P3-c** (branding)

Objectif : zéro mention Copilot **visible** quand l’utilisateur travaille avec le moteur Drox (session provider `drox`, surfaces Microsoft off).

### Déjà OK

| Élément | Valeur Drox |
|---------|-------------|
| Product name | Drox IDE |
| Provider label | Drox |
| Customizations title | Agent Customizations for **Drox** |
| Permission modes | Planifier / Trust Edit / I'm Not Crazy |
| Thinking phrases (pool) | `droxThinkingPhrases` |

### Résidus connus (à traiter en P6)

| Priorité | Zone | Texte type | Fichier |
|:--------:|------|------------|---------|
| Haute | Statut run | Working / Finished Working | `chatThinkingContentPart.ts` (→ P2) |
| Haute | Footer welcome | « … Copilot may show public code … » | `sessionsSetUpService.ts` |
| Haute | Disclaimer chat | « By continuing with … Copilot » | `chatWidget.ts` |
| Moyenne | Permissions hover | « Copilot asks before running tools » | `agentHostPermissionPickerDelegate.ts` |
| Moyenne | Barre compte | Copilot Unavailable / quota | `accountTitleBarState.ts` |
| Basse | Upgrade modèle | Upgrade to GitHub Copilot Pro | `chatModelPicker.ts` (masquer si MS off) |
| Basse | Erreurs quota | messages Copilot Pro | `chatErrorMessages.ts` |
| Basse | Tools customizations | « Copilot CLI » | `toolsListWidget.ts` (section masquée harness) |

### Méthode inventaire

```bash
# Chaînes localisées contenant Copilot (sessions + chat UI)
rg "localize\\([^)]*Copilot" src/vs/sessions src/vs/workbench/contrib/chat/browser --glob "*.ts"
```

Pour chaque hit : **masquer**, **remplacer par `{providerName}`**, ou **brancher texte Drox** selon que la surface est atteignable en session Drox.

---

## 10. Fichiers de référence

| Domaine | Copilot | Drox |
|---------|---------|------|
| Sessions provider | `copilotChatSessionsProvider.ts` | `droxSessionsProvider.ts` |
| Changesets | `copilotChatSessionsChangesets.ts` | — (à créer) |
| File change fil | upstream | `droxFileChangeProgress.ts` |
| Harness customizations | default | `droxCustomizationHarness.ts` |
| Chemins prompts | `promptFileLocations.ts` | + `.drox/*` |
| Remote / tunnel | `remoteAgentHost/**` | **P4** off |
| Masquage MS | — | `droxMicrosoftAgentsSurfaceContribution.ts` |
| Branding libellés | chaînes upstream | **P6** · `defaultChatAgent.provider.default.name` |
