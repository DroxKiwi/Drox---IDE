# Plan 1.5.7 — Agents Window adaptée Drox

**Version** : juin 2026  
**Base** : [1.5.6](../1.5.6/PLAN-1.5.6.md) (MCP — customizations Agents)  
**Branche** : `1.5.7` · tag **`v1.5.7`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **A0** Décision produit (webview vs Agents) | 0 % | oui |
| **A1** Réactivation contrôlée UI | 0 % | oui |
| **A2** `DroxSessionsProvider` | 0 % | oui |
| **A3** Rebrand & onboarding Drox | 0 % | non |
| **A4** Customizations (skills, MCP, instructions) | 0 % | non |
| **A5** Smoke & release | 0 % | oui |

---

## Objectif

| In | Hors scope |
|----|------------|
| Fenêtre **Agents** utilisable avec **moteur Drox** (Ollama / API locale) | Login GitHub Copilot obligatoire |
| Bouton **Open in Agents** / entrée menu cohérents | Marketplace Plugins Copilot |
| Sessions, Changes, Files (chassis `vs/sessions/`) | Parité 100 % UX webview Drox dès v1 |
| Coexistence documentée avec **Drox Chat** (webview) | Suppression du webview chat (décision A0) |

---

## Contexte — masquage actuel (1.3.2 → aujourd’hui)

Depuis [PLAN-DESACTIVATION-AGENTS](../../1.3/1.3.2/finalisation/PLAN-DESACTIVATION-AGENTS-VSCODE-1.3.2.md) :

| Levier | Valeur Drox | Fichier |
|--------|-------------|---------|
| `chat.agent.enabled` | `false` | `droxProductDefaultsConfiguration.ts` |
| `chat.disableAIFeatures` | `true` | idem |
| `chat.titleBar.openInAgentsWindow` | masqué via agent off | upstream |
| `product.sessionsWindowAllowedExtensions` | `[]` | `product.json` |
| Welcome Agents / Copilot | off | `droxMicrosoftAgentsSurfaceContribution.ts` |

**Pourquoi c’était masqué** : Agents Window = Copilot + GitHub, **sans lien** `drox.exe` → fausse porte d’entrée.

**Pourquoi réactiver en 1.5.7** : le chassis UX (sessions, panneau Changes, layout chat-first) est riche ; [brainstorm 13](../../feature-brainstorm/13-agents-window-kdds-drox.md) propose de le **réapproprier** plutôt que tout réécrire.

---

## Vision

```text
┌─ Drox Agents ─────────────────────────────────────────────┐
│ Sessions          │  Fil agent (phases, tools, réponse)   │
│ · workspace A     │  Moteur : drox.exe (JSON-RPC)         │
│ · workspace B     │  LLM    : réglages Drox / Ollama      │
│                   │                                       │
│ Customizations    ├───────────────────────────────────────┤
│ · Instructions    │  Changes │ Files                       │
│ · Skills Drox     │  (workspace réel)                     │
│ · MCP (1.5.6)     │                                       │
└───────────────────┴───────────────────────────────────────┘
```

- **Pas** d’écran « Sign in to GitHub » au chemin nominal.
- **Provider** : `DroxSessionsProvider` (`id`: `drox`), pas `default-copilot`.

---

## Décision produit A0 (à trancher en début de chantier)

| Option | Description | Risque |
|--------|-------------|--------|
| **C — Convergence progressive** (recommandé brainstorm) | Agents = surface avancée ; webview chat conservé | Deux UIs temporaires |
| **A — Remplacement** | Agents = principale ; webview secondaire | Régression utilisateurs webview |
| **B — Parité stricte** | Les deux miroirs complets | Coût double |

**Livrable A0** : une page dans ce plan ou README 1.5.7 avec décision signée.

**Analyse détaillée** : [IMPLEMENTATION-1.5.7.md](IMPLEMENTATION-1.5.7.md) (difficulté, architecture `droxAgentRunBridge`, phases P0–P4, fichiers, tests).

---

## Piliers

### A1 — Réactivation contrôlée (sans rouvrir Copilot)

