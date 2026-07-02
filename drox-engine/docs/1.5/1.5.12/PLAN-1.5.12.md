# Plan 1.5.12 — Polish natif + workspace Cursor

**Version** : juin 2026 · **Base** : [1.5.11](../1.5.11/PLAN-1.5.11.md) livrée  
**Branche** : `1.5.12` · tag **`v1.5.12`**

---

## En une phrase

Rattraper les **coquilles 1.5.11** (reset, voix Drox, rebrand, surfaces Copilot off) **et** livrer la **fenêtre Agents façon Cursor** : changements branchés, onglets unifiés (fichier · terminal · browser · …), tree + diff, commit depuis le composer, marketplace MCP curated OSS.

---

## Vue d’ensemble

| # | Pilier | Version | Effort | Statut |
|---|--------|---------|--------|--------|
| **P1** | Reset workspace `.drox/` | **1.5.12** | faible | **✅** |
| **P2** | Phrases geek / cinéma (anti « Working ») | **1.5.12** | faible | **✅** |
| **P3** | Remote off · customizations `.drox` · branding Drox | **1.5.12** | faible–moyen | **✅** |
| **P4** | Marketplace MCP OSS (curated) | **1.5.12** | moyen | **P4-1/2 ✅** · P4-3 run `mcp__*` ⏳ |
| **P5** | Open in Browser (title bar) | **1.5.12** | **fait** | **✅** |
| **P6** | **Workspace Cursor** (changes · onglets · tree · git) | **1.5.12** | large | **A–E2/E3 ✅** · D/E6 code · smoke ⏳ |
| **P7** | Fiabilisation installateur Windows (artefacts télémétrie/Copilot) | **1.5.12** | moyen | **code ✅** · smoke install ⏳ |
| **P8** | Purge références Copilot / Anthropic / Microsoft | **1.5.12+** | large | ⏳ planifié |

Docs détaillés : [AUDIT](AUDIT-COPILOT-AGENTS-WINDOW.md) · [MCP](MCP-MARKETPLACE-DROX.md) · [COMPARE](../1.5.11/COMPARE-WEBVIEW-VS-NATIF.md) · P7 install Windows ci-dessous

---

## P1 — Reset workspace ✅ (code)

**Objectif** : « Reset Drox data for this workspace » dans le chat **natif** (IDE + Agents), comme la webview.

| # | Tâche | Statut |
|---|--------|--------|
| 1 | Helper partagé `confirmAndResetDroxWorkspace` (`droxChatWorkspaceReset`, `droxWorkspaceResetFs`) | ✅ (existant webview · réutilisé) |
| 2 | Action UI natif IDE + fenêtre Agents (`drox.nativeChat.resetWorkspace`, `droxNativeChatViewPane`) | ✅ |
| 3 | Vider MRU `droxSharedChatSessionHistory` · bloquer si run actif | ✅ |
| 4 | Smoke IDE natif + fenêtre Agents | ✅ |

**Réf.** webview : `04-history.js`, `droxChatTabsManager.resetWorkspaceDroxData()`

---

## P2 — Phrases Drox ✅ (code)

**Objectif** : plus de « Working » / « Finished Working » — pool `droxThinkingPhrases` aussi dans le **header** thinking.

| # | Tâche | Statut |
|---|--------|--------|
| 1 | Titre repliable ≠ « Working » quand `mode: replace` (`chatThinkingContentPart.ts`) | ✅ |
| 2 | Smoke IDE natif + fenêtre Agents | ✅ |

---

## P3 — Surfaces Copilot → Drox (1.5.12) ✅ (code)

Trois sujets courts, même release.

### P3-a — Antenne remote (ex-P4) ✅

- [x] Default `chat.remoteAgentHosts.enabled: false` (`droxProductDefaultsConfiguration` + `droxMicrosoftAgentsSurfaceContribution`)
- [x] Plus de bouton *Allow remote session access* visible
- [x] Smoke : antenne absente en UI

### P3-b — Customizations (ex-P5) ✅

