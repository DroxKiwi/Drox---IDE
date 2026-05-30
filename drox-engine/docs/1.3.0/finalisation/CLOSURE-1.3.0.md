# Clôture 1.3.0 — Distribution Drox IDE

**Date** : 2026-05-29  
**Référence** : [PLAN-DISTRIBUTION-LAUNCHER.md](./PLAN-DISTRIBUTION-LAUNCHER.md)

Checklist pour boucler la **1.3.0 distribution** avant d’enchaîner sur F4/F5 et la promo publique.

---

## État au 2026-05-29

| Phase | Statut | Notes |
|-------|--------|-------|
| F1 Build packagé | ✅ | Smoke OK (chat, moteur embarqué) |
| F2 Installeur | 🟡 | Fonctionne ; polish UI + licence + context menu à valider |
| F3 Canal releases | ✅ | Release `v1.3.0` publiée, install testée depuis GitHub |
| F4 Notification MAJ IDE | ⬜ | `latest.json` prêt, module IDE à implémenter |
| F5 Updater (`inno_updater`) | ⬜ | POC + intégration service |
| F6 Site vitrine | ⬜ | Hors MVP si Releases suffit |
| F7 ADR / guide release | 🟡 | `RULES.md` ; guide mainteneur partiel |

---

## Bloc A — Conformité licences (priorité haute)

**Objectif** : savoir si une dépendance **oblige** à open-sourcer tout le monorepo.

### Conclusion préliminaire (audit rapide)

| Composant | Licence | Impact distribution binaire |
|-----------|---------|----------------------------|
| **Code OSS / VS Code** | MIT | Attribution Microsoft **obligatoire** — garder `LICENSE.txt` + notice |
| **Drox (KDDS)** | MIT (intention) | Pas de copyleft |
| **drox-engine (Rust)** | Pas de GPL dans `Cargo.toml` | OK |
| **fish-shell 3.7.1** | GPL-2 (partiel) | Composant **terminal-suggest** / doc — binaire embarqué ; obligation GPL sur **ce composant** si distribué lié, pas sur tout l’IDE. Voir `ThirdPartyNotices.txt` § fish-shell |
| **zsh 5.9** | Licence permissive (header) ; certaines fonctions GPL | Même logique — composant shell embarqué, pas le cœur IDE |

**Action** : audit formel à documenter (pas de panique : GPL dans le bundle ≠ « tout le repo doit être public »). Typiquement : conformité via **notices + source offer** pour composants GPL si requis, ou **retrait/remplacement** du composant si politique produit = zéro GPL.

| # | Tâche | Livrable | Statut |
|---|--------|----------|--------|
| A.1 | Scanner `ThirdPartyNotices.txt` + `cargo license` / `npm` pour GPL/AGPL/LGPL | `AUDIT-LICENCES-1.3.0.md` avec liste + décision par composant | ⬜ |
| A.2 | Valider juridiquement ou décision produit : garder fish/zsh ou les retirer du package | ADR ou note dans audit | ⬜ |
| A.3 | Installeur : texte licence **légal** (Microsoft MIT **conservé**) + mention KDDS | `LICENSE-INSTALL.txt`, `licenses/LICENSE-fra.txt` | 🟡 en cours |
| A.4 | Package installé : `LICENSE.txt`, `ThirdPartyNotices.txt`, `NOTICE-DROX.txt` présents | Checklist post-install | ⬜ |

> **Important** : supprimer le copyright Microsoft de la licence serait **illégal** (MIT). On **ajoute** Drox/KDDS en tête, on ne remplace pas.

---

## Bloc B — Installeur Inno (polish F2)

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| B.1 | Panneau wizard noir/vert + logo | `npm run sync-drox-icons` → `inno-big-*.bmp` | ✅ script ; **rebuild + republish** requis sur release actuelle |
| B.2 | Page licence FR/EN avec attribution Drox + Microsoft | `LICENSE-INSTALL.txt`, `licenses/LICENSE-fra.txt`, `code.iss` | 🟡 |
| B.3 | Tâches par défaut : PATH + associations **décochées** (beta) | `code.iss` `[Tasks]` | ✅ code ; republier installeur |
| B.4 | Messages fin d’install FR/EN | `messages.fr.isl`, `messages.en.isl` | ✅ |
| B.5 | **« Ouvrir avec Drox IDE »** — test Explorer (fichier + dossier) | Smoke manuel post-install | ⬜ |
| B.6 | Rebuild Setup + `npm run release-publish-win32` + nouvelle release **v1.3.1** ou **v1.3.0.1** | Pipeline | ⬜ |

### Smoke « Open with Drox IDE »

- [ ] Clic droit sur un fichier `.txt` → « Ouvrir avec Drox IDE » (si tâche cochée à l’install)
- [ ] Clic droit sur un dossier → idem
- [ ] Drox IDE s’ouvre avec le bon chemin
- [ ] Désinstall → entrées menu contextuel retirées

---

## Bloc C — F4 Notification MAJ (IDE)

| # | Tâche | Réf. plan § F4 |
|---|--------|----------------|
| C.1 | Settings `drox.update.manifestUrl`, `drox.update.channel` | F4.1 |
| C.2 | `IDroxUpdateService` + parse `latest.json` | F4.2 |
| C.3 | UI notification + palette | F4.3 |
| C.4 | No-op update Microsoft | F4.4 |
| C.5 | Tests semver / manifest | F4.5 |

URL manifest : `https://raw.githubusercontent.com/DroxKiwi/Drox---IDE---releases/main/stable/latest.json`

---

## Bloc D — F5 Updater technique

| # | Tâche | Réf. plan § F5 |
|---|--------|----------------|
| D.1 | POC `inno_updater.exe` en ligne de commande | F5.1 |
| D.2 | Lancement depuis `IDroxUpdateService` | F5.2 |
| D.3 | Échec / rollback / logs | F5.3 |
| D.4 | Signature Authenticode (optionnel beta) | F5.4 — plus tard |

---

## Bloc E — Release suivante (après B)

```powershell
npm run sync-drox-icons
.\scripts\build-release-win32.ps1 -SkipNpmInstall -SkipCompile -WithSetup
npm run release-publish-win32 -ProductVersion 1.3.1
# git push releases + gh release create v1.3.1 ...
```

Mettre à jour `stable/latest.json` pour pointer vers la nouvelle version une fois publiée.

---

## Ordre recommandé

```
A.1 audit licences → A.2 décision fish/zsh
B.2–B.6 installeur polish + Open-with smoke → republish
C.* F4 (peut chevaucher)
D.* F5 (après F4 partiel)
```

---

## Liens

- [RULES.md](../../../../RULES.md) — règles dev / git / release
- [PATCHES-UPSTREAM-BUILD.md](./PATCHES-UPSTREAM-BUILD.md)
- Repo releases : `../Drox---IDE---releases`
