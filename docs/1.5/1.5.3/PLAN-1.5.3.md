# Plan 1.5.3 — Diffs fil + UX utilisateur + splash phosphore

**Version** : juin 2026  
**Base** : [1.5.2](../1.5.2/PLAN-1.5.2.md) · moteur `tui_mono` · shim RPC  
**Branche** : `1.5.3`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **D1** Diffs fil + undo/redo | ✅ 100 % | — |
| **U1** Messages utilisateur | ✅ 100 % | — |
| **U2** Composer auto-grow | ✅ 100 % | — |
| **T1** Cadres commandes shell | ✅ 100 % | — |
| **TUI-1** Fil discussion style rétro (VT323) | ✅ 100 % | — |
| **W** Patch WORK UI (smoke fil) | ~98 % (W1–W4, W6 ✅ · W5 partiel · hotfixes strip/scroll) | non |
| **H** Historique / chargement sessions | Phase 1 ✅ · Phase 2 ✅ · H5 ✅ — H1–H3 reportés | non |
| **A1** Animation lancement IDE (boot phosphore) | reporté | non |
| **P2** Polish trays | 0 % | non |

**Hors scope ship 1.5.3** : release Linux → [1.5.4](../1.5.4/PLAN-1.5.4.md) · splash boot phosphore TUI (spec prête, non requis pour ce tag — splash **mise à jour** IDE déjà en place).

**Smoke WORK** : [PATCH-WORK-UI-1.5.3.md](PATCH-WORK-UI-1.5.3.md).

### Décisions & livrables session (juin 2026)

| Sujet | Décision |
|-------|----------|
| Option C (aperçu fichier avant écriture) | Abandonnée — cartes `fileChange` à `tool_finish` + undo/redo carte conservés |
| Edit & resend (type Cursor) | Hors scope — le dev commit manuellement |
| Bouton **Restore here** sur messages | Retiré de l’UI (backend `revertToMessage` conservé) |
| Hint commit | Au-dessus de chaque message user : *Commit regularly — the agent can make mistakes.* |
| Expand message user long | Inline dans le fil (plus de popup) |
| Style TUI fil (`TUI-1`) | Police VT323, phosphore terne, bords droits — fil + composer alignés au sash |
| A1 boot phosphore | Reporté — on ship avec l’existant (dont notification / splash **mise à jour**) |

---

## Objectif

| In | Hors scope 1.5.3 |
|----|-------------------|
| Diffs fichier visibles dans le fil chronologique | Release Linux `.deb` (**1.5.4**) |
| Undo / redo des edits agent dans le fil | Index / graphe repo |
| Copie rapide + style messages user | Refonte workbench VS Code |
| Composer qui grandit avec le texte | Nouveaux champs RPC moteur |
| **Cadres shell** (commande + sortie type Cursor) | Refonte workbench VS Code |
| **Style TUI** fil discussion (VT323, phosphore) | Splash boot phosphore IDE (**A1**, reporté) |
| Historique sessions (liste + rejeu UI) | Titres archives dérivés transcript (**H1**) |
| Animation de lancement IDE (splash phosphore TUI, spec `animation-start/`) | Signature Authenticode (**1.5.4**) |
| Configuration moteur sampling | — (livré **1.5.2** M1) |

---

## D1 — Diffs fichier dans le fil

Le moteur et les outils IDE produisent des diffs (`unifiedDiff`, event `fileChange`, `12-fileChange.js`). Intégration chronologique, état `applied` et undo/redo par carte sont en place.

### État actuel

| Couche | Fichiers | État |
|--------|----------|------|
| Outil `file_write` | `droxFileWriteTool.ts` | diff généré ✅ |
| Event webview | `host-message.js` → `fileChange` | handler ✅ |
| Rendu carte | `12-fileChange.js`, CSS `.msg-file-change` | fil P0 chronologie ✅ |
| Undo / redo carte | `droxChatFileChangeUndo.ts`, `droxRunRevertService.ts` | ✅ |
| Replay | `droxSessionReplay.ts`, `droxUiReplayExport.ts` | type `fileChange` ✅ |

### Checklist

- [x] **D1-1** — Monter `fileChange` dans `chronology.js` / fil P0 (ordre TUI)
- [x] **D1-2** — Afficher diff unifié repliable inline (`renderDiffLines`)
- [x] **D1-3** — Lier `applied: true/false` du `tool_finish` à l’état visuel
- [x] **D1-4** — **Undo** : revert fichier depuis la carte diff
- [x] **D1-5** — **Redo** : réappliquer le patch
- [x] **D1-6** — Undo stack session + smoke mutation fichier

