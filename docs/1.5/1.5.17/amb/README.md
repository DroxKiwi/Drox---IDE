# Fiches AMB — 1.5.17

Une fiche par ambiguïté. L’inventaire reste dans [../AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) ; **le détail des modifications** vit ici.

## Règle

Après chaque patch AMB :

1. Mettre à jour la fiche `AMB-XX.md` (section **Modifications** + **Statut**).
2. Mettre à jour le statut dans `AMBIGUITIES-IDE-TUI.md`.
3. Ne pas fusionner plusieurs AMB dans une seule fiche.

Nouveau AMB : copier [`_TEMPLATE.md`](_TEMPLATE.md).

## File d’attente (priorité)

| Ordre | Fiche | Statut |
|-------|-------|--------|
| 0 | [AMB-01](AMB-01-plan-trois-verites.md) | **fait** (UI P0 + note P1) |
| 1 | [AMB-08](AMB-08-propose-cancel-soft-success.md) | **fait** |
| 2 | [AMB-16](AMB-16-triple-confirmation.md) | **fait** |
| 3 | [AMB-12](AMB-12-loop-recovery-asymetrique.md) | **fait** |
| 4 | [AMB-05](AMB-05-defaut-apply.md) | **fait** (labels) |
| 5 | [AMB-09](AMB-09-phases-thinking-fold.md) · [AMB-18](AMB-18-dual-surface.md) | **fait** |
| — | [AMB-03](AMB-03-cancelled-todo-mapping.md) · [AMB-04](AMB-04-vocabulaire-modes.md) | **fait** (clôture 1.5.17) |

**Reportés 1.5.18+** (hors finalisation enveloppe) : 02, 06–07, 10–11, 13–15, 17, 19–20 — voir inventaire.

## Checklist dual surface (AMB-18)

À chaque patch AMB :

```text
[ ] Agents natif
[ ] Webview legacy (ou N/A justifié)
[ ] Helper common/ si règle partagée
[ ] Tests / smoke noté
```

## Décisions figées (session)

- **Professor (AMB-06)** : hors priorité 1.5.17 (UI déjà retirée ; cleanup Rust = chantier séparé).
- **AMB-09** : conserver le **visuel Copilot** (fold thinking / avancement chat) ; harmoniser le routage phases, pas remplacer le chrome.
- **Connexions LLM** : hors AMB → [PLAN-LLM-CONNECTIONS.md](../PLAN-LLM-CONNECTIONS.md) (même **1.5.17**).
