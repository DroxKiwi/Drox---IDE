# drox-prompts

Catalogue central des textes injectés au LLM (session parent, Explore, tools, gates, asks).

Le moteur (`drox-engine` / CLI / TUI) doit rester cohérent **hors fork VS Code** :
toute procédure / contrainte / ask boot vit ici, pas dans l’IDE.

## Modules Rust

| Module | Rôle |
|--------|------|
| `entry` | `PromptEntry` + audience / intent / strength |
| `catalog` | Registre de toutes les fiches |
| `lint` | Ids uniques + claims non contradictoires |
| `core` | System prompt parent (phases / tools) |
| `session` | Suppléments run (Explore, hors-WS, thinking, professeur) |
| `runtime` | Soft frames & rescues boucle (work plan, S-5, analyzing, …) |
| `gates` | Filets done / testing / intent-write / loops / todos |
| `blocks` | Messages de refus hard-gate |
| `tools` | Descriptions d’outils (schéma companion) |
| `explore` | System + report sous-agent Explore |
| `compaction` | Prompt compaction mémoire |
| `model_questions` | Ask one-shot boot (multi-bool session intent) |

## Documentation

| Fichier | Contenu |
|---------|---------|
| [`docs/injection-map.md`](docs/injection-map.md) | **Carte** : ce que le modèle reçoit, par couche et scénario |
| [`docs/journal.md`](docs/journal.md) | **Journal** : évolution des injections dans le temps |
| [`docs/adding.md`](docs/adding.md) | **Discipline** : checklist avant nouvelle fiche / body |
| [`docs/verification.md`](docs/verification.md) | **Vérif** : scénarios à contrôler (dose / mécanique) |

Quand tu changes un body, un `when`, ou un site d’injection (`drive.rs`, handlers RPC) :
1. fiche / claims ;
2. `injection-map.md` si ordre ou scénario change ;
3. entrée datée dans `journal.md`.

## Trois couches utiles

1. **Contrat** — CORE + tool schemas (stable)
2. **Contexte run** — flags session (Explore, hors-WS, professeur, thinking)
3. **Rappel situationnel** — un motif, un moment (turn-0 classif, kickoff, gate, rescue)

Canon Plan→Assign→Merge : `session.subagents.explore` uniquement (voir `docs/adding.md`).

## Lint

```bash
cargo test -p drox-prompts
```

`catalog_lint_passes` échoue si ids dupliqués, body vide, claim malformé, ou même clé de claim avec deux valeurs.
