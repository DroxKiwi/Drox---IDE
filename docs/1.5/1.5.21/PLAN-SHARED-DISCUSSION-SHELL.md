# Plan — Shell de discussion partagé Agents ↔ IDE (1.5.21)

**Statut** : **préparé** · priorité **#3** de la maj (après index + Explore)  
**Version** : 1.5.21  
**Parent** : [README 1.5.21](README.md)  
**Décision produit** : l’IDE récupère **l’intégralité** de l’interface de discussion Agents — fil **et** tous les outils qui vont avec (modèle, connexion, paramètres, modes, status) — pas un sous-ensemble.

---

## Contexte (pourquoi on en est là)

| Surface | Shell actuel | Origine |
|---------|--------------|---------|
| **Agents** (`sessions.desktop`) | Fenêtre Copilot Agents + adaptations Drox (`NewChatInput`, picker, toolbar Drox, wizard connexion, panneaux modèle/serveur) | Fork UI sessions Microsoft, provider/run Drox |
| **IDE** (`workbench.desktop`) | `DroxNativeChatViewPane` → **`ChatWidget` nu** (look Copilot Chat : `@ Agent`, Auto…) | Décision **1.5.11** : canal nominal = chat natif VS Code |

Le **cerveau** est déjà partagé (`DroxAgentsSessionHandler` + `drox.exe`).  
Le **chrome de discussion + ses outils** ne l’est pas.

Docs liées : [1.5.11](../1.5.11/README.md) · [COMPARE webview/natif](../1.5.11/COMPARE-WEBVIEW-VS-NATIF.md) · [AUDIT Copilot Agents](../1.5.12/AUDIT-COPILOT-AGENTS-WINDOW.md)

---

## Objectif

Transformer le shell de discussion **côté Agents** en module **partageable**, puis le monter dans le panneau DROX IDE.

### Inclus (parité stricte Agents ↔ IDE)

