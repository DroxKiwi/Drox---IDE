# 1.6.3

**Statut** : **ouvert**  
**Précédent** : [1.6.2](../1.6.2/README.md) — stable shippée (`v1.6.2`).  
**Git** : branche `1.6.3` depuis `main` (post-ship 1.6.2).

## Objectifs

| Id | Sujet | Fiche |
|----|--------|--------|
| **O1** | Full protocol : une seule conclusion visible (**codé**) | [OBJECTIFS.md](OBJECTIFS.md) § O1 |
| **O2** | Historique de session : plafond de messages **retiré** ; allègement ciblé à la place | [OBJECTIFS.md](OBJECTIFS.md) § O2 |

## Note — depuis l’ouverture de 1.6.3

Le but reste le même : un modèle quelconque peut se brancher, et c’est le moteur qui borne les boucles et le contexte. Les écarts de parcours du modèle ne sont pas traités comme des bugs.

**Clôture.** O1 est codé : après `DONE_ONLY`, une conclusion réécrite sans outil ni `[phase: done]` n’est plus renvoyée au chat, et le run s’arrête. Le full protocol ferme aussi le run sur un tour sans outil, comme les profils locaux. `[phase: done]` reste accepté quand le modèle l’écrit. Le texte synthétique « Run terminé » s’affiche encore, mais il n’est plus remis dans l’historique du tour suivant. Un `bash` terminé avec le code 0 après une modification de fichier compte comme la vérification : le rappel « code modifié sans check » ne part plus dans ce cas.

**Contexte envoyé au modèle.** Le plafond « 4 ou 8 derniers messages » a été retiré. À la place, sans quota : les résultats `file_edit` / `file_write` / `notebook_edit` ne renvoient plus le diff ; `todo_write`, `course_plan_write` et `bash` ne répètent plus la demande. Les anciens `glob` et `task` volumineux sont résumés. Le corps d’un `file_edit` déjà appliqué est retiré des appels plus anciens, avec un marqueur `edit_body` pour que ça ne ressemble pas à un nouvel appel ; un échec (`old_string not found`) garde `edits` pour la correction. Un message utilisateur identique au précédent n’est pas renvoyé deux fois.

**Prompt.** Le mode d’emploi des outils désactivés (mémoire, skills, worktrees) sort du prompt ; il reste la liste courte. `memory_*` n’est plus cité dans la phase `analyzing` quand ces outils sont coupés. Une étape de plan qui nomme un seul fichier ne reçoit plus le rappel Explore. `WORK PLAN FRAME` et le rappel anti-flood ne demandent plus de lancer un `task`.

**IDE, dev seulement.** Le probe d’historique (`Drox: History Probe`) n’existe que hors build release : il rejoue trois messages, enregistre l’historique réellement envoyé au modèle, et écrit le JSON à côté du workspace. Le sélecteur de modèle ne réécrit plus `drox.architect.model` quand le catalogue se charge tout seul (plus de retour forcé sur le premier modèle du provider).
