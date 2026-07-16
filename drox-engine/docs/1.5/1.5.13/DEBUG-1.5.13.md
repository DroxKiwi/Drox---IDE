# Debug — freeze / crash fenêtre Agents (1.5.13)

**Contexte** : « La fenêtre ne répond plus » (Windows) au lancement ou après quelques secondes, sans action utilisateur.

---

## 1. Logs (le plus rapide)

### Install packagée

```text
%APPDATA%\.drox-ide\logs\
```

Ouvrir le dossier du jour le plus récent → `window1` ou `main.log` / `renderer*.log`.

Filtrer (PowerShell) :

```powershell
Select-String -Path "$env:APPDATA\.drox-ide\logs\**\*.log" -Pattern "\[Drox Agents\]|\[DroxSessionsProvider\]|Error|FATAL" | Select-Object -Last 80
```

### Depuis les sources

Même arborescence sous le profil utilisé par `scripts\code.bat` (souvent `%USERPROFILE%\.vscode-oss-dev\logs`).

---

## 2. DevTools sur la fenêtre Agents

Raccourcis dans la fenêtre **Agents** (`drox.exe` / titre « Agents ») :

| Action | Raccourci |
|--------|-----------|
| DevTools | **Ctrl+Shift+I** ou **F12** |
| Recharger | **Ctrl+R** |

Onglets utiles :

- **Console** — erreurs JS, warnings `[Drox Agents]`
- **Performance** — enregistrer 10–20 s au moment du freeze → voir boucle `setChat` / layout
- **Memory** — heap snapshot avant / après ouverture (fuite modèles chat)

---

## 3. Déboguer depuis les sources (recommandé)

### Prérequis

```powershell
cd C:\Users\coren\Desktop\GitHub\Drox---IDE
npm run compile
```

### F5 dans Cursor / VS Code

1. Ouvrir le repo `Drox---IDE`
2. Run and Debug → **VS Code Agents** (ou **Launch VS Code Agents Internal**)
3. La fenêtre Agents démarre avec `--inspect-brk` + port **9222** (Chrome debugger attaché)

Variables utiles déjà dans `launch.json` :

- `VSCODE_DEV_DEBUG_OBSERVABLES=1` — surcharge observable
- `--crash-reporter-directory=.profile-oss/crashes`

### Ligne de commande manuelle

```powershell
.\scripts\code.bat --agents --remote-debugging-port=9222 --inspect=5875
```

Puis Chrome/Edge : `chrome://inspect` → inspecter le renderer Agents.

---

## 4. Identifier quel processus bloque

Gestionnaire des tâches au freeze :

| Processus | Rôle |
|-----------|------|
| **Drox.exe** (plusieurs) | Renderer IDE + **fenêtre Agents** (process séparé) |
| **drox.exe** | Moteur agent (Rust) |
| CPU à 100 % sur un renderer | Boucle JS (autorun `setChat`, git watch, replay) |

Si **drox.exe** monte en RAM sans discussion active → warm start / fuite moteur.

---

## 5. Scénarios de repro documentés

Voir [SMOKE-1.5.13.md](SMOKE-1.5.13.md).

| Id | Repro | Piste |
|----|-------|-------|
| T2 | Nouveau dossier → discussion → crash après réponse | Boucle `setChat` + evict (S2-3 / S3-bis) |

### T2 — protocole (en cours)

1. Fenêtre Agents ouverte (`.\scripts\code.bat` ou fenêtre déjà lancée).
2. **Nouveau dossier** (picker ou dossier jamais utilisé dans cette session).
3. **Nouvelle discussion** → message court (« dis bonjour »).
4. Attendre la **fin complète** de la réponse (streaming terminé).
5. Vérifier : pas de crash, fil intact, UI réactive, layout inchangé.

**Échec** : copier les 30 dernières lignes de la console (Ctrl+Shift+I) ou :

```powershell
$log = Get-ChildItem "$env:APPDATA\code-oss-dev\logs" -Directory | Sort-Object Name -Descending | Select-Object -First 1
Select-String -Path "$($log.FullName)\**\*.log" -Pattern "Error|FATAL|infinite|setChat|evict|Drox Agents" | Select-Object -Last 40
```

---
| T3 | **Relance app seule** → freeze sans clic | Scan MRU + `_hydrateSessionChanges` × N sessions au boot (S5 lazy) |

---

## 6. Flags / réglages temporaires

| Réglage | Effet |
|---------|--------|
| `drox.warmStart` → `false` | Pas de spawn `drox.exe` au idle |
| Fermer fenêtre Agents, ne garder que l’IDE | Moins de RAM / moins de scans |

---

## 7. Erreur type « Autorun stuck in infinite update loop »

Stack typique (1.5.13) :

```text
GitRepository.updateState → droxSessionsProvider._attachGitRepositoryState
```

Cause : autorun qui lit `session.workspace` et appelle `updateWorkspace()` sans garde d’égalité.

Correctif : `droxSessionsProvider.ts` — comparer `branchName` / `uncommittedChanges` avant `updateWorkspace` (S5-bis).

---

```text
[Drox Agents] session history loaded … loadMs=
[Drox Agents] session history skipped … workspacePath=(missing)
[DroxSessionsProvider] sendRequest
```

- `loadMs` très élevé → replay disque lourd
- Répétition en boucle des mêmes lignes en < 1 s → reload infini
- Absence de log puis freeze → thread principal bloqué (sync I/O ou boucle serrée)

---

## Liens

- [SMOKE-1.5.13.md](SMOKE-1.5.13.md)
- [PLAN-1.5.13.md](PLAN-1.5.13.md)
- `.vscode/launch.json` → config **VS Code Agents**
