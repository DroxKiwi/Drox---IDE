# Plan 1.5.2 — Diffs fil + UX utilisateur + paramètres moteur

**Version** : juin 2026  
**Base** : [1.5.1](../1.5.1/CLOSURE-1.5.1.md) · moteur `tui_mono` · shim RPC  
**Branche** : `1.5.2` (ouverte depuis `main` après clôture 1.5.1)

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **D1** Diffs fil + undo/redo | 0 % | UX mutation |
| **U1** Messages utilisateur | 0 % | polish |
| **U2** Composer auto-grow | 0 % | polish |
| **M1** Paramètres moteur | 0 % | config agent |
| **P2** Polish trays | 0 % | non |

**Hors scope** : release Linux → [1.5.3](../1.5.3/PLAN-1.5.3.md).

---

## Objectif

| In | Hors scope 1.5.2 |
|----|-------------------|
| Diffs fichier visibles dans le fil chronologique | Release Linux `.deb` (**1.5.3**) |
| Undo / redo des edits agent dans le fil | Index / graphe repo |
| Copie rapide + style messages user | Refonte workbench VS Code |
| Composer qui grandit avec le texte | Nouveaux champs RPC moteur |
| Paramètres LLM alignés shim (`agent.run`) | Signature Authenticode |

---

## D1 — Diffs fichier dans le fil

Le moteur et les outils IDE produisent déjà des diffs (`unifiedDiff`, event `fileChange`, `12-fileChange.js`). Il manque l’**intégration chronologique** et l’**annulation**.

### État actuel

| Couche | Fichiers | État |
|--------|----------|------|
| Outil `file_write` | `droxFileWriteTool.ts` | diff généré |
| Event webview | `host-message.js` → `fileChange` | handler existant |
| Rendu carte | `12-fileChange.js`, CSS `.msg-file-change` | hors fil P0 chronologie |
| Replay | `droxUiReplayExport.ts` | type `fileChange` |

### Checklist

- [ ] **D1-1** — Monter `fileChange` dans `chronology.js` / fil P0 (ordre TUI)
- [ ] **D1-2** — Afficher diff unifié repliable inline (`renderDiffLines`)
- [ ] **D1-3** — Lier `applied: true/false` du `tool_finish` à l’état visuel
- [ ] **D1-4** — **Undo** : revert fichier depuis la carte diff
- [ ] **D1-5** — **Redo** : réappliquer le patch
- [ ] **D1-6** — Persistance undo stack par session · smoke mutation fichier

**Critère** : run « modifie README » → diff dans le fil → undo restaure → redo réapplique.

---

## U1 — Interaction & style messages utilisateur

| # | Tâche | Détail |
|---|--------|--------|
| U1-1 | Icône **copier** sur chaque message user | clic → clipboard |
| U1-2 | Refonte CSS bulle user | typo, padding, contraste |
| U1-3 | Hover / focus accessibles | `droxChatMvp.css`, `stream/messages/user.js` |

**Fichiers** : `stream/messages/user.js`, `droxChatMvp.css`, `host-message.js`.

---

## U2 — Composer auto-grow

| # | Tâche | Détail |
|---|--------|--------|
| U2-1 | Textarea composer : hauteur auto | min 1–2 lignes, max ~8–12 puis scroll interne |
| U2-2 | Recalcul saisie / paste / reset après envoi | |
| U2-3 | Layout sticky footer intact | |

**Fichiers** : `droxChatWebview.ts`, JS composer, `droxChatMvp.css`.

---

## M1 — Paramètres moteur Drox (alignement TUI)

Réglages `drox.engine.tuning.*` et orchestration 1.4 **ignorés** par le moteur TUI. L’UI doit refléter `agent.run` ([`protocol.rs`](../../../drox/crates/drox-cli/src/jsonrpc/protocol.rs)).

### Defaults produit

| Paramètre | Aujourd’hui | Cible 1.5.2 |
|-----------|-------------|-------------|
| `max_iterations` | **12** | **50** |
| `top_p`, `repeat_penalty`, `top_k`, `min_p` | partiel / dev | exposés utilisateur |
| `drox.engine.tuning.*` | visible | **deprecated** / masqué |

### Paramètres à exposer

- `max_iterations`, `temperature`, `max_tokens`, `num_ctx`
- `top_p`, `top_k`, `repeat_penalty`, `min_p`
- `presence_penalty`, `frequency_penalty`, `native_thinking`
- `disabled_tools`, `mcp_tools_enabled`, `subagents_*`

### Checklist

- [ ] **M1-1** — Audit settings IDE vs `AgentRunParams`
- [ ] **M1-2** — `DROX_DEFAULT_MAX_ITERATIONS = 50`
- [ ] **M1-3** — Panneau General settings : section Engine / Sampling
- [ ] **M1-4** — Masquer legacy 1.4 (`engine.tuning`, orchestration ignorés)
- [ ] **M1-5** — `droxConfiguration.ts` descriptions à jour
- [ ] **M1-6** — Tests + smoke avec `top_p` / `repeat_penalty` modifiés

**Fichiers** : `droxProductDefaults.ts`, `droxRunSettings.ts`, `droxChatGeneralSettings.ts`, `panel.js`, `droxConfiguration.ts`.

---

## P2 — Polish trays (optionnel)

- [ ] **P2-1** — Fichiers édités repliés dans le tray
- [ ] **P2-2** — Lignes « Ran » / layout outils
- [ ] **P2-3** — Questionnaire `ask_user`

---

## Livrables

| # | Livrable | Critère |
|---|----------|---------|
| D1 | Diffs + undo/redo | smoke mutation + revert |
| U1 | UX user messages | copie 1 clic + style modernisé |
| U2 | Composer | long message sans scroll textarea |
| M1 | Paramètres moteur | 50 iter · sampling exposé |
| L3 | `droxVersion` **1.5.2** au ship | `package.json` |

---

## Séquence

```text
1.5.1 clôture (ship win + merge main)
    → branche 1.5.2
        → D1 + U1 + U2 + M1
        → tag v1.5.2
            → 1.5.3 Linux
```

---

## Liens

- [README 1.5.2](README.md)
- [PLAN 1.5.3](../1.5.3/PLAN-1.5.3.md)
- [SHIM-MOTEUR-IDE](../1.5.0/SHIM-MOTEUR-IDE.md)
