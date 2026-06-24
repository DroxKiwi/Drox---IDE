# Guide release Drox + mise à jour VS Code

Procédure unique, étape par étape.  
Remplace les placeholders avant d’exécuter une commande.

| Placeholder | Signification |
|-------------|---------------|
| `<DROX_VER>` | `droxVersion` dans `package.json` (release produit) |
| `<VSCODE_VER>` | `version` dans `package.json` (base VS Code / Copilot) |
| `<BRANCH>` | Branche de release, ex. même nom que `<DROX_VER>` |
| `<TAG>` | Tag git sources, format `v<DROX_VER>` |
| `<REPO>` | Racine clone `Drox---IDE` |
| `<OR>` | Clone voisin `Drox---IDE---OR` |

**Liens** : [RULES.md](../../RULES.md) · [GUIDE-PUBLICATION-WIN32.md](operations/GUIDE-PUBLICATION-WIN32.md) · [PATCHES-UPSTREAM-BUILD.md](1.3/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md)

---

## Règles (à ne pas oublier)

1. **Deux dépôts** : `Drox---IDE` (sources) · `Drox---IDE---OR` (manifestes + exe en Release GitHub).
2. **Deux historiques git** : sur GitHub, `main` = historique **produit court**. L’historique Microsoft vit **en local** (`upstream`), jamais poussé sur `origin`.
3. **Merger VS Code sur `main`** = toujours **`read-tree` + 1 commit squash**. Jamais `git merge upstream/main` directement sur `main` GitHub.
4. **Ordre** : produit Drox sur `main` → (optionnel) bump VS Code → build → publication OR.
5. **Branches `<BRANCH>`** : les **conserver** sur GitHub après merge. Ne pas cocher « Delete branch » sur les PR.
6. **Installeur** : jamais dans git. Fichier dans `<OR>\_upload\`, upload via `gh release create`.

---

## Quand intégrer VS Code ?

| Moment | Intégrer upstream ? |
|--------|----------------------|
| Ouvrir la branche `<BRANCH>` | **Non** |
| Merger le produit sur `main` | **Non** (sauf si la release inclut aussi un bump VS Code) |
| Avant `drox:ship` final | **Oui**, seulement si tu changes `<VSCODE_VER>` |

**En une phrase** : tu codes la release Drox sur `<BRANCH>` ; tu ne tires Microsoft que quand tu veux une **nouvelle base VS Code** (`package.json` → champ `version`).

---

## Étape 0 — Prérequis (une fois par machine)

```powershell
cd <REPO>
git remote add upstream https://github.com/microsoft/vscode.git   # si absent
git fetch upstream
git fetch origin
```

Voisin attendu : `<OR>` au même niveau que `<REPO>` (parent `GitHub\`).

---

## Étape 1 — Ouvrir une release produit

```powershell
cd <REPO>
git checkout main
git pull origin main
git checkout -b <BRANCH>
```

Éditer `package.json` :

- `droxVersion` → `<DROX_VER>`
- `version` → **ne pas changer** (sauf release couplée à un bump VS Code)

```powershell
git add package.json drox-engine/docs/
git commit -m "Ouvrir la release <DROX_VER>."
git push -u origin <BRANCH>
```

Travail quotidien : commits sur `<BRANCH>`, push sur `origin/<BRANCH>`.

---

## Étape 2 — Développer et valider

Sur `<BRANCH>` :

```powershell
npm run watch
.\scripts\code.bat
```

Avant de publier :

- [ ] `droxVersion` = `<DROX_VER>`
- [ ] Doc `CLOSURE-<DROX_VER>.md` à jour
- [ ] Smoke chat : salut, lecture repo, mutation fichier
- [ ] Si modif `contrib/drox` : prévoir `drox:ship -- -Force` plus tard

---

## Étape 3 — Mettre le produit sur `main`

**Choisir une seule méthode.**

### Méthode A — Pull Request (historique de branche propre)

```powershell
gh pr create --base main --head <BRANCH> --title "Release <DROX_VER>" --body "..."
```

Après merge : **ne pas supprimer** `<BRANCH>` sur GitHub.

Si la branche a été supprimée par erreur :

```powershell
git push origin <commit-tip-de-BRANCH>:refs/heads/<BRANCH>
```

### Méthode B — Squash `read-tree` (historiques divergents)

```powershell
cd <REPO>
git fetch origin
git checkout -B publish/<DROX_VER> origin/main
git read-tree -u --reset refs/heads/<BRANCH>
git rm -r -f extensions/copilot/test/simulation/cache 2>$null
git commit -m "Release <DROX_VER>: <résumé en une phrase>."
git push origin publish/<DROX_VER>:main
```

Puis :

```powershell
git checkout main
git pull origin main
```

---

## Étape 4 — (Optionnel) Intégrer une nouvelle base VS Code

**Sauter cette étape** si `<VSCODE_VER>` ne change pas.

### 4.1 Sauvegarde

```powershell
cd <REPO>
git checkout main
git pull origin main
git tag <DROX_VER>-pre-upstream main
```

### 4.2 Branche locale d’intégration

Partir de la branche integrate existante (ex. `integrate/vscode-from-<ancre>`).

**Première fois** (création de la base upstream locale) :

```powershell
git checkout -b integrate/vscode-from-<ancre> <tag-ou-commit-drox>
git merge upstream/main
# Conflits : garder NOTRE version sur contrib/drox, drox-engine, product.json
```

**Cas habituel** (base upstream déjà importée) :

```powershell
git checkout -B integrate/vscode-onto-<DROX_VER> integrate/vscode-from-<ancre>
```

Overlay couche Drox depuis `main` (pas `git merge main` — unrelated histories) :

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
  NOTICE-DROX.txt `
  .github/workflows/drox-release-linux.yml `
  LICENSE-INSTALL.txt logo3.png `
  scripts/templates/NOTICE.md `
  src/vs/workbench/browser/media/kdds-code-icon.png `
  scripts/build-release-linux.sh scripts/release-publish-linux.sh `
  scripts/verify-packaged-linux.sh scripts/wsl-linux-build.ps1 scripts/wsl-linux-build.sh
```

