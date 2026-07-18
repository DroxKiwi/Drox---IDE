# Plan 1.5.17 — Alignement enveloppe IDE ↔ contrat TUI

**Branche** : `1.5.17`  
**Version** : `droxVersion` **1.5.17**  
**Statut** : ouvert (doc) — implémentation après validation du plan  
**Base** : `main` après clôture 1.5.16  
**README** : [README.md](README.md)

---

## En une phrase

Rendre l’enveloppe IDE (Agents / chat natif) **fidèle au contrat TUI** : une source de vérité pour le plan / le run, pour supprimer les consignes contradictoires qui poussent le modèle en boucle d’édition.

---

## Contexte (analyse 1.5.16+)

- Moteur partagé TUI / IDE (`drive_inner`, gates MUTATING / unfinished / `intent_only_write`).
- Écart structurel : TUI = plan **run-centric** ; widget Copilot natif = plan **session-sticky** (clear soft si 5/6 ouvert).
- Symptôme : modèle verbalise « je suis bloqué / je vais écrire » sans `tool_calls` — souvent après plan zombie UI + gate reset sur le nouveau `agent.run`.
- Boussole produit : **fidélité TUI** (Option B), pas rehydrate session-centric Copilot.

---

## Périmètre (à figer)

| Id | Sujet | Surface | Statut |
|----|--------|---------|--------|
| **AL-A** | Fin de run / restitution de parole → plus de plan « vivant » qui contredit le run suivant | IDE | ⬜ |
| **AL-B** | Aligner signaux UI + éventuellement note système au run suivant | IDE · ? Rust | ⬜ |

Hors scope immédiat : refonte core prompt, nouveaux tools, changer les gates MUTATING elles-mêmes (sauf si audit le justifie).

---

## Ordre d’implémentation (provisoire)

```text
1. Doc PLAN/README 1.5.17          ← cette ouverture
2. Trancher politique exacte (cancel / archive / clear widget)
3. Implémentation enveloppe IDE
4. Smokes (plan 5/6 → nouveau message édition)
5. Clôture + ship OR
```

---

## Critères d’acceptation (brouillon)

- [ ] Après `agent/done` (ou équivalent fin de tour), le widget plan ne laisse plus un 5/6 « vivant » contredire le prochain run
- [ ] Nouveau message « édite X » : consignes UI / contexte / gates non contradictoires (reproduire le scénario 1.5.16)
- [ ] Pas de régression 1.5.15–1.5.16 (OW, Retry, carnet, intent_only_write)

---

## Références

- Analyse conversationnelle post-1.5.16 (désync plan / enveloppe)
- [PLAN-1.5.16.md](../1.5.16/PLAN-1.5.16.md) · [ENGINE-RUST-1.5.16.md](../1.5.16/ENGINE-RUST-1.5.16.md)
- TUI : `drox-tui` todo panel · IDE : `ChatTodoListWidget` / `droxAgentsChatSink`
