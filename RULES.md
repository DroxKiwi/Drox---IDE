# Règles de développement — Drox IDE

Ce fichier fixe les conventions **spécifiques au fork Drox** (build, release, git, agents IA).
Pour l’architecture VS Code / Code OSS, voir [AGENTS.md](AGENTS.md) et [.github/copilot-instructions.md](.github/copilot-instructions.md).

---

## 1. Git & GitHub

### Commits

- Ne créer un **commit** que si l’utilisateur le demande explicitement.
- Messages en **phrases complètes**, orientées le *pourquoi*.
- Ne jamais modifier `git config` (nom, email, hooks globaux).
- Pas de commandes destructives (`push --force` sur `main`/`master`, `reset --hard`) sauf demande explicite.
- Pas de `--no-verify` / `--no-gpg-sign` sauf demande explicite.

### Co-auteur Cursor (important)

Pour éviter **cursoragent** dans les *Contributors* GitHub :

- Préférer des **commits manuels** sans trailer `Co-authored-by: Cursor <cursoragent@cursor.com>`.
- Ou désactiver l’ajout automatique du co-auteur dans les **réglages Cursor** (selon version).
- Si un commit a été amendé par un agent : vérifier le message avec `git log -1 --format=full` avant `push`.
- Pour retirer un co-auteur déjà poussé : `git commit --amend` (message sans `Co-authored-by`) puis `git push --force-with-lease` sur la branche concernée.

### E-mail git (confidentialité)

- **Ne pas** utiliser l’e-mail professionnel sur ce dépôt — utiliser **`corentinfredj.dev@gmail.com`** (ou `git@users.noreply.github.com` si anonymat GitHub).
- Config **locale au repo** (à faire vous-même, une fois) :
  ```powershell
  cd C:\Users\coren\Desktop\GitHub\Drox---IDE
  git config user.email "corentinfredj.dev@gmail.com"
  git config user.name "Corentin Fredj"
  ```
- Si des commits pro ont déjà été poussés : `.\scripts\fix-git-author-email.ps1` (working tree propre) puis `git push --force-with-lease`.

### Dépôts

| Dépôt | Rôle |
|-------|------|
| `Drox---IDE` | Sources, build, développement (souvent privé) |
| `Drox---IDE---OR` | Manifestes publics (`latest.json`, notes, NOTICE) — **pas** les gros binaires dans git |

### Releases GitHub

- Fichiers **> 100 Mo** (installeur ~235 Mo) : **GitHub Releases** uniquement, jamais dans l’historique git.
- Dossier local `_upload/` + `.gitignore` (`*.exe`, `*.zip`) dans le repo releases.
- Tag de release : format **`v1.3.0`** (pas d’espaces, pas le titre marketing comme tag).
- Publication : `npm run drox:ship` (ou `drox:publish` si l’installeur est déjà buildé), puis commit des manifestes, puis upload de l’exe via Releases (web ou `gh`).

### Intégration upstream VS Code (fork à historique produit)

Le dépôt **`origin`** (GitHub) porte un historique **produit Drox** court (~40 commits). Il **n’est pas** un miroir git de `microsoft/vscode` : **pas d’ancêtre commun** avec `upstream/main`.

L’historique Microsoft (~160k commits, ~1,3 Go) vit **en local** via le remote `upstream` — **on ne le pousse pas** sur GitHub. On pousse uniquement le **code** (arbre de fichiers), en **un commit squash** par release ou bump VS Code majeur.

| Où | Rôle |
|----|------|
| **Local** — `1.5.x-dev`, `integrate/vscode-*` | Dev + intégration upstream (`git fetch upstream`, reset/merge **local**) |
| **GitHub** — `main` | Ligne produit : commits Drox + **1 commit squash** par release |
| **GitHub** — tag `v1.x.x` | Pointe le commit squash publié |

#### Développement au quotidien (1.5.1, 1.5.2, …)

```powershell
git fetch origin
git checkout main
git pull origin main
git checkout -b 1.5.2          # branche feature / release
# Dès l’ouverture de branche : bump `droxVersion` dans package.json (ex. 1.5.2)
# … commits UI, moteur, etc. sur la lignée main (pas besoin d’historique MS)
git push -u origin 1.5.2       # pushes légers
```

Les commits **sur la lignée `main`** (sans reset `upstream/main` sur la branche) se poussent normalement — quelques Mo.

#### Intégrer un nouveau VS Code (local seulement)

