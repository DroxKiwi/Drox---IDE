Rédigé à l'aide de Cursor Agent

# Permissions — allow, ask, deny avant d’agir

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le système de **permissions**. Avant qu’un outil ne touche au disque ou au shell, le moteur se demande : *est-ce autorisé, faut-il demander à l’humain, ou refuser ?*

On relie ça aux [outils](05-outils.md), à la [boucle](02-boucle-agent.md) et à [`user/ask`](04-moteur-et-affichage.md).

### L’histoire en une phrase

Même si le modèle *veut* lancer `rm -rf`, le moteur peut **bloquer**, **demander confirmation**, ou **laisser passer** — selon le mode du run et les règles.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs) | Modes (`plan`, `acceptEdits`, …) |
| [`engine.rs`](../../drox-engine/drox/crates/drox-permissions/src/engine.rs) | Décision allow/ask/deny |
| [`permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/permissions.rs) | Pont dans l’agent |
| [`drox-bash`](../../drox-engine/drox/crates/drox-bash/) | Classer une commande shell (inspectif vs mutateur) |
| Réf. | [tools-and-permissions.md](../engine/tools-and-permissions.md) |

---

## Partie A — Trois réponses possibles

| Décision | Effet |
|----------|--------|
| **Allow** | L’outil s’exécute |
| **Ask** | Pause : `user/ask` (ou UI équivalente) → l’humain choisit |
| **Deny** | Pas d’effet de bord ; le modèle reçoit un refus / erreur contrôlée |

Ce n’est **pas** la même chose qu’une panique process ([03](03-gestion-erreurs.md)) : un deny est souvent une **réponse outil** que le LLM peut lire.

---

## Partie B — Les modes (réglage du run)

Chaînes typiques dans `agent.run` (`mode`) :

| Mode | Idée pour un humain |
|------|---------------------|
| `default` | Pipeline complet ; si aucune règle ne tranche → souvent **ask** |
| `plan` | Lecture OK ; **écritures refusées** (analyser sans modifier) |
| `acceptEdits` | Auto-allow des edits fichier dans le workspace ; bash risqué peut encore demander |
| `bypassPermissions` | « Yolo » — presque tout auto-allow sauf denies explicites (risqué) |
| `professor` | Écritures bridées par la pédagogie cours ([14](14-mode-professor.md)) |

**Côté machine** : un `enum` Rust (`PermissionMode`) désérialisé depuis le JSON du client. Une seule valeur par run (sauf changement explicite).

### Exemple concret — l’enum dans `mode.rs`

[`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs) :

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// Mode par défaut : pipeline complet allow → ask → deny.
    #[default]
    Default,
    /// Mode plan : interdit toute écriture / commande qui change le système.
    Plan,
    /// Auto-allow les écritures fichier dans le workspace.
    AcceptEdits,
    /// Bypass complet (sauf rules deny explicites).
    BypassPermissions,
    /// Mode professeur : écritures via gates `workArea` + étape exercise/checkpoint.
    Professor,
}
```

| Attribut / syntaxe | Sens |
|--------------------|------|
| `#[derive(…)]` | Le compilateur génère Debug, Clone, sérialisation JSON, etc. |
| `Serialize, Deserialize` | **serde** : lecture/écriture JSON automatique |
| `rename_all = "camelCase"` | En JSON on écrit `acceptEdits`, pas `AcceptEdits` |
| `#[default]` | `PermissionMode::default()` → `Default` |
| `Copy` | Enum sans données heap : on peut la copier bit à bit (pas besoin de `.clone()` obligatoire) |

Mapping UI fréquent : `analyze` → `plan`, `trustEdit` → `acceptEdits`, etc.

---

## Partie C — Règles allow / ask / deny

En plus du mode, le client peut passer des listes de règles (chemins, noms d’outils…).  
Le moteur de permissions les évalue dans un ordre défini (deny souvent prioritaire — lis les commentaires de `drox-permissions`).

Analogie : le **mode** est le climat général ; les **règles** sont des panneaux de signalisation locaux.

---

## Partie D — Cas particulier : `bash`

Une même tool `bash` peut être :

- **inspectif** (`git status`, `ls`, `cargo check`) → souvent toléré même avant `todo_write` ;
- **mutateur** (`rm`, `git commit`, redirection `>`) → plus strict.

[`drox-bash`](../../drox-engine/drox/crates/drox-bash/) parse la commande (dont **tree-sitter** + grammar bash) pour **classer** sans se fier au seul texte libre du modèle.

---

## Partie E — Où ça s’insère dans la boucle

Pour chaque tool call, avant `execute` :

1. Pre-gates moteur (ex. todo obligatoire avant mutation — [07](07-phases-et-gates.md)).
2. Check permission (mode + règles + nature bash).
3. Si **ask** → dialogue humain → reprendre.
4. Si **allow** → hooks → execute.
5. Si **deny** → résultat d’erreur / message au modèle → tour suivant éventuel.

---

## Récapitulatif

1. Permissions = **filtre** entre intention du modèle et effet réel.
2. Modes = politique globale du run.
3. Ask relie le moteur à l’humain via l’UI.
4. Bash est analysé pour ne pas traiter `ls` comme `rm`.

## Suite

[07-phases-et-gates.md](07-phases-et-gates.md). Index : [README.md](README.md).
