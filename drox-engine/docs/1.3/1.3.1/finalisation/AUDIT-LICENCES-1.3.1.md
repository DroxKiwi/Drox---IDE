# Audit licences — release 1.3.1

**Parent** : [CLOSURE-1.3.1.md](./CLOSURE-1.3.1.md) (bloc **A**)

**Objectif** : inventaire des composants distribués dans le Setup Windows + décision par licence (conserver, remplacer, retirer, mention légale).

**Statut** : ⬜ brouillon — à remplir avant publication `v1.3.1`.

---

## Méthode

| Étape | Commande / source | Responsable | Statut |
|-------|-------------------|-------------|--------|
| 1 | Copier / résumer `ThirdPartyNotices.txt` (build VS Code) | | ⬜ |
| 2 | `npx license-checker --production` (racine fork, hors `node_modules` profond si script dédié) | | ⬜ |
| 3 | `cargo license` dans `drox-engine/` | | ⬜ |
| 4 | Lister binaires embarqués (Electron, Node, fish, zsh, …) depuis manifest build | | ⬜ |
| 5 | Valider avec [LICENCE-PRODUIT.md](./LICENCE-PRODUIT.md) | | ⬜ |

---

## Tableau de décision (à compléter)

| Composant | Version | Licence | Où (package / path) | Action 1.3.1 | Statut |
|-----------|---------|---------|---------------------|--------------|--------|
| Visual Studio Code / Code OSS (socle) | `package.json` → `version` | MIT | `LICENSE.txt` | Conserver + attribution | ✅ |
| Electron | | | `ThirdPartyNotices` | Conserver notices | ⬜ |
| drox-engine (Rust) | | | binaire embarqué | Inventaire crates | ⬜ |
| fish-shell | | GPL | terminal intégré ? | Décision A.3 | ⬜ |
| zsh | | GPL | terminal intégré ? | Décision A.3 | ⬜ |
| vscode-js-debug (built-in) | | MIT | `product.json` builtInExtensions | Conserver + notice, pas promo UI | ⬜ |
| … | | | | | ⬜ |

**Actions possibles** : `conserver` | `remplacer` | `retirer` | `source-offer` (GPL) | `avis-juridique`

---

## Synthèse (à remplir en fin d’audit)

| Question | Réponse |
|----------|---------|
| Composants GPL dans le Setup ? | |
| Décision fish / zsh | |
| Fichiers livrés à l’utilisateur | `LICENSE.txt`, `ThirdPartyNotices.txt`, `NOTICE-DROX.txt`, `LICENSE-INSTALL.txt` |
| EULA KDDS joint au binaire ? | voir [LICENCE-PRODUIT.md](./LICENCE-PRODUIT.md) |

---

## Liens

- [CLOSURE-1.3.1.md](./CLOSURE-1.3.1.md)
- [LICENCE-PRODUIT.md](./LICENCE-PRODUIT.md)
- `NOTICE-DROX.txt` (racine fork, si présent)
