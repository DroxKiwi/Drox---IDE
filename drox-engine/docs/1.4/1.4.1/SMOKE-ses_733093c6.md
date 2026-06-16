# Smoke — `ses_733093c6` (Qwen 27B · Phase E vert)

**Date** : 2026-06-16 · durée **~3 min 08**  
**Session** : `ses_733093c6-b23e-4fda-bd14-5c84595f27bd`  
**Workspace** : `site-kdds`  
**Build** : `1.4.0.1781632229` · git `d0beafd` · `target/debug/drox.exe`  
**Export** : `drox-engine/docs/chat_qwen27b.txt` · archive `site-kdds/.drox/exports/transcript-ses_733093c6-*.txt`

## Demande utilisateur

Simplifier le SVG animé du site (`animated-background.tsx`) — moins chargé, plus simple.

## Verdict global

| Critère | Seuil R | Résultat |
|---------|---------|----------|
| **R1** 1er `tool_call` structuré | ≤ 3 tours | ✅ index moteur **6** |
| **R2** `[tool_use]` texte persistant | 0 | ✅ streak **0** |
| **R3** Thinking « cannot read / simulation » | 0 | ✅ (non observé) |
| **R4** `internal_plan_write` avant autre outil | oui | ✅ iter 0 |
| **R5** Tokens `in` | < 25 000 | ⚠️ **25 760** (+3 %) |
| **R6** `phase: done` + mutation | oui | ✅ `file_write` + LSP 0 erreur |
| **R7** Export A+B+C archivé | oui | ✅ résumé fin PARTIE A |

**Conclusion** : smoke **Phase E validé** après correctifs tool folders × rail ([`SMOKE-ses_3948a285.md`](SMOKE-ses_3948a285.md)).

## Métriques run

| Métrique | Valeur |
|----------|--------|
| Itérations LLM | 15 |
| Tool calls (journal) | 14 |
| Tool errors (récupérés) | 3 |
| Events UI | 263 |
| Messages transcript | 25 |
| Tokens in / out / ctx | 25 760 / 537 / 17 770 |
| `text_tool_marker_streak` | 0 |
| `schema_error_continue_count` | 0 |

## Flux outils (succinct)

1. `internal_plan_write` (plan L2)
2. `read_workspace describe` → rail **INTENT → READ** → expand OK
3. `workspace_map_read` + `file_read` ×3 → cible `animated-background.tsx`
4. `file_write` ×1 **échec** (folder `edit_file` pas encore expand) — attendu
5. `edit_file describe` → expand OK
6. `file_write` **succès** (~10 Ko → ~5 Ko, particules 80→15, mesh/spores/sonar retirés)
7. `lsp` diagnostics → 0
8. `internal_plan_write` (steps completed)
9. Réponse utilisateur + `[phase: done]`

## Erreurs non bloquantes

| Tool | Erreur | Récupération |
|------|--------|--------------|
| `internal_plan_write` ×2 | merge sans champ `action` | ignoré, plan poursuivi |
| `file_write` ×1 | folder gate avant `edit_file describe` | corrigé tour suivant |

## Comparaison smokes

| Session | Durée | Mutation | `done` | Tokens in |
|---------|-------|----------|--------|-----------|
| `ses_7d5db0f1` | long | ✅ (tard) | ✅ | ~51k |
| `ses_3948a285` | 30+ min | ❌ | ❌ | ~29k |
| **`ses_733093c6`** | **~3 min** | ✅ | ✅ | **25.8k** |

## Références

- Échec pré-fix : [SMOKE-ses_3948a285.md](SMOKE-ses_3948a285.md)
- Baseline protocole texte : [SMOKE-ses_7d5db0f1.md](SMOKE-ses_7d5db0f1.md)
- Clôture : [finalisation/CLOSURE-1.4.1.3.md](finalisation/CLOSURE-1.4.1.3.md)
