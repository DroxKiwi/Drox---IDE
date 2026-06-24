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

## 2. Build (tout-en-un depuis Windows)

```powershell
cd <REPO>
.\scripts\wsl-linux-build.ps1
```

Log : `.build\wsl-linux-build.log`

---

## 2bis. Build manuel (WSL)

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

```powershell
# arrêter npm run watch d'abord
cd <REPO>
.\scripts\restore-windows-dev-deps.ps1
```

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| `nvm` / `dpkg-shlibdeps` échoue | WSL **24.04**, pas 26.04 |
| `node: command not found` | `source ~/.nvm/nvm.sh` |
| `HOME` = `C:Users...` | `export HOME=/home/$(whoami)` |
| `drox-ide-tunnel` manquant | `./scripts/stage-linux-cli-tunnel.sh` puis relancer deb |
| Bundle stale + `--skip-compile` | Relancer sans `--skip-compile` ou `--force-compile` |
| Build très lent sur `/mnt/c/` | Normal (1–3 h) · ou cloner sous `~/Drox---IDE` |
| `npm run watch` cassé après WSL | `.\scripts\restore-windows-dev-deps.ps1` |
| `latest.json` sans win32 | Refaire Windows ([03](03-RELEASE-WINDOWS.md)) avant publish Linux |
