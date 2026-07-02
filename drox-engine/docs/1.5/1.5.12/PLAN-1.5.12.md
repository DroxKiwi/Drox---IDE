# Plan 1.5.12 — Polish natif + vision workspace Cursor

**Version** : juin 2026 · **Base** : [1.5.11](../1.5.11/PLAN-1.5.11.md) livrée  
**Branche** : `1.5.12` · tag **`v1.5.12`**

---

## En une phrase

Rattraper les **coquilles 1.5.11** (reset, voix Drox, rebrand, surfaces Copilot off), puis préparer la **fenêtre Agents façon Cursor** : changements branchés, onglets unifiés (fichier · terminal · browser · …), tree + diff, commit depuis le composer.

---

## Vue d’ensemble

| # | Pilier | Version | Effort |
|---|--------|---------|--------|
| **P1** | Reset workspace `.drox/` | **1.5.12** | faible |
| **P2** | Phrases geek / cinéma (anti « Working ») | **1.5.12** | faible |
| **P3** | Remote off · customizations `.drox` · branding Drox | **1.5.12** | faible–moyen |
| **P4** | Marketplace MCP OSS (cadrage) | spec **1.5.12** · impl 1.5.13+ | doc |
| **P5** | Open in Browser (title bar) | **1.5.12** | **fait** |
| **P6** | **Workspace Cursor** (changes · onglets · tree · git) | **1.5.13+** | large |

Docs détaillés : [AUDIT](AUDIT-COPILOT-AGENTS-WINDOW.md) · [MCP](MCP-MARKETPLACE-DROX.md) · [COMPARE](../1.5.11/COMPARE-WEBVIEW-VS-NATIF.md)

---

## P1 — Reset workspace

**Objectif** : « Reset Drox data for this workspace » dans le chat **natif** (IDE + Agents), comme la webview.

| # | Tâche |
|---|--------|
| 1 | Helper partagé `confirmAndResetDroxWorkspace` (`droxChatWorkspaceReset`, `droxWorkspaceResetFs`) |
| 2 | Action UI natif IDE + fenêtre Agents |
| 3 | Vider MRU `droxSharedChatSessionHistory` · bloquer si run actif |

**Réf.** webview : `04-history.js`, `droxChatTabsManager.resetWorkspaceDroxData()`

---

## P2 — Phrases Drox

**Objectif** : plus de « Working » / « Finished Working » — pool `droxThinkingPhrases` aussi dans le **header** thinking.

| # | Tâche |
|---|--------|
| 1 | Titre repliable ≠ « Working » quand `mode: replace` (`chatThinkingContentPart.ts`) |
| 2 | Smoke IDE natif + fenêtre Agents |

---

## P3 — Surfaces Copilot → Drox (1.5.12)

Trois sujets courts, même release.

### P3-a — Antenne remote (ex-P4)

- Default `chat.remoteAgentHosts.enabled: false` (`droxProductDefaultsConfiguration` + `droxMicrosoftAgentsSurfaceContribution`)
- Plus de bouton *Allow remote session access* visible

### P3-b — Customizations (ex-P5)

- Chemins agent : **`.drox/agents`** (`promptFileLocations.ts`) · retirer `.github` du harness
- Audit complet → [AUDIT-COPILOT-AGENTS-WINDOW.md](AUDIT-COPILOT-AGENTS-WINDOW.md)

### P3-c — Branding (ex-P6)

- Remplacer « Copilot » en dur par `product.defaultChatAgent.provider.default.name` (« Drox »)
- Cibles : footers (`sessionsSetUpService`, `chatWidget`), masquer quota/upgrade MS, permission picker Drox only
- Smoke : parcours nominal sans « GitHub Copilot » visible

---

## P4 — Marketplace MCP

**Objectif** : catalogue **curated OSS** pour l’écran MCP (aujourd’hui *No MCP servers available*) — pas le registry Copilot.

