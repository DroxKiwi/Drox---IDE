# Tutoriel — naviguer dans l’interface Drox IDE

Guide **utilisateur / contributeur UI** : où trouver les surfaces Drox dans le workbench.  
Ce n’est **pas** la doc du moteur Rust — pour ça : [`docs/engine/`](../engine/README.md).

> Statut : **tutoriel vivant**. Les libellés de menus peuvent évoluer ; en cas de doute, chercher la commande dans la palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) avec le préfixe **Drox**.

## 1. Premiers pas

1. Ouvre un dossier workspace (File → Open Folder).
2. Configure un backend LLM (Ollama local recommandé, ou endpoint OpenAI-compat) dans les settings Drox / modèles.
3. Ouvre le **chat / Agents Drox** (vue latérale ou éditeur selon la build).
4. Envoie un message simple en mode lecture / plan pour valider le lien moteur (`drox --serve` doit tourner en arrière-plan).

Si le chat reste muet : vérifier que le process moteur démarre (Sortie / logs Drox) — côté technique voir [ide-integration.md](../engine/ide-integration.md).

## 2. Surfaces principales

| Surface | À quoi ça sert | Code (orienté) |
|---------|----------------|----------------|
| Chat / Agents | Fil de conversation, streaming, tools | `contrib/drox/browser/`, `…/agents/` |
| Modes permission | Plan / trust edits / default (pas Professor) | pickers Agents + mapping → `AgentRunParams.mode` |
| Modèles / connexions LLM | Choisir provider, modèle, mute params | settings + `llmProviders/` |
| Changes / diffs | Voir et appliquer les edits du run | composer / Changes Drox |
| **Codebase** | Index local, inject, catalogue | activity bar + chip composer + (Agents) icône historique |
| **Regulation** | Notes L1–L5, Auto, historique runs | activity bar + chip + (Agents) icône historique |
| Sessions | Reprendre / compacter / tronquer un fil | bridge sessions + RPC `session.*` |
| Help / À propos | Version `droxVersion`, liens | contribution Help menu |

Racine code UI : [`src/vs/workbench/contrib/drox/`](../../src/vs/workbench/contrib/drox/).

## 3. Modes d’interaction (mapping mental)

| Intention utilisateur | Mode permission typique côté moteur |
|----------------------|-------------------------------------|
| Analyser sans écrire | `plan` |
| Laisser appliquer les edits fichier | `acceptEdits` |
| Demander confirmation au fil de l’eau | `default` |
| Mode tuteur / cours | **Pas disponible** — `professor` est downgradé côté IDE ([pédagogie 14](../pedagogie/14-mode-professor.md)) |

| Dogfood sans friction (attention) | `bypassPermissions` |

Détail moteur : [tools-and-permissions.md](../engine/tools-and-permissions.md).

## 4. Pendant un run

- **Stop** : annule via `agent.cancel` — pas d’offre « Reprendre » systématique selon le produit.
- **Phases** : la UI peut afficher analyzing / reading / acting / answering (issues du moteur ou synthétisées).
- **Thinking natif** : souvent replié (« Native reasoning ») — distinct de la réponse finale.
- **Widgets outils** : cartes bash / edit / grep ; certains streams shell live selon la version.
- **Questions / permissions** : dialogues issus de `user/ask`.

## 5. Sessions et mémoire côté UI

- Reprendre une conversation = `session.read` + nouveau `agent.run` avec historique.
- Compaction / truncate = actions UI branchées sur `session.compact` / `session.truncateAfterLastUser`.
- Archives projet `.drox/memory/sessions/` : écrites par le **moteur** ; l’UI peut les surfacir via outils / notes.

## 5b. Codebase & Regulation (IDE + Agents)

- Chaque discussion Agents est liée à un **dossier racine** ; l’index RAG et les notes de régulation suivent **ce** dossier.
- **Agents** : sur une ligne d’historique, icônes **Codebase** (database) et **Regulation** (pulse) à côté de persist / notes.
- L’index se met à jour **automatiquement** pour la discussion **active** seulement (pas toute la liste) — détail : [codebase-and-rag.md](../engine/codebase-and-rag.md), pédagogie [16](../pedagogie/16-codebase-et-rag.md).

## 6. Commandes utiles (palette)

Cherche : `Drox:` — exemples typiques selon build :

- ouvrir chat / Agents ;
- settings modèles ;
- session end / compact ;
- notes de release / help.

## 7. Pour aller plus loin (contributeur UI)

| Sujet | Doc / code |
|-------|------------|
| Contrat RPC | [jsonrpc-protocol.md](../engine/jsonrpc-protocol.md) |
| Bridge run | [`droxAgentRunBridge.ts`](../../src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts) |
| Outils exécutés dans l’IDE | [`droxClientTools.ts`](../../src/vs/workbench/contrib/drox/common/droxClientTools.ts) |
| Codebase / RAG | [codebase-and-rag.md](../engine/codebase-and-rag.md) |
| Régulation | [model-regulation.md](../engine/model-regulation.md) |
| Parité Agents | [PLAN-AGENTS-PARITY.md](../1.5/1.5.22/PLAN-AGENTS-PARITY.md) |
| Historique shim 1.5.0 | [SHIM-MOTEUR-IDE.md](../1.5/1.5.0/SHIM-MOTEUR-IDE.md) |

## À compléter (backlog tutoriel)

- Captures d’écran annotées (chat, modes, Changes).
- Parcours « premier run Ollama de A à Z ».
- Différences chat natif vs webview legacy si encore présentes.
- Raccourcis clavier exacts de la build courante.