| # | Tâche | Détail |
|---|--------|--------|
| A1-1 | Activer **uniquement** ce qui sert Drox | Ex. `chat.agent.enabled` = true **si** provider Drox enregistré |
| A1-2 | Garder `github.copilot.enable` = false | Pas de complétion Copilot par défaut |
| A1-3 | Afficher **Open in Agents** | `chat.titleBar.openInAgentsWindow.enabled` = true quand provider Drox prêt |
| A1-4 | `sessionsWindowAllowedExtensions` | Whitelist minimale (vide ou extensions Drox seulement) |
| A1-5 | Smoke sans réseau GitHub | Install frais → Agents → pas de login MS |

**Fichiers** : `droxProductDefaultsConfiguration.ts`, `product.json`, contributions `agentSessions`.

### A2 — `DroxSessionsProvider` (cœur)

| # | Tâche | Détail |
|---|--------|--------|
| A2-1 | Spike `ISessionsProvider` | `src/vs/sessions/contrib/providers/drox/` (nouveau) |
| A2-2 | Lier `IDroxEngineService` | `agent.run`, events `agent/event`, annulation |
| A2-3 | Persistance sessions | `.drox/sessions/*.jsonl` + modèle sessions existant IDE |
| A2-4 | MVP | 1 session · 1 prompt · fil affiché · 1 tool call |
| A2-5 | Ne pas enregistrer `CopilotChatSessionsProvider` en build Drox nominal | Ou precondition blocked |

Référence upstream : [SESSIONS.md](../../../../src/vs/sessions/SESSIONS.md).

### A3 — Rebrand Drox

| # | Tâche | Détail |
|---|--------|--------|
| A3-1 | Chaînes utilisateur | Remplacer « Copilot » / « Build with AI Agents » visibles |
| A3-2 | Welcome Agents | Écran onboarding Drox local (modèle, workspace) |
| A3-3 | Icônes / titlebar | Aligner `resources/drox/` |

### A4 — Customizations (après 1.5.6 MCP)

| Concept Agents VS Code | Équivalent Drox |
|------------------------|-----------------|
| Instructions | prompts `drox-cli`, `EngineTuning` |
| Skills | `skill_list` / `.drox/skills/` |
| MCP Servers | section [1.5.6](../1.5.6/PLAN-1.5.6.md) |
| Hooks / Plugins Copilot | hors scope |

### A5 — Release & tests

| # | Test | Attendu |
|---|------|---------|
| T1 | Open in Agents | Fenêtre s’ouvre, provider Drox actif |
| T2 | Run sans GitHub | Réponse LLM locale OK |
| T3 | Drox Chat webview | Inchangé ou doc si déprécié (selon A0) |
| T4 | `drox.subagents` | Non régressé |

- [ ] `droxVersion` **1.5.7**
- [ ] Ship OR ([operations](../../operations/README.md))

---

## Phasage suggéré (dans la release)

Voir détail technique : [IMPLEMENTATION-1.5.7.md §5](IMPLEMENTATION-1.5.7.md#5-plan-dimplémentation-par-phases).

```text
Sprint 1 : A0 + A1 + P0 spike (MVP run texte)
Sprint 2 : P1 (tools, ask, sessions, models)
Sprint 3 : P2 rebrand + P4 lien MCP 1.5.6 + A5 smoke
(Option 1.5.7 : P3 Changes / Files)
```

---

## Critères d'acceptation

- [ ] **Open in Agents** visible et fonctionnel **sans** login Copilot
- [ ] Au moins une session Agents exécute un run via **drox.exe**
- [ ] Aucune mention Copilot sur le chemin nominal
- [ ] Stratégie webview vs Agents **documentée** (A0)
- [ ] Tests A1–A4 passent

---

## Liens

- [README 1.5.7](README.md)
- [IMPLEMENTATION-1.5.7.md](IMPLEMENTATION-1.5.7.md)
- [PLAN 1.5.6](../1.5.6/PLAN-1.5.6.md)
- [13-agents-window-kdds-drox.md](../../feature-brainstorm/13-agents-window-kdds-drox.md)
- [PLAN désactivation Agents 1.3.2](../../1.3/1.3.2/finalisation/PLAN-DESACTIVATION-AGENTS-VSCODE-1.3.2.md)
