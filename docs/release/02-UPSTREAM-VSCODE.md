# 02 — Mise à jour VS Code

Cette page ne décrit plus la montée. L’ancienne méthode (merge de `upstream/main`, puis recopie d’une liste de dossiers) écrase des réglages Drox et n’est plus à suivre.

La procédure actuelle est locale, dans `docs/Drox---IDE---rebase/README.md`. Ce dossier est ignoré par git : il n’est pas dans le dépôt public. On la lance par `docs/Drox---IDE---rebase/scripts/rebase.ps1 etat`, qui indique l’étape suivante.

Elle rejoue la couche Drox sur la version VS Code demandée, dans un dossier d’atelier, puis dépose l’arbre sur la branche de départ seulement sur demande. Elle ne fait pas de merge.