1. Sauvegarder : `git branch 1.5.x-pre-upstream` ou tag `pre-upstream-YYYYMMDD`.
2. Branche dédiée : `integrate/vscode-<version>` depuis `main` ou la branche release.
3. **Local** : `git fetch upstream` puis `reset --hard upstream/main` + réappliquer couche Drox (`contrib/drox`, `drox-engine`, `product.json`, patches §5 de [ARCHITECTURE-DECOUPLAGE-UPSTREAM](drox-engine/docs/1.2/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md)).
4. Valider : `npm install`, `npm run compile`, `cargo test -p drox-cli`, F5, `drox:ship` si release.
5. **Ne pas** `git push` cette branche full vers `origin` (transfert ~1 Go+).

#### Merger une release sur `main` (publication squash)

Quand la branche de dev ou `integrate/vscode-*` est validée, **publier** sur GitHub sans historique Microsoft :

```powershell
git fetch origin
$ver = '1.5.2'                                    # droxVersion
$src = 'refs/heads/1.5.1'                         # branche validée (ou integrate/vscode-*)

git checkout -B "publish/$ver" origin/main
git read-tree -u --reset $src

# Si le push LFS échoue (caches tests Copilot) :
# git rm -r -f extensions/copilot/test/simulation/cache

git commit --no-verify -m "Release ${ver}: …"     # pre-commit hygiene massif upstream → --no-verify OK si arbre déjà validé

git push origin "refs/heads/publish/${ver}:refs/heads/main"
git tag -f "v${ver}"
git push origin "refs/tags/v${ver}:refs/tags/v${ver}" --force

git checkout main
git pull origin main
```

**Après publication** : `main` local = `origin/main` (un commit squash de plus). Conserver la branche dev / `integrate/*` en local pour le prochain cycle.

**Ce que « merge 1.5.x sur main » veut dire ici** : pas `git merge 1.5.x` (historiques incompatibles si reset upstream) — c’est **`read-tree` + 1 commit** = le produit de la branche validée devient le nouveau `main`.

#### Erreurs fréquentes

| Symptôme | Cause | Fix |
|----------|--------|-----|
| Push bloqué ~15 min puis SSH coupé | Push de la branche full post-`reset --hard upstream` | Publication squash (ci-dessus) |
| `src refspec 1.5.0 matches more than one` | Tag et branche même nom | `refs/heads/…` / `refs/tags/v…` explicites |
| LFS `copilot/test/simulation/cache` manquant | Blobs LFS non fetchés | Retirer ce dossier du commit publish (tests Copilot, hors produit Drox) |
| `main` local diverge de GitHub | Ancienne lignée locale | `git checkout main && git reset --hard origin/main` |

**Réf.** : [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](drox-engine/docs/1.2/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md) §7.

---

## 2. Produit & branding

- Nom utilisateur : **Drox IDE** (moteur **Drox**). Plus de « Nexus » / `kdds-nexus` dans l’UI ou le package.
- Profil utilisateur : `%APPDATA%\.drox-ide`
- `product.json` : source de vérité pour noms exe, mutex, AppId, dossiers.
- URLs produit (`licenseUrl`, `reportIssueUrl`) : pointer vers **Drox** / `Drox---IDE---OR`, pas Microsoft / Nexus.
- Licence distribuée : conserver **`LICENSE.txt`** + **`ThirdPartyNotices.txt`** dans le package ; voir `NOTICE-DROX.txt` pour l’attribution KDDS. EULA produit (non open source) : voir `drox-engine/docs/1.3/1.3.1/finalisation/LICENCE-PRODUIT.md`.
- Release **1.3.1** : pas de liens Microsoft / Copilot visibles à l’usage ; suivi [CLOSURE-1.3.1.md](drox-engine/docs/1.3/1.3.1/finalisation/CLOSURE-1.3.1.md) et [PLAN-DEBRAND-MICROSOFT.md](drox-engine/docs/1.3/1.3.1/finalisation/PLAN-DEBRAND-MICROSOFT.md).

### Versionning (source unique : `package.json`)

| Champ | Exemple | Usage |
|-------|---------|--------|
| **`version`** | `1.122.0` | Base VS Code / API extensions (Copilot, marketplace) — ne pas remplacer par la version Drox |
| **`droxVersion`** | `1.5.2` | Release produit : installeur, `latest.json`, dialogue **À propos**, header chat |
| **`droxSurface`** | `dev` | `dev` en sources / watch ; `release` injecté au package via `DROX_PRODUCT_SURFACE` (`build-release-win32.ps1`) |

