# Smoke M.9 — Mémoire unifiée post-compaction (template dogfood)

**Version** : juin 2026 — **post Phase M**  
**Statut** : **à exécuter** — remplacer `TEMPLATE` par `ses_<id>` après export  
**Plan** : [PLAN-1.4.2.md](PLAN-1.4.2.md) M.9 · comparer [SMOKE pré-M](SMOKE-1.4.2-ses_7b34fd1d.md)

---

## Objectif

Valider en conditions réelles que :

1. **M.5b** — le checkpoint compaction est **court** et renvoie au snapshot.
2. **M.3/M.4** — après compaction, le snapshot `## Run context (engine)` **réinjecté chaque tour** suffit (user request, objective, focus step).
3. **M.8** — `grep` **n’indexe pas** `.drox/exports/` (pas d’explosion ~300k tokens).
4. **M.6–M.10** — boot sans listing sessions/skills ; teaser `memory_list` / `DROX.md` seulement.

---

## Préparation

| Étape | Action |
|-------|--------|
| Build | `cargo build -p drox-cli` dans `drox-engine/drox` → `target/debug/drox.exe` |
| IDE | F5 Drox ou binaire debug pointant sur ce `drox.exe` |
| Workspace | `site-kdds` (ou repo avec background animé connu) |
| `.droxignore` | Vérifier présence de `.drox/exports/` (template M.8) |

---

## Scénario 3-tours (identique F1 / 1.4.2)

| Run | Message utilisateur | Attendu |
|-----|---------------------|---------|
| **1** | « Salut ! » | `discuss_reply_only` · USER-FACING REPLY · pas d’outils |
| **2** | « Tu peux analyser le répertoire de code ? » | `discuss_with_reads` · réponse livrée |
| **3** | Brief mutation background (cf. [chat_north-mini-code](../chat_north-mini-code) run 3) | `edit` · `file_edit` ou `file_write` · USER-FACING REPLY |

---

## Critères M.9 (post-compaction run 3)

Cocher pendant / après l’export :

| ID | Critère | OK ? | Preuve (step / export) |
|----|---------|------|------------------------|
| **M9-1** | Checkpoint contient « Run context (engine) » · **pas** de dump Objective 8k chars | ☐ | |
| **M9-2** | Après compaction, snapshot réinjecté avec **User request** run 3 | ☐ | |
| **M9-3** | Après compaction, modèle **ne cite pas** une ancienne session (`ses_…` hors session courante) | ☐ | |
| **M9-4** | `grep` : **0 match** sous `.drox/exports/` dans tool results | ☐ | |
| **M9-5** | Pic `tokensUsed` run 3 **&lt; 50k** (ordre de grandeur, hors régression 316k) | ☐ | |
| **M9-6** | Boot iter 0 run 3 : **pas** de bloc listing sessions/skills · teaser `memory_list` OK | ☐ | |
| **M9-7** | `schema_error_continue_count` ≤ **3** | ☐ | |
| **M9-8** | Run 3 : **USER-FACING REPLY** + mutation disque si brief l’exige | ☐ | |

---

## Métriques à noter (export)

```text
Session: ses_____________________
Build: ___________________________
Tokens fin: _____ in / _____ out / _____ ctx
Run 3 — iterations: ___
Run 3 — pic tokensUsed: ___
Run 3 — tool errors: ___
Run 3 — schema_error_continue_count: ___
Compaction passes (run 3): ___
```

---

## Verdict (à remplir)

| Verdict | Condition |
|---------|-----------|
| **VERT** | M9-1…M9-8 tous OK |
| **ORANGE** | M9-1…M9-6 OK mais mutation / schema_error encore rouges |
| **ROUGE** | M9-4 ou M9-5 échoue (régression contexte exports) |

**Actions si ROUGE** : rouvrir backlog S-CTX-01/02/03 dans [SMOKE-1.4.2](SMOKE-1.4.2-ses_7b34fd1d.md) — ne pas gate 1.4.3.

---

## Après export

1. Renommer ce fichier → `SMOKE-M-memory-ses_<id>.md`
2. Cocher **M.9** et **A.8** dans [PLAN-1.4.2.md](PLAN-1.4.2.md) si vert
3. Mettre à jour [README 1.4.2](README.md) livrables

---

## Liens

- Export brut : `drox-engine/docs/1.4/chat_north-mini-code` (référence pré-M)
- [PLAN-1.4.2 § Phase M](PLAN-1.4.2.md#phase-m--mémoire-unifiée-triage)
