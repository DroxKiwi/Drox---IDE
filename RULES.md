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
| `Drox---IDE---releases` | Manifestes publics (`latest.json`, notes) — **pas** les gros binaires dans git |

### Releases GitHub

- Fichiers **> 100 Mo** (installeur ~235 Mo) : **GitHub Releases** uniquement, jamais dans l’historique git.
- Dossier local `_upload/` + `.gitignore` (`*.exe`, `*.zip`) dans le repo releases.
- Tag de release : format **`v1.3.0`** (pas d’espaces, pas le titre marketing comme tag).
- Publication : `npm run release-publish-win32` puis commit des manifestes, puis upload de l’exe via Releases (web ou `gh`).

---

## 2. Produit & branding

- Nom utilisateur : **Drox IDE** (moteur **Drox**). Plus de « Nexus » / `kdds-nexus` dans l’UI ou le package.
- Profil utilisateur : `%APPDATA%\.drox-ide`
- `product.json` : source de vérité pour noms exe, mutex, AppId, dossiers.
- URLs produit (`licenseUrl`, `reportIssueUrl`) : pointer vers **Drox** / `Drox---IDE---releases`, pas Microsoft / Nexus.
- Licence distribuée : conserver **`LICENSE.txt`** + **`ThirdPartyNotices.txt`** dans le package ; voir `NOTICE-DROX.txt` pour l’attribution KDDS.

---

## 3. Build & release Windows

### Commandes usuelles

```powershell
# Dev
npm run watch
.\scripts\code.bat

# Icônes + wizard Inno (logo à la racine : logo3.png)
npm run sync-drox-icons

# Package F1
.\scripts\build-release-win32.ps1 -SkipNpmInstall -ForceCompile

# Installeur F2 (nécessite rebuild Electron pour icône exe si logo changé)
.\scripts\build-release-win32.ps1 -SkipNpmInstall -SkipCompile -WithSetup
# Sans -SkipElectron si l’icône de Drox IDE.exe doit changer

# Préparer F3 (manifestes → repo releases)
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
| Marqueur bundle moteur | `'resolved bundled engine'` dans `out-vscode-min/main.js` |

### Installeur (Inno Setup)

- Flux **Inno** hérité Code OSS (`build/win32/code.iss`) — pas electron-builder.
- Rebrand : `code.iss`, `build/win32/i18n/messages.*.isl`, BMP wizard (`npm run sync-drox-inno-wizard` ou via `sync-drox-icons`).
- Couleurs wizard : fond **#1E1E1E**, accent **#3D7A3D** (aligné UI chat Drox).
- Par défaut beta : **PATH** et **associations de fichiers** décochés dans l’installeur.

---

## 4. Moteur Drox (`drox-engine`)

- Chat / run : le moteur packagé doit résoudre `drox.exe` embarqué, pas un `drox` nu sur le PATH.
- `drox.executablePath` = `drox` seul peut court-circuiter l’auto-détection — comportement documenté dans `droxExecutable.ts`.
- Warnings `executable tool … no local counterpart` en mode Architecte : attendus (registre réduit).
- Intégration GitHub du moteur (GitHub App, remote, etc.) ≠ liste **Contributors** GitHub ; pas de lien avec `cursoragent`.

---

## 5. Travail avec les agents IA (Cursor, etc.)

- **Langue** des échanges avec l’utilisateur : **français**.
- **Scope minimal** : pas de refactor ou de fichiers hors sujet sans demande.
- Ne pas committer sans demande ; ne pas pousser sur le remote sans demande.
- Préférer réutiliser les scripts existants (`build-release-win32.ps1`, `sync-drox-win32-icons.ps1`, `release-publish-win32.ps1`) plutôt que réinventer le pipeline.
- Après modif du plan distribution : mettre à jour `drox-engine/docs/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md` et **CLOSURE-1.3.0.md** si le processus change.
- Tests : n’en ajouter que s’ils couvrent un comportement réel demandé, pas des assertions triviales.

---

## 6. Phases distribution (rappel)

Ordre : **P0 → F1 → F2 → F3 → F4 → F5**.

| Phase | Statut typique | Livrable |
|-------|----------------|----------|
| F1 | Build packagé + smoke | `VSCode-win32-x64\Drox IDE.exe` |
| F2 | Installeur | Setup user/system |
| F3 | Canal public | `latest.json` + Release GitHub + exe |
| F4–F5 | Plus tard | Notification MAJ IDE + `inno_updater` |

Checklist smoke : `drox-engine/docs/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md` §8.

---

## 7. Fichiers sensibles

- Ne pas committer : `.env`, clés API, tokens, profils utilisateur.
- `logo3.png` / `logo3.ico` à la racine : sources branding locales (peuvent rester hors git si volumineux — à trancher par l’équipe).
- Binaires releases : `_upload/*.exe` ignorés par git.

---

## 8. Références rapides

| Sujet | Document |
|-------|----------|
| Plan distribution | `drox-engine/docs/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md` |
| Clôture 1.3.0 | `drox-engine/docs/1.3.0/finalisation/CLOSURE-1.3.0.md` |
| Patches fork / merge upstream | `drox-engine/docs/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md` |
| Repo releases | `../Drox---IDE---releases/README.md` |
| Guide dev Drox | `DROX.md` (si présent) |

---

*Dernière mise à jour : 2026-05-29 — enrichir ce fichier quand une règle métier ou build est validée en session.*