**Critère** : run « modifie README » → diff dans le fil → undo restaure → redo réapplique.

---

## U1 — Interaction & style messages utilisateur

| # | Tâche | Détail | État |
|---|--------|--------|------|
| U1-1 | Icône **copier** sur chaque message user | clic → clipboard | ✅ |
| U1-2 | Refonte CSS bulle user | typo, padding, contraste | ✅ |
| U1-3 | Hover / focus accessibles | `droxChatMvp.css`, `stream/messages/user.js` | ✅ |
| U1-4 | Dépliage inline message long | clic sur texte tronqué → expand dans le fil (`viewer.js`) | ✅ |
| U1-5 | Hint commit discret | *Commit regularly — the agent can make mistakes.* au-dessus de chaque bulle | ✅ |
| — | ~~Restore here~~ | Bouton retiré (non fonctionnel) — pas d’edit & resend en 1.5.3 | ✅ retiré |

**Fichiers** : `stream/messages/user.js`, `stream/messages/viewer.js`, `droxChatMvp.css`, `host-message.js`.

---

## U2 — Composer auto-grow

| # | Tâche | Détail | État |
|---|--------|--------|------|
| U2-1 | Textarea composer : hauteur auto | min 2 lignes, max 12 puis scroll interne | ✅ |
| U2-2 | Recalcul saisie / paste / reset après envoi | `syncPromptInputHeight()` · `01-prompt.js` · bootstrap | ✅ |
| U2-3 | Layout sticky footer intact | `width: 100%` sur `.composer-input-frame` | ✅ |

**Fichiers** : `droxChatWebview.ts` (`rows="1"`), `settings/01-prompt.js`, `bridge/10-bootstrap.js`, `composer/payload.js`, `droxChatMvp.css`.

---

## T1 — Cadres commandes shell (type Cursor)

Afficher les appels outil **`bash`** (shell Windows PowerShell / Linux bash) dans un **cartouche dédié** : en-tête lisible, commande monospace avec préfixe `$`, sortie stdout/stderr dans le même cadre, badge exit code / erreur — plutôt que le bloc générique `<details class="msg-tool">` + JSON brut.

**Référence UX** : fil agent Cursor (capture : carte arrondie, titre action, commande, sortie inline).

### Impact moteur — faible (MVP sans changement Rust)

| Couche | Rôle | Changement 1.5.3 |
|--------|------|------------------|
| Moteur `tui_mono` | Émet `tool_start` / `tool_finish` pour `bash` | **Aucun** requis |
| Outil IDE `bash` | Exécute via `droxBashExec` · retour structuré | **Aucun** requis |
| Shim `droxChatAgentEvents.ts` | Relaye events vers webview | Optionnel : champ `shell` (`powershell` \| `bash`) dérivé de `process.platform` |
| Webview fil | Rendu carte shell | **Cœur du pilier** |

Le contrat existe déjà :

- **Entrée** (`tool_start`, `name: bash`) : `arguments.command`, optionnel `arguments.description`
- **Sortie** (`tool_finish`) : objet `{ command, exit_code, stdout, stderr, timed_out, duration_ms }` (pas seulement du texte libre — aujourd’hui affiché via `previewJson` dans `logTools.js`)

Parité TUI : le moteur formate déjà les lignes bash dans `drox-tui/src/view/bash_output.rs` (`format_bash_finish_lines`) — l’IDE peut **réimplémenter le même rendu en DOM/CSS** sans toucher au crate.

### Améliorations optionnelles (hors MVP)

| Sujet | Couche | Priorité |
|-------|--------|----------|
| Stream sortie pendant exécution (`tool_progress`) | Moteur + shim si pas déjà câblé pour `bash` IDE | P2 / 1.5.3+ |
| Libellé shell i18n (« PowerShell », « bash ») | IDE | T1-2 |
| Coloration syntaxique commande | IDE (CSS / tokenizer léger) | T1-4 optionnel |

### État actuel

