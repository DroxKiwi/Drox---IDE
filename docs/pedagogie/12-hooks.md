Rédigé à l'aide de Cursor Agent

# Hooks — exécuter un script autour d’un outil

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : les **hooks**. Sans recompiler le moteur, un projet peut dire : « *avant chaque `bash`, lance cette commande* » ou « *après un `file_edit`, notifie…* ».

Prérequis : [05-outils.md](05-outils.md), [06-permissions.md](06-permissions.md).

### L’histoire en une phrase

Un fichier `.drox/hooks.json` décrit des commandes shell déclenchées **pre** ou **post** tool ; le moteur les lance, interprète le code de sortie, et peut **bloquer** l’outil.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`drox-hooks`](../../drox-engine/drox/crates/drox-hooks/) | Lecture config + exécution |
| [`tool_hooks.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_hooks.rs) | Pont dans l’agent |
| Emplacements | `<workspace>/.drox/hooks.json` + optionnel `~/.drox/hooks.json` |
| Réf. | [tools-and-permissions.md](../engine/tools-and-permissions.md) (section hooks) |

---

## Partie A — Pourquoi des hooks ?

Cas d’usage :

- audit (« log chaque mutation ») ;
- garde-fou maison (refuser certains patterns) ;
- enrichir le contexte (générer un fichier temporaire avant un tool).

Sans hooks, il faudrait forker Drox ou patcher Rust pour chaque politique d’équipe.

---

## Partie B — Forme du JSON (V1)

```json
{
  "PreToolUse": [
    {
      "matcher": "bash|file_edit",
      "hooks": [
        { "type": "command", "command": "echo pre-check", "timeout": 30 }
      ]
    }
  ],
  "PostToolUse": [],
  "settings": {
    "default_timeout_secs": 60,
    "allowed_commands": []
  }
}
```

| Champ | Sens |
|-------|------|
| `matcher` | Quels noms d’outils déclenchent (motif) |
| `type: "command"` | V1 : seul type validé |
| `command` | Shell à lancer |
| `timeout` | Secondes |
| `allowed_commands` | Allowlist du 1er token si non vide |

---

## Partie C — Codes de sortie (contrat)

| Exit | Lecture Drox (idée) |
|------|---------------------|
| `0` | OK, continuer |
| `2` | **Bloquant** — l’outil ne doit pas (ou plus) s’exécuter comme prévu |
| autre | Avertissement |

**Côté machine** : le moteur `spawn` un process, attend (timeout), lit le status. Rien de magique — un sous-processus classique.

Événement possible : `HookProgress` pour l’UI.

---

## Partie D — Où ça se place dans la pipeline outil

```text
tool call
  → gates / permissions
  → PreToolUse hooks
  → execute (local|remote)
  → PostToolUse hooks
  → résultat → messages
```

Un pre-hook bloquant évite l’effet de bord.  
Un post-hook voit le résultat (logging, métriques).

---

## Partie E — Fusion user + workspace

Config workspace **et** config utilisateur home peuvent se combiner (lis `drox-hooks` pour la règle exacte de merge).  
En dogfood : commence par un hook `echo` inoffensif pour valider le déclenchement.

---

## Récapitulatif

1. Hooks = scripts configurables autour des tools.
2. JSON déclaratif, exécution shell, exit codes sémantiques.
3. Permet d’étendre le moteur **sans** le recompiler.
4. Visible éventuellement dans l’UI via progress events.

## Suite (satellites)

[13-tui-vs-serve.md](13-tui-vs-serve.md) · [14-mode-professor.md](14-mode-professor.md)  
Index : [README.md](README.md).
