# Carte des gates (MVP 1.3.2)

**Arborescence (source de vérité unique)** :  
[`drox-engine/drox/crates/drox-engine/assets/gates/gate-graph.json`](../../../drox/crates/drox-engine/assets/gates/gate-graph.json)  
→ causalité, boucles, chemins terminaux, `START_RUN`, arêtes `edges[]`.

**Exécution (prompts + parse par gate)** : `assets/gates/*.gate.toml` — `[transition]` doit rester aligné sur le JSON.

**Table Rust (tests)** : `gate_engine/gate_routes.rs` — régénérer avec `node scripts/sync-gate-routes-from-graph.mjs`.

## Graphe discuss

```text
entry
  ├─ architect_discuss → discuss.needs_repo_facts
  │                        ├─ true  ─┐
  │                        └─ false ─┼→ discuss.open_user_reply (FINALE)
  │                                   ├─ reply_only  → START_RUN.discuss_reply_only
  │                                   ├─ with_reads  → START_RUN.discuss_with_reads
  │                                   └─ recheck_repo → discuss.needs_repo_facts
  └─ architect_edit → edit.has_concrete_goal
                        ├─ true  → START_RUN.edit
                        └─ false → START_RUN.edit_e_none
```

## Règle UI

Tant que `discuss.open_user_reply` n'a pas choisi un `START_RUN.*` discuss, **aucune Answer** utilisateur.  
Après `START_RUN` → rôle `architect_discussion` → `user_facing_reply` canonique.

## Cas « analyser le répertoire »

1. `entry` → `architect_discuss`
2. `discuss.needs_repo_facts` → **`true`** (lecture repo nécessaire)
3. **`discuss.open_user_reply`** → branche **`with_reads`** (obligatoire si le binaire est à jour)
4. `architect_discussion` avec outils lecture seule + supplément prompt `with_reads`
5. `[discussion: reply]` → réponse utilisateur → `[discussion: done]`

Si l'export UI montre `Start run: discuss_with_reads` **sans** probe `discuss.open_user_reply`, le CLI embarqué est ancien → `cargo build -p drox-cli`.

## Plan / sub-agents (évolution)

| Aujourd'hui | Cible |
|-------------|--------|
| `START_RUN.edit` → architect + `delegate_executor` | Gates edit intermédiaires (objectif concret, scope, …) puis run |
| `discuss_with_reads` = 1 tour discussion + tools | Option : gate **`discuss.prep_repo_read`** (tools, pas de réponse user) → puis **`discuss.open_user_reply`** |
| Plan / todos dans edit | Restent sur le chemin **edit** ; le chemin **discuss** reste sans `todo_write` |

Principe : **chaque gate = une décision JSON courte** ; le travail (lecture, exécution) = run dédié **sans** bulle Answer jusqu'à la gate finale.

## Maintenance

```bash
node scripts/validate-gate-graph.mjs
node scripts/sync-gate-routes-from-graph.mjs
cargo test -p drox-engine gate_graph
```

Modifier l'arborescence **d'abord** dans `gate-graph.json`, puis aligner les TOML `[transition]` et lancer le sync.

## Évolution technique

- Gates in-run (`edit.*` checkpoints) à ajouter au graphe quand implémentées.
- Gate edit finale symétrique à `discuss.open_user_reply` (optionnel).
