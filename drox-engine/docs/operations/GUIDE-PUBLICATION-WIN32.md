# Publication Windows — guide rapide

Checklist pour publier une release Drox IDE (ex. `1.3.1`) et clôturer la branche de travail.

**Repos** : sources `Drox---IDE` · manifestes `Drox---IDE---releases`  
**Version produit** : champ `droxVersion` dans `package.json` (pas `version` VS Code).

---

## 1. Préparer la version (repo sources)

```powershell
cd C:\Users\coren\Desktop\GitHub\Drox---IDE
```

1. Mettre à jour **`droxVersion`** dans `package.json` (ex. `1.3.2`).
2. Commit / push de la branche feature (ex. `release/1.3.1`).
3. Merger vers `main` quand la release est prête (PR ou merge local).

---

## 2. Build + manifestes (une commande)

**Premier build** ou changement d’icône exe :

```powershell
npm run drox:ship -- -Full
```

**Rebuild habituel** (dépendances déjà installées) :

```powershell
npm run drox:ship
```

**Re-package rapide** (aucun changement TypeScript) :

```powershell
npm run drox:ship -- -Fast
```

**Après modifs `contrib/drox`** :

```powershell
npm run drox:ship -- -Force
```

Le build **refuse** de publier si `out-vscode-min` n’est pas aligné sur `droxVersion` (`drox-bundle-stamp.json`, sentinelles UI, sources plus récentes que le bundle, `product.json` et `drox.exe` MODERN dans le package). `-Fast` échoue dans ce cas au lieu de recycler un vieux bundle.

**Surface release** : `build-release-win32.ps1` force `DROX_PRODUCT_SURFACE=release` → `product.json` packagé sans `droxEngineDevBuild`, header chat en semver seul, `drox.exe` sans stamp dev (`DROX_OMIT_DEV_BUILD=1`). En watch/F5, `droxSurface: dev` dans les sources conserve suffixe build et outils dogfood.

### Sorties

| Artefact | Chemin |
|----------|--------|
| Installeur local (test) | `.build\win32-x64\user-setup\Drox-IDE-UserSetup-<ver>-win32-x64.exe` |
| Copie pour GitHub | `..\Drox---IDE---releases\_upload\Drox-IDE-Setup-<ver>-win32-x64.exe` |
| Manifeste MAJ | `..\Drox---IDE---releases\stable\latest.json` |
| Notes / SHA256 | `..\Drox---IDE---releases\stable\<ver>\` |

Installeur seul (sans manifestes) : `npm run drox:build`  
Manifestes seuls (setup déjà buildé) : `npm run drox:publish`

---

## 3. Publier le repo releases (git)

```powershell
cd C:\Users\coren\Desktop\GitHub\Drox---IDE---releases

git add stable/ .gitignore NOTICE.md README.md
git status   # aucun .exe ne doit apparaître
git commit -m "Release v<VER> win32-x64 (manifest)"
git push
```

**Ne pas** `git add` le `.exe` : `_upload/` et `*.exe` sont ignorés.

---

## 4. Publier le binaire (GitHub Release)

### Sans `gh` CLI — interface web

1. https://github.com/DroxKiwi/Drox---IDE---releases/releases → **New release**
2. Tag : `v<VER>` (ex. `v1.3.1`) sur `main`
3. Titre : `Drox IDE <VER>`
4. Description : coller `stable\<VER>\RELEASE_NOTES.md`
5. Joindre `_upload\Drox-IDE-Setup-<VER>-win32-x64.exe` (**garder ce nom exact**)
6. **Publish release**

### Avec GitHub CLI

```powershell
winget install --id GitHub.cli
# redémarrer PowerShell
gh auth login

cd C:\Users\coren\Desktop\GitHub\Drox---IDE---releases
gh release create v<VER> ".\_upload\Drox-IDE-Setup-<VER>-win32-x64.exe" `
  --title "Drox IDE <VER>" `
  --notes-file ".\stable\<VER>\RELEASE_NOTES.md"