Nettoyer les fichiers morts (présents sur integrate, absents de `main`) :

```powershell
git status --short
git rm -f <fichier-obsolète>   # si le pre-commit ou le build échoue
```

Vérifier les patches build écrasés par upstream — voir [PATCHES-UPSTREAM-BUILD.md](1.3/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md) :

- `build/lib/electron.ts` — `DROX_SKIP_ELECTRON_CHECKSUM`
- `build/gulpfile.vscode.ts` — `signtool` optionnel en local

Mettre à jour `package.json` → `version` = `<VSCODE_VER>`.

```powershell
.\scripts\list-nexus-patches.ps1
npm run compile
git commit -m "Intégrer VS Code <VSCODE_VER> avec couche Drox <DROX_VER>."
```

### 4.3 Publier l’intégration sur `main` (squash)

```powershell
git fetch origin
git checkout -B publish/vscode-<DROX_VER> origin/main
$env:GIT_LFS_SKIP_SMUDGE = "1"
git read-tree -u --reset integrate/vscode-onto-<DROX_VER>
git rm -r -f extensions/copilot/test/simulation/cache 2>$null
git commit -m "Intégrer VS Code <VSCODE_VER> avec Drox <DROX_VER> sur main."
git push origin publish/vscode-<DROX_VER>:main
git checkout main && git pull origin main
```

La branche `integrate/*` peut rester **locale** (push souvent bloqué par LFS — sans impact sur `main`).

---

## Étape 5 — Build installeur Windows

```powershell
cd <REPO>
git checkout main
git pull origin main
```

| Commande | Quand |
|----------|-------|
| `npm run drox:ship` | Bundle déjà aligné sur `<DROX_VER>` |
| `npm run drox:ship -- -Force` | Modif `contrib/drox`, post-upstream, stamp obsolète |
| `npm run drox:ship -- -Fast` | Re-package sans recompiler TS |
| `npm run drox:ship -- -Full` | Première build machine ou nouvelle icône exe |

**Sorties utiles**

| Artefact | Chemin |
|----------|--------|
| Installeur local | `<REPO>\.build\win32-x64\user-setup\Drox-IDE-UserSetup-<DROX_VER>-win32-x64.exe` |
| Copie upload | `<OR>\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe` |
| Manifeste MAJ | `<OR>\stable\latest.json` |

Le build refuse de ship si le bundle n’est pas aligné (`out-vscode-min/drox-bundle-stamp.json`).

---

## Étape 6 — Publier manifestes (repo OR)

```powershell
cd <OR>
git add stable/<DROX_VER> stable/latest.json
git status
# Aucun .exe ne doit apparaître dans git status
git commit -m "Release v<DROX_VER> win32-x64 (manifest)."
git push origin main
```

---

## Étape 7 — Publier le binaire (GitHub Release)

```powershell
cd <OR>
gh release create <TAG> `
  ".\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe" `
  --repo DroxKiwi/Drox---IDE---OR `
  --title "Drox IDE <DROX_VER>" `
  --notes-file ".\stable\<DROX_VER>\RELEASE_NOTES.md"
```