→ Spec complète : **[MCP-MARKETPLACE-DROX.md](MCP-MARKETPLACE-DROX.md)** · brainstorm [#16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)

**1.5.12** : spec validée · **1.5.13** : `product.mcpGallery.serviceUrl` + registre hébergé

---

## P5 — Open in Browser ✅

Action `agentSession.openInBrowser` · globe à côté du terminal · `runScriptAction.ts` — **livré**.

---

## P6 — Workspace Cursor (1.5.13+)

**Vision** : la zone droite de la fenêtre Agents se comporte comme **Cursor** — une seule expérience cohérente, extensible pour de futures idées.

### Architecture cible

```text
┌──────────────── Chat Drox ────────────────┬── Zone workspace (editor part) ──┐
│  [ Changes +N −M ]  [ Commit & Push ▾ ]   │  [>_ ps] [>_ watch] [PLAN.md] [+]│
│  ┌─────────────────────────────────────┐  │  ┌──────┬──────────────────────┐ │
│  │ Composer                            │  │  │ Tree │ Tab active (diff,    │ │
│  └─────────────────────────────────────┘  │  │      │ terminal, browser…)  │ │
└───────────────────────────────────────────┴──┴──────┴──────────────────────┘
```

Menu **+** (comme Cursor) : **File** · **Terminal** · **Browser** · **Changes** · *(Canvas, … futur)*  
→ Chaque type = **onglet** dans le même strip ; **plusieurs onglets du même type** (ex. 2× PowerShell, fichier + terminal).

### Existant Agents à réutiliser

| Brique | Rôle aujourd’hui | Écart Cursor |
|--------|------------------|--------------|
| `baseSessionLayoutController` | Working set éditeur par session | Terminal encore dans **Panel** bas |
| `changesView.ts` | Liste Changes (aux bar) | Vide pour Drox · pas onglet |
| `SessionsExplorerView` | Files workspace complet (aux bar) | Pas tree session dans editor |
| `droxSessionsProvider` | `changes = []` stub | Pas de données |
| Editor part | Onglets fichiers, révélé au besoin | Pas terminal/browser en onglet |

### Phase A — Données changements (prérequis)

Brancher `droxSessionsProvider` : accumulateur depuis `droxFileChangeProgress` / sink → `ISessionFileChange[]` + changeset « session ».

**Done A** : panneau Changes et stats non vides après un run.

### Phase B — Panneau Changes enrichi

Stats globales (`10 files · +918 −33`), liste + diff au clic, fusion git uncommitted si repo. Réutiliser `changesView.ts` / multi-diff resolver.

### Phase C — Tree + diff éditeur

Clic carte / lien fichier dans le fil → reveal editor part · tree session-scoped (badges **M**) · diff live (snapshots `.drox/diff-snapshots/`).

### Phase D — Git dans le composer

Pill **Changes** + split **Commit & Push** (Commit · Commit & Push · Create PR si `gh`) — `IGitService`, pas `github.copilot.sessions.*`.

### Phase E — Onglets unifiés (Session Page Model)

**Principe** : terminal, browser, changes, fichiers = **mêmes onglets** dans l’editor part (pas panel terminal séparé en prod Cursor-like).

| # | Tâche |
|---|--------|
| E1 | Spec `ISessionPage` / editor inputs : File, Terminal, Browser, Changes, *(extensible)* |
| E2 | Menu **+** pour ouvrir un nouveau onglet par type |
| E3 | Migrer terminal session : panel → onglet terminal (garder `SessionsTerminalContribution` logique cwd) |
| E4 | Browser : onglet `simpleBrowser` / `BrowserEditorInput` (lien **P5** title bar) |
| E5 | Changes : onglet embarqué ou focus vue Changes existante |
| E6 | Working set session : persistance onglets par session (`IEditorWorkingSet` existant) |
| E7 | P8 Open Browser → ouvre/focus onglet browser (pas seulement commande loose) |

**Done P6** : plusieurs onglets hétérogènes côte à côte ; clic fichier chat → tree + diff ; commit depuis composer ; base pour futures pages (Canvas, etc.).

**Ordre recommandé** : A → B → C → E3/E2 → D → E reste

---

## État d'avancement

| Pilier | Statut |
|--------|--------|
| P1 Reset | ouvert |
| P2 Phrases | ouvert |
| P3 Copilot→Drox | ouvert |
| P4 MCP | spec ok |
| P5 Browser | **fait** |
| P6 Workspace Cursor | ouvert (1.5.13+) |

---

## Critères d'acceptation

### 1.5.12

- [ ] Reset natif IDE + Agents (`.drox/` sauf `.env`, historique vide)
- [ ] Phrases Drox dans le fil (pas « Working »)
- [ ] Antenne remote absente · agents sous `.drox/agents` · pas de « Copilot » visible
- [ ] P5 Browser title bar OK · pas de régression E2E 1.5.11 · ship OR `v1.5.12`

### 1.5.13+ (P6)

- [ ] Changes peuplé après run agent
- [ ] Composer : pill Changes + Commit & Push (git local)
- [ ] Clic fichier → tree + diff
- [ ] Terminal / browser / fichier en **onglets** multiples (+ menu)

---

## Liens

- [README 1.5.12](README.md)
- [AUDIT Copilot vs Drox](AUDIT-COPILOT-AGENTS-WINDOW.md)
- [MCP Marketplace Drox](MCP-MARKETPLACE-DROX.md)
