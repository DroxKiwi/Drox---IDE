Rédigé à l'aide de Cursor Agent

# Mode professor — prévu, pas encore disponible

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **ce que le mode `professor` est censé faire** dans Drox, et **où en est le produit aujourd’hui**.

> **État produit** : le mode Professor **n’est pas disponible** dans Drox IDE.  
> Depuis **1.4.0**, l’UI le **refuse / downgrade** (notification + repli sur un mode confirm-each-edit). Le code Rust (`professor.rs`, prompts, `course_plan_write`) peut encore exister dans le dépôt, mais ce n’est **pas** un chemin fiable ni exposé aux utilisateurs.  
> Une reprise propre (« Professor 2.0 ») est **prévue** comme chantier futur — pas livrée. Voir aussi [`docs/1.4/REPORT/professor-2.0.md`](../1.4/REPORT/professor-2.0.md).

Ce guide reste utile pour comprendre **l’intention** et lire le code s’il revient ; ce n’est **pas** un tutoriel d’usage actuel.

Prérequis conceptuels : [06-permissions.md](06-permissions.md), [07-phases-et-gates.md](07-phases-et-gates.md).

### L’histoire en une phrase (cible produit)

En professor, le modèle enseigne et fait travailler ; les **écritures** hors zone / hors étape d’exercice seraient refusées par le moteur — **quand** le mode sera de nouveau branché et validé.

### Fichiers (code encore présent / historique)

| Fichier | Rôle |
|---------|------|
| [`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) | Gates runtime (si chemin activé) |
| [`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) | Variantes teach / exercise / review |
| [`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs) | Variant `Professor` dans l’enum |
| IDE | [`droxPermissionAsk.ts`](../../src/vs/workbench/contrib/drox/common/droxPermissionAsk.ts) — **downgrade** si `professor` est demandé |

---

## Partie A — Intention (permission + pédagogie)

`PermissionMode::Professor` : les écritures ne seraient autorisées que via des **gates** (zone `workArea`, étape `exercise` / `checkpoint`, selon implémentation).

Ce n’est pas seulement un prompt « sois gentil » : le Rust **bloquerait**. Aujourd’hui, l’IDE **n’envoie pas** ce mode sur le wire.

### Exemple concret — gate professor sur les mutations (code legacy / futur)

[`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) :

```rust
/// `Some(message)` si l'appel doit être refusé.
pub fn check_mutating_tool(
    tool_name: &str,
    args: &Value,
    state: &ProfessorCourseState,
) -> Option<&'static str> {
    if !PROFESSOR_GATED_TOOLS.contains(&tool_name) {
        return None;
    }

    // bash inspect-only (`git status`, …) : exploration, jamais gated.
    if tool_name == "bash"
        && args.get("command").and_then(|v| v.as_str()).is_some_and(drox_bash::command_is_inspect_only)
    {
        return None;
    }

    if !state.has_plan {
        return Some(MUTATING_BEFORE_COURSE_PLAN);
    }

    let kind = state.active_step_kind.as_deref()?;
    if kind != "exercise" && kind != "checkpoint" {
        return Some(MUTATING_NO_ACTIVE_EXERCISE);
    }
    // … contrôles workArea …
}
```

| Morceau | Détail |
|---------|--------|
| `-> Option<&'static str>` | `None` = OK ; `Some("…")` = message de refus |
| `PROFESSOR_GATED_TOOLS.contains` | Seuls certains tools sont concernés |
| Constantes `MUTATING_…` | Messages stables renvoyés au modèle |

---

## Partie B — Downgrade côté IDE (comportement actuel)

```typescript
// droxPermissionAsk.ts (idée)
normalizeDroxPermissionMode('professor') // → mode confirm (ex. imNotCrazy)
resolveDroxPermissionMode('professor').downgradedFromProfessor // → true + notification
```

Les tests (`droxCommon.test.ts`) vérifient que `buildAgentRunParams` **n’envoie jamais** `mode: "professor"` sur le wire.

---

## Partie C — Phases de cours (cible prompt, non UI)

Le prompt professor (s’il est réactivé) parle de phases du genre `teach` / `exercise` / `review` / `done`.  
Sans surface UI ni smoke fiables, **ne pas** compter dessus pour dogfood.

---

## Récapitulatif

1. Professor = mode permission + prompt + gates **en conception / code partiel**.
2. **Pas dispo** dans l’IDE actuel (retiré 1.4.0, downgrade explicite).
3. Reprise future = chantier dédié (« Professor 2.0 »), pas un toggle caché.

Index : [README.md](README.md).
