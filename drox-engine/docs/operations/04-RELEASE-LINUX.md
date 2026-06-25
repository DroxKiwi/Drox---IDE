# 04 — Release Linux

**Après** [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md) (pour ne pas écraser win32 dans `latest.json`).

Publication → **`<OR>`** + `gh release upload` du `.deb`.

Référence rapide : [00-BUILD-REFERENCE.md](00-BUILD-REFERENCE.md)

---

## 1. Préparer

Même branche / même `<DROX_VER>` que Windows.

WSL par défaut = **Ubuntu-24.04** :

```powershell
wsl --set-default Ubuntu-24.04
wsl -l -v
```

Setup apt une fois : [README.md § Setup](README.md#setup-machine-une-fois) ou [scripts/README.md](scripts/README.md).

---

## 2. Build

**Ne touche pas** au `node_modules` Windows.

```powershell
cd <REPO>
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

Commit auto · sync `~/Drox---IDE` · 1–3 h · Log : `.build\wsl-linux-build-isolated.log`

**Sorties** (clone Linux, parent = home WSL)

| Fichier | Chemin |
|---------|--------|
| App | `~/VSCode-linux-x64/drox-ide` |
| Moteur | `~/VSCode-linux-x64/resources/drox/linux-x64/drox` |
| `.deb` | `~/Drox---IDE/.build/linux/deb/amd64/deb/*.deb` |

---

## 2bis. Build manuel (WSL, clone isolé)

```bash
wsl -d Ubuntu-24.04
cd ~/Drox---IDE
export DROX_PRODUCT_SURFACE=release
bash drox-engine/docs/operations/scripts/wsl-linux-build.sh
```

---

## 3. Vérifier

```bash
cd ~/Drox---IDE
source ~/.nvm/nvm.sh
./scripts/verify-packaged-linux.sh
```

Attendu : `[verify-packaged-linux] OK`

---

## 4. Manifeste OR

Le repo **`<OR>`** est à côté des sources **Windows** (`Desktop\GitHub\Drox---IDE---OR`), **pas** à côté du clone isolé `~/Drox---IDE`.

Le script isolé exporte `DROX_RELEASES_REPO` automatiquement. Sinon, publier depuis le chemin Windows :

```powershell
wsl -d Ubuntu-24.04 bash -lc "cd /mnt/c/Users/<vous>/Desktop/GitHub/Drox---IDE && . ~/.nvm/nvm.sh && DROX_RELEASES_REPO=/mnt/c/Users/<vous>/Desktop/GitHub/Drox---IDE---OR ./scripts/release-publish-linux.sh"
```

Ou avec le `.deb` du clone isolé :

```powershell
wsl -d Ubuntu-24.04 bash -lc "cd /mnt/c/Users/<vous>/Desktop/GitHub/Drox---IDE && . ~/.nvm/nvm.sh && ./scripts/release-publish-linux.sh --releases-repo /mnt/c/Users/<vous>/Desktop/GitHub/Drox---IDE---OR --deb /home/<vous>/Drox---IDE/.build/linux/deb/amd64/deb/*.deb"
```

Copie `.deb` → `<OR>\_upload\` · fusionne `platforms.linux-x64` dans `latest.json` (win32 conservé).

```powershell
cd <OR>
git add stable/
git commit -m "Release v<DROX_VER> linux-x64 (manifest)."
git push origin main
```

---

## 5. Upload `.deb` sur la release existante

```powershell
cd <OR>
gh release upload <TAG> ".\_upload\Drox-IDE-<DROX_VER>-linux-x64.deb" --repo DroxKiwi/Drox---IDE---OR --clobber
```

---

## 6. Retour dev Windows

**Inutile** après un build isolé réussi.

Si `watch` / `code.bat` sont cassés (erreur passée : `npm install` WSL sur `/mnt/c/`) :

```powershell
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1
```

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| `nvm` / `dpkg-shlibdeps` échoue | WSL **24.04**, pas 26.04 |
| `dpkg-shlibdeps` + `libc.musl` | Relancer build isolé (strip `@parcel/watcher-*` auto) |
| `code-open-folder.desktop` manquant | Restaurer fichier Drox — [02 § Checklist](02-UPSTREAM-VSCODE.md#checklist-post-merge-fichiers-drox) |
| `node: command not found` | `source ~/.nvm/nvm.sh` |
| `sudo` bloqué depuis PowerShell | apt dans WSL interactif ([scripts/README](scripts/README.md)) |
| `ETIMEDOUT` npm | Relancer le script isolé |
| `EBADPLATFORM` win32 | Utiliser le script **isolé**, pas `npm install` sur `/mnt/c/` |
| `latest.json` sans win32 | Refaire Windows ([03](03-RELEASE-WINDOWS.md)) avant publish Linux |
