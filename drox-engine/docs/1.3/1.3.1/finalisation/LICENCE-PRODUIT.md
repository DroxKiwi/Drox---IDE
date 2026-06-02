# Cadrage licence produit — Drox IDE 1.3.1

**Parent** : [CLOSURE-1.3.1.md](./CLOSURE-1.3.1.md) (bloc **A**)

**Statut** : brouillon technique — **validation juridique requise** avant publication large.

---

## Intention produit

- **Distribution** : application **non open source** au sens « pas de publication du code source Drox sous licence permissive ».
- **Socle** : fork **Code OSS (MIT Microsoft)** — obligations MIT inchangées sur cette partie.
- **Ajouts KDDS** : moteur Drox, `contrib/drox`, branding, installeur → couverts par **EULA / contrat utilisateur** propriétaire.

---

## Modèle cible (deux couches)

| Couche | Document | Rôle |
|--------|----------|------|
| Socle MIT + dépendances | `LICENSE.txt`, `ThirdPartyNotices.txt` | Obligatoire dans le package |
| Produit Drox / KDDS | EULA (à rédiger), résumé dans `NOTICE-DROX.txt` | Usage du binaire, pas de redistribution sans accord |
| Installeur | `LICENSE-INSTALL.txt`, `licenses/LICENSE-fra.txt` | Acceptation à l’installation : MIT + EULA |

**Interdit** : remplacer le MIT Microsoft par « © KDDS tous droits réservés » sur l’ensemble du dépôt sans distinguer socle / ajouts.

---

## Checklist avant `v1.3.1`

| # | Tâche | Statut |
|---|--------|--------|
| L.1 | Rédiger ou valider EULA KDDS (FR + EN si besoin) | ⬜ |
| L.2 | Aligner `LICENSE-INSTALL.txt` avec EULA | 🟡 |
| L.3 | `NOTICE-DROX.txt` : liste ajouts propriétaires + lien notices tiers | ⬜ |
| L.4 | `product.json` → `licenseUrl` pointe vers NOTICE / EULA publiés (releases repo) | 🟡 |
| L.5 | Dialogue **À propos** : version Drox + base VS Code + liens légaux | 🟡 |
| L.6 | [AUDIT-LICENCES-1.3.1.md](./AUDIT-LICENCES-1.3.1.md) signé « OK release » | ⬜ |

---

## Questions pour conseil juridique

1. EULA B2C gratuite vs licence commerciale future ?
2. Obligation de mise à disposition des sources **modifications MIT** si repo privé ?
3. fish / zsh GPL : conformité « source offer » dans le Setup ?
4. Marque « Visual Studio Code » : formulation autorisée dans « basé sur » ?

---

## Liens

- [CLOSURE-1.3.1.md](./CLOSURE-1.3.1.md)
- [AUDIT-LICENCES-1.3.1.md](./AUDIT-LICENCES-1.3.1.md)
- [RULES.md](../../../../RULES.md) §2
