# 01 — Branche produit → `main`

Release Drox **sans** bump VS Code. Pour Microsoft, voir [02-UPSTREAM-VSCODE.md](02-UPSTREAM-VSCODE.md).

---

## 1. Ouvrir la branche

```powershell
cd <REPO>
git checkout main
git pull origin main
git checkout -b <BRANCH>
```

Éditer `package.json` : `droxVersion` → `<DROX_VER>` · **ne pas** toucher `version` (VS Code).

```powershell
git add package.json drox-engine/docs/
git commit -m "Ouvrir la release <DROX_VER>."
git push -u origin <BRANCH>
```

---

## 2. Développer

```powershell
npm run watch
# autre terminal :
.\scripts\code.bat
```

Commits sur `<BRANCH>`, push régulier.

**Moteur Rust** (si modif `drox-engine/`) :

```powershell
cd drox-engine/drox
cargo test --workspace
cd ../..
```

---

## 3. Valider avant clôture

```powershell
npm run compile
npm run test-drox
```

Smoke manuel : chat Drox · un `agent.run` · un tool (`file_read` ou équivalent).

Doc : `drox-engine/docs/<version>/CLOSURE-<DROX_VER>.md` à jour.

---

## 4. Merger sur `main` (sources)

### Méthode A — Pull Request (cas habituel)

```powershell
gh pr create --base main --head <BRANCH> --title "Release <DROX_VER>" --body "..."
# merger sur GitHub — ne pas supprimer la branche
```

```powershell
git checkout main
git pull origin main
```

### Méthode B — Squash `read-tree` (historiques très divergents)

```powershell
cd <REPO>
git fetch origin
git checkout -B publish/<DROX_VER> origin/main
git read-tree -u --reset refs/heads/<BRANCH>
git rm -r -f extensions/copilot/test/simulation/cache 2>$null
git commit -m "Release <DROX_VER>."
git push origin publish/<DROX_VER>:main
git checkout main && git pull origin main
```

---

## 5. Préparer la release (OR)

Merger sur `main` **n’est pas obligatoire** pour shipper : tu peux builder depuis `<BRANCH>` ou `integrate/*` si le code est validé.

→ [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md) puis [04-RELEASE-LINUX.md](04-RELEASE-LINUX.md)

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| Pre-commit hygiene échoue | `npm run precommit` · corriger ou mettre à jour `build/lib/stylelint/vscode-known-variables.json` |
| `npm run watch` / `code.bat` plante après build WSL | Arrêter watch · fermer code.bat · `.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1` |
| Correctif après publication OR | [06-HOTFIX-LATEST.md](06-HOTFIX-LATEST.md) |
| Branche supprimée sur GitHub par erreur | `git push origin <commit>:refs/heads/<BRANCH>` |
