# DIAG — Indicateurs tokens / ctx figés

> **Statut** : archive (comportement attendu, pas de correctif 1.5.18).

**Symptôme** : pendant un run Agents long, `↑ 0` / `↓ 0` ne bougent pas ; `ctx 85k / 128k` paraît figé ; chip gear `128k` inchangé.  
**Repro** : self-hosted, modèle type `qwen3.6:…` (capture 1.5.17/18).

---

## Ce que montre l’UI (3 compteurs distincts)

| Élément | Source | Doit bouger par échange ? |
|---------|--------|---------------------------|
| Gear / chip `128k` | Setting `drox.numCtx` | **Non** — taille de fenêtre configurée |
| `ctx Xk / 128k` | `stats.ctx` vs `numCtx` | Oui (approx) via `context_usage` et/ou `turn_usage.input` |
| `↑` / `↓` | Cumuls `totalIn` / `totalOut` | Oui, via `turn_usage` (tokens provider > 0) |

Fichiers : `droxAgentsChatStatusBar.ts`, `droxAgentsChatUiStatsService.ts`, `droxNumCtx.ts`.

---

## Chaîne d’événements (attendu)

```text
Ollama NDJSON done { prompt_eval_count, eval_count }
  → StreamEvent::Stop { usage }
  → AgentEvent::TurnUsage { usage }   // seulement si usage > 0
  → notify agent/event { kind: "turn_usage", usage: { input_tokens, output_tokens } }
  → DroxAgentsChatUiStatsService.trackUsage
  → status bar ↑↓
```

Parallèle : `AgentEvent::ContextUsage` (RoughTokenCounter local) → `ctx` sans passer par le provider.

---

## Hypothèses classées (après revue code)

### H1 — Provider UI = OpenAI-compatible (forte)

Sur la capture, le chip connexion lit **`Self-hosted · API Open…`** → libellé **API OpenAI-compatible**, pas « Ollama ».

Même si le **serveur** derrière est Ollama (ou un gateway), le runtime 1.5.17 utilise alors `OpenAiCompatibleClient` :

- SSE `/v1/chat/completions`
- **Pas** de `stream_options.include_usage` dans `openai/request.rs`
- Beaucoup d’endpoints n’envoient alors **jamais** `usage` en stream → `TurnUsage` jamais émis → **↑↓ restent à 0**

Le `ctx` peut quand même avancer via le compteur local → impression « tokens cassés » alors que seul le chemin **usage provider** est mort.

**Pas introduit par un bug Ollama natif** : régression / trou du **nouveau client OpenAI** livré en 1.5.17.

### H2 — Ollama natif sans compteurs sur `done` (moyenne)

Si `provider=ollama` et le chunk final omet `prompt_eval_count` / `eval_count` :

```rust
// ollama/stream.rs
input_tokens: chunk.prompt_eval_count.unwrap_or(0),
```

→ usage 0 → le moteur **n’émet pas** `TurnUsage` (`agent.rs` gate `usage > 0`).

### H3 — Course `activeRunId` Agents (faible pour un run long)

Dans `droxAgentsSessionHandler.ts`, les notifs sont filtrées tant que `activeRunId` n’est pas renseigné (après le retour de `agent.run`). Fenêtre courte en début de run ; peu probable d’expliquer ↑↓ à 0 pendant 28 minutes, sauf si **aucun** `turn_usage` n’arrive jamais (renvoie à H1/H2).

### H4 — Affichage `ctx` « figé » (cosmétique)

`formatDroxContextUsageStat` arrondit en `Nk` (÷ 1024). Autour de 85 k, il faut ~1 k tokens pour voir `85k` → `86k`.

---

## Lien avec 1.5.17

| Changement 1.5.17 | Impact tokens |
|-------------------|---------------|
| `LlmError::Api` + URL | Non |
| Adaptateurs + `OpenAiCompatibleClient` | **Oui** si id ≠ `ollama` |
| Stream Ollama natif | Inchangé pour l’usage |

---

## Vérifications manuelles

1. Chip connexion : **Ollama** vs **API OpenAI-compatible**.
2. Si OpenAI-compatible vers Ollama : basculer temporairement sur id `ollama` + URL `:11434` → ↑↓ doivent bouger si Ollama envoie les compteurs.
3. Inspecter un `agent/event` `turn_usage` (Output Drox / log) : `input_tokens` / `output_tokens` non nuls ?
4. Confirmer que le gear `128k` ne doit **pas** suivre l’usage.

---

## Correctifs candidats (hors scope tant que non validés)

1. Ajouter `stream_options: { include_usage: true }` (ou équivalent) au client OpenAI.
2. Fallback : dériver ↑↓ depuis `context_usage` / estimation si usage provider absent (doc explicite).
3. Assouplir le filtre `activeRunId` (buffer events jusqu’à runId connu).
4. Afficher sous-k ou tokens bruts pour le ctx live.