---

## Étape 8 — Tag sources + clôture

```powershell
cd <REPO>
git tag <TAG>
git push origin <TAG>
```

Mettre à jour `drox-engine/docs/.../CLOSURE-<DROX_VER>.md` → statut **livré**.

---

## Script complet (copier-coller)

Remplacer tous les placeholders, puis exécuter bloc par bloc.

```powershell
# ── 1. Branche ──
cd <REPO>
git fetch origin && git checkout main && git pull
git checkout -b <BRANCH>
# package.json → droxVersion = <DROX_VER>
git commit -am "Ouvrir la release <DROX_VER>." && git push -u origin <BRANCH>

# ── 2. Dev sur <BRANCH> … ──

# ── 3. Produit sur main (read-tree) ──
git checkout -B publish/<DROX_VER> origin/main
git read-tree -u --reset refs/heads/<BRANCH>
git rm -r -f extensions/copilot/test/simulation/cache 2>$null
git commit -m "Release <DROX_VER>: <résumé>."
git push origin publish/<DROX_VER>:main
git checkout main && git pull

# ── 4. (Optionnel) Bump VS Code ──
git tag <DROX_VER>-pre-upstream main
git checkout -B integrate/vscode-onto-<DROX_VER> integrate/vscode-from-<ancre>
git checkout main -- src/vs/workbench/contrib/drox drox-engine package.json product.json LICENSE-INSTALL.txt logo3.png
# … liste overlay complète étape 4.2 …
git commit -m "Intégrer VS Code <VSCODE_VER> avec couche Drox <DROX_VER>."
git checkout -B publish/vscode-<DROX_VER> origin/main
$env:GIT_LFS_SKIP_SMUDGE = "1"
git read-tree -u --reset integrate/vscode-onto-<DROX_VER>
git rm -r -f extensions/copilot/test/simulation/cache 2>$null
git commit -m "Intégrer VS Code <VSCODE_VER> avec Drox <DROX_VER> sur main."
git push origin publish/vscode-<DROX_VER>:main
git checkout main && git pull

# ── 5. Build ──
npm run drox:ship -- -Force

# ── 6–7. OR ──
cd <OR>
git add stable/<DROX_VER> stable/latest.json
git commit -m "Release v<DROX_VER> win32-x64 (manifest)." && git push
gh release create <TAG> ".\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe" `
  --repo DroxKiwi/Drox---IDE---OR --title "Drox IDE <DROX_VER>" `
  --notes-file ".\stable\<DROX_VER>\RELEASE_NOTES.md"

# ── 8. Tag sources ──
cd <REPO>
git tag <TAG> && git push origin <TAG>
```

---

## Champs `package.json`

| Champ | Modifier quand |
|-------|----------------|
| `droxVersion` | Chaque release produit → `<DROX_VER>` |
| `version` | Bump base VS Code → `<VSCODE_VER>` |
| `droxSurface` | Ne pas committer `release` (injecté au package par le build) |

---

## Dépannage

| Symptôme | Action |
|----------|--------|
| Push énorme / timeout SSH | Ne pas pousser `upstream` ; utiliser `read-tree` sur `main` |
| `unrelated histories` entre `main` et `integrate/*` | `git checkout main -- <chemins>` (overlay), pas `git merge` |
| `LICENSE-INSTALL.txt` ou `logo3.png` manquant au ship | Inclure dans l’overlay étape 4.2 ou `git checkout <DROX_VER>-pre-upstream -- <fichier>` |
| Erreur checksum Electron | Vérifier patch `build/lib/electron.ts` (voir PATCHES-UPSTREAM-BUILD) |
| `signtool.exe ENOENT` | Vérifier patch `build/gulpfile.vscode.ts` |
| Pre-commit : JS non autorisé | `git rm` fichier obsolète sur branche integrate |
| Branche `<BRANCH>` supprimée après PR | `git push origin <tip>:refs/heads/<BRANCH>` |

---

## Checklist finale

- [ ] `origin/main` = arbre attendu (`droxVersion`, éventuellement `version`)
- [ ] Tag `<DROX_VER>-pre-upstream` si bump VS Code
- [ ] `npm run drox:ship` OK
- [ ] Installeur testé (À propos, chat, run minimal)
- [ ] `<OR>` : `stable/latest.json` + `stable/<DROX_VER>/` poussés
- [ ] GitHub Release `<TAG>` avec exe
- [ ] Tag `<TAG>` sur `Drox---IDE`
- [ ] `CLOSURE-<DROX_VER>.md` → livré
- [ ] Branche `<BRANCH>` toujours sur GitHub
