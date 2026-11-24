# 2.0.1-1.147.0

**Statut** : branche de travail. La montée VS Code 1.147.0 est commitée en local. Elle n’est pas encore sur `origin`.
**Base** : VS Code 1.147.0, Drox `2.0.1+1.147.0`.

## Erreur de branche

Les retouches d’interface après le dépôt ont été commitées sur `main` au lieu de cette branche. Le message du commit le dit : `fix: retoucher le chat natif, depose par erreur sur main.`

La branche `2.0.1-1.147.0` part de ce `main` local. La suite se fait ici.

## Déjà dans l’arbre local

- Compositeur Drox rétabli dans le chat natif, onglet Chat Microsoft masqué.
- Faux plafond « 160k » retiré du sélecteur de modèle.
- Icône Windows de dev : pas d’AppUserModelId tant que le build n’est pas packagé.
- Grille 3×3 à la place de l’icône Copilot pendant tout le run, retirée à la fin.
- Bandeau de progression VS Code collé au-dessus du compositeur désactivé.
- Marge entre le fil et la barre de saisie.

## Push bloqué

`git push origin main` est refusé par GitHub : l’objet Git LFS `ebdf45f381d459924c43f733f2e94fd15a80ecd93181d93e7d38672be60899e5` n’existe pas en local. Il correspond à `extensions/copilot/test/simulation/cache/layers/225c3482-5729-4633-9555-da6ddb7cbd51.sqlite`, arrivé avec la montée de version. Tant que ce pointeur reste dans les commits non poussés, ni `main` ni cette branche ne peuvent partir.
