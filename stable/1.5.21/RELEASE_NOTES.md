# Drox IDE 1.5.21

## Nouveautés

- **Codebase** — index local avec auto-inject dans les runs agent ; chip Forced pour ancrer la recherche sur le fichier éditeur actif.
- **Retrieval** — compréhension modèle (EN) pour les filtres de recherche, sans heuristiques mot-clés sur le message utilisateur.
- **Shell discussion partagé** — IDE et Agents partagent les mêmes outils compositeur (modèle, serveur, réglages).
- **Loop guard** — retries bash/grep à changements cosmétiques uniquement : nudge puis abort.

## Prérequis

- Windows 10+ (64 bits) / Linux x64
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows)
- [Ollama](https://ollama.com/) (recommandé) ou endpoint OpenAI-compatible

## Licence

MIT — Code OSS (Microsoft) + portions Drox (KDDS). Voir [NOTICE.md](../../NOTICE.md).
