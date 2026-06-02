# Idée 07 — Réponses légères sans plan (salutations, avis rapide)

**Statut** : idée validée terrain — cible **post-1.3.1**  
**Date** : 2026-06-02  
**Priorité** : haute UX / coût tokens

---

## Résumé

Pour les messages **simples** qui ne justifient pas un cycle architecte complet (`todo_write`, `delegate_executor`, exploration lourde), le moteur doit répondre **directement** — court, naturel, sans faux « plan » ni enchaînement d’outils inutile.

L’architecte ne déclenche plan + délégation **que** si le besoin de contexte repo ou d’exécution est réel.

---

## Problème actuel

| Exemple utilisateur | Comportement souhaité | Risque actuel |
|--------------------|----------------------|---------------|
| « Salut, ça va ? » | Réponse courte, pas d’outils | Cycle complet, phases, todo, latence |
| « Je veux faire X, tu en penses quoi ? » | Avis / questions de clarification, éventuellement 1–2 lectures ciblées | Plan multi-étapes, exécuteurs, surcoût |
| « Explique-moi ce fichier » (sans modifier) | Lecture + synthèse | Délégation executor inutile |

L’orchestration `v1_2` est optimisée pour les **tâches de dev** ; les **échanges conversationnels** payent le même prix qu’un refactor.

---

## Vision produit

1. **Détection d’intention légère** (heuristique + modèle) : salutation, small talk, demande d’avis sans livrable, question métier sans chemin fichier explicite.
2. **Mode réponse directe** : une phase `answering` (ou équivalent) **sans** `todo_write` obligatoire ni `delegate_executor` par défaut.
3. **Escalade progressive** :
   - d’abord réponse depuis le contexte déjà en transcript ;
   - si insuffisant → `file_read` / `grep` ciblé (architecte seul, allowlist courte) ;
   - si mutation ou gros périmètre → plan + délégation comme aujourd’hui.
4. **Prompt architecte** : règle explicite « ne pas inventer un plan pour une question qui n’en demande pas ».

---

## Pistes techniques

| Piste | Détail |
|-------|--------|
| **Classifieur entrée** | Tag `light_reply` vs `task` avant le premier tour LLM (moteur ou pré-pass petit modèle) |
| **RunSpec allégé** | Profil « chat » : allowlist réduite, pas de `delegate_executor` tant que non requis |
| **Gates** | Ne pas nudger `todo_write` si intention légère détectée |
| **Few-shot** | Exemples FR/EN dans `architect_system_prompt` (salut → 1 phrase ; avis → 3–5 phrases max) |
| **Métrique** | % runs sans délégation sur corpus de prompts courts |

---

## Critères d’acceptation (MVP)

- [ ] « Salut, ça va ? » → réponse en < 5 s ressenti, **zéro** `delegate_executor`.
- [ ] « Tu en penses quoi de faire Y ? » → avis structuré court ; plan uniquement si l’utilisateur confirme ou demande implémentation.
- [ ] Tâche explicite (« ajoute un bouton dans `App.tsx` ») → comportement orchestration actuel inchangé.
- [ ] Pas de régression sur les gates `done` / `answering` des vrais runs.

---

## Liens

- [VISION-CONSOLIDEE-1.3.0.md](../1.3/1.3.0/steps/01-vision/VISION-CONSOLIDEE-1.3.0.md) — rôles architecte / exécuteur
- [ARCHITECT-STATE-MACHINE.md](../1.2.0/steps/08-architect-state/ARCHITECT-STATE-MACHINE.md) — phases et gates
- [CLOSURE-1.3.1.md](../1.3/1.3.1/finalisation/CLOSURE-1.3.1.md) — backlog post-release
