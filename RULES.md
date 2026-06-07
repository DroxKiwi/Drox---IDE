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
| **`droxVersion`** | `1.3.1` | Release produit : installeur, `latest.json`, dialogue **À propos** |

Pour une nouvelle release Drox : modifier **`droxVersion`** uniquement (sauf rebase upstream majeur → mettre à jour **`version`** aussi).

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
| Alignement release | `out-vscode-min/drox-bundle-stamp.json` = `droxVersion` du `package.json` ; sentinelles chat 1.3.2+ ; vérif post-package (product.json + moteur MODERN) |
| Marqueur bundle moteur | `'resolved bundled engine'` dans `out-vscode-min/main.js` (insuffisant seul — voir `scripts/lib/drox-bundle-readiness.ps1`) |

### Installeur (Inno Setup)

- Flux **Inno** hérité Code OSS (`build/win32/code.iss`) — pas electron-builder.
- **Compilateur : Inno Setup 6.6+** (dark mode natif). Le paquet npm `innosetup` reste en **6.4.1** — ne pas l’utiliser pour compiler l’installeur Drox. Avant F2 : `.\scripts\ensure-inno-setup.ps1` (winget) ou `-Vendor` (ISCC dans `build/win32/inno-setup-6/`).
- Rebrand : `code.iss`, `build/win32/i18n/messages.*.isl`, BMP wizard (`npm run sync-drox-inno-wizard` ou via `sync-drox-icons`).
- Thème : **Inno 6.6+ dark natif** uniquement — `WizardStyle=modern dark hidebevels includetitlebar`, `WizardBackColor=$1E1E1E`. Pas de dessin Pascal custom (évite les artefacts sur le wizard).
- BMP latéraux : `npm run sync-drox-inno-wizard` — fond **#1E1E1E**, logo + barre verte **opaque** (pas d’alpha dans le BMP → évite trait magenta).
- Chrome live : `build/win32/drox-wizard-theme.inc.iss` — faisceau vert animé, grille 3×3 (style chat), masque logo haut-droite + bevels.
- Par défaut beta : **PATH** et **associations de fichiers** décochés dans l’installeur.

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

1. **Sommaire** — ancres FR / EN + lien schéma Mermaid.
2. **Schéma** — état actuel (ex. orchestration 1.3), avant le prose.
3. **Corps FR** — intro une ligne, `___`, invariants, `___`, chronologie par mois.
4. **Corps EN** — même squelette, deuxième moitié du fichier.

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
