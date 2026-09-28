# Trace moteur Rust — 1.5.15

**Commit** : `66f875759ef` — *Ouvrir la release 1.5.15.*  
**Périmètre Rust de ce patch** : **uniquement** le flag session **hors workspace** (`allow_outside_workspace`).  
**Retry (RT)** et **Carnet (NB)** : **aucune** modification Rust (N0 carnet = injection `system` IDE ; Retry = recovery IDE / Agents uniquement).

> Mise à jour post-implémentation RT+NB : confirmé — **zéro** diff Rust additionnel pour ces deux piliers.

Ce document sert de **trace d’audit** : chaque changement, son intention, et les effets de bord possibles.  
Les numéros de ligne ci-dessous sont ceux du **diff du commit** (état post-patch sur `1.5.15` à `66f875759ef`). En cas de drift, se fier au hunk `git show 66f875759ef -- <fichier>`.

---

## 0. Synthèse

| Crate | Fichiers touchés | Nature |
|-------|------------------|--------|
| `drox-cli` | `protocol.rs`, `handlers.rs`, `remote_tool.rs`, `prompts.rs` | RPC + wiring run + prompt |
| `drox-tools` | `context.rs`, `path_util.rs`, 8 tools `simple/*` | Confinement FS optionnel |
| `drox-engine` | `subagent.rs` | Propagation flag sous-agent |

| Non touché (volontaire) | Pourquoi c’est important |
|-------------------------|--------------------------|
| `agent.rs` (boucle, phases, gates) | Pas de changement de contrôle de run |
| `drox-permissions` | Allow/ask/deny inchangé |
| `memdir` / `memory_sessions` | Mémoire projet / archives inchangées |
| `ToolRegistry` / nouveaux tools | Surface tools identique |
| `bash.rs` | Pas de sandbox path ; cwd reste workspace (un `cd` dans la commande pouvait déjà sortir) |

**Comportement par défaut** : `allow_outside_workspace = false` → **identique à 1.5.14** (PathEscape hors workspace).

---

## 1. `drox-cli` — protocole JSON-RPC

### 1.1 `crates/drox-cli/src/jsonrpc/protocol.rs`

#### `AgentRunParams` — ajout champ

```diff
+    /// Si `true`, les tools fs acceptent des chemins hors workspace (session toggle IDE).
+    #[serde(default)]
+    pub allow_outside_workspace: Option<bool>,
```

| | |
|--|--|
| **Intention** | Permettre à l’IDE d’activer le mode hors-workspace **par run** (toggle session), sans nouveau mode de permission. |
| **Défaut** | `None` / absent → traité comme `false` dans `handlers`. Clients anciens = comportement inchangé. |
| **Effet de bord** | Aucun tant que l’IDE n’envoie pas `true`. Serde ignore les champs inconnus côté vieux binaires ; un vieux IDE + nouveau binaire = flag absent = safe. |

#### `ToolExecParams` — ajout champ

```diff
+    /// Si `true`, le client peut résoudre des chemins hors workspace.
+    #[serde(default)]
+    pub allow_outside_workspace: bool,
```

| | |
|--|--|
| **Intention** | Aligner les tools **délégués** (`tool/exec` → IDE) avec le même flag que les tools in-process Rust. |
| **Défaut** | `false` (bool, pas Option). |
| **Effet de bord** | Si le serveur envoie `true` mais un vieux client ignore le champ → client reste confiné (plus strict, OK). Si client nouveau + serveur omet le champ → `false` (confiné). |

---

## 2. `drox-cli` — wiring `agent.run`

### 2.1 `crates/drox-cli/src/jsonrpc/handlers.rs` — dans `build_agent_setup`

#### Bloc A — lecture flag + injection prompt

```diff
+    let allow_outside = params.allow_outside_workspace.unwrap_or(false);
+    if allow_outside {
+        match &mut system_merged {
+            Some(s) => {
+                s.push_str("\n\n");
+                s.push_str(crate::prompts::ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT);
+            }
+            None => {
+                system_merged =
+                    Some(crate::prompts::ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT.to_string());
+            }
+        }
+    }
```

| | |
|--|--|
| **Intention** | (1) Matérialiser le bool pour le `ToolContext`. (2) Dire au modèle qu’il **peut** sortir du repo (sinon il continue à s’autocensurer même si PathEscape est levé). |
| **Effet de bord** | Tokens system supplémentaires **uniquement** si flag `true`. N’altère pas memdir / professor / native thinking (même pattern `push_str`). Ordre : après native thinking, **avant** `build_permission_policy`. |

#### Bloc B — `ToolContext`

