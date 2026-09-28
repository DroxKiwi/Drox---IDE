# Idée 15 — Visualisation en direct des interactions shell du modèle

**Statut** : idée brute (brainstorm)  
**Date** : 2026-06-05  
**Auteur** : produit / dogfooding

---

## Résumé

Permettre à l’utilisateur de **voir en temps réel** ce que fait le modèle quand il appelle l’outil `bash` : commande lancée, répertoire courant, **stdout / stderr streamés** pendant l’exécution, code de sortie et durée — sans attendre la fin du tool pour découvrir le résultat dans le transcript ou le canal Sortie.

Objectif : **transparence** et **debug** (runs longs, `npm test`, `cargo build`, scripts multi-étapes) ; complément du fil chat où `bash` n’affiche aujourd’hui qu’un résumé « Ran `…` ».

---

## Problème actuel

| Existant | Limite |
|----------|--------|
| Carte tool chat (`droxToolPreview` → « Ran » + commande tronquée) | **Avant / après** seulement — pas de flux live |
| Canal Sortie **`droxBash`** (`DROX_BASH_OUTPUT_CHANNEL_ID`) | Header `$ cmd` puis **tout le stdout/stderr en bloc** à la fin (`droxBashTool.ts`) |
| `runDroxBashExec` (main process, `child_process.spawn`) | Capture bufferisée (`MAX_STREAM_BYTES` 30 KiB), **aucun événement intermédiaire** vers le renderer |
| Permissions (`analyze` / `trustEdit` / `imNotCrazy`) | Décision allow/ask/deny — **pas** de surface UI dédiée shell pendant le run |
| Timeline orchestration (1.3.x) | Orientée phases / outils — **pas** terminal intégré |

En **1.3.4 architecte seul**, `bash` est un outil central (sanity cycle, tests, builds). L’utilisateur doit souvent **ouvrir manuellement** le panneau Sortie ou relire le tool result JSON pour comprendre un échec — friction élevée sur des commandes de 30 s à plusieurs minutes.

---

## Vision produit

### Option A — Carte shell **inline** dans le fil Drox (MVP recommandé)

Sous la carte « Ran `npm test` » (ou dès `ToolStart` moteur) :

```text
┌─ bash · run_abc / call_xyz ─────────────────────────────┐
│ $ npm test -- --grep "droxCommon"                        │
│ cwd: C:\…\Drox---IDE                                      │
├──────────────────────────────────────────────────────────┤
│  PASS  droxCommon.test.ts (12 tests)                     │  ← stream live
│  …                                                        │
│  FAIL  1 test                                              │
├──────────────────────────────────────────────────────────┤
│ exit 1 · 42.3 s · 12.4 KiB stdout · 0.8 KiB stderr      │
│ [Copier] [Ouvrir dans Sortie] [Réduire]                  │
└──────────────────────────────────────────────────────────┘
```

- Style **pseudo-terminal** (police monospace, couleurs ANSI si disponibles).
- Auto-scroll pendant le run ; pause si l’utilisateur scroll manuellement.
- État **running** / **ok** / **error** / **timeout** / **denied** (permission).

### Option B — Onglet panneau bas « Shell agent » (complément)

Onglet à côté de **Terminal** / **Output** (proche [02 — Parcours modèles](02-onglet-parcours-modeles.md)) :

- Historique des N dernières commandes du run courant.
- Clic → focus la carte inline correspondante dans le chat.
- Utile quand plusieurs `bash` s’enchaînent ou quand la carte chat est repliée.

### Hors MVP

- Injection clavier dans le process (shell **interactif** type PTY).
- Partage du **même** terminal VS Code que l’utilisateur.
- Replay ANSI sur sessions anciennes (export transcript suffit en V1).

---

## Pistes techniques

### 1. Streaming IPC main → renderer

Aujourd’hui : `ExecBash` RPC **request/response** unique.

Évolution :

```text
ToolStart(bash) → client handler spawn
  → main: spawn + listeners stdout/stderr 'data'
  → fire IDroxBashStreamChunk { runId, callId, stream, chunk, offset }
  → renderer: append webview card OU canal Sortie incrémental
  → fin: IDroxBashExecResult inchangé (rétrocompat tool result LLM)
```

Fichiers touchés (indicatif) :

