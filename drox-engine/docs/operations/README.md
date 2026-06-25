# Opérations Drox IDE

Guides **linéaires** — suivre dans l’ordre selon le besoin.

| # | Guide | Quand |
|---|--------|--------|
| 0 | Ci-dessous § Setup | Une fois par machine |
| 1 | [01-BRANCHE.md](01-BRANCHE.md) | Ouvrir une release, dev, merger sur `main` |
| 2 | [02-UPSTREAM-VSCODE.md](02-UPSTREAM-VSCODE.md) | Rattraper une nouvelle base VS Code (Microsoft) |
| 3 | [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md) | Installeur `.exe` + publication OR |
| 4 | [04-RELEASE-LINUX.md](04-RELEASE-LINUX.md) | Paquet `.deb` + publication OR |
| 5 | [05-OPEN-VSX.md](05-OPEN-VSX.md) | Galerie extensions (optionnel) |
| 6 | [06-HOTFIX-LATEST.md](06-HOTFIX-LATEST.md) | Correctif sur la release déjà publiée (`latest`) |

Scripts release Linux / restauration dev Windows : [scripts/](scripts/README.md).

**Parcours release typique** : `00` (référence) → `01` → `02` (si bump VS Code) → `03` → `04`.  
**Hotfix** sur version déjà en ligne : `06`.

**Linux** : toujours `wsl-linux-build-isolated.ps1` — pas `wsl-linux-build.ps1` (legacy `/mnt/c`).

---

## Placeholders

| Symbole | Valeur |
|---------|--------|
| `<REPO>` | `Drox---IDE` (sources, privé) |
| `<OR>` | `Drox---IDE---OR` (manifestes + GitHub Releases, **pas de sources**) |
| `<DROX_VER>` | `droxVersion` dans `package.json` (ex. `1.5.5`) |
| `<VSCODE_VER>` | `version` dans `package.json` (ex. `1.127.0`) |
| `<BRANCH>` | Branche produit (ex. `1.5.5`) |
| `<TAG>` | `v<DROX_VER>` sur GitHub OR |

---

## Setup machine (une fois)

**Arborescence**

```text
Desktop\GitHub\
├── Drox---IDE\          ← <REPO>
└── Drox---IDE---OR\     ← <OR> (obligatoire pour release)
```

**Remotes git**

```powershell
cd <REPO>
git remote add upstream https://github.com/microsoft/vscode.git   # si absent
git fetch upstream
git fetch origin
```

**Windows** : Node (`.nvmrc`), Rust, Inno Setup 6.6+, `gh auth login`, `npm install`

```powershell
.\scripts\ensure-inno-setup.ps1
gh auth status
```

**Linux (WSL)** : Ubuntu **24.04** en WSL 2 — pas Ubuntu 26.04

```powershell
wsl --install -d Ubuntu-24.04
wsl --set-default Ubuntu-24.04
```

Dans WSL (première fois) :

```bash
export HOME=/home/$(whoami)
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libx11-dev libxkbfile-dev \
  libsecret-1-dev libkrb5-dev fakeroot rpm lintian curl git ca-certificates
```

---

## Règles courtes

- **Release utilisateur** → repo **OR**, pas un push « publication » sur `main` sources.
- **Binaires** (`.exe`, `.deb`) → GitHub Release OR uniquement, jamais dans git.
- **Historique Microsoft** → branche locale `integrate/*`, jamais `git merge upstream/main` directement sur `main` sources.

Workflow détaillé historique : [GUIDE-RELEASE-ET-UPSTREAM.md](../GUIDE-RELEASE-ET-UPSTREAM.md) (référence — préférer les guides `01`–`04`).
