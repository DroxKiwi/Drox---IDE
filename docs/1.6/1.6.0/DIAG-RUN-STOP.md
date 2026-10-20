# Diagnostiquer un arrêt soudain de run

**Objectif** : classer en moins de 2 min si l’arrêt vient de l’**IDE** (EH / dispose) ou du **moteur** (orphan tool / erreur run) — sans diguer Explore par défaut.

## Automatisé

```powershell
# Depuis la racine du repo (export = docs/exports/latest-transcript.txt)
.\scripts\diag-drox-run-stop.ps1

# + log terminal du dogfood si tu l’as capturé
.\scripts\diag-drox-run-stop.ps1 -TerminalLog path\to\code.bat.log
```

Le script sort un **BUCKET** + preuves (PARTIE D, orphan UI, `disposed engine` / EH).

## Manuel (si pas de script)

### 1. Export immédiat au stop

Export transcript → `docs/exports/latest-transcript.txt` (ou chemin connu).

### 2. Bucket sur PARTIE D (30 s)

Regarder le **dernier** message moteur :

| Dernier message | Bucket |
|-----------------|--------|
| `TOOL` result OK, **pas** d’`ASSISTANT` après | **kill_mid_turn** — coupure entre tool_finish et prochain LLM |
| Tool en cours + UI « Run ended without tool result » | **orphan_tool** (D6) |
| `agent/done` cancelled / error / completed | **run_done** (stop normal ou erreur run) |

### 3. Corréler le terminal `code.bat` (1 min)

Autour de l’heure `Exported:` :

| Log | Lecture |
|-----|---------|
| `[Drox] disposed engine for window … reason=shutdown` | Fermeture fenêtre (attendu) — **ignorer** si timestamp **après** `Exported:` (post-hoc, pas kill mid-run) |
| `reason=respawn-binary` / `respawn-settings` | Rebuild `drox.exe` ou settings LLM — **ne doit plus** arriver mid-run (defer) |
| `reason=start-replace` | Remplacement host (exe/cwd/env changés) |
| `[Drox] engine dispose deferred` / `respawn deferred` | No-kill actif : run vivant, dispose refusé |
| `[Drox] reused engine for window` | start idempotent (pas de kill) |
| `[Drox] engine exit code=` / `stale client … restart + retry` | Process mort → recovery auto (1 retry) ; si Retry UI encore, lire le `code=` |
| `Extension host … exited` | EH mort → moteur jeté |
| `UNRESPONSIVE extension host` | Piste saturation / restart EH |
| Rien de tout ça + silence long | Piste hang LLM (prochain tour jamais revenu) |

### 4. Ce qu’on ne digue pas en premier

Markers Explore (`e2.`, `a.`, spill, kinds) — **seulement** si bucket `orphan_tool` ou spirale kinds évidente. Sur `kill_mid_turn` + `disposed engine` → dossier **IDE**, pas A/E2b.

## Pendant le prochain dogfood

1. Ne pas reload / fermer / F5 tant que busy.  
2. Au stop : export **immédiat** + noter geste UI (oui/non).  
3. Lancer `.\scripts\diag-drox-run-stop.ps1`.

## Lien produit

- **D6** orphan tool_finish — [APPROCHE](APPROCHE-CONTRATS-ETAPE.md) · backlog [CLOSURE](CLOSURE-1.6.0.md)  
- Kill mid-turn = voisin D6 (survie run / UI « engine disposed »), pas le même bug que orphan Sync Explore.
