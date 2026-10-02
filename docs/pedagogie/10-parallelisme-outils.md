# Parallélisme des outils — plusieurs lectures en même temps

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : quand le modèle demande **plusieurs tools dans le même tour**, le moteur peut les lancer **en parallèle** ou **l’un après l’autre**.

Ça touche à la perf (moins d’attente) et à la sécurité (ne pas écrire deux fichiers en même temps n’importe comment).

Prérequis : [05-outils.md](05-outils.md), [02-boucle-agent.md](02-boucle-agent.md).

### L’histoire en une phrase

`file_read` + `grep` + `glob` dans le même tour → souvent **un lot parallèle** ; `file_edit` ou `bash` → **série**, un par un.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`tool_orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_orchestration.rs) | `partition_tool_calls`, plafond 8 |
| [`tool.rs`](../../drox-engine/drox/crates/drox-tools/src/tool.rs) | `is_concurrency_safe` |
| [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | Exécution des lots (`buffer_unordered`) |
| Réf. | [tools-and-permissions.md](../engine/tools-and-permissions.md#parallélisme) |

---

## Partie A — Parallèle vs série (idée machine)

**Série** : finir A, puis B, puis C. Simple, prévisible, plus lent si A et B n’ont pas de lien.

**Parallèle** : démarrer A, B et C **en même temps** (plusieurs tâches Tokio). La machine (CPU / disque / réseau) entrelace le travail. On gagne du temps si les outils sont surtout en **attente** (I/O).

Risque du parallèle sur des **écritures** : deux tools qui modifient le même fichier → résultat imprévisible. D’où le drapeau `is_concurrency_safe`.

---

## Partie B — Le drapeau sur chaque outil

```rust
fn is_concurrency_safe(&self) -> bool {
    self.is_read_only()  // défaut
}
```

- Lecture seule → en général **safe** en parallèle.
- Écriture / shell / todo → **pas safe** → lot **Serial**.
- Exception notable : `task` (Explore) est forcé **non safe** même en lecture ([11](11-mcp-et-explore.md)).

---

## Partie C — Partition en lots

`partition_tool_calls` parcourt les noms **dans l’ordre** demandé par le modèle :

```text
file_read, grep, glob, file_edit, file_read
→ Parallel[read,grep,glob]  puis  Serial[file_edit]  puis  Parallel[file_read]
```

Dès qu’un outil non safe apparaît, on coupe le lot parallèle et on crée un lot série (souvent un seul index).

**Pourquoi l’ordre compte** : le modèle peut dépendre sémantiquement de l’ordre ; on ne réordonne pas arbitrairement les mutations.

### Exemple concret — `partition_tool_calls`

[`tool_orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_orchestration.rs) :

```rust
pub fn partition_tool_calls(tool_names: &[&str], registry: &ToolRegistry) -> Vec<ToolCallBatch> {
    let mut batches: Vec<ToolCallBatch> = Vec::new();
    for (idx, name) in tool_names.iter().enumerate() {
        let safe = registry.is_concurrency_safe(name);
        if safe {
            if let Some(ToolCallBatch::Parallel(indices)) = batches.last_mut() {
                indices.push(idx);
                continue;
            }
            batches.push(ToolCallBatch::Parallel(vec![idx]));
        } else {
            batches.push(ToolCallBatch::Serial(vec![idx]));
        }
    }
    batches
}
```

| Morceau | Détail |
|---------|--------|
| `tool_names: &[&str]` | Slice de références vers les noms (emprunt, pas de copie des `String`) |
| `.enumerate()` | Donne `(index, name)` : 0, 1, 2… |
| `registry.is_concurrency_safe(name)` | Demande au tool (via le trait) s’il est safe |
| `batches.last_mut()` | Emprunt **mutable** du dernier lot |
| `if let Some(ToolCallBatch::Parallel(indices))` | Si le dernier lot est déjà parallèle → on **ajoute** l’index dedans |
| `continue` | Passe à l’outil suivant sans créer de nouveau lot |
| `Serial(vec![idx])` | Un outil non safe → son propre lot série |

Puis dans `drive_inner` (~L1454) : `let batches = partition_tool_calls(&tool_names, &self.registry);` suivi de l’exécution Tokio (`buffer_unordered` pour les lots parallèles).

---

## Partie D — Plafond 8

`DEFAULT_MAX_PARALLEL_TOOL_CALLS = 8`  
`AgentConfig.max_parallel_tool_calls` peut ajuster.

Même 20 `file_read` safe ne lanceront pas 20 tâches d’un coup : on limite la charge.

Côté Tokio, l’idée ressemble à `buffer_unordered(max)` : au plus N futures actives.

Explore force souvent **4** localement.

---

## Partie E — Ce que tu observes

| Symptôme | Piste |
|----------|--------|
| Beaucoup de lectures d’un coup dans l’UI | Lot parallèle |
| Edits strictement un par un | Serial |
| Run lent alors que plein de greps | Vérifier qu’ils sont bien `concurrency_safe` |

Les événements `ToolStart`/`ToolFinish` peuvent s’**entrelacer** en parallèle — l’UI doit tolérer ça ([04](04-moteur-et-affichage.md)).

---

## Récapitulatif

1. Safe → parallèle ; non safe → série.
2. Partition **préserve** l’ordre global en coupant en lots.
3. Plafond pour ne pas saturer la machine.
4. Lié directement à `is_read_only` / overrides.

## Suite

[11-mcp-et-explore.md](11-mcp-et-explore.md). Index : [README.md](README.md).

