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

## Documentation (à compléter)

| Fichier | Contenu |
|---------|---------|
| [`docs/injection-map.md`](docs/injection-map.md) | **Carte** : ce que le modèle reçoit, par couche et par scénario |
| [`docs/journal.md`](docs/journal.md) | **Journal** : évolution des injections dans le temps |

Quand tu changes un body, un `when`, ou un site d’injection (`drive.rs`, handlers RPC) :
1. mets à jour la fiche / claims si besoin ;
2. ajuste `injection-map.md` si l’ordre ou un scénario change ;
3. ajoute une entrée datée dans `journal.md`.

## Trois couches utiles (cible produit)

1. **Contrat** — CORE + tool schemas (stable)
2. **Contexte run** — flags session (Explore, hors-WS, professeur, thinking)
3. **Rappel situationnel** — un motif, un moment (turn-0 classif, kickoff, gate, rescue)

Éviter de répéter la même procédure soft (ex. Plan→Assign→Merge) dans (1)+(2)+(3).

## Lint

```bash
cargo test -p drox-prompts
```

`catalog_lint_passes` échoue si ids dupliqués, body vide, claim malformé, ou même clé de claim avec deux valeurs.
