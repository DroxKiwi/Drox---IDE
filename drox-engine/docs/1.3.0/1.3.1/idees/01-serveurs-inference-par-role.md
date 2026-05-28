# Idée 01 — Serveurs d’inférence distincts par rôle

**Statut** : idée brute  
**Date** : 2026-05-28  
**Auteur** : produit / dogfooding

---

## Résumé

Permettre des **provenances différentes** de serveur d’inférence pour l’**architecte** et pour les **exécuteurs / sous-agents** : par exemple architecte sur un gros modèle local (Ollama), exécuteurs sur une autre machine ou un autre endpoint (GPU dédié, serveur LAN, cloud compatible OpenAI API).

Objectif : **vrai gain de perf** — paralléliser charge LLM sans saturer une seule instance `OLLAMA_NUM_PARALLEL=1`.

---

## Problème actuel

| Aujourd’hui | Limite |
|-------------|--------|
| `drox.server` + `drox.architect.model` / `drox.executor.model` | Même **base URL** implicite pour tous les rôles |
| Exécuteurs en `parallel_with` | Partagent le même pool Ollama → contention VRAM / file d’attente |
| Sous-agents `task` (explore) | Même serveur que l’architecte |

Sur une machine 12–24 Go VRAM, faire tourner **deux modèles** ou **N requêtes parallèles** sur un seul Ollama est souvent le goulot.

---

## Vision produit

```text
┌─────────────────┐     plan / gates      ┌──────────────────┐
│  Architecte     │ ────────────────────► │  Ollama local    │
│  (gros modèle)  │                       │  192.168.1.10    │
└────────┬────────┘                       └──────────────────┘
         │ delegate_executor × N
         ▼
┌─────────────────┐     mutations         ┌──────────────────┐
│  Exécuteurs     │ ────────────────────► │  Ollama / vLLM   │
│  (modèle rapide)│                       │  autre host      │
└─────────────────┘                       │  ou cloud API    │
                                          └──────────────────┘
```

- Réglages IDE explicites (ex. `drox.architect.server`, `drox.executor.server`) ou profil « pool » par rôle.  
- Le moteur route chaque **run_spec** / sous-agent vers le bon client HTTP.  
- UI : indicateur dans le chat (icône / badge « exécuteur → serveur B »).

---

## Pistes techniques

### Moteur (`drox-engine`)

- Étendre la config run (env + JSON-RPC `agent/run`) : `llm_endpoints: { architect, executor, explore? }`.  
- `LlmClient` / factory par rôle au lieu d’un singleton global.  
- Attention : **clés API**, timeouts, `num_ctx` différents par endpoint.  
- Logs / traçabilité : chaque événement outil tagué `endpoint_id`.

### IDE (Drox IDE)

- Settings `drox.*` miroir (déjà architect vs executor **modèle** — ajouter **serveur**).  
- Validation : ping / liste modèles par serveur au reload ↻.  
- Parallélisme 1.3.0 : `maxParallelExecutors` plus utile si les exécuteurs ne bloquent pas l’architecte.

### Hors scope MVP probable

- Load-balancing automatique entre N serveurs exécuteur.  
- Affinité modèle ↔ serveur apprise (scheduling ML).

---

## Liens existants

- Settings : `drox.server`, `drox.architect.model`, `drox.executor.model`  
- Doc : [PARALLELISME-DESIGN.md](../../steps/03-parallelisme/PARALLELISME-DESIGN.md), [MODELES-PAR-TAILLE.md](../../../0.0.0/architecture/MODELES-PAR-TAILLE.md)  
- Script : `scripts/ollama_parallel_probe.py` (probes charge parallèle)

---

## Questions ouvertes

| ID | Question |
|----|----------|
| Q1 | Un seul champ `executor.server` ou liste (round-robin) pour N exécuteurs ? |
| Q2 | Sous-agents **explore** (`task`) = serveur architecte, exécuteur, ou troisième ? |
| Q3 | Compatibilité **vLLM / LM Studio** : même contrat que Ollama pour tous les rôles ? |
| Q4 | Sécurité : exécuteur sur machine distante — chemins workspace / tools hybrides comment ? |
| Q5 | Fallback si serveur exécuteur down : retry local ou échec batch ? |

---

## Critères de succès (si promu)

- Deux runs parallèles exécuteur sur serveur B sans ralentir un appel architecte sur serveur A (mesure latence + tokens/s).  
- Configuration documentée en &lt; 5 min (deux URLs + deux modèles).  
- Pas de régression sur run mono-serveur (comportement actuel = défaut).