```diff
     let mut ctx = ToolContext::new(workspace.clone(), apply)
         .with_plan_mode(mode == PermissionMode::Plan)
+        .with_allow_outside_workspace(allow_outside)
         .with_user_asker(asker)
```

| | |
|--|--|
| **Intention** | Propager le flag à **tous** les tools du run (in-process + remote). |
| **Effet de bord** | Aucun si `false`. Si `true`, seuls les resolve path des tools FS changent (voir §4). |

---

### 2.2 `crates/drox-cli/src/jsonrpc/remote_tool.rs`

```diff
             plan_mode: ctx.plan_mode,
             apply_fs_writes: ctx.apply_fs_writes,
+            allow_outside_workspace: ctx.allow_outside_workspace,
```

| | |
|--|--|
| **Intention** | Les tools exécutés côté Electron (`file_write`, `file_edit`, `bash`, …) reçoivent le même droit de résolution hors workspace. |
| **Effet de bord** | Dépend du miroir TS `droxPathUtils` (hors Rust). Sans miroir IDE, le client resterait confiné même si Rust autorise — le patch IDE accompagne ce champ. |

---

### 2.3 `crates/drox-cli/src/prompts.rs`

```diff
+/// Injecté quand la session IDE active « accès hors workspace ».
+pub const ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT: &str = r#"# Outside-workspace access (session toggle)
+
+The user enabled **outside-workspace** access for this discussion. You **may** use absolute paths
+outside the project root with `file_read`, `file_edit`, `file_write`, `glob`, `grep`, `copy_path`,
+`delete_path`, and `bash` (...). Prefer absolute paths when leaving the workspace. Still refuse
+destructive system paths; ask via `ask_user_question` before risky deletes."#;
```

| | |
|--|--|
| **Intention** | Alignement comportemental modèle ↔ capacité tools. |
| **Effet de bord** | Texte only. N’assouplit **pas** `dangerous_removal_*` ni plan mode. |

---

## 3. `drox-tools` — `ToolContext`

### 3.1 `crates/drox-tools/src/context.rs`

| Changement | Intention | Effet de bord |
|------------|-----------|---------------|
| Champ `pub allow_outside_workspace: bool` | État par run pour les tools | Struct +1 bool ; **breaking** pour littéraux `ToolContext { ... }` (corrigé dans `subagent.rs`) |
| Défaut `false` dans `ToolContext::new` | Compat tests / CLI | Identique pré-patch |
| `with_allow_outside_workspace(self, allow)` | Builder fluent | Aucun |
| Champ dans `Debug` | Observabilité logs | Aucun |
| Commentaire `plan_mode` reformulé (doc only) | Clarification | Aucun runtime |

---

## 4. `drox-tools` — `path_util.rs` (**cœur du changement**)

Fichier critique : toute régression confinement = faille ou faux PathEscape.

### 4.1 Extraction `join_user_path`

```rust
fn join_user_path(workspace_root, user_path) -> Result<Utf8PathBuf>
// absolute → as-is ; relative → workspace_root.join
```

| | |
|--|--|
| **Intention** | Factoriser la jointure partagée entre read et write. |
| **Effet de bord** | Comportement jointure **inchangé** vs ancien code. |

### 4.2 Signature `resolve_under_workspace(..., allow_outside: bool)`

**Quand `allow_outside == false`** (défaut) :

1. `join_user_path`
2. canonicalize root + target
3. `strip_prefix(root)` → sinon `ToolError::PathEscape`

→ **Même sémantique qu’avant 1.5.15.**

**Quand `allow_outside == true`** :

1. `join_user_path`
2. canonicalize target
3. **Pas** de `strip_prefix` → retourne le chemin canonique même hors workspace

| | |
|--|--|
| **Intention** | Lever uniquement le garde-fou PathEscape ; relatifs restent ancrés au workspace. |
| **Effet de bord** | Avec flag `true` : lecture/écriture **possible** hors repo si le chemin existe (read) / parent existe (write). Les gardes `dangerous_removal_*`, `.droxignore`, `plan_mode` restent actifs. |
| **Limite** | Fichier hors workspace **inexistant** → toujours erreur IO à la canonicalize (pas de création magique du chemin). |

### 4.3 Signature `resolve_path_for_write(..., allow_outside: bool)`

**`false`** : parent doit être sous workspace (`strip_prefix`) — inchangé.  
**`true`** : parent canonicalisé **sans** `strip_prefix`.

| | |
|--|--|
| **Intention** | Permettre `file_write` / copy dest hors workspace si autorisé. |
| **Effet de bord** | Écriture hors repo possible si flag + parent existant. Pas d’assouplissement des chemins dangereux delete. |