| Couche | Fichiers | État |
|--------|----------|------|
| Event bridge | `droxChatAgentEvents.ts`, `tool-events.js`, `droxShellToolWire.ts` | bash routé ✅ |
| Rendu | `stream/tools/shellCard.js`, `logTools.js` | carte `.drox-shell-card` ✅ |
| Description | `droxToolPreview.ts` | verb + cible commande ✅ |
| Chronologie P0 | `chronology.js`, `overrides.js` | carte shell dans le fil ✅ |
| Replay | `droxSessionReplay.ts` | aligné *(smoke rechargement onglet)* |
| Exécution | `droxBashTool.ts`, `droxBashExec.ts` | stdout/stderr structurés ✅ |

### Checklist

- [x] **T1-1** — `createShellCommandCard` : header (icône terminal + `description` ou « Ran command »), corps `$ command`
- [x] **T1-2** — `finishShellCommandCard` : stdout / stderr séparés, troncature (seuils TUI ~24 lignes / 2k caractères), badge `exit N` / timeout / erreur
- [x] **T1-3** — CSS `.drox-shell-card` dans `droxChatMvp.css` (bordure, radius, fond, état `running` / `error`)
- [x] **T1-4** — Intégration fil P0 (`chronology.js`) + trays (`overrides.js`) : carte shell non noyée dans JSON
- [x] **T1-5** — Copier commande depuis le header
- [x] **T1-6** — Replay session : même rendu après rechargement onglet
- [x] **T1-7** — Smoke : `bash` ok / erreur / sortie longue

**Critère** : run agent avec `git status` ou `dir` → carte type Cursor dans le fil → sortie lisible sans JSON → état erreur visible si exit ≠ 0.

**Fichiers** : `stream/tools/shellCard.js`, `logTools.js`, `tool-events.js`, `droxShellToolWire.ts`, `droxToolPreview.ts`, `droxChatMvp.css`, `chronology.js`, `droxSessionReplay.ts`.

---

## TUI-1 — Style fil discussion (rétro phosphore)

Esthétique **TUI** sur le fil `#log` et le composer : police **VT323**, verts atténués + brun, coins droits, scanlines légères. Le contenu est **flush** au sash VS Code (pas de marge gauche parasite).

| # | Tâche | État |
|---|--------|------|
| TUI-1-1 | Feuille `droxChatThreadTui.css` + police locale | ✅ |
| TUI-1-2 | Chargement webview (`droxChatViewPane.ts`, CSP `font-src`) | ✅ |
| TUI-1-3 | Scope `#log` : bulles, phases, shell, diffs | ✅ |
| TUI-1-4 | Composer / plan sticky alignés (padding gauche 0) | ✅ |

**Fichiers** : `media/droxChatThreadTui.css`, `media/fonts/VT323-Regular.ttf`, `droxChatViewPane.ts`, `droxChatWebview.ts`.

---

## H — Historique & chargement sessions

Pilier ajouté en smoke 1.5.3 (doublons « Untitled » + rechargement fil vide).

### État actuel

| Couche | Fichiers | État |
|--------|----------|------|
| Liste moteur | `drox-session/src/list.rs` | exclut `*.ui-replay.jsonl` ✅ |
| Garde-fou IDE | `droxSession.ts` → `isListableDroxSessionId` | ✅ |
| Liste webview | `droxChatTabsManager.sendSessionsList` | filtre ids auxiliaires ✅ |
| Rejeu full | `DROX_CHAT_TAB_LOAD_FULL`, `droxChatController` (`webviewReady`) | ✅ |
| Journal UI | `droxUiReplayJournal.ts` — `state` exclu | ✅ |
| Reset workspace | `droxWorkspaceResetFs.ts`, `resetWorkspaceDroxData` | H5 ✅ |

### Checklist

- [x] **H-P0** — Exclure `*.ui-replay.jsonl` de `session.list` + garde-fou TS + `loadSession` rejette les ids auxiliaires
- [x] **H-P1** — Rejeu **full** journal UI au redémarrage (`webviewReady`) et chargement historique
- [x] **H5** — Reset workspace : purge `.drox/` côté IDE + rafraîchissement panneau SESSIONS
- [ ] **H1** — Titre historique archives : dériver du 1er message user (aujourd’hui titres = onglets ouverts uniquement)
- [ ] **H2** — Filtrer / regrouper sessions vides ou &lt; seuil taille
- [ ] **H3** — Clarifier UX : une « discussion » ≠ un seul `ses_*` si `session_end` entre cycles
- [ ] **H4** — *(1.5.3 : bouton Restore retiré ; edit & resend hors scope)*

