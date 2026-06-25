# 04 — Release Linux

**Après** [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md) (pour ne pas écraser win32 dans `latest.json`).

Publication → **`<OR>`** + `gh release upload` du `.deb`.

---

## 1. Préparer

Même branche / même `<DROX_VER>` que Windows.

WSL par défaut = **Ubuntu-24.04** :

```powershell
wsl --set-default Ubuntu-24.04
wsl -l -v
```

---

## 2. Build (recommandé — clone WSL isolé)

**Ne touche pas** au `node_modules` Windows. Pas de `restore-windows-dev.ps1` après.

```powershell
cd <REPO>
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

Commit auto des changements locaux Windows, puis clone/sync sur `~/Drox---IDE` (ext4). Log : `.build\wsl-linux-build-isolated.log`

---

## 2bis. Build legacy (même repo `/mnt/c` — fragile)

Arrêter `npm run watch` et fermer `code.bat` avant. Restauration Windows obligatoire à la fin.

```powershell
.\drox-engine\docs\operations\scripts\wsl-linux-build.ps1
```

Log : `.build\wsl-linux-build.log` · Dépannage : [scripts/README.md](scripts/README.md)

---

## 2ter. Build manuel (WSL sur `/mnt/c`)

```bash
export HOME=/home/$(whoami)
source ~/.nvm/nvm.sh
source ~/.cargo/env
cd /mnt/c/Users/<vous>/Desktop/GitHub/Drox---IDE

export DROX_PRODUCT_SURFACE=release
chmod +x scripts/*.sh
./scripts/build-release-linux.sh
```

| Option | Quand |
|--------|--------|
| `--skip-compile` | Bundle déjà aligné sur `droxVersion` |
| `--force-compile` | Après modif `contrib/drox` ou upstream |
| `--no-deb` | App seulement, pas de `.deb` |

**Sorties**

| Fichier | Chemin |
|---------|--------|
| App | `../VSCode-linux-x64/drox-ide` |
| Moteur | `../VSCode-linux-x64/resources/drox/linux-x64/drox` |
| `.deb` | `.build/linux/deb/amd64/deb/*.deb` |

---

## 3. Vérifier

```bash
source ~/.nvm/nvm.sh
./scripts/verify-packaged-linux.sh
```

Attendu : `[verify-packaged-linux] OK`

---

## 4. Manifeste OR

```bash
./scripts/release-publish-linux.sh
```

Copie `.deb` → `<OR>\_upload\` · fusionne `platforms.linux-x64` dans `latest.json`.

```bash
cd ../Drox---IDE---OR
git add stable/ .gitignore NOTICE.md README.md
git commit -m "Release v<DROX_VER> linux-x64 (manifest)."
git push origin main
```

---

## 5. Upload `.deb` sur la release existante

```powershell
cd <OR>
gh release upload <TAG> ".\_upload\Drox-IDE-<DROX_VER>-linux-x64.deb" --repo DroxKiwi/Drox---IDE---OR
```

---

## 6. Retour dev Windows

**Inutile** si vous avez utilisé `wsl-linux-build-isolated.ps1` (section 2).

Après un build legacy sur `/mnt/c/`, WSL laisse des artefacts Linux dans `node_modules` partagé :

| Symptôme | Action |
|----------|--------|
| `npm run watch` : `'npm-run-all2' n'est pas reconnu` | shims `.cmd` manquants |
| `.\scripts\code.bat` : `*.node n'est pas une application Win32 valide` | addons natifs ELF (Linux) |

```powershell
# arrêter npm run watch et fermer code.bat d'abord
cd <REPO>
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1
```

Automatique si vous avez utilisé `wsl-linux-build.ps1` (section 2). Shims seulement : `-ShimsOnly`.

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| `nvm` / `dpkg-shlibdeps` échoue | WSL **24.04**, pas 26.04 |
| `node: command not found` | `source ~/.nvm/nvm.sh` |
| `HOME` = `C:Users...` | `export HOME=/home/$(whoami)` |
| `drox-ide-tunnel` manquant | `./scripts/stage-linux-cli-tunnel.sh` puis relancer deb |
| Bundle stale + `--skip-compile` | Relancer sans `--skip-compile` ou `--force-compile` |
| Build très lent sur `/mnt/c/` | Normal (1–3 h) · préférer `wsl-linux-build-isolated.ps1` |
| `npm run watch` cassé après WSL | `.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1` |
| `code.bat` : `.node` pas Win32 valide | Idem (recompile les addons natifs) |
| `EBADPLATFORM` `@*-win32-*` sous WSL | `node_modules` Windows — le script utilise `npm install --force` (voir `scripts/lib/linux-npm-install.sh`) |
| `postinstall.ts` / `EIO` sur `esbuild.exe` | `build/node_modules` Windows verrouillé sous `/mnt/c` | `prepare-wsl-linux-build.ps1` avant WSL ; fermer watch + `code.bat` |
| `bash\r: No such file or directory` | Script `.sh` en CRLF → convertir en LF |
| `latest.json` sans win32 | Refaire Windows ([03](03-RELEASE-WINDOWS.md)) avant publish Linux |
