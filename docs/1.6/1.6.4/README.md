# 1.6.4

**Statut** : **ouvert**  
**Précédent** : [1.6.3](../1.6.3/README.md) — stable shippée (`v1.6.3`).  
**Git** : branche `1.6.4` depuis `main`.

## En cours

Le texte de régulation doit dire la même chose que le moteur.

- **L4 `cloud-full`** : un tour sans outil ferme le run. L’annexe ne demande plus de fermer les todos avant `[phase: done]`, et ne dit plus que le moteur refuse ce marqueur.
- **L5** : si L2 est `core`, `codebase_search` n’est pas dans le schéma. Le rappel de recherche ne cite plus cet outil ; il s’appuie sur le contexte `@Codebase` déjà injecté.

Le clic droit **Open Inline Chat** ouvre le panneau Drox dans l’éditeur (modèle de la conversation). L’onglet **Explain This Code**, aussi dans ce menu, explique uniquement la sélection.

**SDTCM** (Simulator Data Transition into Code Map) : carte 2D du code, du dossier jusqu’à la variable, pour suivre le chemin factuel d’une donnée et rejouer ses transferts. Principe : [SDTCM.md](SDTCM.md). Le prototype n’est pas cadré.
