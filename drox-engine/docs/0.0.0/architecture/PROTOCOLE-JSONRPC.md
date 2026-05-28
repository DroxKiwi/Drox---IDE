# Protocole JSON-RPC Drox (NDJSON)

**Transport** : une ligne JSON par message sur stdin/stdout (`drox --serve`).  
**Référence code** : `drox-cli/src/jsonrpc/protocol.rs`, `handlers/`.  
**Profils modèle** : [PLAN-MODELES-TIER](../plans/PLAN-MODELES-TIER.md), [MODELES-PAR-TAILLE](./MODELES-PAR-TAILLE.md).

---

## Méthodes principales

| Méthode | Rôle |
|---------|------|
| `initialize` | Capacités serveur / client |
| `agent.run` | Démarre un run agent (streaming events) |
| `agent.cancel` | Annule un `runId` |
| `user/ask` | Questions bloquantes (webview) |
| `session.*` | Lecture / compaction transcript |

---

## `agent.run` — paramètres (extrait)

Champs en **camelCase** (serde). Tous optionnels sauf `prompt`.

```json
{
  "prompt": "…",
  "modelTier": "low",
  "model": "qwen3.5:9b",
  "workspace": "/path/to/project",
  "mode": "acceptEdits",
  "sessionId": "…",
  "maxIterations": 12,
  "nativeThinking": false,
  "disabledTools": [],
  "mcpToolsEnabled": true,
  "subagentsEnabled": false
}
```

### `modelTier` (M0+)

| Valeur | Défaut | Effet |
|--------|--------|--------|
| `"medium"` | **oui** (absent = medium) | Comportement moteur de référence (gelé) |
| `"low"` | non | Profil petit modèle : allowlist outils, 1 tool/tour, prompt allégé — voir plan |

Résolution côté serveur :

```text
modelTier → RunProfileId::resolve_tier_opt → RunSpec (legacy)
```

### `orchestrationMode` (1.2.0 — P2)

| Valeur | Défaut | Effet |
|--------|--------|--------|
| `"legacy"` | **oui** | Boucle agent 0.0.0 (`modelTier` low/medium) |
| `"v1_2"` | non | Stub P2 → même exécution que `legacy` ; multi-rôles en P3 |

Priorité : param `orchestrationMode` > env `DROX_ORCHESTRATION` > `legacy`.

Voir [ORCHESTRATION-FLAG.md](../../1.2.0/steps/06-flag/ORCHESTRATION-FLAG.md).

### Autres champs

Voir `AgentRunParams` dans `protocol.rs` pour la liste complète (`images`, `runObjective`, `allow`/`ask`/`deny`, …).

---

## Workbench Nexus

Le panneau chat envoie `modelTier` via `buildAgentRunParams` (`common/droxRunSettings.ts`). Défaut : **`medium`**. UI : vignettes **Fast** / **Standard** + setting `nexus.drox.modelTier`.

---

*Dernière mise à jour : 2026-05-20 (`modelTier`, `orchestrationMode` P2).*
