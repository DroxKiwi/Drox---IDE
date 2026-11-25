# 2.0.1-1.147.0

**Statut** : branche de travail active, poussée sur `origin`.
**Base** : VS Code 1.147.0, Drox `2.0.1+1.147.0`.

## Schéma des branches

| Branche | Contenu |
|---------|---------|
| `origin/main` | ancrage précédent + montée VS Code 1.147.0, sans le cache Copilot LFS absent |
| `2.0.1-1.147.0` | `main` + retouches chat natif + cette doc |

Les retouches d'interface ont d'abord été commitées sur `main` par erreur ; elles vivent maintenant uniquement sur cette branche. La fin du lot se fera par merge de `2.0.1-1.147.0` dans `main`.

## Déjà sur la branche

- Compositeur Drox dans le chat natif, onglet Chat Microsoft masqué.
- Faux plafond « 160k » retiré du sélecteur de modèle.
- Icône Windows de dev : pas d'AppUserModelId tant que le build n'est pas packagé.
- Grille 3×3 pendant tout le run, retirée à la fin.
- Bandeau de progression VS Code collé au-dessus du compositeur désactivé.
- Marge entre le fil et la barre de saisie.

## Encadrement rebase / Playwright

Logique UI externalisée dans `contrib/drox`, seams dans `droxChatWidgetSeams.ts`, ancres `data-testid` sur le pane natif. Détail : [ENCADREMENT-CHAT-NATIF.md](./ENCADREMENT-CHAT-NATIF.md).

## Chantiers avant livraison

Suivi des lots outil « sauvegarder une règle », configuration outils × profils × régulation, et adoption ciblée des mécaniques Cline (discussion + run) : [MAJ-AVANT-LIVRAISON.md](./MAJ-AVANT-LIVRAISON.md).

## Cache LFS retiré

Le fichier `extensions/copilot/test/simulation/cache/layers/225c3482-5729-4633-9555-da6ddb7cbd51.sqlite` pointait un objet Git LFS jamais présent en local ; il a été retiré des commits reconstruits de `main` et de cette branche.