Pour une nouvelle release Drox : modifier **`droxVersion`** dans `package.json` **dès l’ouverture de la branche** (ex. `git checkout -b 1.5.3` → passer à `1.5.3`), pas seulement au ship. Sauf rebase upstream majeur → mettre à jour **`version`** aussi. Ne pas committer `droxSurface: release` dans les sources — c’est le pipeline `drox:ship` qui l’écrit dans le `product.json` packagé.

Affichage utilisateur : `1.3.1 (base VS Code 1.122.0)` via `getProductDisplayVersion()` dans le code. Build : `build/lib/droxVersion.ts`.

---

## 3. Build & release Windows

**Guide publication + clôture branche** : [drox-engine/docs/operations/GUIDE-PUBLICATION-WIN32.md](drox-engine/docs/operations/GUIDE-PUBLICATION-WIN32.md)

### Commandes usuelles

```powershell
# Dev
npm run watch
.\scripts\code.bat

# Release Windows (recommandé — une commande)
npm run drox:build              # installeur UserSetup
npm run drox:ship               # installeur + latest.json (repo releases)

# Options (après --)
npm run drox:build -- -Fast     # re-package sans recompiler TS
npm run drox:build -- -Force    # rebundle out-vscode-min (après modif contrib/drox)
npm run drox:build -- -Full     # 1er build : npm install + electron + icône exe

# Bas niveau (si besoin)
npm run sync-drox-icons
.\scripts\build-release-win32.ps1 -SkipNpmInstall -WithSetup
npm run release-publish-win32
```

### Pièges connus

