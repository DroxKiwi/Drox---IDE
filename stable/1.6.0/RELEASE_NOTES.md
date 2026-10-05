# Drox IDE 1.6.0

## Stabilisation agent (boucles · contexte · compaction)

Correctifs moteur pour les boucles de réponse et les explosions de contexte observées en dogfood (locaux / GLM flash), **sans** changer le paradigme phases / MEMORY / régulation.

### Filets anti-boucle

- **L-1** — les nudges `DONE_ONLY` / générique ne remettent plus le LoopDetector à zéro.
- **L-2** — hard-stop si le même texte assistant se répète sans tool (thinking ignoré) : warn @2, abort @3.
- **L-tools** — détection `(tool, args)` répétée avec output identique ; output différent = progrès (polling).
- **L-3** — nudges mid-run repliés dans le bloc `system` unique (OpenAI / Ollama) : plus de faux message `user` `[System reminder]`.

### Contexte & compaction

- **C-1 / C-3** — après snip / microcompact / compaction live, le transcript JSONL IDE est **réécrit** (comme le TUI) et le curseur de flush recalibré.
- **C-2** — `session.compact` / `/compact` persiste le transcript quand la compaction live s’applique (`transcriptRewritten`).
- **T-1** — résultats d’outils > ~48 KiB spillés sous `.drox/tool-outputs/` ; le modèle reçoit un pointeur + aperçu.

### UI

- **G-1** — jauge contexte Agents : suffixe `estim.` (RoughTokenCounter) vs `provider` (`usage.input_tokens`).

## Prérequis

- Windows 10+ (64 bits) / Linux x64
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows)
- [Ollama](https://ollama.com/) (recommandé) ou endpoint OpenAI-compatible

## Licence

MIT — Code OSS (Microsoft) + portions Drox (KDDS). Voir [NOTICE.md](../../NOTICE.md).
