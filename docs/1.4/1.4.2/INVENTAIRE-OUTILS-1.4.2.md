# Inventaire outils architecte — 1.4.2 (culture unique)

**Statut** : **livré** (juin 2026) — aligné Phase **M** · revue dogfood pour réduire palette si besoin  
**Principe** : **outils plats** uniquement — le modèle voit des `tool_calls` wire directs, jamais de dossier `describe` → sous-outils.

---

## Problème actuel

| Symptôme | Cause |
|----------|--------|
| « read_workspace not expanded » | Dossier virtuel masque `file_read` / `grep` / `workspace_map_read` |
| `file_edit` vs `edit_file` | Deux noms pour la même capacité ; `edit_file` = folder, pas wire |
| `verify_project` describe | Même pattern sur VERIFY |
| Liste API ≠ liste wire | `apply_tool_folder_specs` **retire** des specs et injecte un meta-outil |
| Protocoles par station | Le modèle ne voit pas le même manuel d’un tour à l’autre |

**Règle 1.4.2** : supprimer **tout** le mécanisme `tool_folders` (`read_workspace`, `edit_file`, `verify_project`) du allowlist, des specs LLM, des protocoles et du client — pas seulement le désactiver.

---

## Palette cible — run EDIT (architect)

Une seule liste **stable** tout le run (couche 2). Protocoles compacts uniquement pour les outils à schéma non trivial.

### Noyau lecture (6)

| Outil | Rôle | Protocole détaillé |
|-------|------|-------------------|
| `workspace_map_read` | Arbre repo une fois | Oui (court) |
| `file_read` | Lire un fichier | Oui (path) |
| `grep` | Recherche texte | Oui |
| `glob` | Trouver fichiers par pattern | Inline schema |
| `lsp` | Diagnostics / symboles | Oui |
| `bash` | Commande shell (verify, build) | Oui |

### Noyau mutation (4)

| Outil | Rôle | Protocole détaillé |
|-------|------|-------------------|
| `file_edit` | **Seul** outil d’édition ciblée (`path` + `edits[]`) | **Oui** (exemple JSON obligatoire) |
| `file_write` | Créer / remplacer fichier entier | Oui |
| `notebook_edit` | Cellules notebook | Oui (si gardé produit) |
| `delete_path` | Supprimer fichier/dossier | Inline schema |

### Orchestration run (2)

| Outil | Rôle | Notes |
|-------|------|--------|
| `ask_user_question` | Demande bloquante user | Protocole compact |
| `internal_plan_write` | Plan moteur L2 (seul plan) | Engine-only · pas de gate obligatoire |

### Secondaire (hors protocole injecté par défaut — schema API seulement)

Disponibles dans l’API si allowlist complète, **sans** bloc `T-*` long (économie ctx) :

`copy_path`, `git_worktree_enter`, `git_worktree_exit`, `web_fetch`, `web_search`, `memory_list`, `memory_read`, `skill_list`, `skill_read`, `scope_defer`, `session_*`, `workspace_map_note`, `architect_help`

→ Revue dogfood : retirer de l’allowlist ce qui n’est jamais utilisé (objectif &lt; **18** outils visibles API edit).

---

## Palette cible — discuss (`ArchitectDiscussion`)

Inchangée dans l’esprit, **sans** folders :

| Outil | |
|-------|---|
| `workspace_map_read` | |
| `file_read` | |
| `grep` | |
| `glob` | |
| `lsp` | |
| `memory_list` | |
| `memory_read` | |

`discuss_reply_only` : aucun outil (existant).

---

## Suppressions explicites (R-NOLEGACY)

| Symbole | Action |
|---------|--------|
| `read_workspace` | **Retirer** allowlist, specs, alias, handlers virtuels |
| `edit_file` | **Retirer** (confusion avec `file_edit`) |
| `verify_project` | **Retirer** |
| `apply_tool_folder_specs` | **Supprimer** — `llm_turn` passe specs allowlist directement |
| `collapse_wire_tools` / `folder_tool_spec` | **Supprimer** avec module |
| `resolve_tool_name_alias` → folder | **Supprimer** ou limiter aux alias utiles (`read_file` → `file_read` si client) |
| `is_tool_folder_expanded` / state folder | **Supprimer** de `ArchitectRunState` |
| Blocs prompt « Tool folder: `edit_file` » | **Supprimer** |

---

## Qualité schéma (facile pour le modèle)

Pour chaque outil **noyau**, le `ToolSpec.parameters` JSON Schema doit :

1. Avoir **`required`** explicites (`path`, `edits`, etc.).
2. Avoir `description` **une ligne** dans l’API + détail dans `T-*` seulement si nécessaire.
3. Inclure **un exemple** dans le protocole `file_edit.md` (déjà le cas — garder).

**`file_edit`** — forme canonique unique (wire + doc + erreurs client) :

```json
{
  "path": "relative/from/workspace/root.tsx",
  "edits": [{ "old_string": "…", "new_string": "…" }]
}
```

Pas d’`action: describe`, pas de `file_path` alternatif sauf alias moteur **transparent** côté handler (pas exposé au modèle).

---

## Fichiers à modifier (inventaire → code)

| Zone | Fichier | Changement |
|------|---------|------------|
| Allowlist | `run_spec/mod.rs` | Retirer `edit_file`, `read_workspace`, `verify_project` |
| Specs tour | `agent/loop/drive/llm_turn.rs` | Specs = allowlist filtrée permissions ; **pas** `apply_tool_folder_specs` |
| Module | `orchestration/tool_folders/` | **Supprimer** |
| State | `agent/state/` | Retirer champs folder expanded |
| Protocoles | `blocks/tools/mod.rs` | `ARCHITECT_EDIT_CORE_BLOCKS` fixe ; `tool_supplements_architect_compact` |
| IDE | `drox-tools` / registry | Pas d’enregistrement handlers virtuels folders |
| Tests | `tool_folders/tests.rs`, rail pre_gate | Supprimer ou migrer |

---

## Critères de validation inventaire

- [ ] API LLM run EDIT : **aucun** nom `read_workspace` \| `edit_file` \| `verify_project`
- [ ] `file_edit` présent avec schema `path` + `edits` dès le tour 0
- [ ] Protocole injecté : même contenu tour 1 et tour N (`skip_if_unchanged`)
- [ ] Smoke run 3 : 0× erreur folder / describe
- [ ] `rg` sur symboles folder = vide dans `drox/crates/`

---

## Liens

- [PLAN-1.4.2](PLAN-1.4.2.md) — Phase T + Phase P
- [file_edit protocole actuel](../../../drox/crates/drox-engine/src/orchestration/prompts/system/blocks/tools/file_edit.md)
- [allowlist actuelle](../../../drox/crates/drox-engine/src/run_spec/mod.rs)
