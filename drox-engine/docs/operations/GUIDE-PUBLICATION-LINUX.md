# Publication Linux — guide rapide (1.5.1b)

Checklist pour produire le **.deb amd64** et l’ajouter au repo releases **`Drox---IDE---OR`**, même version que Windows.

**Repos** : sources `Drox---IDE` · manifestes `Drox---IDE---OR`  
**Version produit** : `droxVersion` dans `package.json` (ex. `1.5.1`).

---

## WSL Ubuntu (Windows)

Depuis PowerShell a la racine du repo :

```powershell
.\scripts\wsl-linux-build.ps1
```

Ou ouvrir **Windows Terminal > Ubuntu** puis :

```bash
cd /mnt/c/Users/coren/Desktop/GitHub/Drox---IDE
bash ./scripts/wsl-linux-build.sh
```

Le script installe les deps apt, Node (nvm), Rust si besoin, puis lance `build-release-linux.sh` et `release-publish-linux.sh`. Log : `.build/wsl-linux-build.log`.

**Note** : le premier build sur `/mnt/c/` est lent (1-3 h). Pour aller plus vite, cloner le repo dans `~/Drox---IDE` sous WSL.

Si `wsl` ne repond pas : `wsl --set-default Ubuntu` puis `wsl --shutdown` et relancer.

---

## Prérequis machine (Ubuntu 22.04+ recommandé)

```bash
# Outils de base
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libx11-dev libxkbfile-dev \
  libsecret-1-dev libkrb5-dev fakeroot rpm lintian

# Node (voir .nvmrc à la racine du repo)
# Rust (rustup) — pour cargo build drox-cli
```

Disque : ~15–25 Go · Durée : 1–3 h (premier build).

---

## 1. Build F1 + .deb

Depuis la racine du fork (sur **Linux**) :

```bash
export DROX_PRODUCT_SURFACE=release
./scripts/build-release-linux.sh
# Options :
#   ./scripts/build-release-linux.sh --skip-npm-install
#   ./scripts/build-release-linux.sh --force-compile
```

### Sorties attendues

| Artefact | Chemin |
|----------|--------|
| App packagée | `../VSCode-linux-x64/` |
| Binaire IDE | `../VSCode-linux-x64/drox-ide` |
| Moteur embarqué | `../VSCode-linux-x64/resources/drox/linux-x64/drox` |
| Paquet .deb | `.build/linux/deb/amd64/deb/*.deb` |

Vérification rapide :

```bash
./scripts/verify-packaged-linux.sh
```

---

## 2. Publish manifeste (merge `linux-x64`)

Après le ship Windows (`npm run drox:ship` sur Windows) **ou** en parallèle :

```bash
./scripts/release-publish-linux.sh
# Dry-run :
#   ./scripts/release-publish-linux.sh --dry-run
```

Le script :

1. Copie le `.deb` vers `../Drox---IDE---OR/_upload/Drox-IDE-<ver>-linux-x64.deb`
2. **Fusionne** `platforms.linux-x64` dans `stable/latest.json` (sans écraser `win32-x64`)

---

## 3. Git + GitHub Release

```bash
cd ../Drox---IDE---OR
git add stable/ .gitignore NOTICE.md README.md
git commit -m "Release v1.5.1 linux-x64 (manifest)"
git push
```

Puis attacher le `.deb` à la release existante :

```bash
gh release upload v1.5.1 ../Drox---IDE---OR/_upload/Drox-IDE-1.5.1-linux-x64.deb
```

---

## CI (alternative)

Workflow manuel : **Actions → Drox Linux release build → Run workflow**

Artefacts : `.deb` + logs. Puis lancer `release-publish-linux.sh` en local ou étendre le workflow.

---

## Dépannage

| Problème | Piste |
|----------|--------|
| `gulp vscode-linux-x64-min-ci` échoue | Relancer avec `--force-compile` après modif `contrib/drox` |
| `fakeroot` / `dpkg-deb` manquant | `sudo apt install fakeroot` |
| `latest.json` sans win32 | Toujours ship Windows **avant** merge Linux, ou vérifier merge script |
| MAJ IDE ne propose pas le .deb | Vérifier `platforms.linux-x64.installerUrl` dans manifeste |

---

## Liens

- [PLAN 1.5.1b](../1.5/1.5.1b/PLAN-1.5.1b.md)
- [GUIDE Windows](GUIDE-PUBLICATION-WIN32.md)
- [RULES.md](../../../RULES.md)
