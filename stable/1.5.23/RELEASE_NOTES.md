# Drox IDE 1.5.23

## Correctifs (2026-10-04)

- **Chat Microsoft masqué** — l’onglet Chat Copilot ne réapparaît plus dans le panneau bas (à côté du Terminal) ; surfaces MS restantes (Open/Toggle/Quick Chat) désactivées quand `droxMicrosoftAgentsSurfaceEnabled` est off.
- **Diffs discussion** — clic sur le chemin d’un fichier modifié ouvre bien l’éditeur ; cartes diff allégées (plus de bordure verte).

## Nouveautés

- **Polish dogfood** — badge Changes, switch Agents ↔ IDE, auth Copilot allégée, cockpits allégés, terminaux agent visibles, onglet Traffic.
- **Traffic** — tags / alertes destination (liste, suppression, match partiel, rétroactif sur le ledger).
- **Explore** — sub-agent `task` câblé dans l’IDE / Agents (gate `drox.subagents.enabled` ∧ L2 standard/full) avec cartes de rapport dans le fil.
- **Ports** — forwards déclaratifs (`drox.ports.*`) + outil extérieur interchangeable (ssh / socat / script), panneau Start / Stop / Open, sans cloud tiers.

## Prérequis

- Windows 10+ (64 bits) / Linux x64
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows)
- [Ollama](https://ollama.com/) (recommandé) ou endpoint OpenAI-compatible

## Licence

MIT — Code OSS (Microsoft) + portions Drox (KDDS). Voir [NOTICE.md](../../NOTICE.md).
