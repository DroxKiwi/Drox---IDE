# 1.6.3 — Objectifs

**Statut** : ouvert

---

## O1 — Full protocol : une seule conclusion visible — **codé**

**Statut** : codé, dogfood en attente.  
**Profil** : `cloud-full` uniquement. Les profils locaux ferment déjà le run au premier tour sans outil.

### Symptôme

En fin de run, avec un modèle qui ignore `[phase: done]` (repro : `glm-5.3-flash`), le chat affiche **plusieurs fois** le même bilan (souvent 4 à 6). Entre les blocs : « Finished with N steps ».

### Cause

Le full protocol ne s’arrête que lorsque `[phase: done]` est accepté. Si le tour est déjà en `[phase: answering]`, todos fermés et gate de test passée, le moteur envoie `DONE_ONLY` (« n’écris pas la réponse, émets seulement `[phase: done]` »). Le modèle réécrit quand même le bilan. Ce texte est streamé **avant** la décision de relancer. Le détecteur de boucle ne compte un strike que si le corps est identique au tour précédent : une reformulation remet le compteur à zéro.

En `local-27b` / `local-9b`, `engine_closure` fait `return` dès le tour sans outil. `DONE_ONLY` n’est pas envoyé.

### Correctif retenu

Uniquement sur le chemin `DONE_ONLY` (todos fermés, test déjà fait, nudge déjà envoyé) :

1. Au tour suivant, s’il réécrit une conclusion sans `[phase: done]` et sans outil, **ne pas** renvoyer ce texte au chat. La première conclusion reste affichée.
2. Fermer le run (`SyntheticDone`) tout de suite.

Les autres gates restent : test encore dû (`CODE_MUTATION_TESTING_NUDGE`), et `[phase: done]` sans `answering` (`MISSING_ANSWERING`).

Réf. enquête 1.6.2 : [DIAG-CLOSURE-REPEAT](../1.6.2/DIAG-CLOSURE-REPEAT.md).

---

## O2 — Historique de session — **retiré**

**Statut** : essai retiré. Pas de code en place.  
**Commit** : aucun. O1 n’est pas concerné.

### Ce qui a été retiré

Une copie envoyée au modèle ne gardait que les 4 derniers messages (`local-9b`) ou les 8 derniers (`local-27b`, `cloud-full`), et vidait les résultats d’outils au-delà de 2 ou 3. Le transcript du chat n’était pas modifié.

Ce plafond est trop contraignant : un travail sur plusieurs fichiers sort de la queue, et le modèle n’a plus de quoi s’appuyer.

Pas de quota du type « x derniers messages en clair ». Le détail de ce qui a été codé à la place est dans la [note du README](README.md).

### Étape en place

Le résultat renvoyé au modèle pour `file_edit`, `file_write` et `notebook_edit` ne contient plus le diff ni le fichier entier. `todo_write` ne répète plus `todos`, `course_plan_write` ne répète plus `steps`, `bash` ne répète plus la commande. L’appel d’outil garde la demande. Le chat affiche toujours le JSON complet.
