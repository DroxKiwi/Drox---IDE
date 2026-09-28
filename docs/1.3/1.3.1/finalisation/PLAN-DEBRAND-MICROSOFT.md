# Plan dé-branding Microsoft / VS Code — release 1.3.1

**Parent** : [CLOSURE-1.3.1.md](./CLOSURE-1.3.1.md) (bloc **F**)

**Objectif** : retirer ou remplacer tout ce qui expose Microsoft, Copilot, aka.ms ou l’onboarding VS Code par défaut, **sans** violer les obligations MIT du socle Code OSS.

---

## Ce qu’on ne supprime pas (légal)

- `LICENSE.txt` MIT + copyright Microsoft Corporation
- `ThirdPartyNotices.txt` dans le package distribué
- Mention utilisateur du type « basé sur Visual Studio Code / Code OSS » (version base dans `package.json` → `version`)
- Extensions embarquées Microsoft **MIT** (ex. `vscode-js-debug`) : OK dans le binaire si listées dans les notices ; pas besoin de les promouvoir dans l’UI

---

## Vague F.A — `product.json` et config produit

| # | Tâche | Fichiers / notes | Statut |
|---|--------|------------------|--------|
| F.A.1 | Neutraliser `defaultChatAgent` (URLs aka.ms, API GitHub Copilot, provider Copilot) | `product.json` | ⬜ |
| F.A.2 | Vérifier absence `updateUrl` Microsoft | `product.json` | ✅ |
| F.A.3 | `licenseUrl`, `reportIssueUrl`, doc → Drox releases uniquement | `product.json` | 🟡 |
| F.A.4 | `extensionsGallery` / trusted domains : pas de domaine Microsoft obligatoire si marketplace désactivée | `product.json` | ⬜ |
| F.A.5 | `skipCopilotGitHubSignIn` et flags produit cloud cohérents | `product.json` | 🟡 |

---

## Vague F.B — Welcome, onboarding, walkthrough

| # | Tâche | Fichiers / notes | Statut |
|---|--------|------------------|--------|
| F.B.1 | Désactiver ou remplacer Getting Started Microsoft | `welcomeGettingStarted/`, `gettingStartedContent.ts` | ⬜ |
| F.B.2 | Désactiver `welcomeOnboarding` / Agent Sessions welcome si visible | `welcomeOnboarding/`, `welcomeAgentSessions/` | ⬜ |
| F.B.3 | Retirer ou remplacer walkthrough éditeur VS Code | `welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough.md` | ⬜ |
| F.B.4 | Option produit : ne pas ouvrir welcome au 1er lancement (`skip-welcome` / contribution off) | `product.json`, `workbench.common.main.ts` ou flag Drox | ⬜ |
| F.B.5 | Page d’accueil Drox minimale (option) : ouvrir dossier, chat, réglages Ollama | `contrib/drox/` | ⬜ |
| F.B.6 | Bannière welcome Copilot / `welcomeBanner` | `welcomeBanner/` | ⬜ |

**Critère** : aucun lien aka.ms au premier lancement ; pas de texte « Copilot » dans l’écran d’accueil.

---

## Vague F.C — Redirections, menus, comptes

| # | Tâche | Statut |
|---|--------|--------|
| F.C.1 | Menu **Aide** : documentation, release notes → URLs Drox ou locales | 🟡 |
| F.C.2 | Signaler un problème → `reportIssueUrl` Drox | 🟡 |
| F.C.3 | Télémétrie Microsoft désactivée / non envoyée | ⬜ |
| F.C.4 | Compte Microsoft / GitHub par défaut non poussé à l’ouverture | ⬜ |
| F.C.5 | Chat panel : pas de promotion Copilot si agent Drox actif | ⬜ |

---

## Vague F.D — Installeur & package

| # | Tâche | Statut |
|---|--------|--------|
| F.D.1 | Textes wizard : « Drox IDE », pas « Visual Studio Code » sauf licence | 🟡 |
| F.D.2 | `LICENSE-INSTALL.txt` : MIT Microsoft + EULA KDDS (voir bloc A) | 🟡 |
| F.D.3 | Raccourcis / `VisualElementsManifest` : branding Drox | 🟡 |

---

## Vague F.E — Contrôle qualité (grep)

Commandes indicatives (à exécuter avant publish) :

```powershell
# Chaînes à traiter au cas par cas (exclure legal, tests, commentaires copyright)
rg -i "aka\.ms|microsoft\.com|vscode\.com" src/vs/workbench src/vs/platform product.json --glob "!**/*test*"
rg -i "Copilot|GitHub Copilot" src/vs/workbench/contrib --glob "!**/*test*"
```

| # | Critère | Statut |
|---|---------|--------|
| F.E.1 | Aucun `aka.ms` dans chemins utilisateur actifs | ⬜ |
| F.E.2 | Pas de « Sign in to use Copilot » par défaut | ⬜ |
| F.E.3 | Revue manuelle écran **À propos** | ⬜ |

---

## Hors périmètre 1.3.1 (backlog)

- Retrait complet marketplace Open VSX / extensions Microsoft optionnelles
- Refonte totale de tous les walkthroughs extensions tierces
- Plan Anthropic déjà couvert par [PLAN-SUPPRESSION-REFERENCES-EXTERNES.md](../../../0.0/plans/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md) (moteur / CLI)

---

## Liens

- [CLOSURE-1.3.1.md](./CLOSURE-1.3.1.md)
- [LICENCE-PRODUIT.md](./LICENCE-PRODUIT.md)
- [RULES.md](../../../../RULES.md) §2 Produit & branding
