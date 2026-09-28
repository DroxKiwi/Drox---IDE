# État des lieux — dé-branding Microsoft & licences (1.3.2)

**Parent** : [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md) · hérite [PLAN-DEBRAND-MICROSOFT.md](../../1.3.1/finalisation/PLAN-DEBRAND-MICROSOFT.md)

**But** : inventorier ce qui expose encore **Microsoft / Copilot / aka.ms** et cartographier les **dépendances & licences** avant tag stable.

---

## 1. Obligations légales (ne pas supprimer)

| Artefact | Statut | Action |
|----------|--------|--------|
| `LICENSE.txt` (MIT Microsoft) | Requis Code OSS | **Conserver** dans package |
| `ThirdPartyNotices.txt` | Agrégat deps npm/rust | **Conserver** ; regénérer avant ship si deps changent |
| `NOTICE-DROX.txt` / releases NOTICE | Marque KDDS | Vérifier lien `licenseUrl` produit |
| Copyright headers `Microsoft Corporation` dans sources forkées | MIT | **Conserver** sur fichiers non réécrits |
| Mention « basé sur VS Code » (À propos) | Transparence | **Garder** avec `version` base + `droxVersion` |

---

## 2. `product.json` — exposé runtime

| Zone | Risque utilisateur | Statut 2026-06 | Action 1.3.2 |
|------|-------------------|----------------|--------------|
| Noms Drox (`nameShort`, AppId, mutex) | OK | ✅ | — |
| `licenseUrl`, `reportIssueUrl` | OK Drox GitHub | ✅ | — |
| `defaultChatAgent` | **aka.ms**, API Copilot, extension `github.copilot-chat` | 🟡 | URLs → NOTICE Drox ; backup [assets/](assets/product-defaultChatAgent.microsoft-backup.json) |
| `droxMicrosoftAgentsSurfaceEnabled` | Interrupteur surfaces MS | ✅ | `false` en release — voir [D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md](D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md) |
| `builtInExtensions` (js-debug ×3) | Publisher « Microsoft » dans métadonnées | 🟡 | OK légal ; pas promu UI |
| `skipCopilotGitHubSignIn` | | ✅ `true` | — |
| `webviewContentExternalBaseUrlTemplate` | `vscode-cdn.net` | 🟡 | Acceptable build ; pas user-facing |
| `onboardingKeymaps` id `vscode` | Label « VS Code » | 🟡 | Renommer « Default » en UI Drox |
| `agentsTelemetryAppName` | Télémétrie agents MS | 🟡 | Coupler désactivation agents R3 |

---

## 3. Workbench — grep indicatif

Commandes (excl. `*test*`, `*.d.ts` proposés) :

```powershell
rg -i "aka\.ms|microsoft\.com|vscode\.com" src/vs/workbench/contrib --glob "!**/*test*"
rg -i "Copilot|GitHub Copilot|Open in Agents" src/vs/workbench/contrib --glob "!**/*test*"
```

| Zone | Fichiers clés | Priorité UI |
|------|---------------|-------------|
| Welcome / Getting Started | `welcomeGettingStarted/`, `welcomeOnboarding/`, `welcomeAgentSessions/` | **P0** |
| Chat / Agents | `contrib/chat/`, `agentSessionsActions.ts` | **P0** (masqué si R3) |
| Menu Aide | `workbench.actions.*`, `productService` URLs | P1 |
| Télémétrie | `workbench/services/telemetry/` | P1 — opt-out total |
| Comptes | `github-authentication`, sign-in flows | P1 |
| **Drox** `contrib/drox/` | Headers copyright MS (template) | P2 — cosmétique |

**Contrib Drox** : ~130 fichiers avec header `Copyright (c) Microsoft` — **légal OK** ; rebranding header optionnel (KDDS) hors 1.3.2.

---

## 4. Dépendances — inventaire

### 4.1 Socle IDE (npm / build)

| Source | Fichier | Licence dominante |
|--------|---------|-------------------|
| VS Code / Code OSS tree | `LICENSE.txt` | MIT (Microsoft) |
| npm runtime | `package.json` + `ThirdPartyNotices.txt` | Mix MIT/Apache/BSD |
| Built-in extensions | `product.json` → `builtInExtensions` | MIT (Microsoft repos) |

**Action** : avant `drox:ship`, vérifier `ThirdPartyNotices.txt` à jour (`npm run gulp vscode-win32-x64` pipeline existante).

### 4.2 Moteur Drox (Rust)

| Crate | Chemin | Licence |
|-------|--------|---------|
| `drox-engine`, `drox-cli`, … | `drox-engine/drox/crates/*` | Voir `Cargo.toml` / repo KDDS |
| Dépendances crates.io | `Cargo.lock` | `cargo license` (à exécuter en CI) |

**Livrable** : section `drox-engine/NOTICE` ou append dans releases si distribué séparément.

### 4.3 Extensions marketplace

| État | Note |
|------|------|
| Marketplace VS / Open VSX | Non requis release 1.3.2 |
| Copilot extensions | **Non** installer par défaut |

---

## 5. Matrice tâches (vagues)

### Vague D1 — Produit visible (bloquant stable)

| ID | Tâche | Statut |
|----|-------|--------|
| D1.1 | `defaultChatAgent` sans aka.ms | ✅ |
| D1.2 | Agents VS Code off ([D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md](D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md)) | ✅ |
| D1.3 | Welcome sans Copilot | ☐ |
| D1.4 | Menu Aide → URLs Drox | ☐ |
| D1.5 | Télémétrie MS désactivée | ☐ |

### Vague D2 — Package & legal

| ID | Tâche | Statut |
|----|-------|--------|
| D2.1 | `ThirdPartyNotices.txt` regénéré | ☐ |
| D2.2 | Installeur : textes « Drox IDE » | ☐ |
| D2.3 | EULA / NOTICE release repo | ☐ |

### Vague D3 — Fond (post-stable)

| ID | Tâche |
|----|-------|
| D3.1 | Headers copyright fichiers Drox réécrits |
| D3.2 | Retrait code mort chat Copilot si upstream le permet |
| D3.3 | Open VSX curation |

---

## 6. Critères grep pré-tag

| # | Critère | OK ? |
|---|---------|------|
| E1 | Aucun `aka.ms` dans chemins **1er lancement** | ☐ |
| E2 | Pas de « Sign in to Copilot » par défaut | ☐ |
| E3 | À propos : Drox + base VS Code, pas « Visual Studio Code » seul | ☐ |
| E4 | `ThirdPartyNotices.txt` présent dans installeur | ☐ |

---

## Liens

- [LICENCE-PRODUIT.md](../../1.3.1/finalisation/LICENCE-PRODUIT.md)
- [RULES.md](../../../../RULES.md) §2
