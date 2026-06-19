# Drox 1.4.2 — Rail observateur & contexte en 4 couches

**Statut** : **implémentation clôturée** (juin 2026) — **dogfood M.9** + gate Acceptation en cours  
**Prérequis** : [1.4.1](../1.4.1/README.md) livrée

---

## En une phrase

**Remplacer** le rail prescriptif (ACL par station, tool folders, gates) par un rail **observateur** et **4 couches de contexte** — culture unique livrée en code ; **dogfood 3-tours** obligatoire avant 1.4.3.

---

## Décision (juin 2026)

- **Une seule culture moteur** après 1.4.2 — pas de flag Soft/Strict, pas de legacy.
- **R-NOLEGACY** : table rase — **zéro dossier dépliant** + ACL rail supprimés.
- **R-MEMORY** : `DROX.md` seul · plan = `internal_plan_write` · archives via `memory_list`/`memory_read`.
- **R-TEST** : `cargo test` vert + session 3-tours ([template dogfood M.9](SMOKE-M-memory-TEMPLATE.md)).

L’ancien backlog UI/signature : **[1.4.3](../1.4.3/README.md)**. Conduct utilisateur : **Phase 6** (post-dogfood).

---

## Les 4 couches

| Couche | Rôle | Chez Drox |
|--------|------|-----------|
| **1 — Cadre** | Règles, objectif, hint rail | Boot `01_core_rail_solo.md` + `rail_snapshot` |
| **2 — Outils** | Palette API stable tout le run | `ToolSpec` wire + protocole compact unique |
| **3 — Mémoire** | Où en est le run | `ctx_run_snapshot` + plan interne |
| **4 — Historique** | Tours récents + résumé | Transcript + checkpoint court → snapshot réinjecté |

---

## Plan & checklist

**[PLAN-1.4.2.md](PLAN-1.4.2.md)** — phases **T**, **P**, **1–4**, **M** cochées · **6** et dogfood en cours.

| Phase | Contenu | État |
|-------|---------|------|
| **T** | Inventaire outils plats | ✅ |
| **P** | Purge `tool_folders` + ACL | ✅ |
| 1–2 | Outils libres + protocoles unifiés | ✅ |
| 3–4 | Rail observateur + closure | ✅ |
| **M** | Mémoire unifiée (CUT MEMORY/todo) | ✅ code · M.9 dogfood |
| 5 | Dogfood 3-tours + rapports smoke | ⏳ |
| 6 | Conduct utilisateur | ⏳ post-dogfood |

---

## Règles de chantier

| Règle | Détail |
|-------|--------|
| **R-FILE** | Fichiers &lt; ~500 lignes si possible |
| **R-DOC** | Documenter code + plan à chaque phase |
| **R-NOLEGACY** | Supprimer l’ancien — pas de double chemin |
| **R-TEST** | Tests verts + dogfood complet avant 1.4.3 |
| **R-MEMORY** | Un canal par question (pas de listing boot doublon) |

---

## Livrables

- [x] Inventaire outils plats + code sans dépliants
- [x] Phase M (memdir, boot, snapshot, checkpoint, `.droxignore` exports)
- [ ] `SMOKE-M-memory-*.md` (dogfood post-M)
- [ ] `SMOKE-1.4.2-*.md` rejeu vert (mutation run 3)
- [ ] FOI mis à jour (rail prescriptif retiré) — D.3
- [ ] Gate 1.4.3 **uniquement** si checklist Acceptation (A.*) verte

---

## Dogfood (prochaine étape)

1. Recompiler `drox.exe` debug (`drox-engine/drox`).
2. Workspace recommandé : `site-kdds` (même scénario que [chat_north-mini-code](../chat_north-mini-code)).
3. Suivre **[SMOKE-M-memory-TEMPLATE.md](SMOKE-M-memory-TEMPLATE.md)** — 3 tours + critères post-compaction.
4. Renommer le rapport en `SMOKE-M-memory-ses_<id>.md` après export.

Smoke **pré-M** (référence) : [SMOKE-1.4.2-ses_7b34fd1d.md](SMOKE-1.4.2-ses_7b34fd1d.md).

---

## Liens

- [Plan détaillé + checklist](PLAN-1.4.2.md#checklist-davancement)
- [Inventaire outils](INVENTAIRE-OUTILS-1.4.2.md)
- [Hub 1.4](../README.md)
- [Smoke F1 référence](../1.4.3/SMOKE-ses_7df5045c.md)
- [FOI-REFONTE](../1.4.0/FOI-REFONTE.md)