```

---

## 5. Vérifier

- [ ] `stable/latest.json` sur `main` : `version` = `<VER>`, `platforms.win32-x64.installerUrl` télécharge l’exe
- [ ] SHA256 du fichier téléchargé = `stable\<VER>\SHA256SUMS`
- [ ] Install UserSetup ou exe Release → **À propos** affiche `<VER>`
- [ ] (Optionnel) notif MAJ : install `<VER>` puis publier `<VER+1>` sur `latest.json`

---

## 6. Clôturer la branche (repo sources)

Sur `Drox---IDE`, après merge de la PR release :

```powershell
cd C:\Users\coren\Desktop\GitHub\Drox---IDE
git checkout main
git pull

# Tag sources (optionnel, documentation)
git tag v<VER>
git push origin v<VER>

# Supprimer la branche locale + distante
git branch -d release/<VER>
git push origin --delete release/<VER>
```

Sur GitHub : fermer la PR, supprimer la branche si pas déjà fait.

Mettre à jour le doc de clôture versionné :  
`drox-engine/docs/1.3/<VER>/finalisation/CLOSURE-<VER>.md` → statut **livré**.

---

## Aide-mémoire (copier-coller)

Remplacer `<VER>` par la version (ex. `1.3.1`).

```powershell
# --- Sources ---
cd C:\Users\coren\Desktop\GitHub\Drox---IDE
# editer package.json -> droxVersion = <VER>
npm run drox:ship

# --- Releases (manifestes) ---
cd C:\Users\coren\Desktop\GitHub\Drox---IDE---releases
git add stable/ .gitignore NOTICE.md README.md
git commit -m "Release v<VER> win32-x64 (manifest)"
git push
# puis Release GitHub + exe dans _upload\

# --- Clôture branche ---
cd C:\Users\coren\Desktop\GitHub\Drox---IDE
git checkout main && git pull
git tag v<VER> && git push origin v<VER>
git branch -d release/<VER>
git push origin --delete release/<VER>
```

---

## Depannage notifications MAJ (install 1.3.1)

Les reglages ont des **valeurs par defaut** (`drox.update.manifestUrl`, `drox.update.notifyOnStartup: true`). En dev, un `settings.json` avec URL vide **ecrase** le defaut : supprimer la cle ou laisser l'URL complete.

| Symptome | Cause probable |
|----------|----------------|
| Rien au demarrage | `latest.json` a la **meme** version que l'install (ex. 1.3.1 = 1.3.1) — normal |
| « manifestUrl is not set » | Setting vide dans `%APPDATA%\.drox-ide\User\settings.json` |
| Commande introuvable | Build installe **avant** le code MAJ — reinstaller un Setup recent |
| Pas de lien installeur | Manifeste sans `platforms.win32-x64` (corrige en 1.3.2+) |

**Test rapide sur install 1.3.1** (sans publier 1.3.2) :

1. Palette : **Drox: Check for Updates** — doit afficher « a jour (1.3.1) » si le manifeste distant est en 1.3.1.
2. Ou reglages utilisateur :
   ```json
   "drox.update.simulateLatestVersion": "99.0.0"
   ```
   puis **Drox: Check for Updates** → notification de test.

**Test reel** : publier `1.3.2` sur `stable/latest.json` + Release GitHub, garder l'install 1.3.1, redemarrer l'IDE.

---

## Signature Authenticode (prévu 1.5.3)

Les releases actuelles (dont **1.5.1**) : installeur **non signé** → SmartScreen « Éditeur inconnu » au premier lancement (normal).

Cible **1.5.3** : certificat Code Signing + `sign-drox-win32.ps1` · détail [PLAN-1.5.3 § W1](../1.5/1.5.3/PLAN-1.5.3.md#w1--confiance-windows-smartscreen--éditeur-inconnu).

En attendant : télécharger uniquement depuis [Releases officielles](https://github.com/DroxKiwi/Drox---IDE---OR/releases) ; si SmartScreen bloque, **Exécuter quand même**.

---

## Voir aussi

- [RULES.md](../../../../RULES.md) — build, git, releases
- [PLAN-DISTRIBUTION-LAUNCHER.md](../1.3/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md) — architecture F3–F5
- [PLAN-1.5.1.md](../1.5/1.5.1/PLAN-1.5.1.md) — signature Windows + UI chat
