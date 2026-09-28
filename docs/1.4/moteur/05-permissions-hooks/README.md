# 05 — Permissions & hooks

**Question** : qui décide si un tool peut s’exécuter, et quels scripts tournent autour ?

---

## Rôle

Garde-fous **sécurité & UX** avant exécution : allow / ask / deny par tool et chemin ; confirmation utilisateur ; hooks projet `.drox/hooks.json`.

---

## Crates & fichiers

| Emplacement | Rôle |
|-------------|------|
| `drox-permissions/src/engine.rs` | `PermissionEngine` |
| `drox-permissions/src/rule.rs` | Règles settings |
| `drox-engine/src/permissions.rs` | `PermissionPolicy` — pont vers la boucle |
| `drox-bash/` | Parse/classifie commandes bash |
| `drox-hooks/` | Pre/post tool hooks |
| `drox-engine/src/tool_hooks.rs` | Intégration hooks dans agent |

---

## Décision

```text
PermissionPolicy::evaluate(tool_name, arguments)
  → Allow   → exécution directe
  → Ask     → UserAsker (stdin ou RPC IDE)
  → Deny    → tool_result erreur
```

Modes courants : `default`, `plan`, `acceptEdits`, `bypassPermissions`, `professor`.

---

## Bash

`bash` passe par `drox-bash` pour détecter segments destructifs, chemins hors workspace, etc. Couplé aux règles permissions.

---

## Hooks

Fichier `.drox/hooks.json` : commandes shell **avant/après** certains tools (audit, format, deny custom).

---

## Liens

- [GUIDE-MOTEUR-DROX §permissions](../../../0.0/guides/GUIDE-MOTEUR-DROX.md)
- Exécution : [04-tools](../04-tools/README.md) → `tool_execution.rs`