**Critère Phase 1+2** : panneau SESSIONS sans doublons `ui-replay` · clic session → fil rechargé identique au live.

---

## A1 — Animation de lancement IDE (splash phosphore TUI)

**Statut 1.5.3** : **reporté** — spec et assets prêts ; pas requis pour le tag. L’IDE dispose déjà d’un flux **mise à jour** (notification / splash update). Le splash boot phosphore TUI reste documenté pour une itération ultérieure.

Reproduire à l’ouverture de l’IDE le **même splash** que le TUI au boot : halo phosphore vert, logo ASCII **DROX** (6 lignes), taglines, fond `#030704` — **52 frames × 50 ms ≈ 2,6 s** (source TUI : `drox-tui/src/ui/boot_splash.rs`).

**Spec livrée** : [`docs/animation-start/`](../../animation-start/) — prête à intégrer.

| Fichier | Rôle |
|---------|------|
| [drox-splash-spec.ts](../../animation-start/drox-splash-spec.ts) | `createDroxSplashController()` — DOM autonome, sans dépendance npm |
| [drox-phosphor-theme.json](../../animation-start/drox-phosphor-theme.json) | Couleurs + timing (miroir `boot_splash.rs`) |
| [drox-logo.ascii.txt](../../animation-start/drox-logo.ascii.txt) | Logo block ASCII |
| [VSCODE-FORK.md](../../animation-start/VSCODE-FORK.md) | Points d’accroche fork VS Code |
| [extract-splash-from-ide.ps1](../../animation-start/extract-splash-from-ide.ps1) | Scan splash existant → `reports/` |

### Comportement (aligné TUI)

| Phase | Progression | Effet |
|-------|-------------|--------|
| Apparition | 0 → 48 % | Dissolve entrant, halo radial vert |
| Palier | 48 → 68 % | Logo plein phosphore, tagline |
| Sortie | 68 → 100 % | Fade out, suppression overlay |

- **Taglines** : « Initialisation… » puis « Agent local · terminal » (i18n FR/EN — voir `drox-phosphor-theme.json`)
- **Compact** : fenêtre &lt; 480 px → texte `DROX` au lieu du block ASCII
- **Workbench en parallèle** : splash décoratif ; `stop()` si session prête avant la fin

### État actuel

| Couche | Fichiers | État |
|--------|----------|------|
| TUI | `boot_splash.rs` | ✅ référence implémentée |
| Spec portage | `animation-start/*` | ✅ doc + TS + tokens JSON |
| IDE workbench | `partsSplash.ts`, `splash.contribution.ts` | splash VS Code natif (`monaco-parts-splash`) — à remplacer / court-circuiter |
| IDE Drox | `droxMicrosoftAgentsSurfaceContribution.ts` | `workbench.startupEditor: none` — pas de welcome Microsoft |
| Intégration | — | reporté (spec `animation-start/` prête) |

### Intégration cible (option A — workbench part) — *reporté post-1.5.3*

Voir [VSCODE-FORK.md](../../animation-start/VSCODE-FORK.md) :

1. Copier / adapter `drox-splash-spec.ts` → `src/vs/workbench/browser/parts/droxSplash/` (chemin indicatif)
2. Hook `Workbench` startup : `div#drox-splash-root` + `createDroxSplashController(root)`
3. Désactiver ou conditionner le splash Microsoft si conflit
4. i18n : `nls.localize` pour `taglineBoot` / `taglineProduct` (clés TUI `boot.init` / `boot.tagline`)
5. Setting `drox.ui.launchAnimation` (défaut on) · `prefers-reduced-motion` → skip ou durée réduite

**Hors scope A1** : webview plein écran (latence), framer-motion, prototype site `AnimatedBackground`.

### Checklist

- [x] **A1-1** — Spec `animation-start/` : frames, palette phosphore, logo ASCII, TS portage
- [ ] **A1-2** — Audit fork : `extract-splash-from-ide.ps1` + points listés dans VSCODE-FORK.md
- [ ] **A1-3** — Intégrer `drox-splash-spec.ts` dans le bundler workbench (`parts/droxSplash/`)
- [ ] **A1-4** — Hook startup Workbench + désactivation splash natif · setting `drox.ui.launchAnimation`
- [ ] **A1-5** — Smoke visuel : fond `#030704`, halo, logo 6 lignes, mode compact &lt; 480 px · comparaison TUI côte à côte
- [ ] **A1-6** — Sync doc : toute modif `boot_splash.rs` → `drox-phosphor-theme.json` + `drox-splash-spec.ts`