- [x] Chemins agent : **`.drox/agents`** (`promptFileLocations.ts`) · retirer `.github` du harness
- [x] Audit complet → [AUDIT-COPILOT-AGENTS-WINDOW.md](AUDIT-COPILOT-AGENTS-WINDOW.md)

### P3-c — Branding (ex-P6) ✅ (code)

- [x] Remplacer « Copilot » en dur par `product.defaultChatAgent.provider.default.name` (« Drox ») — footers `sessionsSetUpService`, `chatWidget`
- [x] Smoke : parcours nominal sans « GitHub Copilot » visible (quota/upgrade MS, permission picker)

→ Installateur Windows (erreur NSIS OpenTelemetry) : voir **[P7](#p7--installateur-windows)**.

---

## P4 — Marketplace MCP

**Objectif** : catalogue **curated OSS** pour l’écran MCP (aujourd’hui *No MCP servers available*) — pas le registry Copilot.

→ Spec complète : **[MCP-MARKETPLACE-DROX.md](MCP-MARKETPLACE-DROX.md)** · brainstorm [#16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)

| Phase | Livrable | Statut |
|-------|----------|--------|
| **P4-0** | Spec + PLAN validés | ✅ |
| **P4-1** | `product.mcpGallery` · registre `drox-engine/mcp-registry/v0.1/servers` (5 entrées OSS) · résolution embarquée `DroxMcpGalleryManifestService` · packaging gulp | ✅ |
| **P4-2** | Marketplace non vide dans Customizations · install smoke (ex. filesystem → `.mcp.json`) | ✅ |
| **P4-3** | Run Drox : outils `mcp__*` visibles si `drox.tools.mcp.enabled` | ⏳ |
| **P4-4** | Gouvernance ops documentée (README registre) | ✅ |

---

## P5 — Open in Browser ✅

Action `agentSession.openInBrowser` · globe à côté du terminal · `runScriptAction.ts` — **livré**.

---

## P6 — Workspace Cursor

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

### Phase A — Données changements (prérequis) 🟡 partiel

Brancher `droxSessionsProvider` : accumulateur depuis `droxFileChangeProgress` / sink → `ISessionFileChange[]` + changeset « session ».

- [x] Observables `changes` / `changesSummary` (plus stub vide)
- [x] `_hydrateSessionChanges()` depuis `readUiReplay` + messages `fileChange` · après chaque run
- [x] Changeset par défaut `droxSessionChangesets.ts` (le panneau lit `changesets`, pas `session.changes` direct)
- [x] Bridge live `fileChange` pendant le run (`droxSessionChangesBridge`)
- [x] **Done A** : panneau Changes et stats non vides après un run (smoke UI)

### Phase A2 — Diff inline style Cursor (panneau Changes Drox) ✅ (code)

**Objectif** : dans l’onglet **Changes** à droite, afficher le **contenu modifié** comme Cursor — pas seulement la liste de fichiers.

**Comportement UI (réf. captures Cursor)** :

| Élément | Détail |
|---------|--------|
| Résumé global | `N Uncommitted Changes` + stats `+X −Y` en tête de panneau |
| Carte par fichier | En-tête : chemin relatif, `+a −d` |
| Corps diff | Diff **unifié vertical** : lignes `+` vert, `−` rouge, contexte neutre |
| Séparateurs | Barres cliquables **`N unmodified lines`** entre hunks — lignes inchangées repliées, dépliables au clic |
| Scope | Sessions **provider Drox** uniquement ; les sessions Copilot/git gardent le tree MS existant |

**Implémentation** :

| Fichier | Rôle |
|---------|------|
| `droxSessionChangesDetailService.ts` | Stocke `IDroxFileChangePayload` (diff + contenu) par session / fichier |
| `droxChangesDiffDisplay.ts` | Parse diff unifié → lignes + blocs repliés |
| `droxChangesInlineDiffWidget.ts` + CSS | Widget scrollable dans `ChangesViewPane` |
| `changesView.ts` | Bascule tree MS ↔ widget Drox selon `providerId === 'drox'` |
| `droxSessionsProvider.ts` | Alimente le detail service (replay + live) |

- [x] Code livré
- [x] Smoke : diff visible avec séparateurs après run agent · fil rechargé au reopen · clic fichier → éditeur · Clean/dismiss

### Phase B — Panneau Changes enrichi ✅ (code)

Stats globales (`N files · +X −Y`), liste fichiers avec badges A/M/D, fusion Git uncommitted si repo, bouton **Open all** → multi-diff editor.

| Fichier | Rôle |
|---------|------|
| `droxSessionGitChanges.ts` | `loadDroxGitUncommittedChanges`, `mergeDroxSessionFileChanges`, `countDroxSessionFileChangeStats` |
| `droxSessionsProvider.ts` | Sync async merged changes + `autorun` sur `uncommittedChanges` Git |
| `droxSessionChangesets.ts` | Label « Session & Workspace Changes » |
| `droxChangesInlineDiffWidget.ts` | Résumé stats, liste fichiers, Open all, refresh sur `onDidChangeSessions` |
| `droxChangesInlineDiff.css` | Styles liste fichiers + bouton Open all |

- [x] Code livré · compile OK
- [ ] Smoke : stats + liste fusionnée (agent + git) · Open all multi-diff · clic ligne fichier

### Phase C — Tree + diff éditeur 🟡 partiel

Clic carte / lien fichier dans le fil → reveal editor part · tree session-scoped (badges **M**) · diff live (snapshots `.drox/diff-snapshots/`).

- [x] `beforeSnapshotUri` dans payload + agrégation `originalUri`
- [x] `openDroxSessionFileChange` : reveal editor part + diff side-by-side + sidebar session (badges A/M/D)
- [x] Commande `workbench.action.droxOpenSessionFile` (fil chat + panneau Changes)
- [x] Enrichissement snapshots au replay `.ui-replay.jsonl`
- [ ] Smoke : clic fil + Changes → diff modal + navigation fichiers
- [x] Tree session dans explorer aux bar (badge **M/A/D** sur fichiers modifiés) — `droxSessionExplorerDecorations.ts`

### Phase D — Git dans le composer 🟡 (code)

Pill **Changes** + split **Commit & Push** (Commit · Commit & Push · Create PR si `gh`) — `IDroxSessionGitService` (git CLI local), pas `github.copilot.sessions.*`.

| Fichier | Rôle |
|---------|------|
| `droxSessionGitService.ts` | Interface + implélectron (`AgentHostGitService`) |
| `droxSessionGitComposerActions.ts` | Actions Commit / Commit & Push · submenu `Menus.SessionHeaderMeta` |
| `droxCoreSingletons.ts` | Register singleton |

- [x] Code livré (Commit + Commit & Push)
- [ ] Create PR via `gh` (optionnel)
- [ ] Smoke : bouton meta row · commit · push · pill Changes disparaît

### Phase E — Onglets unifiés (Session Page Model)

**Principe** : terminal, browser, changes, fichiers = **mêmes onglets** dans l’editor part (pas panel terminal séparé en prod Cursor-like).

| # | Tâche |
|---|--------|
| E1 | Spec `ISessionPage` / editor inputs : File, Terminal, Browser, Changes, *(extensible)* |
| E2 | Menu **+** pour ouvrir un nouveau onglet par type |
| E3 | Migrer terminal session : panel → onglet terminal — **🟡 slice 1 code** |
| E4 | Browser : onglet `simpleBrowser` / `BrowserEditorInput` (lien **P5** title bar) |
| E5 | Changes : onglet embarqué ou focus vue Changes existante |
| E6 | Working set session : persistance onglets par session (`IEditorWorkingSet` existant) — **🟡 slice** `SessionTerminalViewController` |
| E7 | Open Browser title bar → onglet `BrowserEditorInput` (pas `simpleBrowser`) — **✅ code** |

- [x] E3 slice 1 : `ensureTerminal` → onglet `TerminalEditorInput` · toggle title bar · tasks agent host
- [x] E2 : menu **+** multi-onglets (File · Terminal · Browser · Changes)
- [x] E6 slice : `SessionTerminalViewController` — associe onglets terminal restaurés à la session (working set)
- [ ] Smoke E3/E6 : terminal en onglet · switch session · archive · restore working set

**Done P6** : plusieurs onglets hétérogènes côte à côte ; clic fichier chat → tree + diff ; commit depuis composer ; base pour futures pages (Canvas, etc.).

**Ordre recommandé** : A → B → C → E3/E2 → D → E reste

---

## P7 — Installateur Windows

**Objectif** : plus d’échec à l’installation / mise à jour sur Windows à cause d’artefacts Copilot / télémétrie dans le bundle.

### Symptôme observé

L’installateur NSIS affiche une erreur du type **« impossible de renommer un fichier »** sur des chemins sous :

```text
extensions/copilot/node_modules/@opentelemetry/*
```

Popup typique : *Recommencer / Ignorer / Annuler l’installation* — l’install échoue ou laisse un état incohérent.

### Cause probable

- Désactivation / suppression de la télémétrie Copilot dans le build Drox, mais **fichiers ou dossiers encore référencés** dans le manifeste du package (liste NSIS, script uninstall, ou copie post-build).
- Modules OpenTelemetry **orphelins** : présents dans l’arborescence source ou le cache de build, absents ou partiellement supprimés au moment où NSIS tente rename/delete.
- Conflit **upgrade** : ancienne install verrouille des DLL sous `Program Files` ou `%LOCALAPPDATA%` pendant que le nouvel installateur tente de les remplacer.

### Piste de correction

| # | Tâche |
|---|--------|
| 1 | Auditer la **composition du package** Windows : quels fichiers sous `extensions/copilot/node_modules/@opentelemetry/` sont réellement copiés dans `out/` / artefact release |
| 2 | Si télémétrie désactivée : **exclure** `@opentelemetry/*` du bundle (pas seulement runtime off) — pas d’entrée NSIS pour des fichiers inexistants |
| 3 | Vérifier scripts **post-install / uninstall** Copilot ou Drox qui touchent encore ces chemins |
| 4 | Nettoyer le pipeline release (pas de `node_modules` résiduels copiés depuis `extensions/copilot` sans filtre) |
| 5 | Smoke **install neuve** + **upgrade** sur Windows (profil utilisateur), sans popup d’erreur |

### Critère done (P7)

- Installateur Windows : plus d’erreur de renommage sur `extensions/copilot/node_modules/@opentelemetry/*`
- Install neuve et upgrade OK sur machine de test Windows

### Correctif code (juillet 2026)

- `build/.moduleignore` : exclusion globale `@opentelemetry/**` (bundle desktop + `extensions/copilot`)
- `droxProductDefaultsConfiguration` : `github.copilot.chat.otel.enabled` = false · `workbench.enableExperiments` = false

---

## P8 — Purge Copilot / Anthropic / Microsoft

**Objectif** : aucune dépendance, télémétrie externe ni texte utilisateur pointant vers Copilot, Anthropic ou Microsoft — sauf remplacement explicite par **Drox** quand la fonctionnalité est conservée.

### Périmètre

| Zone | Action |
|------|--------|
| **Packages install** | Exclure modules inutiles (OTel, experimentation, auth MS) du bundle release ; pas de téléchargement marketplace Copilot par défaut |
| **Runtime UI** | Texte « Copilot » → « Drox » ; masquer sign-in / tunnel / agents Microsoft (déjà partiel via P3) |
| **Télémétrie** | `telemetry` off · OTel Copilot off · pas d’export App Insights / OTLP |
| **Serveurs externes** | Pas d’appels dev tunnels, experimentation, gallery Copilot, endpoints Anthropic/Microsoft sauf opt-in explicite |
| **Build / CI** | Pipelines `product-copilot.yml` hors release Drox ; audit `product.json` |

### Ordre recommandé

1. **Release bundle** (P7 + `.moduleignore` + defaults config) — en cours
2. **UI strings** — grep `Copilot` / `GitHub` / `Microsoft` / `Anthropic` dans `src/vs/workbench/contrib/drox` et `src/vs/sessions`
3. **Extensions built-in** — réduire surface `extensions/copilot` au strict moteur agent si possible
4. **Smoke** — install neuve · fenêtre Agents · aucun lien MS dans About / Help

### Critère done (P8)

- Installateur et app Drox sans modules OTel / experimentation dans le package
- Aucun texte « Copilot » visible en usage normal Drox (Agents + chat natif)
- Pas de connexion réseau MS/Anthropic sans action utilisateur explicite

---

## État d'avancement

| Pilier | Statut |
|--------|--------|
| P1 Reset | **✅** |
| P2 Phrases | **✅** |
| P3 Copilot→Drox | **✅** |
| P4 MCP | **P4-1/2 ✅** · P4-3 run `mcp__*` ⏳ |
| P5 Browser | **✅** |
| P6 Workspace Cursor | **A–B + E2/E3/E6 slice ✅** · D code · C partiel · smoke ⏳ |
| P7 Install Windows | **code ✅** (`@opentelemetry` exclu) · smoke install ⏳ |
| P8 Purge MS/Copilot | ⏳ planifié (voir section P8) |

---

## Critères d'acceptation (1.5.12)

- [x] Reset natif IDE + Agents (`droxNativeChatViewPane`, MRU, blocage run) — smoke ✅
- [x] Phrases Drox dans le fil (`chatThinkingContentPart`) — smoke ✅
- [x] Antenne remote off · agents `.drox/agents` · footers sans « Copilot » — smoke ✅
- [x] P5 Browser title bar OK
- [x] Marketplace MCP : catalogue non vide · install smoke (P4-2) ✅
- [ ] Outils `mcp__*` visibles au run Drox (P4-3)
- [x] Changes peuplé après run agent · diff inline · reopen fil (P6-A/A2) ✅
- [x] Stats `N files · +X −Y` · liste fusionnée agent+git · Open all multi-diff (P6-B code) ✅
- [x] Composer : Commit & Push git local (P6-D code) — smoke ⏳
- [x] Terminal / browser / fichier en **onglets** (+ menu E2 · E6 slice) — smoke ⏳
- [x] Installateur : exclusion `@opentelemetry/*` du bundle (P7 code) — smoke install ⏳
- [ ] Purge Copilot / MS / Anthropic (P8)
- [ ] Pas de régression E2E 1.5.11 · ship OR `v1.5.12`

---

## Retours smoke

### Session 2026-07-02 (correctifs)

Tests depuis la **fenêtre Agents** sur workspace externe (`site-kidds`).

| Point | Observation | Correctif |
|-------|-------------|-----------|
| **P1 Reset** | Commande introuvable · erreur `service accessor is only valid during…` | `drox.agents.resetWorkspace` ; services capturés avant `await` dialog |
| **P2 Phrases** | Toujours « Considering », « Analyzing » au 1er message | `agentsWindow.default` + `registerDefaultConfigurations` pour `chat.agent.thinking.phrases` ; filtre labels Copilot génériques en mode `replace` |
| **P6 Changes** | Panneau vide / liste seule sans diff inline | Changesets + bridge live + **diff inline Cursor (phase A2)** |
| **P4 / P5** | OK (marketplace MCP, browser) | — |
| **P7** | Installateur non testé | — |

### Validation smoke (juillet 2026) — **✅ coché**

P1 · P2 · P3 · P4-2 · P5 · P6-A/A2 (Changes, diff, reopen fil, clic fichier, Clean/dismiss).

**Prochaine étape** : smoke **P6-D** · **P6-E6** · **P7 install** · démarrer **P8** (audit UI strings).

---

## Liens

- [README 1.5.12](README.md)
- [AUDIT Copilot vs Drox](AUDIT-COPILOT-AGENTS-WINDOW.md)
- [MCP Marketplace Drox](MCP-MARKETPLACE-DROX.md)
