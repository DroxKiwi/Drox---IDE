# Gates & context bubbles — architecture 1.3.2+

> **OBSOLÈTE** — `GateEngine` et context bubbles **retirés**. Index : [ARCHIVE.md](ARCHIVE.md) · code actuel : [CONDUCTEUR-CODE.md](../CONDUCTEUR-CODE.md).

**Statut** : archive historique.  
**Objectif** : remplacer les gates « prompt-only » par un **arbre de décision** explicite, et reconstruire le contexte LLM par **bulles** adressables (budget maîtrisé).

**Plan d’implémentation** : [PLAN-INTEGRATION-GATES-BACKPACK.md](../PLAN-INTEGRATION-GATES-BACKPACK.md) *(phase D backpack annulée)*  
**Nettoyage / reliquats** : [SUIVI-NETTOYAGE-GATES.md](SUIVI-NETTOYAGE-GATES.md)

## Documents

| Fichier | Contenu |
|---------|---------|
| **[PROTOCOL-CONTRACT.md](../PROTOCOL-CONTRACT.md)** | **Contrat normatif** gates / événements / surfaces UI — anti-surprise |
| **[FILE-CONDUCTEUR-CHEMINS-CYCLE.md](../FILE-CONDUCTEUR-CHEMINS-CYCLE.md)** | **Carte des parcours modèle** (conducteur, outils, portes) — base refonte |
| **[gate-graph.json](../../../drox/crates/drox-engine/assets/gates/gate-graph.json)** | **Arborescence unique** : causalité, boucles, chemins, `START_RUN` |
| [GATE-ROUTES.md](GATE-ROUTES.md) | Vue synthétique (dérivée du graphe JSON) |
| [GATE-SPEC.md](GATE-SPEC.md) | Format fichier gate, JSON de réponse modèle, branchement moteur |
| [EDIT-GATES-MAP.md](EDIT-GATES-MAP.md) | Alignement `EditTier` ↔ checkpoints `edit.*` (in-run, impl. incrémentale) |
| [CONTEXT-BUBBLES.md](CONTEXT-BUBBLES.md) | Registre des bulles (`last_user_message`, `historic`, …), budget, journal |
| [gates/](gates/) | Pointeur vers `assets/gates/*.gate.toml` (pas de copie locale) |
| [bubbles/](bubbles/) | Définitions bulles (paramètres, plafonds tokens) |
| [SUIVI-NETTOYAGE-GATES.md](SUIVI-NETTOYAGE-GATES.md) | Checklist débris `[gate:]` / intent markdown / docs dupliquées |

## Principes

1. **Gate** = question + contexte autorisé + format de réponse → **transition** vers un nœud ou un run.
2. **Bulle** = fragment de contexte **calculé à la demande** (pas tout le transcript dans la fenêtre).
3. **Journal moteur** = inventaire persistant des gates passées et actions (comme les livrables executor `.md`).
4. **Pas d’heuristique NLP** sur le message user : sanitize structurel uniquement ; la décision passe par les gates (tour LLM dédié ou override RPC).

## Lien code actuel

- Entrée : `orchestration_run.rs` → `probe_architect_gate_chain` + `GateEngine` (TOML `assets/gates/`).
- Exécution : `architect_gates.rs` (gates **bloquantes** outils) — conservées, complémentaires.
- État : `ArchitectRunState` → évoluer vers `RunJournal` + `GatePath`.

## Implémentation

Voir [PLAN-INTEGRATION-GATES-BACKPACK.md](../PLAN-INTEGRATION-GATES-BACKPACK.md) (phases A→F, nettoyage débris, sprints).