| Situation | Règle |
|-----------|--------|
| Modif TypeScript `contrib/drox` ou résolution moteur | Rebuild avec **`-ForceCompile`** (pas seulement `-SkipCompile`) |
| `-SkipCompile` + besoin du correctif moteur packagé | Incompatible — le bundle garde l’ancien JS |
| Icône barre des tâches / exe | `npm run electron` **sans** `-SkipElectron` |
| Sortie package F1 | Parent du repo : `..\VSCode-win32-x64\` |
| Sortie installeur F2 | `.build\win32-x64\user-setup\Drox-IDE-UserSetup-*.exe` |
| Moteur embarqué | `resources\drox\win32-x64\drox.exe` (à côté de `resources\app\` en package) |
| Alignement release | `out-vscode-min/drox-bundle-stamp.json` = `droxVersion` du `package.json` ; `product.json` packagé : `droxSurface: release`, sans `droxEngineDevBuild` ; `drox.exe` ship sans stamp (`DROX_OMIT_DEV_BUILD=1`) |
| Features dev | Registre `DROX_DEV_FEATURES` / `isDroxDevFeatureEnabled()` — suffixe version chat, simulate MAJ, export transcript |
| Marqueurs bundle | `clientName:"drox-ide"` dans `main.js` ; contributions Drox dans `workbench.desktop.main.js` ; media chat — voir `scripts/lib/drox-bundle-readiness.ps1` |

### Installeur (Inno Setup)

- Flux **Inno** hérité Code OSS (`build/win32/code.iss`) — pas electron-builder.
- **Compilateur : Inno Setup 6.6+** (dark mode natif). Le paquet npm `innosetup` reste en **6.4.1** — ne pas l’utiliser pour compiler l’installeur Drox. Avant F2 : `.\scripts\ensure-inno-setup.ps1` (winget) ou `-Vendor` (ISCC dans `build/win32/inno-setup-6/`).
- Rebrand : `code.iss`, `build/win32/i18n/messages.*.isl`, BMP wizard (`npm run sync-drox-inno-wizard` ou via `sync-drox-icons`).
- Thème : **Inno 6.6+ dark natif** uniquement — `WizardStyle=modern dark hidebevels includetitlebar`, `WizardBackColor=$1E1E1E`. Pas de dessin Pascal custom (évite les artefacts sur le wizard).
- BMP latéraux : `npm run sync-drox-inno-wizard` — fond **#1E1E1E**, logo + barre verte **opaque** (pas d’alpha dans le BMP → évite trait magenta).
- Chrome live : `build/win32/drox-wizard-theme.inc.iss` — faisceau vert animé, grille 3×3 (style chat), masque logo haut-droite + bevels.
- Par défaut beta : **PATH** et **associations de fichiers** décochés dans l’installeur.

---

## 3b. Build & release Linux (1.5.1b)

**Guide** : [drox-engine/docs/operations/GUIDE-PUBLICATION-LINUX.md](drox-engine/docs/operations/GUIDE-PUBLICATION-LINUX.md) · [PLAN-1.5.1b](drox-engine/docs/1.5/1.5.1b/PLAN-1.5.1b.md)

### Commandes usuelles (Ubuntu 22.04+ ou CI)

```bash
export DROX_PRODUCT_SURFACE=release
./scripts/build-release-linux.sh
./scripts/release-publish-linux.sh
```

### Manifeste multi-plateforme

`stable/latest.json` dans `Drox---IDE---OR` est **fusionné** par plateforme (`scripts/lib/drox-release-manifest.mjs`) :

- Windows : `release-publish-win32.ps1` → `platforms.win32-x64`
- Linux : `release-publish-linux.sh` → `platforms.linux-x64`

Ne pas écraser `latest.json` à la main — chaque ship **préserve** les autres plateformes déjà publiées.

| Sortie | Chemin |
|--------|--------|
| App packagée F1 | `../VSCode-linux-x64/` |
| Binaire IDE | `../VSCode-linux-x64/drox-ide` |
| Moteur embarqué | `../VSCode-linux-x64/resources/drox/linux-x64/drox` |
| Paquet .deb | `.build/linux/deb/amd64/deb/*.deb` |
| Upload GitHub | `_upload/Drox-IDE-<droxVersion>-linux-x64.deb` sur tag **`v<droxVersion>`** (même release que Windows) |

CI : workflow `.github/workflows/drox-release-linux.yml` (manuel, artefacts `.deb`).

---

## 4. Moteur Drox (`drox-engine`)

- Chat / run : le moteur packagé doit résoudre `drox.exe` embarqué, pas un `drox` nu sur le PATH.
- `drox.executablePath` = `drox` seul peut court-circuiter l’auto-détection — comportement documenté dans `droxExecutable.ts`.
- Warnings `executable tool … no local counterpart` en mode Architecte : attendus (registre réduit).
- Intégration GitHub du moteur (GitHub App, remote, etc.) ≠ liste **Contributors** GitHub ; pas de lien avec `cursoragent`.

---

## 5. README.md racine — doc moteur

Fichier : [`README.md`](README.md) à la racine du fork. Référence publique du **moteur** — pas de l’IDE, du build, ni du marketing produit.

### Périmètre

- **Oui** : binaire Rust, RPC, orchestration, outils, gates, chronologie des capacités moteur.
- **Non** : quick start IDE, upstream VS Code, CI, licence détaillée, liens vers `drox-engine/docs/`, guides externes, promesses produit.

### Ton — désinvolte et brut

Par **vulgaire**, on entend **direct et sans vernis commercial** — pas grossièreté gratuite.

| À faire | À éviter |
|---------|----------|
| Dire ce que le code fait | « Solution », « expérience », « révolutionnaire », « puissant » |
| Identifiants réels (`delegate_executor`, `RunSpec`) | Vignettes marketing, storytelling (« nous avons voulu… ») |
| Phrases courtes, factuelles | Tableaux « Principe \| Idée » façon pitch |
| « Le client stream, le moteur décide » | Anthropic, Cursor, cloud imposé sauf fait utile (ex. indépendance Ollama) |

Même ton en **FR** et en **EN** (EN = traduction brute, pas re-marketing).

### Structure

1. **Sommaire** — ancres FR / EN + liens vue globale + schéma Mermaid.
2. **Vue globale** — pile Ollama / moteur / IDE (diagrammes grossiers), avant le schéma détaillé.
3. **Schéma** — état actuel (ex. run rail 1.4), avant le prose.
4. **Corps FR** — intro une ligne, `___`, invariants, `___`, chronologie par mois.
5. **Corps EN** — même squelette, deuxième moitié du fichier.

Séparateurs de section : ligne seule `___` (pas de titres « Fonctionnalités » ou « Features »).

### Chronologie

- Une entrée = une ligne, **sans puce** :
  - `` `identifiant_mecanique` — ce que ça fait, en une phrase sèche. ``
- Slugs de blocs : `### 2025-12 — amorçage`, `### 2026-05 — v1_3`, etc.
- Les noms d’identifiants restent stables entre FR et EN (pas de traduction des clés).

### Mermaid

Aligné sur la chronologie : **schéma de flux**, pas plaquette commerciale.

- Nœuds = rôles / binaires (`Architecte`, `Client IDE`, `delegate_executor`).
- Libellés de flèches = verbes techniques courts (`sync`, `reportMarkdown`), compatibles **rendu GitHub** (pas de `tasks[]` / `results[]` dans les flèches, pas de `<br/>` sur les liens, éviter `==>` si ça casse).
- Pas de gras marketing dans les subgraphs.
- Si besoin de précision : petit tableau sous les diagrammes (comme aujourd’hui), pas un paragraphe vendeur.

Mettre à jour les schémas quand le comportement moteur change (version produit ou flag d’orchestration), pas pour la déco.

### Maintenance

- Nouvelle capacité moteur livrée → ligne chronologie + éventuellement schéma / invariant.
- Refonte marketing ou doc IDE → **pas** dans ce README ; autre fichier ou `drox-engine/docs/`.
- Les agents IA qui modifient `README.md` **doivent** appliquer cette section.

---

## 6. Travail avec les agents IA (Cursor, etc.)

- **Langue** des échanges avec l’utilisateur : **français**.
- **Scope minimal** : pas de refactor ou de fichiers hors sujet sans demande.

### Orchestration moteur — interdictions (obligatoire)

- **Pas de listes heuristiques** sur le message utilisateur : interdit de classer l'intention par listes de mots-clés, regex « salut / bonjour / merci », longueur minimale du prompt, ou tout autre NLP codé en dur dans le moteur ou l'IDE pour choisir discuss vs edit.
- **Routage discuss / edit** : uniquement via `architectInteractionMode` (RPC), tour intent modèle (`[gate: architect_discuss|architect_edit]`), ou marqueurs protocolaires déjà définis — pas de raccourci heuristique parallèle.
- **Prompts modèle** : ne pas injecter de numéros de version produit (ex. « Drox 1.2 », « 1.3.2 ») dans les system prompts architecte / exécuteur ; le modèle juge l'intention dans le texte du prompt, le code ne duplique pas cette logique.
- **Plans** : en chemin edit, chaque ligne `todo_write` doit refléter une demande utilisateur explicite — pas de plan d'audit / analyse de répertoire par défaut.

- Ne pas committer sans demande ; ne pas pousser sur le remote sans demande.
- Préférer réutiliser les scripts existants (`build-release-win32.ps1`, `sync-drox-win32-icons.ps1`, `release-publish-win32.ps1`) plutôt que réinventer le pipeline.
- Après modif du plan distribution : mettre à jour `drox-engine/docs/1.3/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md` et **1.3.1/finalisation/CLOSURE-1.3.1.md** si le processus release change.
- Édition de [`README.md`](README.md) racine : respecter la **§5** (ton brut, chronologie, Mermaid).
- Tests : n’en ajouter que s’ils couvrent un comportement réel demandé, pas des assertions triviales.

---

## 7. Phases distribution (rappel)

Ordre : **P0 → F1 → F2 → F3 → F4 → F5**.

| Phase | Statut typique | Livrable |
|-------|----------------|----------|
| F1 | Build packagé + smoke | `VSCode-win32-x64\Drox IDE.exe` |
| F2 | Installeur | Setup user/system |
| F3 | Canal public | `latest.json` + Release GitHub + exe |
| F4–F5 | Plus tard | Notification MAJ IDE + `inno_updater` |

Checklist smoke : `drox-engine/docs/1.3/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md` §8.

---

## 8. Fichiers sensibles

- Ne pas committer : `.env`, clés API, tokens, profils utilisateur.
- `logo3.png` / `logo3.ico` à la racine : sources branding locales (peuvent rester hors git si volumineux — à trancher par l’équipe).
- Binaires releases : `_upload/*.exe` ignorés par git.

---

## 9. Références rapides

| Sujet | Document |
|-------|----------|
| Plan distribution | `drox-engine/docs/1.3/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md` |
| Clôture 1.3.0 (moteur) | `drox-engine/docs/1.3/1.3.0/finalisation/CLOSURE-1.3.0.md` |
| Suivi release 1.3.1 | `drox-engine/docs/1.3/1.3.1/finalisation/CLOSURE-1.3.1.md` |
| Dé-branding 1.3.1 | `drox-engine/docs/1.3/1.3.1/finalisation/PLAN-DEBRAND-MICROSOFT.md` |
| Audit licences 1.3.1 | `drox-engine/docs/1.3/1.3.1/finalisation/AUDIT-LICENCES-1.3.1.md` |
| Feature brainstorm (idées) | `drox-engine/docs/feature-brainstorm/README.md` |
| Patches fork / merge upstream | `drox-engine/docs/1.3/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md` |
| Repo releases | `../Drox---IDE---OR/README.md` |
| Guide dev Drox | `DROX.md` (si présent) |

---

*Dernière mise à jour : 2026-06-02 — §6 orchestration (pas de listes heuristiques, pas de version dans les prompts modèle).*
