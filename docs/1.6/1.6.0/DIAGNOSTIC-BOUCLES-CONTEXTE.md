# Diagnostic — boucles agent & explosion de contexte

**Statut** : baseline **1.6.0** · patches Vague 1–2 + L-3 appliqués (tests moteur) · **dogfood manuel encore dû**  
**Symptômes d’origine** : réponses identiques 2–3× ; runs qui n’aboutissent pas ; jauge ~78k → ~162k ; locaux / GLM flash.

---

## 1. Verdict (rappel)

| Intuition | Lecture initiale | Après patches |
|-----------|------------------|---------------|
| Défaut moteur (compact + done + reset) | Fort | **Traité** (L-1/L-2/C-1) |
| Modèles hypersensibles | Secondaire | Inchangé (ampli) |
| Faux `user` `[System reminder]` | Probable | **Traité** (L-3) |
| Jauge 78k→162k | 2 couches | **Partiel** (G-1 lisible + C-1 disque) |

---

## 2–6. Causes → résolution

| ID | Cause | Fix 1.6.0 | État |
|----|--------|-----------|------|
| H2 / L-1 | `loop_detector.reset()` sur DONE_ONLY / nudge générique | Plus de reset sur ces chemins | ✅ |
| H2 / L-2 | Même body sans tool, thinking variable | Filet `text_only` warn@2 hard@3 | ✅ |
| H1 / C-1+C-3 | Compact RAM IDE sans rewrite JSONL | `rewrite_messages` + curseur | ✅ |
| H5 / T-1 | Gros tool results inline | Spill `.drox/tool-outputs/` (>48 KiB) | ✅ |
| — / L-tools | Répétition `(tool, args)` hors bash/grep | `observe_tool_outputs` progress-aware | ✅ |
| H4 / G-1 | Confusion estim. vs provider | Label `estim.` / `provider` status bar | ✅ |
| — / C-2 | `session.compact` sans persistance | `try_live_compact` + `write_transcript` | ✅ |
| H3 / L-3 | Nudges → faux `user` | Fold dans le system unique | ✅ |
| OBS-1/2 | Export messages[] prod | — | ⬜ reporté |

### Dogfood post-Vague 3 — intent-only / grosse écriture

| ID | Cause | Fix | État |
|----|--------|-----|------|
| FX-B+ | Annonce « page complète / one file_write » sans `tool_calls` → abort opaque | Nudges chunk (`LARGE_WRITE_CHUNK`) + budget +1 · UI `intent_only_write` · CORE incremental writes | ✅ code |
| H5+ | Dumps docs (`Get-Content`) + écriture monolithique | Prompt anti-dump · suite curation → **[Vague 4](PLAN-CONTEXT-SITUATION.md)** | partiel |

Détail opérable 1.6.0 : [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md).  
Suite « apps sérieuses » (situation card, snip chaud) : [DIAGNOSTIC-CONTEXTE-SERIEUX.md](DIAGNOSTIC-CONTEXTE-SERIEUX.md).

---

## 7. Communauté (IAL) — inchangé

Références : papier *When Agents Do Not Stop* · DeerFlow / Agent Framework · Pi/OpenClaw (compaction = checkpoint disque).

---

## 8. Dogfood restant (gate clôture)

| # | Scénario | Attendu |
|---|----------|---------|
| S1 | Omet `done`, même réponse | Stop ≤ 3 (`text_only` / LoopDetected) |
| S2 | Message juste après compact | JSONL compacté, pas ×2 |
| S3 | `file_read` même path/range ×N | Stop via L-tools |
| S4 | Gros bash / Explore | Spill fichier, pas explosion ctx |
| G1 | Regarder la jauge | Suffixe `estim.` puis `provider` |
| L3 | Inspecter requête LLM (si possible) | Pas de `[System reminder]` en user |

OBS export messages[] reste **reporté** — les smokes ci-dessus + tests Rust suffisent pour ship si dogfood OK.
