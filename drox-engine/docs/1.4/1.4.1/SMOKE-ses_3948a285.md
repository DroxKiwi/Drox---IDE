# Smoke — `ses_3948a285` (Qwen 27B · tool folders deadlock)

**Date** : 2026-06-15  
**Session** : `ses_3948a285-e302-4b9e-953b-3597005f04d5`  
**Workspace** : `site-kdds`  
**Build** : `1.4.0.1781549526` · git `d0beafd` · `target/debug/drox.exe`  
**Export** : `drox-engine/docs/chat_qwen27b.txt` (tronqué iter 31)

## Demande utilisateur

Adoucir / simplifier le système d'animation de la page principale.

## Verdict

| Critère | Résultat |
|---------|----------|
| `tool_calls` natifs | ✅ (pas de `[tool_use]` texte) |
| Exploration (`file_read`, `grep`) | ✅ |
| Mutation fichier | ❌ **0** `file_edit` / `file_write` |
| Clôture run | ❌ pas de `[phase: done]` |
| Tokens ctx final | ❌ ~29k (objectif &lt; 25k) |

**Cause racine** : protocole **tool folders × rail** incohérent — pas un refus du modèle d'appeler des outils.

## Symptômes observés

1. **Deadlock ACT** — `file_edit` / `file_write` repliés dans `edit_file`, mais `edit_file {"action":"describe"}` **bloqué** par `tool_pre_gate_rail` alors que le message rail dit « utilise file_edit / file_write ».
2. **Avance rail prématurée** — `read_workspace describe` lancé à `intent`, station passée à `act` **avant** exécution (`minimum_station_for_tool("read_workspace")` retombait sur `Act` par défaut).
3. **Boucle bash Windows** — contournement heredoc / `echo` après échec mutation (~13 bash, 31 iters).

## Correctifs appliqués (post-smoke)

| Fichier | Changement |
|---------|------------|
| `agent/rail/policy.rs` | `virtual_folder_allowed` + `minimum_station_for_virtual_folder` ; `tool_allowed` pour `read_workspace` / `edit_file` / `verify_project` ; hint ACT mentionne `edit_file describe` |
| `agent/rail/pre_gate.rs` | Tests : folders autorisés aux bonnes stations |
| `agent/rail/infer.rs` | (indirect) `read_workspace` aligne `intent → read`, plus `intent → act` |
| `orchestration/prompts/.../01_core_rail_solo.md` | Discipline par station alignée sur tool folders |
| `orchestration/tool_folders/tests.rs` | Régression pre_gate + align `read_workspace` |

## Re-smoke attendu

1. `read_workspace describe` à INTENT → OK, station **READ** (pas ACT).
2. `edit_file describe` à ACT → OK, `file_edit` / `file_write` visibles iter suivante.
3. ≥1 mutation réussie sur `home-content.tsx` ou `globals.css`.
4. Clôture `[phase: answering]` + `[phase: done]`, tokens in &lt; 25k.

## Re-smoke validé

[`SMOKE-ses_733093c6.md`](SMOKE-ses_733093c6.md) — ~3 min, `file_write` OK, `done`, R5 à 25 760 tokens (+3 % vs seuil).
