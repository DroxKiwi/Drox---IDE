# Plan — désactivation Agents VS Code (release 1.3.2)

**Contexte** : le fork embarque le sous-système **Agents Window** de VS Code (`vs/sessions/`, Copilot CLI, Skills Microsoft) — **sans lien** avec Drox Chat / `drox.exe`. Pour une release Drox claire, ce flux doit être **off** par défaut.

Référence : [13-agents-window-kdds-drox.md](../../feature-brainstorm/13-agents-window-kdds-drox.md).

---

## Périmètre

| Système | Rôle | Action 1.3.2 |
|---------|------|----------------|
| **Drox Chat** | Moteur local `drox-engine` | **Garder** — produit principal |
| **Executors Drox** | `delegate_executor` sous-agents | **Garder** — réglage `drox.subagents` |
| **Agents Window VS Code** | Fenêtre séparée, Copilot/GitHub | **Désactiver** |
| **Chat panel VS Code** | `workbench.panel.chat` Copilot | **Masquer / désactiver** si encore visible |
| **Open in Agents** (titlebar) | `workbench.action.openWorkspaceInAgentsWindow` | **Masquer** via precondition |

---

## Leviers techniques

### A — Configuration (fait / à compléter)

| Clé | Valeur Drox | Effet |
|-----|-------------|-------|
| `chat.agent.enabled` | **`false`** (défaut produit) | Masque Open in Agents, désactive agent mode VS Code |
| `chat.generalPurposeAgent.enabled` | `false` | Sous-agents chat intégrés |
| `workbench.secondarySideBar.defaultVisibility` | (déjà Drox aux bar) | Drox seul en auxiliary bar |

**Code** : `droxProductDefaultsConfiguration.ts` — override défauts après `chat.shared.contribution`.

### B — `product.json`

| Champ | Action |
|-------|--------|
| `defaultChatAgent` | Neutraliser URLs **aka.ms** → stubs Drox ou vides ; doc [ETAT-LIEUX-DEBRAND](ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md) |
| `skipCopilotGitHubSignIn` | ✅ déjà `true` |
| `builtInExtensions` ms-vscode.* | **Garder** (MIT, debug) — pas promu UI |

### C — Welcome / onboarding

| Zone | Action |
|------|--------|
| `welcomeAgentSessions` | Désactiver contribution ou `when: false` |
| `welcomeGettingStarted` | Pas d’étape Copilot / Agents |
| `welcomeBanner` Copilot | Off |
| `workbench.startupEditor` | `none` ou welcome Drox |

### D — Commandes & menus

Désinscrire ou `when: false` permanent :
- `workbench.action.openAgentsWindow`
- `workbench.action.openWorkspaceInAgentsWindow`
- Entrées palette « Copilot » / « Agents » non-Drox

**Alternative** : garder commandes mais precondition impossible (`chat.agent.enabled` false).

### E — Télémétrie agents

| Champ | Action |
|-------|--------|
| `agentsTelemetryAppName` | Ne pas envoyer — audit télémétrie workbench (R4) |

---

## Checklist release

- [ ] `chat.agent.enabled` défaut **false** (nouveaux profils)
- [ ] Migration profils existants : option « réinitialiser réglages chat Microsoft » dans doc ops
- [ ] Titlebar : pas de widget **Open in Agents**
- [ ] Palette (F1) : pas de « Open Agents Window » visible
- [ ] Ctrl+Shift+A : inactif ou réassigné Drox
- [ ] Aucun écran login GitHub Copilot au 1er lancement
- [ ] Doc utilisateur : seul **Drox** est l’agent du produit

---

## Tests

| # | Action | Attendu |
|---|--------|---------|
| A1 | Install frais `.drox-ide` | Pas de bouton Agents |
| A2 | F1 « Agents » | Rien ou commande disabled |
| A3 | Drox Chat run | Inchangé |
| A4 | `drox.subagents.enabled` | Executors orchestration OK |

---

## Liens

- [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md)
- [ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md](ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md)
