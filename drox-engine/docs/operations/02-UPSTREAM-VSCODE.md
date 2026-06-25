# 02 — Mise à jour VS Code (upstream)

À faire **seulement** si tu changes `version` (base VS Code) dans `package.json`.

**Ne pas** merger `upstream/main` directement sur `main` sources (historiques séparés).

---

## 1. Sauvegarder

```powershell
cd <REPO>
git checkout main
git pull origin main
git tag <DROX_VER>-pre-upstream main
```

---

## 2. Créer / mettre à jour la branche integrate

**Si une base `integrate/vscode-from-*` existe déjà** (cas habituel) :

```powershell
git fetch upstream
git checkout -B integrate/vscode-<VSCODE_VER>-from-<DROX_VER> integrate/vscode-from-<ancre>
git merge upstream/main -m "merge: upstream/main vers <VSCODE_VER>"
```

**Première fois** (pas encore de base integrate) :

```powershell
git checkout -b integrate/vscode-from-<DROX_VER> <tag-ou-branche-drox>
git merge upstream/main
```

---

## 3. Réappliquer la couche Drox depuis `main`

```powershell
git checkout main -- `
  src/vs/workbench/contrib/drox `
  drox-engine `
  package.json product.json `
  build/lib/droxVersion.ts `
  build/lib/stylelint/vscode-known-variables.json `
  .eslint-allowed-javascript-files `
  scripts/drox-release.ps1 scripts/fix-drox-precommit.mjs `
  scripts/lib/drox-bundle-readiness.ps1 scripts/lib/drox-release-manifest.mjs `
  resources/drox resources/win32/drox.ico resources/win32/drox_256.png `
  NOTICE-DROX.txt LICENSE-INSTALL.txt logo3.png `
  .github/workflows/drox-release-linux.yml `
  scripts/templates/NOTICE.md `
  src/vs/workbench/browser/media/kdds-code-icon.png `
  scripts/build-release-linux.sh scripts/release-publish-linux.sh `
  scripts/verify-packaged-linux.sh `
  drox-engine/docs/operations/scripts/wsl-linux-build-isolated.ps1 `
  drox-engine/docs/operations/scripts/wsl-linux-build.sh `
  drox-engine/docs/operations/scripts/restore-windows-dev.ps1 `
  drox-engine/docs/operations/scripts/restore-windows-dev-deps.ps1 `
  scripts/wsl-linux-build.ps1 scripts/wsl-linux-build.sh `
  scripts/restore-windows-dev.ps1 scripts/restore-windows-dev-deps.ps1
```

Supprimer les fichiers morts (présents sur integrate, absents de `main`) :

```powershell
git status --short
git rm -f <fichier-obsolète>
```

Mettre à jour `package.json` :

- `version` → `<VSCODE_VER>` (depuis upstream)
- `droxVersion` → inchangé (ex. `1.5.4`)
- `distro` → valeur upstream si conflit

---

## 4. Résoudre conflits build fork

Fichiers sensibles — garder les patches Drox :

| Fichier | Garder |
|---------|--------|
| `build/lib/electron.ts` | `winIcon` drox · `DROX_SKIP_ELECTRON_CHECKSUM` · feed upstream si présent |
| `build/gulpfile.vscode.ts` | `core-ci-desktop` · embarquement `resources/drox` |

Détail : [PATCHES-UPSTREAM-BUILD.md](../1.3/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md)

`vscode-known-variables.json` : prendre upstream + variables `--drox-*` / `--nexus-*` de `main`.

---

## 5. Valider integrate

```powershell
.\scripts\list-nexus-patches.ps1
npm run compile
cd drox-engine/drox; cargo test --workspace; cd ../..
npm run precommit
git add -A
git commit -m "Intégrer VS Code <VSCODE_VER> avec couche Drox <DROX_VER>."
```

Smoke F5 identique à [01-BRANCHE.md](01-BRANCHE.md) §3.

**Release depuis integrate** : possible sans merger `main` → [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md).

---

## 6. (Optionnel) Publier l’intégration sur `main` sources

```powershell
git fetch origin
git checkout -B publish/vscode-<DROX_VER> origin/main
$env:GIT_LFS_SKIP_SMUDGE = "1"
git read-tree -u --reset integrate/vscode-<VSCODE_VER>-from-<DROX_VER>
git rm -r -f extensions/copilot/test/simulation/cache 2>$null
git commit -m "Intégrer VS Code <VSCODE_VER> avec Drox <DROX_VER> sur main."
git push origin publish/vscode-<DROX_VER>:main
git checkout main && git pull origin main
```

La branche `integrate/*` peut rester **locale**.

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| `refusing to merge unrelated histories` sur `main` | Normal — utiliser branche `integrate/*` + overlay (ce guide), pas merge direct sur `main` |
| Hygiene : variables CSS inconnues | Compléter `vscode-known-variables.json` (voir upstream + vars Drox) |
| `drox-engine` écrasé | `git checkout main -- drox-engine` |
| Fichiers `contrib/drox` obsolètes restants | `git checkout main -- src/vs/workbench/contrib/drox` puis `git rm` des extras listés par `git status` |
