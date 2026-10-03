# Pédagogie — comprendre Drox en lisant le code

Ces guides ne remplacent pas la [référence moteur](../engine/README.md).  
Ils **accompagnent** la lecture du vrai code : une histoire concrète, des définitions au moment où on en a besoin, la syntaxe Rust et ce que ça fait dans la machine.

## Comment lire la série

1. Suis les numéros **dans l’ordre** la première fois.
2. Le guide **01** pose les bases (programme, variable, fonction, mémoire) sur le contact avec Ollama — c’est le socle.
3. Les suivants **réutilisent** ces idées et en ajoutent (boucles, erreurs, tools, permissions…).
4. Ouvre toujours les fichiers source cités **à côté** du tutoriel.
5. Chaque guide contient des blocs **« Exemple concret »** tirés du dépôt, avec un tableau qui détaille la syntaxe ligne à ligne — appuie-toi dessus autant que sur le récit.

## Parcours

| # | Guide | Ce qu’on y voit dans Drox | Idées de langage / système |
|---|--------|---------------------------|----------------------------|
| **01** | [Contact Ollama](01-contact-ollama.md) | Config → client → `POST /api/chat` → flux | Variable, fonction, `struct`, `trait`, `async`, `Arc` |
| **02** | [Boucle agent](02-boucle-agent.md) | `drive_inner` jusqu’à `done` | `for`, conditions, état mutable |
| **03** | [Gestion d’erreurs](03-gestion-erreurs.md) | `Result`, `?`, LLM / RPC | Succès ou échec typé |
| **04** | [Moteur et affichage](04-moteur-et-affichage.md) | `AgentEvent` → chat IDE | Canal, NDJSON, deux process |
| **05** | [Outils](05-outils.md) | Trait `Tool`, registry, local / remote | `dyn Tool`, JSON schéma |
| **06** | [Permissions](06-permissions.md) | Modes, ask/deny, bash | Enum modes, classification shell |
| **07** | [Phases et gates](07-phases-et-gates.md) | `[phase:]`, todos, nudges | Prompt + verrous Rust |
| **08** | [Contexte et compaction](08-contexte-et-compaction.md) | Snip, tokens, compact | Budget, tiktoken |
| **09** | [Sessions et mémoire](09-sessions-et-memoire.md) | JSONL, `.drox/memory` | Append-only, couches mémoire |
| **10** | [Parallélisme des outils](10-parallelisme-outils.md) | Lots parallel / serial | Concurrence Tokio, drapeaux |
| **11** | [MCP et Explore](11-mcp-et-explore.md) | `mcp__*`, tool `task` | Process externes, sous-agent |
| **12** | [Hooks](12-hooks.md) | `.drox/hooks.json` | Spawn shell, exit codes |
| **13** | [TUI vs `--serve`](13-tui-vs-serve.md) | Deux façades du même cœur | Isolation vs in-process |
| **14** | [Mode professor](14-mode-professor.md) | Intention + code (⚠️ **pas dispo** IDE) | Gates / downgrade |
| **15** | [Régulation et notes](15-regulation-et-notes.md) | Sonde, L1–L5, scores, Auto | Signaux, moyenne, policy |
| **16** | [Codebase et RAG](16-codebase-et-rag.md) | Index local, lazy Agents, coalesce | Root discussion, file 1-root |

## Cours (vulgarisation)

Hors parcours code : [`Cours/`](Cours/) — [01 Gros modèle vs Drox](Cours/01-gros-modele-vs-drox/) · [02 Axes du moteur](Cours/02-axes-moteur-drox/) (sommaire linéaire d’une requête).

## Référence (hors pédagogie)

Quand tu cherches un fait précis sans le fil narratif : [`docs/engine/`](../engine/README.md).

