# Scripts opérations — release Linux & retour dev Windows

Guides : [04-RELEASE-LINUX.md](../04-RELEASE-LINUX.md) · [01-BRANCHE.md](../01-BRANCHE.md)

---

## Recommandation : deux répertoires

| Rôle | Chemin | Usage |
|------|--------|--------|
| **Dev Windows** | `C:\…\Drox---IDE` | `npm run watch`, `.\scripts\code.bat` — **ne jamais** y lancer `npm install` sous WSL |
| **Build Linux** | `~/Drox---IDE` (ext4 WSL) | clone séparé, `node_modules` Linux uniquement |

```powershell
# Build Linux sans toucher au dev Windows (recommandé)
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

Pas de `restore-windows-dev.ps1` après un build isolé.

L'ancien flux sur `/mnt/c/` (même `node_modules` partagé) reste disponible via `wsl-linux-build.ps1` + `restore-windows-dev.ps1`, mais est **fragile** (esbuild verrouillé, ssh2 ELF dans `remote/`, etc.).

---

## Pourquoi les scripts « partagés » existent

Le repo vit sur le disque Windows (`C:\…`) et WSL y accède via `/mnt/c/…`. **Le même dossier `node_modules` est donc partagé** entre les deux OS.

Quand on build Linux dans WSL, `npm install` y installe des binaires **Linux** (scripts bash, addons `.node` ELF). Au retour sur Windows :

| Symptôme | Cause |
|----------|--------|
| `'npm-run-all2' n'est pas reconnu` | les shims `node_modules/.bin/*.cmd` ont été remplacés par des scripts bash |
| `*.node n'est pas une application Win32 valide` | les addons natifs (`@vscode/policy-watcher`, etc.) sont compilés pour Linux |

Un `npm install` seul ne suffit souvent pas : le postinstall VS Code est **skippé** si les lockfiles n'ont pas changé, et les `.node` Linux restent en place.

Ces scripts automatisent le build Linux **et** la remise en état du dev Windows.

---

## Scripts

### `prepare-wsl-linux-build.ps1` — avant WSL (appelé automatiquement)

Supprime depuis **Windows** les `node_modules` imbriqués (`build/`, `remote/`, …) que WSL ne peut pas nettoyer (`EIO` sur `esbuild.exe`).

```powershell
.\drox-engine\docs\operations\scripts\prepare-wsl-linux-build.ps1
```

### `wsl-linux-build-isolated.ps1` — **recommandé**

Clone/sync sur `~/Drox---IDE` (ext4). Le `node_modules` Windows sur `C:\` n'est **pas modifié**.

```powershell
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

- **Commit auto** des changements locaux sur le repo Windows avant sync (message `chore(release): sync before linux build (branche)`).
- Clone/sync sur `~/Drox---IDE` aligné sur ce commit Windows.
- Pas de `restore-windows-dev.ps1` après.
- `-SkipCommit` : exige un working tree propre.

Log : `.build\wsl-linux-build-isolated.log`

---

### `wsl-linux-build.ps1` — legacy (même repo `/mnt/c`)

**Quand :** release Linux depuis PowerShell, sans ouvrir WSL à la main.

**Ce qu'il fait :**
0. `prepare-wsl-linux-build.ps1 -StopWatch` — arrête `npm run watch` / `code.bat` du repo, supprime `build/node_modules` côté Windows
1. Choisit la distro WSL (préfère `Ubuntu-24.04`)
2. `linux-npm-install.sh` → `npm install --force` (deps Linux sur `node_modules` partagé)
3. `build-release-linux.sh --skip-npm-install` (évite un 2ᵉ `npm install` qui échoue en `EBADPLATFORM`)
4. À la fin, `restore-windows-dev.ps1` pour réparer le dev Windows

```powershell
.\drox-engine\docs\operations\scripts\wsl-linux-build.ps1
.\drox-engine\docs\operations\scripts\wsl-linux-build.ps1 -Distro Ubuntu-24.04
```

Log : `.build\wsl-linux-build.log` · Durée typique : 1–3 h.

---

### `wsl-linux-build.sh` — pipeline dans WSL

**Quand :** exécuté par le `.ps1` ci-dessus, ou manuellement dans un terminal WSL.

**Ce qu'il fait :**
1. Installe les paquets système (`build-essential`, `libx11-dev`, …)
2. Installe Node (nvm) et Rust si absents
3. `npm install` / `npm install --force` sur le repo (binaires Linux → **casse le dev Windows**)
4. Pose un marqueur `.build/linux-npm-touch`
5. Lance `scripts/build-release-linux.sh --force-compile`
6. Si `Drox---IDE---OR` est à côté du repo → `scripts/release-publish-linux.sh`

---

### `restore-windows-dev.ps1` — retour dev Windows

**Quand :** après tout build/install npm fait dans WSL sur `/mnt/c/`, ou si `code.bat` / `npm run watch` plantent.

**Avant de lancer :** arrêter `npm run watch` et fermer `.\scripts\code.bat` (sinon EPERM sur les `.node`).

**Ce qu'il fait :**
1. **Shims** — `npm install` si `gulp.cmd`, `electron.cmd`, etc. manquent dans `.bin`
2. **Scan ELF** — repère les `.node` Linux dans `node_modules` (et `remote\node_modules`)
3. **Rebuild Win32** — supprime les dossiers `build\` concernés, puis `npm rebuild <packages>`
4. Si besoin : `node build/npm/fast-install.ts --force` puis second rebuild
5. Vérifie les modules critiques (`policy-watcher`, `spdlog`, `sqlite3`, …)
6. Supprime `.build/linux-npm-touch`

```powershell
# Complet (recommandé)
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1

# Shims npm seulement (watch OK mais pas testé pour code.bat)
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1 -ShimsOnly

# Inclure aussi extensions\node_modules (plus lent, utile si EPERM extensions)
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1 -IncludeExtensions
```

---

### `restore-windows-dev-deps.ps1` — alias

Même chose que `restore-windows-dev.ps1`. `-Quick` = `-ShimsOnly`. Conservé pour la rétrocompatibilité doc / habitudes.

---

## Redirections à la racine

Les fichiers `scripts\wsl-linux-build.*` et `scripts\restore-windows-dev*.ps1` **redirigent** vers ce dossier. Les deux chemins fonctionnent ; la doc opérationnelle référence celui-ci.

---

## Enchaînement typique

```
Release Linux                    Retour dev
─────────────────                ─────────────────────────────────
wsl-linux-build.ps1      →       restore-windows-dev.ps1 (auto)
                                 npm run watch
                                 .\scripts\code.bat
```

Si le build WSL a été fait à la main sans le `.ps1`, lancer `restore-windows-dev.ps1` une fois avant de reprendre le dev.
