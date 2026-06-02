# Clôture 1.3.1 — Première release publique Drox IDE

**Date** : 2026-05-29  
**Version cible** : `droxVersion` **1.3.1**  
**Statut global** : 🟡 en cours

**Document de suivi unique** pour la release : légal / dé-branding, installeur, MAJ in-app, publication.

**Prérequis livrés en 1.3.0** : moteur parallélisme, F1 build packagé, F3 canal `v1.3.0` — voir [CLOSURE-1.3.0.md](../../1.3.0/finalisation/CLOSURE-1.3.0.md).

**Plans détaillés** (checklists longues) :

| Document | Bloc |
|----------|------|
| [PLAN-DEBRAND-MICROSOFT.md](./PLAN-DEBRAND-MICROSOFT.md) | F — références Microsoft / Copilot / welcome |
| [AUDIT-LICENCES-1.3.1.md](./AUDIT-LICENCES-1.3.1.md) | A — inventaire licences + décisions |
| [LICENCE-PRODUIT.md](./LICENCE-PRODUIT.md) | A — cadrage EULA KDDS + MIT socle |
| [PLAN-DISTRIBUTION-LAUNCHER.md](../../1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md) | C, D — architecture F4 / F5 |

---

## Vue d’ensemble (tableau de bord)

| Bloc | Thème | Statut | Bloque publish ? |
|------|--------|--------|-------------------|
| **A** | Licences & EULA produit | 🟡 | Oui (minimum A.1–A.4) |
| **F** | Dé-branding Microsoft / UX entrée | ⬜ | Oui (minimum F.A + F.B) |
| **B** | Installeur Inno (charte Drox) | 🟡 | Oui |
| **C** | F4 — notification MAJ | ⬜ | Oui (promesse release) |
| **D** | F5 — updater `inno_updater` | ⬜ | Oui (enchaînement avec C) |
| **E** | Publication `v1.3.1` | ⬜ | — |
| **G** | Site vitrine (F6) | ⬜ | Non |
| **H** | ADR / guide release (F7) | 🟡 | Non |

**Critère « release 1.3.1 livrée »** : A + F + B validés, C + D testés bout-en-bout (install A → notif → update → B), E publié sur `Drox---IDE---releases`.

---

## Ordre d’exécution recommandé

```
A.1 audit licences (parallèle possible)
  → A.2–A.5 décisions + EULA/NOTICE
F.A product.json (Copilot, URLs)
  → F.B welcome / onboarding
  → F.C redirections + grep UI
  → F.D alignement installeur / À propos
B.* installeur (rebuild + validation visuelle)
C.* F4 notification
D.* F5 updater
smoke : install 1.3.0 ou rc → publish 1.3.1 → notif → update
E publish v1.3.1
```

---

## Bloc A — Licences & produit non open source

| # | Tâche | Livrable | Statut |
|---|--------|----------|--------|
| A.1 | Inventaire npm + binaires + `ThirdPartyNotices.txt` | [AUDIT-LICENCES-1.3.1.md](./AUDIT-LICENCES-1.3.1.md) | ⬜ |
| A.2 | Inventaire crates `drox-engine` (`cargo license`) | même audit | ⬜ |
| A.3 | Décision par composant GPL (fish, zsh, …) | colonne « action » dans audit | ⬜ |
| A.4 | Choix licence **distribution** (EULA KDDS + MIT socle) | [LICENCE-PRODUIT.md](./LICENCE-PRODUIT.md) + validation juridique | ⬜ |
| A.5 | Textes installeur FR/EN | `LICENSE-INSTALL.txt`, `licenses/LICENSE-fra.txt` | 🟡 |
| A.6 | Fichiers post-install package | `LICENSE.txt`, `ThirdPartyNotices.txt`, `NOTICE-DROX.txt` | 🟡 |
| A.7 | Dialogue **À propos** + lien `licenseUrl` | `product.json`, UI | 🟡 |

**Règles** (non négociables) : conserver MIT Microsoft sur le socle Code OSS ; ne pas supprimer `ThirdPartyNotices.txt` du binaire ; EULA Drox **en plus**, pas à la place du MIT upstream.

---

## Bloc F — Dé-branding Microsoft / VS Code (UI & config)

Checklist détaillée : [PLAN-DEBRAND-MICROSOFT.md](./PLAN-DEBRAND-MICROSOFT.md).

| # | Vague | Résumé | Statut |
|---|-------|--------|--------|
| F.A | `product.json` | Retirer / neutraliser `defaultChatAgent`, aka.ms, gallery si besoin | ⬜ |
| F.B | Welcome & onboarding | Page d’accueil Drox ou désactivation Getting Started / Copilot walkthrough | ⬜ |
| F.C | Redirections & menus | Aide, release notes, issue reporter → Drox uniquement | 🟡 |
| F.D | Package & installeur | Pas de lien Microsoft visible hors attribution légale | 🟡 |
| F.E | Grep qualité | `rg` chaînes utilisateur (hors tests / legal) | ⬜ |

**Critère fin bloc F** : premier lancement sans Copilot, sans aka.ms, sans page « Get Started » Microsoft ; attribution « base VS Code x.y » conservée où requis.

---

