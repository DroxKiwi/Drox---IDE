# 1.6.4

**Statut** : **shippé** (`v1.6.4`)  
**Précédent** : [1.6.3](../1.6.3/README.md) — stable shippée (`v1.6.3`).  
**Git** : mergée sur `main`. La branche `1.6.4` a été supprimée.

## Commits sur `1.6.4`

| Commit | Sujet |
|--------|--------|
| `4be29a56` | Explain dans l’éditeur, régulation alignée sur le moteur |
| `ed88d98d` | Carte SDTCM : briques, liens, data |
| `c833c442` | Tags sur la carte, relance d’une étape depuis le header |
| `882a0d4d` | Réaligner sur les fichiers changés, correction d’un tag refusé |
| `0e29cdda` | Plus de phase testing exigée avant de clore un run |
| `ece6bfb3` | Installation en ligne de commande, chat dans la barre de titre |
| `c3224e30` | Tutoriels IDE et Agents, SDTCM dans la fenêtre Agents |

**Régulation.** L4 `cloud-full` : un tour sans outil ferme le run. L’annexe ne demande plus de fermer les todos avant `[phase: done]`, et ne dit plus que le moteur refuse ce marqueur. L5 : si L2 est `core`, `codebase_search` n’est pas dans le schéma. Le rappel de recherche ne cite plus cet outil ; il s’appuie sur le contexte `@Codebase` déjà injecté.

**Éditeur.** Le clic droit **Open Inline Chat** ouvre le panneau Drox dans l’éditeur, branché sur le modèle de la conversation. **Explain This Code**, dans le même menu, explique uniquement la sélection.

**SDTCM.** La carte se dessine : briques, liens de fichier, data sous la brique qui les a fait naître. Le header choisit l’étape (build, data, trace, link, tag) et peut la relancer. Un tag refusé revient au modèle avec la forme à réécrire. **Réaligner** ne reprend que les fichiers changés et garde la carte déjà construite. Principe et écart restant : [SDTCM.md](SDTCM.md).

**Clôture.** La phase testing n’est plus exigée avant de fermer un run. Le rappel de fin de tour local ne parle plus que des todos encore ouverts. `local-9b` n’a pas ce rappel.

**Installation.** `scripts/install/install.ps1` (Windows) et `install.sh` (Linux, x64) prennent la release GitHub marquée Latest, vérifient le SHA256, et réinstallent. Les commandes sont dans le [README](../../../README.md).

**Barre de titre IDE.** Le chat n’est plus un onglet de la barre latérale. Le bouton est à côté d’Open in Agents. Vert si le chat est ouvert, gris sinon. L’apparition et la disparition du panneau sont inchangées.

**Tutoriel IDE.** Bouton Tutorial à gauche d’Open in Agents. Le reste de l’écran s’assombrit, la zone en cours est éclairée. Première carte : fork de Visual Studio Code 1.127, seul endroit avec le lien vers la documentation. Ensuite Open in Agents, sans ouvrir cette fenêtre. Puis chaque bouton du chat, les fenêtres de réglage, et une fausse connexion (`http://127.0.0.1:11434`) qui n’est pas enregistrée. Ensuite Codebase, Regulation, Traffic, Ports, SDTCM : d’abord l’icône, puis l’intérieur de l’onglet. SDTCM ouvre la carte sans lancer de run. Consistency n’est pas présenté : c’est un outil de dev.

**Tutoriel Agents.** Bouton livre dans le header, à gauche d’Open Git Graph. Même enchaînement que l’IDE pour quelqu’un qui n’a pas fait l’autre tour : documentation, Open in Editor (sans quitter la fenêtre), chat, puis chaque onglet. Avant d’ouvrir un onglet, le tour éclaire son icône sur la carte d’historique et crée une discussion factice s’il n’y en a pas. Ensuite seulement ce qui est propre à cette fenêtre : la liste des discussions, le bouton lecture qui garde la session active, les voyants et les statistiques. Les voyants et les chiffres ne s’éclairent que si la session est déjà gardée active : le tour ne presse pas lecture.

**Agents, hors tour.** Codebase, Regulation, Traffic, Ports et SDTCM ont un hôte dans la barre auxiliaire et une icône sur la carte de discussion. Ouvrir SDTCM charge la carte du dossier de cette discussion dans la colonne d’édition, sans lancer de run. Les puces Lexical et Regulation ont été retirées du composer.

## Plus tard

Bugs transverses constatés, pas au plan de cette passe : [MAJ/BUGS-TRANSVERSES.md](MAJ/BUGS-TRANSVERSES.md).
