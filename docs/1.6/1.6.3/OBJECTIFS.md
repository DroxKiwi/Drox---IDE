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

## O2 — Historique de session : le tour en cours reste lisible — **ouvert**

**Statut** : ouvert. Cadrage validé, pas encore codé.  
**Profils** : `local-9b`, `local-27b`, `cloud-full`. Même forme, queue plus courte pour le petit modèle.

### Symptôme

Sur un fil long, le modèle répond à la session entière plutôt qu’au dernier message. Repro `local-27b` + `glm-5.3-flash` : après « Oui fait le », la clôture ressort des sujets du tout début (`/api/track`, BOM, `readFileSync`) et peut rééditer un fichier déjà modifié dans le tour.

### Règle

Pas d’heuristique textuelle pour décider ce qui est important. Seulement le rôle du message, son âge et sa taille.

### Correctif retenu

À chaque nouveau message utilisateur, avant l’appel modèle :

1. Garder le prompt système.
2. Garder en clair les derniers échanges (compte de messages ; queue plus courte en `local-9b`).
3. Remplacer les anciens résultats d’outils par le placeholder de `microcompact`. Aujourd’hui ce passage ne part qu’au débordement de fenêtre.
4. Laisser le message utilisateur du tour en dernier, tel quel.

Si après ça la fenêtre déborde encore : résumé modèle déjà en place (`try_live_compact` / `summarize_run`). La fiche est fixe — fichiers touchés, décisions, sujets en suspens — et les sujets en suspens ne sont pas la tâche du tour. Pas de résumé à chaque message.

Distinct de O1 : O1 coupe la conclusion répétée en full protocol ; O2 allège ce que le modèle relit.
