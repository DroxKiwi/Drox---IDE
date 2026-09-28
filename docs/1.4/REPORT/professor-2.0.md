# REPORT — Professor (hors moteur 1.4.0)

**Statut** : produit **retiré** du moteur IDE en 1.4.0 ([FOI-REFONTE](../1.4.0/FOI-REFONTE.md) § III.2, Phase 2c).

---

## Pourquoi retiré

Le mode Professor (`permissionMode: professor`, `course_plan_write`, gates pédagogiques) est un **2ᵉ runtime** dans `drive.rs` — même problème que multi-modèle et guide 1.3 : plusieurs vérités en parallèle, code qui compile mais n’est pas le chemin IDE cible.

---

## Si réintroduction future

- **Ne pas** restaurer les branches 1.3 dans `drive.rs`.
- Envisager : crate ou binaire dédié, ou run type séparé avec **son** prompt et **sa** boucle — pas un flag dans le moteur edit/discuss.
- Spec à réécrire from scratch (Professor 2.0).

---

## Code supprimé (référence)

- `drox-engine/.../professor.rs`
- `drox-tools/.../course_plan_write.rs`
- Branches professor dans `drive.rs`, `gates.rs`
- `drox-cli` : `PROFESSOR_MODE_SUPPLEMENT` ; `permission_mode: professor` → erreur (`permission_guard.rs`)

Standard CLI (phase protocol) : [standard-cli-phase-protocol.md](standard-cli-phase-protocol.md) — hors chat IDE.

Historique doc : guides 1.2 / `GUIDE-MOTEUR-DROX.md`.