| Bloc | Exemples |
|------|----------|
| **Espace de discussion** | Empty state (« What's the goal? »), fil, rendu tools / thinking / file-change |
| **Choix du modèle** | Picker modèle (sessions / Drox), bascule live |
| **Connexion / serveur** | Wizard connexion, catalogue providers, panneau general-settings / serveur |
| **Paramètres modèle** | Panneau role-models (num_ctx, sampling, etc.) |
| **Modes & permissions** | Permission mode picker, quick actions composer Drox |
| **Status bar discussion** | Tokens / ctx / indicateurs run (barre status Agents) |
| **Toolbar composer** | `DroxAgentsComposerToolbar` + host panneaux (`DroxAgentsComposerDroxChatHost`) |

CFG USER déjà unifiée (1.5.11) : l’UI partagée doit **exposer** les mêmes contrôles des deux côtés, pas seulement partager la config silencieuse.

### Exclu (chrome fenêtre Agents, pas « outils de discussion »)

| Sujet | Raison |
|-------|--------|
| Sidebar liste sessions Agents | Chrome fenêtre `sessions.desktop` |
| Écran **Customizations** (Agents / Skills / MCP / Instructions) | Hors zone discussion |
| Changes latéral Agents / titre remote / antenne | Layout fenêtre |
| Historique / Changes **IDE** déjà portés en 1.5.20 | Restent dans le panneau DROX IDE à côté du shell |
| Webview legacy | Reste off |

---

## Architecture cible

```text
┌─ Module partagé DroxDiscussionShell ──────────────────────────┐
│  Fil + empty state                                            │
│  Composer NewChatInput-style                                  │
│  · Model picker                                               │
│  · Connexion / serveur (wizard + settings)                    │
│  · Paramètres modèle (role-models)                            │
│  · Permission modes + quick actions                           │
│  · Status bar (tokens / ctx)                                  │
│  · DroxAgentsComposerToolbar + DroxChatHost                   │
└───────────────┬───────────────────────────┬───────────────────┘
                │                           │
     ┌──────────▼──────────┐     ┌──────────▼──────────┐
     │ sessions.desktop    │     │ workbench.desktop   │
     │ + liste / Changes   │     │ + History / Changes │
     │   (chrome fenêtre)  │     │   (ports 1.5.20)    │
     └─────────────────────┘     └─────────────────────┘
                │                           │
                └───────────┬───────────────┘
                            ▼
                 DroxAgentsSessionHandler + drox.exe
```

**Décision figée** : on **extrait** le shell Agents de discussion **avec tous ses outils**. L’IDE n’embarque pas le chrome fenêtre (liste sessions, Customizations).

---

## Phases

| Phase | Action | Done when |
|-------|--------|-----------|
| **S0** | Inventaire : `NewChatInput`, pickers, toolbar, host connexion/modèle, status — matrice « inclus » ci-dessus | ✅ |
| **S1** | Options ChatWidget partagées (`createDroxDiscussionChatWidgetOptions`) + CSS shell | ✅ partiel |
| **S2** | Brancher `DroxNativeChatViewPane` + masquer chrome Copilot (`@ Agent`, mode, Local/Approvals) | ✅ partiel |
| **S3** | Vérifier chaque contrôle : modèle, connexion, serveur, num_ctx, modes, status | 🔄 |
| **S4** | Handoff + empty-first (1.5.20) sur le nouveau shell | 🔄 |
| **S5** | Smoke Agents + IDE + CLOSURE | 📋 |

### Implémentation en cours (notes)

- Module : `contrib/drox/browser/discussion/droxDiscussionChatWidgetOptions.ts` (+ `media/droxDiscussionShell.css`).
- IDE + Agents `ChatView` consomment les **mêmes** options (`droxNativeComposer` ; `isSessionsWindow` **Agents seulement**).
- `chatInputPart` : masque Mode / SessionTarget / Permission Copilot quand Drox composer actif — reste le picker **modèle** + toolbar Drox (Server / Model settings / permission Drox).
- Load IDE : attente provider + opens **sérialisés** + soft-fail off par défaut + timeout 12 s.
- **CSP** : `connect-src` autorise `http://*:*` (Ollama / LLM en LAN, ex. `192.168.x.x`) — sans ça le catalogue modèles reste à 0 (« Auto » / Failed to fetch).
- Empty-state Agents (`NewChatInput`) : suite si besoin après smoke load + modèles.

---

## Fichiers d’entrée (S0)

| Zone | Chemins |
|------|---------|
| Shell Agents | `newChatInput.ts`, `newChatWidget.ts`, `chatView.ts`, `modelPicker.ts` |
| Composer / connexion | `droxAgentsComposerToolbar.ts`, `droxAgentsComposerDroxChatHost.ts`, `droxAgentsChatInputIntegration.ts` |
| Status / modes | `droxAgentsChatStatusBar.ts`, `droxAgentsPermissionModePicker.ts`, `droxAgentsComposerQuickActions.ts` |
| Panneau IDE | `droxNativeChatViewPane.ts` |
| Run | `droxAgentsSessionHandler`, `droxAgentsChatSink` |

---

## Critères d’acceptation

- [ ] IDE et Agents : **même** zone discussion + **mêmes** outils (modèle, connexion, paramètres, modes, status).
- [ ] Wizard connexion / panneau serveur / panneau modèle ouvrables et fonctionnels dans l’IDE comme dans Agents.
- [ ] Changer modèle ou connexion d’un côté → cohérent de l’autre (CFG USER).
- [ ] Aucun chrome Copilot nominal (`@ Agent`, Auto) sur le chemin IDE.
- [ ] Tools + stream + handoff session sans régression 1.5.20.
- [ ] Fenêtre Agents (liste, Changes droite, Customizations) non régressée.

---

## Risques

| Risque | Mitigation |
|--------|------------|
| Couplage `vs/sessions` → workbench | Extraire vers `contrib/drox` (ou layer commun) autorisé par les deux apps |
| Panneaux settings = scripts webview legacy hostés | Réutiliser `DroxAgentsComposerDroxChatHost` tel quel dans le module partagé |
| Scope creep « toute la fenêtre Agents » | Inclure **tous les outils de discussion** ; exclure uniquement le chrome fenêtre |

---

## Origine demande

Après 1.5.20 : unifier le chrome discussion ; confirmation produit — **récupérer l’intégralité des outils** (modèle, connexion, etc.), pas seulement le fil. Remonté dans **1.5.21** (#3, après index `@Codebase` + Explore).