### 4.4 Tests

| Test | Intention |
|------|-----------|
| `relative_stays_under_root` | Passe `false` — non-régression |
| `absolute_outside_workspace_rejected` | Passe `false` — PathEscape toujours |
| `absolute_outside_workspace_allowed_when_flag` | **Nouveau** — prouve le bypass |

---

## 5. Tools `simple/*` — passage du 3ᵉ argument

Pattern unique : `ctx.allow_outside_workspace` sur le chemin **execute** ; previews sync forcent `false`.

| Fichier | Ligne(s) d’appel (approx. post-patch) | Intention | Effet de bord |
|---------|--------------------------------------|-----------|---------------|
| `file_read.rs` | `execute` → `resolve_under_workspace(..., ctx.allow_outside_workspace)` | Lire hors WS si flag | Contenu hors repo dans le contexte LLM |
| `file_edit.rs` | `execute` → flag ; `preview_file_edit_diff` → **`false`** | Preview propose reste confinée | Preview IDE ne sort pas du WS même si run allow |
| `file_write.rs` | `execute` → flag ; `preview_file_write_diff` → **`false`** | Idem | Idem |
| `notebook_edit.rs` | `execute` → flag ; preview → **`false`** | Idem | Idem |
| `glob.rs` | `path` optionnel → flag | Explorer hors WS | Fanout / perf si path large hors repo |
| `grep.rs` | idem | Chercher hors WS | Idem |
| `copy_path.rs` | src + dest → flag | Copier depuis/vers hors WS | |
| `delete_path.rs` | path → flag | Supprimer hors WS | **Gardes** `dangerous_removal_*` + root workspace + protected entries **conservés** |

**Non modifié** : `bash.rs` — pas de resolve path utilitaire ; le confinement bash n’était déjà pas PathEscape.

---

## 6. `drox-engine` — sous-agents

### 6.1 `crates/drox-engine/src/subagent.rs`

```diff
             plan_mode: true,
+            allow_outside_workspace: parent_ctx.allow_outside_workspace,
```

| | |
|--|--|
| **Intention** | Un `task` / explore hérite du même droit FS que le parent (sinon sous-agent PathEscape alors que parent OK). Compile aussi le littéral `ToolContext { ... }` après ajout du champ. |
| **Effet de bord** | Explore reste `apply_fs_writes: false` + `plan_mode: true` — **lecture** hors WS possible si parent allow, **pas** d’écriture. |

**Toujours pas de changement** dans la boucle `agent.rs`.

---

## 7. Matrice d’effets de bord (hors workspace)

| Condition | PathEscape | Lecture hors WS | Écriture hors WS | Delete dangereux système |
|-----------|------------|-----------------|------------------|--------------------------|
| Flag absent / `false` | Oui (comme 1.5.14) | Non | Non | Bloqué |
| Flag `true` | Non (si chemin valide) | Oui | Oui (si parent existe) | Toujours bloqué (`dangerous_removal_*`) |
| Plan mode + flag `true` | Path OK | Oui | **Non** (`PlanModeViolation`) | N/A |
| `.droxignore` match | — | Refus `DroxIgnore` | — | — |

---

## 8. Piliers 1.5.15 **sans** diff Rust

Documenté ici pour éviter toute ambiguïté d’audit.

### 8.1 Retry (RT)

- **Rust** : aucun fichier prévu.
- Relance via recovery IDE existante (`skipUserTurn`, `session.truncateAfterLastUser`, `agent.run`).

### 8.2 Carnet de session (NB) — stratégie N0

- **Rust** : **aucun** fichier prévu.
- Fichier IDE `.drox/sessions/<id>.notes.md` + injection dans `AgentRunParams.system` (déjà mergé dans `handlers` via `params.system` / memdir).
- Si un futur patch passe en **N1** (load notepad côté `drox-session`), **ouvrir une nouvelle fiche trace** ; ne pas amender silencieusement ce document.

---

## 9. Checklist review moteur avant ship

- [ ] `cargo test -p drox-tools path_util`
- [ ] Smoke flag **off** : PathEscape hors WS inchangé
- [ ] Smoke flag **on** : `file_read` chemin absolu hors repo OK
- [ ] Smoke flag **on** + plan mode : write toujours refusé
- [ ] `git diff drox-engine/drox/crates/drox-engine/src/agent.rs` → **vide**
- [ ] Aucun nouveau tool dans le registry

---

## 10. Références

- Commit : `66f875759ef`
- Plan produit : [PLAN-1.5.15.md](PLAN-1.5.15.md)
- Commande audit : `git show 66f875759ef -- drox-engine/drox/`
