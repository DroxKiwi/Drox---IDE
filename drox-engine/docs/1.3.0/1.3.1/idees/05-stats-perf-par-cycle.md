# Idée 05 — Statistiques de performance par cycle

**Statut** : idée brute  
**Date** : 2026-05-29  
**Auteur** : produit / dogfooding

---

## Résumé

Exposer des **métriques agrégées par cycle** (un tour architecte → exécuteurs → synthèse) pour comparer les runs entre eux et détecter les régressions de perf : lignes modifiées, tokens LLM par rôle / sous-agent, durée, nombre d’outils, etc.

Objectif : **check de perf par cycle** reproductible — sans remplacer le profilage fin, mais en complément des chiffres déjà visibles dans le chat.

---

## Problème actuel

| Aujourd’hui | Limite |
|-------------|--------|
| Jauge **ctx** dans le composer (`statCtx`, événement `usage`) | Contexte **parent** seulement — pas de ventilation par exécuteur |
| Tokens compaction (`droxSessionCompact`) | Affichage ponctuel, pas d’historique par cycle |
| `agent-output` / rapports exécuteur | Riches en contenu, **pauvres en KPI** normalisés |
| Logs moteur / canal Sortie | Difficiles à corréler à « cycle N » côté UI |

On a déjà des **indices** utiles en dogfooding ; ils ne sont pas **consolidés** ni exportables pour comparer deux sessions ou deux versions (1.3.0 vs 1.3.1).

---

## Vision produit

À la fin de chaque **cycle** (strip linéaire 1.2.0 / batch parallèle 1.3.0) :

```text
Cycle 2 — 4 min 12 s
  Architecte     ↑ 12 400 tok  ↓ 890 tok
  Exécuteur t1   ↑ 8 200 tok   ↓ 1 100 tok  ·  +42 / −18 lignes  ·  file_edit×3
  Exécuteur t2   ↑ 6 100 tok   ↓ 400 tok   ·  +12 / −0 lignes   ·  grep×5
  Outils IDE     bash×1  lsp×2
  Total cycle    ↑ 26 700 tok  ↓ 2 390 tok  ·  lignes nettes +54
```

- **Panneau repliable** sous le cycle (ou onglet « Stats » à côté du plan).  
- **Export** optionnel : JSONL dans `.drox/agent-output/<plan_id>/metrics.jsonl` pour scripts / tableurs.  
- **Comparaison** : dernier cycle vs moyenne des 5 derniers cycles (même plan).

---

## Métriques cibles (MVP)

| Métrique | Source probable | Notes |
|----------|----------------|-------|
| `duration_ms` (cycle) | Horodatage `agent/run` → `agent/done` | Par cycle UI |
| `tokens_in` / `tokens_out` | `usage` LLM (architecte + chaque slot) | Déjà partiellement câblé moteur |
| `lines_added` / `lines_removed` | `file_edit` / `file_write` + diff unifié | Réutiliser logique `droxUnifiedDiff` |
| `tool_calls` par nom | ToolRegistry / events RPC | Compteur par rôle |
| `executor_slots` | Batch `parallel_with` | N, succès / échec / timeout |
| `ctx_peak` | Garde jauge parent | Ne pas regonfler sur sous-runs (règle 1.2.0) |

**Hors MVP** : coût € cloud, VRAM, latence P95 par appel LLM.

---

## Pistes techniques

| Couche | Piste |
|--------|--------|
| **Moteur** | Struct `CycleMetrics` dans `architect_state` ; agrégation à chaque `delegate_executor` / fin de slot ; champ optionnel dans `agent/event` |
| **RPC** | `agent/event` kind `cycle_metrics` ou extension de `usage` |
| **IDE** | `droxChatAgentEvents.ts` → state webview ; rendu dans `07b-runTimeline.js` ou module `13-cycle-stats.js` |
| **Persistance** | Append JSONL côté moteur (`agent-output`) + relecture au reopen session |

**Principe** : calcul **moteur** (vérité), affichage **webview** (présentation) — pas de double comptage dans le JS.

---

## Conserver l’existant

- Ne pas retirer la jauge **ctx** du composer.  
- Conserver les mentions tokens dans les messages compaction.  
- Les stats cycle **complètent** ces signaux, ne les remplacent pas.

---

## Liens

| Doc / code | Rôle |
|------------|------|
| [UI-DISPLAY-LINEAR-WORKFLOW.md](../../1.2.0/steps/09-ui/UI-DISPLAY-LINEAR-WORKFLOW.md) | Modèle cycle UI |
| [PARALLELISME-DESIGN.md](../../steps/03-parallelisme/PARALLELISME-DESIGN.md) | Slots parallèles |
| `droxChat/04-history.js`, `09-host.js` | `ctxTokens`, `usage` |
| `droxSessionCompact.ts` | Tokens compaction |
| [CRITERES-TEST-REEL.md](../../finalisation/CRITERES-TEST-REEL.md) | Sessions longues — KPI terrain |

---

## Questions ouvertes

1. Granularité : stats **par cycle** seulement, ou aussi **par plan** (agrégat) ?  
2. Affichage par défaut **ouvert** ou **repliable** (bruit UI) ?  
3. Faut-il un seuil d’alerte (« cycle > 100k tokens ») pour le profil Low ?  
4. Privacy : les métriques restent-elles **100 % locales** (défaut Drox) ?

---

## Critères de promotion

- [ ] Schéma `CycleMetrics` versionné + test unitaire agrégation (2 exécuteurs mock).  
- [ ] UI visible sur un run 1.3.0 avec `parallel_with` sans régression fil linéaire.  
- [ ] Export JSONL lisible pour comparer deux builds sur le même scénario smoke.
