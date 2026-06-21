# Plan 1.5.2 — Configuration moteur Drox depuis l’IDE

**Version** : juin 2026  
**Base** : [1.5.1](../1.5.1/CLOSURE-1.5.1.md) · moteur `tui_mono` · shim RPC  
**Branche** : `1.5.2` (ouverte depuis `main`, juin 2026)

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **M1** Paramètres moteur IDE | 0 % | config agent |

**Hors scope** : diffs fil, UX chat, splash, release Linux → [1.5.3](../1.5.3/PLAN-1.5.3.md) · [1.5.4](../1.5.4/PLAN-1.5.4.md).

---

## Objectif

| In | Hors scope 1.5.2 |
|----|-------------------|
| Panneau General settings : section **Engine / Sampling** alignée TUI | Diffs fichier dans le fil (**1.5.3** D1) |
| `max_iterations` **50** par défaut | UX messages user / composer (**1.5.3**) |
| Exposer `top_p`, `repeat_penalty`, `top_k`, `min_p`, etc. | Splash phosphore (**1.5.3** A1) |
| Masquer / déprécier `drox.engine.tuning.*` (legacy 1.4 ignoré par TUI) | Release Linux `.deb` (**1.5.4**) |
| Réglages pris en compte à l’envoi `agent.run` | Signature Authenticode (**1.5.4**) |

### Problème utilisateur

Le wizard **Connect your AI** (1.5.1) règle l’endpoint LLM, mais le reste de la config moteur reste **opaque ou faux** : champs 1.4 visibles, `max_iterations` à 12, sampling partiel — l’utilisateur croit configurer l’agent alors que le TUI / `AgentRunParams` ne reçoivent pas les bonnes valeurs.

---

## M1 — Paramètres moteur Drox (alignement TUI)

Réglages `drox.engine.tuning.*` et orchestration 1.4 **ignorés** par le moteur TUI. L’UI doit refléter `agent.run` ([`protocol.rs`](../../../drox/crates/drox-cli/src/jsonrpc/protocol.rs)).

### Defaults produit

| Paramètre | Aujourd’hui | Cible 1.5.2 |
|-----------|-------------|-------------|
| `max_iterations` | **12** | **50** |
| `top_p`, `repeat_penalty`, `top_k`, `min_p` | partiel / dev | exposés utilisateur |
| `drox.engine.tuning.*` | visible | **deprecated** / masqué |

### Paramètres à exposer

- `max_iterations`, `temperature`, `max_tokens`, `num_ctx`
- `top_p`, `top_k`, `repeat_penalty`, `min_p`
- `presence_penalty`, `frequency_penalty`, `native_thinking`
- `disabled_tools`, `mcp_tools_enabled`, `subagents_*`

### Checklist

- [ ] **M1-1** — Audit settings IDE vs `AgentRunParams` (liste des écarts + champs morts)
- [ ] **M1-2** — `DROX_DEFAULT_MAX_ITERATIONS = 50`
- [ ] **M1-3** — Panneau General settings : section Engine / Sampling
- [ ] **M1-4** — Masquer legacy 1.4 (`engine.tuning`, orchestration ignorés)
- [ ] **M1-5** — `droxConfiguration.ts` descriptions à jour
- [ ] **M1-6** — Tests + smoke : modifier `top_p` / `repeat_penalty` → run agent observe les valeurs

**Fichiers** : `droxProductDefaults.ts`, `droxRunSettings.ts`, `droxChatGeneralSettings.ts`, `panel.js`, `droxConfiguration.ts`.

**Critère** : utilisateur change `max_iterations` et `top_p` dans General settings → prochain `agent.run` utilise ces valeurs · plus de réglages 1.4 trompeurs visibles.

---

## Livrables

| # | Livrable | Critère |
|---|----------|---------|
| M1 | Paramètres moteur | 50 iter · sampling exposé · legacy masqué |
| L3 | `droxVersion` **1.5.2** au ship | `package.json` |

---

## Séquence

```text
1.5.1 clôture (ship win + merge main)
    → branche 1.5.2
        → M1 configuration moteur IDE
        → tag v1.5.2
            → 1.5.3 diffs + UX + splash
                → 1.5.4 Linux + Authenticode
```

---

## Liens

- [README 1.5.2](README.md)
- [PLAN 1.5.3](../1.5.3/PLAN-1.5.3.md)
- [PLAN 1.5.4](../1.5.4/PLAN-1.5.4.md)
- [SHIM-MOTEUR-IDE](../1.5.0/SHIM-MOTEUR-IDE.md)
