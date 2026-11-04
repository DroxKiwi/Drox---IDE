# Rapport — conclusion répétée (2026-11-04)

**Statut** : constaté, pas corrigé.  
**Session** : `ses_0cf92b48-763e-4846-b8e7-171814041052` (workspace `site-kdds`).  
**Export** : `.drox/exports/transcript-ses_0cf92b48-763e-4846-b8e7-171814041052-2026-11-04T09-56-30-078Z.txt` (95 messages). L’index de cet export dit qu’il n’y a pas de capture. Le fichier `.drox/sessions/…run-capture.jsonl` existe quand même : il ne couvre que le run « remettre les composants », 4 tours.

Le même symptôme est déjà décrit pour `cloud-full` dans [1.6.2/DIAG-CLOSURE-REPEAT.md](../../1.6.2/DIAG-CLOSURE-REPEAT.md). Ce run-ci n’emprunte pas ce chemin.

## Ce que l’export montre

Sur chaque fermeture (suppression, puis recréation, plusieurs fois), deux messages `assistant` se suivent sans outil entre eux. Exemple persisté : le même bilan « C’est nettoyé », à 08:13:27 puis à 08:13:30.

En plus, le texte d’un seul message contient déjà le paragraphe deux fois, collé. Le hash du blob est le même pour le message suivant : la deuxième bulle est une copie de la première, doublon inclus.

Comptage sur le run capturé (« remettre en place ») :

| Tour | Phase capturée | Texte | Outils |
|---|---|---|---|
| 1 | `acting` | 0 | `file_write`, `file_edit` |
| 2 | `reading` | 51 car. | `file_read` |
| 3 | `internal_reasoning` | 615 car., le bilan y figure **2 fois** | aucun |
| 4 | (vide) | 615 car., les mêmes 2 copies | aucun |

Le message système qui ouvre le tour 4 est exactement `LOCAL_SOFT_CLOSE_CHECK_NUDGE` : « If nothing is left, write nothing: the reply you already sent stands. »

Le doublon interne est déjà dans le message assistant envoyé au tour 4. Il est donc dans la sortie du modèle au tour 3, avant tout second affichage.

## Cause

Deux mécanismes se cumulent.

1. **Le moteur relance un tour après la conclusion.** Sur `local-27b` (et `cloud-full`, même branche), un tour sans outil ne ferme pas le run si du code a été modifié et qu’aucune phase `testing` n’a eu lieu. `drive.rs` pousse le nudge soft-close et `continue`. Le nudge demande de ne rien écrire si le travail est fini. Le modèle réécrit le bilan. Ce second texte est un nouveau message assistant, environ trois secondes plus tard. Le correctif `DONE_ONLY` (ne pas réafficher la conclusion) ne couvre pas cette branche : elle n’est prise que si le modèle obéit et renvoie un tour vide.

2. **Le modèle écrit le bilan deux fois dans le même tour.** Les 615 caractères du tour 3 contiennent le paragraphe deux fois, phase finale `internal_reasoning` : le thinking natif a ouvert cette phase, et la réponse n’en est pas sortie. Le supplément thinking local dit déjà de ne pas rédiger la réponse dans le thinking puis de l’écrire encore. Ici la copie est dans le canal de contenu, pas seulement à l’écran.

## Solution retenue — à coder plus tard

Deux changements, uniquement dans le moteur. Le prompt dit déjà la bonne chose.

**1. Le second message.** `drive.rs`, clôture locale.

Le tour qui suit un `DONE_ONLY` est déjà masqué : `consume_stream` reçoit `done_only_nudge_sent` et n’émet pas le texte. Passer le même masque quand `local_soft_close_check_sent` est vrai.

Aujourd’hui le texte du tour est enregistré vers la ligne 792, avant le test. Seul un tour vraiment vide est jeté (vers la ligne 865). Déplacer la décision avant `push_assistant_message` : après le nudge, un tour sans outil ne garde pas son texte et le run s’arrête. Le premier bilan reste le seul. Un appel d’outil dans ce tour s’exécute quand même.

**2. Le bilan doublé dans le premier message.** `consume_llm_stream.rs`.

Au tour 3, les 615 caractères contiennent déjà le paragraphe deux fois, phase restée `internal_reasoning`. C’est le canal de contenu. Avant d’envoyer la seconde moitié à l’écran, si le texte est le même bloc collé deux fois, n’en garder qu’un. Sans ça, le premier message montre encore la conclusion en double.
