# REPORT — Standard CLI (hors contrat IDE 1.4.0)

**Statut** : chemin **terminal one-shot** uniquement (`drox -p "…"`). Pas le chat IDE (Architect / ArchitectDiscussion + run rail).

---

## Implémentation

Le prompt phase-protocol complet vit dans :

`drox-engine/drox/crates/drox-cli/src/prompts/core_standard.rs` (`CORE_SYSTEM_PROMPT`)

Assemblé via `assemble_standard` (`system_prompt/assemble.rs`) quand `RoleId::Standard`.

---

## Retiré en 1.4.0

| Élément | Statut |
|---------|--------|
| `PROFESSOR_MODE_SUPPLEMENT` | **DEL** — plus injecté ; mode `professor` **rejeté** (`permission_guard.rs`) |
| `task` / explore / sub-agents dans le prompt | **CUT** |
| Orchestration IDE sur `Standard` | **DEL** — `RunSpec::Standard` wire-only, zéro outil visible |

---

## Si réintroduction

Ne pas réactiver `Standard` dans le chat IDE. Envisager un binaire ou run type dédié avec sa propre boucle — pas un 3ᵉ guide dans `drive.rs`.