**Critère** : lancement IDE → splash phosphore DROX ~2,6 s → workbench sans flash welcome VS Code · désactivable · taglines i18n.

**Fichiers cibles** : `src/vs/workbench/browser/parts/droxSplash/`, `workbench.ts`, `droxConfiguration.ts`, `product.json` (branding `nameShort: Drox`).

---

## W — Patch WORK UI (smoke 1.5.3)

Corrections visuelles du fil **WORK** détectées en smoke — **webview uniquement**. Détail complet : [PATCH-WORK-UI-1.5.3.md](PATCH-WORK-UI-1.5.3.md).

| # | Sujet | État |
|---|--------|------|
| W6 | Grille verte persistante après run | ✅ |
| W4 | Plan du cycle précédent sur nouvelle question | ✅ |
| W3 | Doublon texte Reasoning | ✅ |
| W1 | Plan instable (dans `<details>` repliable) | ✅ |
| W2 | Compteurs en-tête WORK | ✅ |
| W5 | Clôture étapes plan en direct (`railStationEnter` → `highlightTodoTask`) | partiel |
| — | Scroll phase fichier (double scroll `#log` / `.phase-body`) | ✅ |
| — | Hotfix longs runs (strips multiples, strip orphelin, chronology scroll) | ✅ |

**Critère global** : deux tours user consécutifs · plan/reasoning/compteurs cohérents · pas d’animation résiduelle après `done` · diffs fichier sans scroll parasite.

---

## P2 — Polish trays (optionnel)

- [ ] **P2-1** — Fichiers édités repliés dans le tray
- [ ] **P2-2** — Lignes « Ran » / layout outils
- [ ] **P2-3** — Questionnaire `ask_user`

---

## Livrables

| # | Livrable | Critère | État |
|---|----------|---------|------|
| D1 | Diffs + undo/redo | smoke mutation + revert | ✅ |
| U1 | UX user messages | copie · style · expand · hint commit | ✅ |
| U2 | Composer | auto-grow 2–12 lignes · pleine largeur | ✅ |
| T1 | Cadres shell | carte commande + sortie type Cursor | ✅ |
| TUI-1 | Style fil rétro | VT323 · phosphore · flush sash | ✅ |
| W | Patch WORK UI | W1–W4, W6 + scroll + hotfixes strip | ~98 % |
| H | Historique sessions | liste propre + rejeu full | Phase 1+2 ✅ |
| A1 | Animation lancement boot | splash phosphore TUI | reporté |
| L3 | `droxVersion` **1.5.3** | `package.json` | ✅ (tag `v1.5.3` reste à poser) |

---

## Prochaine étape (ship)

1. **Tag** `v1.5.3` sur branche `1.5.3`
2. Release binaire Windows (process habituel)
3. [1.5.4](../1.5.4/PLAN-1.5.4.md) — Linux `.deb` + Authenticode + A1 boot phosphore si souhaité

---

## Séquence

```text
1.5.2 configuration moteur IDE (tag v1.5.2)
    → branche 1.5.3
        → D1 + U1 + U2 + T1 + TUI-1 + W + H (+ A1 si faisable)
        → tag v1.5.3
            → 1.5.4 Linux + Authenticode
```

---

## Signalements smoke (hors patch W — juin 2026)

| # | Symptôme | Pilier cible | État |
|---|----------|--------------|------|
| S-U2 | Barre d’input message ne prend pas toute la largeur | **U2** | corrigé (`width: 100%` + auto-grow) — smoke |
| S-H1 | Historique **SESSIONS** : dizaines d’« Untitled chat » | **H** | Phase 1 ✅ — voir section [H](#h--historique--chargement-sessions) |
| S-H4 | ~~Restore here~~ sur messages | **U1** | bouton retiré |

---

## Liens

- [README 1.5.3](README.md)
- [PATCH WORK UI — smoke](PATCH-WORK-UI-1.5.3.md)
- [PLAN 1.5.2](../1.5.2/PLAN-1.5.2.md)
- [Animation lancement — spec](../../animation-start/README.md)
- [PLAN 1.5.4](../1.5.4/PLAN-1.5.4.md)
- [SHIM-MOTEUR-IDE](../1.5.0/SHIM-MOTEUR-IDE.md)