| Zone | Fichier |
|------|---------|
| Exec | `electron-main/droxBashExec.ts` — option `onChunk` ou `EventEmitter` |
| IPC | `common/droxIpc.ts` — event `OnBashStream` ou réutiliser `OnNotification` |
| Client tool | `electron-browser/tools/droxBashTool.ts` — subscribe + forward host message |
| Chat UI | `browser/media/droxChat/stream/…` — composant `bash-live-card` |
| Moteur | inchangé si le client garde la responsabilité `executableTools` |

### 2. Réutiliser `agent/event` `ToolStart` / `ToolFinish`

Le moteur émet déjà `ToolStart { name: "bash", … }` avant l’exécution client.

- **Ouvrir** la carte shell au `ToolStart`.
- **Clore** au `ToolFinish` (ou tool result) avec métadonnées `exit_code`, `duration_ms`.
- Corrélation : `callId` / `runId` déjà présents côté RPC `tool/exec`.

### 3. Canal Sortie `droxBash` en mode incrémental

Quick win partiel sans webview :

- `outChannel.append(chunk)` **à chaque** `data` dans `runDroxBashExec`.
- Auto-révéler le panneau Sortie au premier `bash` du run (setting opt-out).

Limite : l’utilisateur reste **hors** du fil chat — utile comme étape 0, pas comme vision finale.

### 4. Rendu webview

- `<pre>` + scroll + classes CSS terminal (déjà `msg-paste-terminal`, variables `--vscode-terminal-ansi*` dans `droxChatMvp.css`).
- Option : lib légère type **xterm.js** si ANSI / largeur colonnes deviennent critiques.
- Troncature UI alignée sur `MAX_STREAM_BYTES` moteur — badge « output truncated ».

### 5. Permissions & modes

| Mode | Comportement UI |
|------|-----------------|
| `imNotCrazy` | Carte en attente « Permission… » jusqu’à allow ; puis stream |
| `analyze` | Stream OK ; commandes mutatives **refusées** avant spawn — carte `denied` |
| `trustEdit` | Stream immédiat |

Ne pas afficher le flux **avant** validation permission (fuite d’intention / confusion).

---

## Liens avec le reste du produit

| Fiche / zone | Lien |
|--------------|------|
| [05 — Stats perf par cycle](05-stats-perf-par-cycle.md) | Compteur `bash×N`, durée cumulée, bytes streamés |
| [11 — Télémétrie locale](11-telemetry-ide-locale-apis.md) | Persister résumés commande (hash, exit, durée) — pas le stdout complet par défaut |
| [02 — Parcours modèles](02-onglet-parcours-modeles.md) | Panneau bas partagé ; shell = une **lane** du parcours |
| 1.3.4 architecte seul | `bash` remplace une partie du sanity autrefois délégué — **priorité UX** élevée |
| Sandbox VS Code (`chat.agent.sandbox.*`) | À clarifier : Drox bash = spawn **hors** sandbox Microsoft aujourd’hui |

---

## Questions ouvertes

1. **Concurrent** : deux `bash` parallèles (futur) — une carte par `callId` ou onglet unique multi-buffer ?
2. **Commandes longues** (`watch`, serveur dev) : timeout 120 s / 600 s max — faut-il un mode « detached » + carte « still running » ?
3. **Secrets** : masquer patterns dans le flux (tokens, mots de passe) avant affichage ?
4. **Windows** : `cmd.exe /C` vs PowerShell — afficher le shell réel dans l’en-tête carte ?
5. **Export transcript** : inclure le stdout streamé ou seulement le résumé (taille JSONL) ?
6. **Réduction bruit** : replier par défaut les commandes read-only (`ls`, `git status`) ?

---

## MVP proposé

| Étape | Livrable | Effort estimé |
|-------|----------|---------------|
| **S0** | Stream vers canal `droxBash` + auto-open Sortie | Petit |
| **S1** | Carte inline chat (texte brut, pas ANSI) + `ToolStart`/`Finish` | Moyen |
| **S2** | IPC chunk typé + troncature + copier / lien Sortie | Moyen |
| **S3** | Onglet « Shell agent » + corrélation multi-commandes | Plus grand |

**Critère de succès dogfood** : pendant un `cargo test -p drox-engine`, l’utilisateur voit les tests défiler **dans le chat** sans ouvrir Sortie ; en cas d’échec, le bloc d’erreur est visible avant la réponse prose de l’architecte.

---

## Non-objectifs (cette idée)

- Remplacer le **Terminal** intégré VS Code pour l’utilisateur humain.
- Exécuter le modèle dans un **PTY interactif** (vim, less, prompts).
- Envoyer le flux shell vers un service cloud.
