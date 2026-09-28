# Idée 07 — Réponses légères sans plan (salutations, avis rapide)

**Statut** : partiellement livré 1.3.2 (discuss heuristique) — **cible complète [1.4.0 Run Rail](../1.4/archive/1.4.0/README.md)**  
**Date** : 2026-06-02 · mis à jour 2026-06-05  
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

## Implémentation 1.3.2 (moteur)

| Élément | Détail |
|---------|--------|
| **Gate (modèle)** | Tour intent : le modèle répond à « demande de modification ? » par **`[gate: architect_edit]`** ou **`[gate: architect_discuss]`** (prompt `ARCHITECT_INTENT_SYSTEM_PROMPT`) |
| **Override RPC** | `architectInteractionMode` = `discussion` \| `action` \| `auto` (pas de tour intent si forcé) |
| **Discussion** | Rôle `ArchitectDiscussion` — outils **lecture seule** (map, read, grep, glob, lsp), pas de plan ni `delegate_executor` |
| **Édition** | Rôle `Architect` — orchestration actuelle |

Voir `orchestration/architect_gate.rs` et `orchestration_run.rs`. **Pas de liste heuristique de mots-clés.**

---

## Suite 1.4 (Run Rail)

L’idée 07 est absorbée par le **rail consultatif** :

- `[gate: hold]` à la frontière INTENT/READ = réponse légère sans plan ;
- `[gate: advance]` seulement si le modèle juge la profondeur nécessaire ;
- mode **A** : candidate unique proposée par le moteur.

Voir [01-VISION.md](../1.4/archive/1.4.0/01-VISION.md) et [03-STATIONS.md](../1.4/archive/1.4.0/03-STATIONS.md).

---

## Pistes techniques (historique)

| Piste | Détail |
|-------|--------|
| **Classifieur entrée** | Tag `light_reply` vs `task` avant le premier tour LLM (moteur ou pré-pass petit modèle) |
| **RunSpec allégé** | Profil « chat » : allowlist réduite, pas de `delegate_executor` tant que non requis |
| **Gates** | Ne pas nudger `todo_write` si intention légère détectée |
| **Few-shot** | Exemples FR/EN dans `architect_system_prompt` (salut → 1 phrase ; avis → 3–5 phrases max) |
| **Métrique** | % runs sans délégation sur corpus de prompts courts |

---

## Critères d’acceptation (MVP)

- [ ] « Salut, ça va ? » → tour intent → gate `architect_discuss`, pas de plan / pas de `delegate_executor` (dogfooding `chat.txt` : échec si chemin edit).
- [x] « Tu en penses quoi de faire Y ? » → même voie discussion si le modèle (ou RPC) choisit `discuss`.
- [ ] Tâche explicite (« ajoute un bouton dans `App.tsx` ») → gate `architect_edit` + orchestration inchangée (validation dogfooding).
- [ ] Pas de régression sur les gates `done` / `answering` des vrais runs.
- [x] Sous-mode édition : `[mode: discovery|task]` parsé côté modèle, ancré dans le cycle (`architect_mode.rs`, ancre cycle).

---

## Liens

- [VISION-CONSOLIDEE-1.3.0.md](../1.3/1.3.0/steps/01-vision/VISION-CONSOLIDEE-1.3.0.md) — rôles architecte / exécuteur
- [ARCHITECT-STATE-MACHINE.md](../1.2.0/steps/08-architect-state/ARCHITECT-STATE-MACHINE.md) — phases et gates
- [CLOSURE-1.3.1.md](../1.3/1.3.1/finalisation/CLOSURE-1.3.1.md) — backlog post-release
