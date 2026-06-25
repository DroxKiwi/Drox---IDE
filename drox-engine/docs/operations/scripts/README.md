# Scripts opérations — release Linux & retour dev Windows

Référence : [00-BUILD-REFERENCE.md](../00-BUILD-REFERENCE.md) · [04-RELEASE-LINUX.md](../04-RELEASE-LINUX.md)

---

## Mot de passe sudo WSL (première fois)

Depuis PowerShell en arrière-plan, **le mot de passe sudo ne peut pas être saisi**.

```powershell
wsl -d Ubuntu-24.04
```

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libx11-dev libxkbfile-dev \
  libsecret-1-dev libkrb5-dev fakeroot rpm lintian curl git ca-certificates
exit
```

Puis : `.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1`

---

## Scripts

### `wsl-linux-build-isolated.ps1` — build Linux (Windows)

Point d'entrée unique depuis PowerShell.

```powershell
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

- Commit auto des changements locaux
- Sync `~/Drox---IDE` (ext4) — **ne modifie pas** `node_modules` Windows
- Appelle `wsl-linux-build.sh` dans le clone Linux
- `-SkipCommit` : working tree propre requis

Log : `.build\wsl-linux-build-isolated.log`

Alias racine : `.\scripts\wsl-linux-build.ps1` (redirige vers isolé).

---

### `wsl-linux-build.sh` — pipeline dans WSL

Exécuté par le script isolé, ou manuellement :

```bash
cd ~/Drox---IDE
bash drox-engine/docs/operations/scripts/wsl-linux-build.sh
```

Installe deps système (si besoin), nvm, rust, `npm install --force`, compile, `.deb`.

---

### `restore-windows-dev.ps1` — réparation dev Windows

**Uniquement** si le dev Windows est cassé (ancien `npm install` WSL sur `/mnt/c/`, ou erreur manuelle).

```powershell
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1
```

Inutile après un build **isolé** réussi.

---

### `restore-windows-dev-deps.ps1` — alias

`-Quick` = `-ShimsOnly`.

---

## Redirections à la racine

| `scripts\…` | Cible |
|---------------|--------|
| `wsl-linux-build.ps1` | `wsl-linux-build-isolated.ps1` |
| `wsl-linux-build.sh` | `operations/scripts/wsl-linux-build.sh` |
| `restore-windows-dev*.ps1` | `operations/scripts/…` |

---

## Enchaînement

```
wsl-linux-build-isolated.ps1  →  (rien sur le dev Windows)
npm run watch + code.bat      →  dev quotidien
restore-windows-dev.ps1       →  seulement si watch/code.bat cassés
```
