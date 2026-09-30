# `@Codebase` — hub doc 1.5.21

**Tout ce qui définit le produit / la tech index codebase** vit dans **ce dossier**.

```text
docs/1.5/1.5.21/codebase/
  README.md           ← tu es ici (carte)
  AMBITION.md         ← but, instances, supervision, embed, décisions
  ARCHITECTURE.md     ← pipeline chunk → embed → store → retrieve
  PLAN-COCKPIT.md     ← CB0b UI shell partagé + contrat live
  PLAN-CODE-MAP.md    ← carte visuelle (lié, plus tard)
  PLAN-CB1.md         ← chantier store lexical + cockpit branché
```

## Ordre de lecture

1. [AMBITION.md](AMBITION.md) — *pourquoi* et *règles produit*  
2. [PLAN-COCKPIT.md](PLAN-COCKPIT.md) — *où* l’utilisateur pilote  
3. [ARCHITECTURE.md](ARCHITECTURE.md) — *comment* techniquement  
4. [PLAN-CB1.md](PLAN-CB1.md) — *prochaine impl*

## Code source (runtime)

```text
src/vs/workbench/contrib/drox/
  common/codebase/     ← domaine : paths, types, index, supervision
  browser/codebase/    ← UI cockpit + contribution workbench
  test/common/codebase/
```

Point d’entrée code : [`common/codebase/README.md`](../../../../src/vs/workbench/contrib/drox/common/codebase/README.md).

## Hors de ce dossier (même release)

| Sujet | Fiche |
|-------|--------|
| Explore IDE | [../PLAN-SUBAGENTS-EXPLORE-IDE.md](../PLAN-SUBAGENTS-EXPLORE-IDE.md) |
| Shell discussion | [../PLAN-SHARED-DISCUSSION-SHELL.md](../PLAN-SHARED-DISCUSSION-SHELL.md) |
| Hub release | [../README.md](../README.md) |
