# Idée 09 — Rôles spécialisés pour la compréhension du code

**Statut** : idée brute  
**Date** : 2026-06-02  
**Priorité** : moteur + UX orchestration (post-1.3.2 ou extension 1.3.x)

---

## Résumé

Introduire de **nouveaux types de rôles** spécialisés (au-delà d’Architecte / Exécuteur) pour mieux séparer **comprendre** le codebase et **agir** dessus — moins de bruit dans le fil, allowlists et prompts plus ciblés, délégations plus courtes et vérifiables.

Objectif : une **meilleure compréhension du code** par le système (cartographie, dépendances, conventions, risques) avant toute mutation, sans forcer un seul modèle « tout-en-un » à enchaîner lecture + plan + patch.

---

## Problème actuel

| Limite `v1_2` | Effet |
|---------------|--------|
| **Architecte** cumule plan, lecture repo, verify, synthèse | Fil chargé, gates nombreuses (`workspace_map_read`, monolith reads, todo/verify) |
| **Exécuteur** aveugle au transcript | Brief long obligatoire ; erreurs de scope |
| Pas de rôle « lecture seule structurée » | `workspace_map_read` + `grep`/`file_read` mélangés dans le même run que la stratégie |
| UI legacy **Exploring** | Confusion entre réflexion modèle et travail réel (voir [CIRCUIT-MOTEUR-GATES-NUDGES.md](../1.3/1.3.2/CIRCUIT-MOTEUR-GATES-NUDGES.md) §12) |

Avec des modèles rapides (ex. gemma4), les gates ressortent plus vite : le besoin d’un **circuit plus net** par intention (comprendre vs modifier) devient visible.

---

## Vision produit

1. **Rôles dédiés « compréhension »** (exemples à affiner) :
   - **Cartographe** — `workspace_map_read`, structure repo, chemins canoniques ;
   - **Analyste** — `grep`, `lsp`, lectures ciblées, graphe d’appels / dépendances (sans mutation) ;
   - **Reviewer** — compare état repo vs objectif, sanity read-only avant clôture ;
   - (L’**Architecte** reste orchestrateur : plan, `todo_write`, `delegate_*`, synthèse utilisateur.)
2. **Délégation explicite** : l’architecte appelle `delegate_<role>` (ou outil unique avec `role: "analyst"`) au lieu d’enchaîner 10 lectures lui-même.
3. **Fil UI par rôle** : cartes distinctes (modèle, statut, rapport `.md` sous `.drox/agent-output/<role>/<task_id>/`) — aligné fil linéaire, sans bandeau Exploring fourre-tout.
4. **Allowlists strictes** par rôle : matrice outils documentée (extension de [ORCHESTRATION-ROLES-TOOLS.md](../1.2/steps/07-roles-tools/ORCHESTRATION-ROLES-TOOLS.md)).

---

## Pistes techniques

| # | Piste | Zone |
|---|--------|------|
| 9.1 | Étendre `RoleId` + `RunSpec::for_orchestration_role` | `run_spec/mod.rs` |
| 9.2 | Prompts + gates par rôle (pas de `file_edit` sur Cartographe/Analyste) | `orchestration/prompts.rs`, `architect_gates.rs` |
| 9.3 | Outil `delegate_analyst` / générique `delegate_role { role, task }` | `drox-tools`, `orchestration_delegate.rs` |
| 9.4 | Modèles distincts par rôle (optionnel) | Lien [01 — serveurs par rôle](01-serveurs-inference-par-role.md) |
| 9.5 | Rapport structuré JSON + `.md` pour reprise par l’architecte | `delegate_report.rs` |
| 9.6 | Paramètre strictesse / profil run | Lien [PATCHNOTES 1.3.2](../1.3/1.3.2/PATCHNOTES-1.3.2.md) § paramètres |

---

## Liens

- [Circuit moteur gates/nudges](../1.3/1.3.2/CIRCUIT-MOTEUR-GATES-NUDGES.md)
- [Onglet parcours modèles](02-onglet-parcours-modeles.md) — visualisation du parcours lecture
- [Réponses légères sans plan](07-reponses-legere-sans-plan.md) — mode discussion sans plan lourd
- [ORCHESTRATION-ROLES-TOOLS.md](../1.2/steps/07-roles-tools/ORCHESTRATION-ROLES-TOOLS.md)

---

## Questions ouvertes

- Quels rôles **MVP** (2–3 max) : Cartographe + Analyste suffisent-ils ?
- Fusionner avec l’ancien sous-agent **Explore** (`task` background) ou le remplacer ?
- Coût tokens : délégations courtes vs architecte qui lit seul — seuil de déclenchement ?
- Même modèle Ollama pour tous les rôles ou petit modèle dédié lecture (4b) + gros modèle plan (26b) ?

---

## Critères de promotion (idée → chantier)

- [ ] Prototype `delegate_analyst` sur un scénario réel (ex. « où est géré X ? ») avec rapport réutilisable par l’architecte.
- [ ] Matrice rôles × outils validée + tests gates.
- [ ] UI : carte rôle lisible, sans Exploring global.
- [ ] Non-régression orchestration `v1_2` existante.
