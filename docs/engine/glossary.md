# Glossaire moteur Drox

| Terme | Définition |
|-------|------------|
| **`tui_mono`** | Pipeline d’orchestration actuel : une boucle agent unique (pas de split Architect/Executor code). Annoncé dans `initialize.orchestrationPipeline`. |
| **`drox.exe` / `drox`** | Binaire `drox-cli` : CLI + serveur `--serve`. |
| **`drive_inner`** | Boucle principale dans `drox-engine` : LLM ↔ tools ↔ nudges jusqu’à done / cancel / plafond. |
| **`AgentEvent`** | Événement de run streamé vers le client (`agent/event`). |
| **`RemoteTool`** | Outil exécuté par le client via `tool/exec`, déclaré dans `executableTools`. |
| **`executableTools`** | Liste handshake des outils remote IDE. |
| **NDJSON** | Une requête/réponse JSON par ligne sur stdio. |
| **Phase** | Marqueur protocole dans le flux modèle (`[phase: answering]`, `[phase: done]`, …). |
| **Nudge** | Message / contrainte injectée quand le modèle dévie (réponse sans done, boucle, todos…). |
| **Compaction** | Réduction d’historique / snapshot pour tenir le budget tokens. |
| **Memdir / session notes** | Mémoire locale projet ou session, hors cloud imposé. |
| **`rail_station_*`** | Événements UI hérités ; souvent **synthétisés** par le shim à partir des phases `tui_mono`. |
| **`role_split`** | Ancien pipeline (Architecte / Exécuteur) — **obsolète**, ne plus l’utiliser comme modèle mental du code actuel. |
| **Ollama-first** | Inférence locale par défaut ; OpenAI-compat supporté pour d’autres endpoints. |

Pour l’historique des releases : `docs/1.5/`, `docs/1.4/`, etc.