## Bloc B — Installeur Inno (charte graphique)

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| B.1 | Wizard dark + BMP logo (opaques, pas d’alpha) | `sync-drox-inno-wizard.ps1`, `drox-wizard-theme.inc.iss`, Inno 6.6+ | 🟡 |
| B.2 | Page licence FR/EN | `LICENSE-INSTALL.txt`, `code.iss` | 🟡 |
| B.3 | PATH + associations décochées (beta) | `code.iss` `[Tasks]` | ✅ |
| B.4 | Messages fin d’install FR/EN | `messages.fr.isl`, `messages.en.isl` | ✅ |
| B.5 | Smoke « Ouvrir avec Drox IDE » | Manuel post-install | ⬜ |
| B.6 | Build Setup `droxVersion` 1.3.1 | `build-release-win32.ps1 -WithSetup` | ⬜ |

### Smoke « Open with Drox IDE »

- [ ] Clic droit fichier → « Ouvrir avec Drox IDE » (si tâche cochée)
- [ ] Clic droit dossier → idem
- [ ] IDE ouvre le bon chemin
- [ ] Désinstall → menu contextuel retiré

---

## Bloc C — F4 Notification MAJ (IDE)

| # | Tâche | Réf. plan § F4 |
|---|--------|----------------|
| C.1 | Settings `drox.update.manifestUrl`, `drox.update.channel` | F4.1 |
| C.2 | `IDroxUpdateService` + parse `latest.json` | F4.2 |
| C.3 | UI notification + commande palette | F4.3 |
| C.4 | No-op update Microsoft (`updateUrl` absent) | F4.4 |
| C.5 | Tests semver / manifest | F4.5 |

URL manifest : `https://raw.githubusercontent.com/DroxKiwi/Drox---IDE---releases/main/stable/latest.json`

### Test bout-en-bout (avec bloc D)

1. Installer version **A** (ex. 1.3.0 ou 1.3.1-rc).
2. Publier version **B** supérieure sur `latest.json` + GitHub Release.
3. Démarrer l’IDE A → **notification** « B disponible ».
4. Accepter → enchaîner bloc D.

---

## Bloc D — F5 Updater technique

| # | Tâche | Réf. plan § F5 |
|---|--------|----------------|
| D.1 | POC `inno_updater.exe` (CLI documentée) | F5.1 |
| D.2 | Lancement depuis `IDroxUpdateService` | F5.2 |
| D.3 | Échec / rollback / logs | F5.3 |
| D.4 | Signature Authenticode | F5.4 — plus tard |

---

## Bloc E — Publication `v1.3.1`

| # | Tâche | Statut |
|---|--------|--------|
| E.1 | `droxVersion` = `1.3.1` dans `package.json` | ⬜ |
| E.2 | `sync-drox-inno-wizard.ps1` + build Setup | ⬜ |
| E.3 | `npm run release-publish-win32 -ProductVersion 1.3.1` | ⬜ |
| E.4 | Commit `stable/latest.json` sur `Drox---IDE---releases` | ⬜ |
| E.5 | `gh release create v1.3.1` + notes | ⬜ |

**Guide commandes** : [GUIDE-PUBLICATION-WIN32.md](../../../operations/GUIDE-PUBLICATION-WIN32.md)

```powershell
npm run drox:ship
# puis repo releases : git push stable/ + Release GitHub (exe dans _upload/)
```

---

## Bloc G / H — Hors chemin critique 1.3.1

| Bloc | Contenu | Statut |
|------|---------|--------|
| G | Site vitrine | ⬜ — Releases GitHub suffit pour v1 |
| H | ADR release, guide contributeur distrib | 🟡 — `RULES.md` racine |

---

## Backlog post-1.3.1 (prochaine release)

| Priorité | Sujet | Doc |
|----------|--------|-----|
| Haute UX | **Chargement segmenté** des discussions historisées — reprise OK mais lente ; afficher la **fin** en premier, puis le reste | [06-chargement-sessions-segmente.md](../../feature-brainstorm/06-chargement-sessions-segmente.md) |
| Haute UX | **Réponses légères** — salutations / « tu en penses quoi ? » sans plan ni délégation systématique ; escalade si contexte repo requis | [07-reponses-legere-sans-plan.md](../../feature-brainstorm/07-reponses-legere-sans-plan.md) |
| Haute produit | **Performance globale** — traitements beaucoup plus rapides (troncature volontaire, moins de tours, tuning à affiner) | [08-performance-traitement-rapide.md](../../feature-brainstorm/08-performance-traitement-rapide.md) |
| — | Autres idées (01–05) | [feature-brainstorm/README.md](../../feature-brainstorm/README.md) |

Retour terrain (2026-06-02) : reprise session validée ; perf chargement, réponses simples et latence runs à traiter en **1.3.2+**.

---

## Journal de suivi

| Date | Événement |
|------|-----------|
| 2026-05-29 | Doc suivi unifié : blocs A, F, B–E ; release = première publique complète |
| 2026-06-02 | Backlog post-release : idées 06 (sessions), 07 (réponses légères), 08 (perf) |
| | |

---

## Liens

- [RULES.md](../../../../RULES.md) — build, versionning, branding
- [1.3.0 — clôture moteur](../../1.3.0/finalisation/CLOSURE-1.3.0.md)
- [PATCHES-UPSTREAM-BUILD.md](../../1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md)
- Repo releases : `Drox---IDE---releases`
- [Feature brainstorm — idée 06 sessions](../../feature-brainstorm/06-chargement-sessions-segmente.md)
