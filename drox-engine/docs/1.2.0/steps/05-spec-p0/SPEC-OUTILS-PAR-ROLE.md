# SPEC — outils par rôle

**Version** : 1.2.0  
**Statut** : **brouillon P0** — à compléter avant P3-2  
**Parent** : [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md) · P0-3

---

## 1. Matrice cible (draft)

Légende : ✅ autorisé · ⚠️ limité · ❌ absent du schéma LLM

| Outil | Architecte | Chef | Exécutant |
|-------|------------|------|-----------|
| `file_read`, `grep`, `glob` | ✅ | ✅ | ✅ |
| `file_edit`, `file_write` | ⚠️ urgence | ⚠️ périmètre | ✅ |
| `bash` | ❌ | ⚠️ non-mutateur | ✅ |
| `task` / sous-agent | ✅ lancer séquence | ✅ déléguer | ❌ |
| `plan`, `todo_write` | ✅ | ✅ | ❌ |
| `delegate_executor` | ✅ | ⚠️ | ❌ |
| `ask_user_question` | ✅ | ✅ | ❌ |
| `session_*`, `memory_*` | ✅ | ⚠️ | ❌ |
| `web_*`, `mcp` | ⚠️ | ⚠️ | ❌ par défaut |

---

## 2. Principes

1. La matrice vit dans **C** (`tool_allowlist` par `RunUnit`), pas dans les handlers **A**.
2. Permissions workspace (**A**) s’appliquent toujours par-dessus.
3. L’Architecte ne reçoit **pas** `file_edit` en P3 sauf décision produit explicite.

---

## 3. À compléter (checklist P0-3)

- [ ] Liste finale alignée inventaire `drox-tools`
- [ ] Cas `notebook_edit`, `course_plan_write`, `professor`
- [ ] Tests : schéma LLM ne contient pas d’outil interdit
