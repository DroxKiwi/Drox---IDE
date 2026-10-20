# Clôture 1.6.0 — freeze code (pas un ship qualité)

**Branche** : `1.6.0`  
**Version** : `droxVersion` **1.6.0**  
**Date freeze** : 2026-10-20  
**Statut** : **lots moteur / IDE en code, figés** · qualité dogfood **non prouvée** · **pas de merge `main`** · **pas de tag / installeur**

**Git** : `main` reste `v1.5.23`. On **ne merge pas** `1.6.0` vers `main` (évite de publier un drive non stable). La suite `1.6.1+` part **de cette branche**. Un merge `main` n’aura lieu que pour un `1.6.x` produit stable (il emportera ce freeze). Détail : [hub 1.6](../README.md) § Git.

Ce n’est **pas** « l’agent code bien ». C’est : **arrêter d’empiler des lots 1.6.0** et ne pas laisser la docs en brouillon « avant dogfood ».

Handover historique : [PASSATION-1.6.0.md](PASSATION-1.6.0.md)  
Suite produit (profils moteur, 9B canari) : [1.6.1](../1.6.1/README.md)

## Ce que « freeze » veut dire

| Oui | Non |
|-----|-----|
| Les n+1 / filets / Explore Option A / bash capture **restent** tels quels | Relancer un lot « pour que site-kdds marche » sur cette maj |
| RELEASE_NOTES + popup `1.6.0` déjà là (rafraîchir seulement si on **ship**) | Smokes S1–S4 comme gate de cette clôture |
| Working tree 1.6.0 = snapshot à committer quand tu le demandes | P2 wrap fichier temp, `GIT_PAGER`, D6, OBS prod **dans** 1.6.0 |

**Latent évité** : pas de demi-P2, pas de nouveau gate, pas de refactor hors obstacle déjà nommé. Réserve P2 / D5 pager / D6 = **non commencés** → reportés, pas un WIP dans l’arbre.

## Livré (moteur + UI) — snapshot

| Lot | Contenu |
|-----|---------|
| **L-1 / L-2** | Plus de reset detector sur DONE_ONLY ; hard-stop text_only |
| **L-tools** | Hash tools global progress-aware |
| **L-3** | Nudges system foldés (pas de faux user reminder) |
| **C-1 / C-3 / C-2** | Compaction / snip → rewrite JSONL ; compact manuel aligné |
| **T-1** | Spill gros tool results |
| **G-1** | Jauge `estim.` / `provider` |
| **Vague 4** | Situation card / snip / CORE curation |
| **Post-V4** | `drox-prompts` · soft work/plan/Explore · hors-WS · UTF-8 Explore · post-merge · anti-rotation |
| **Explore Option A** | `explore_commit` · L0 · mono-kind · no `conclusion.md` · `artifacts_inline` · kinds / index / tags UI |
| **Inventaire + P1–P3** | Désempilage CORE / `task` / frames B |
| **D1–D4** | Spill anti re-read · Explore `partial`/abort · C2 si truncated · post-ask acting |
| **E1+E2+E2b / A / R4/R1** | Covered kinds · stall-act · artifact_read fail · stub already_read |
| **F1+F2** | Spill Explore 64 KiB · `EXPLORE MERGE PRESERVED` · `tool_result_spill/` |
| **Survie run A** | No-kill mid-run · reuse host · `reason=` |
| **Bash IDE P0+P1** | Capture / retry ExecBash / Skip / timeout / chrome / classifieur git inspect · tests `droxBashCapture` |
| **Anti-loop clôture** | Warn → ForceConclude → SyntheticDone |
| **Providers** | Dialecte Mistral (`seed` / `top_p`) |
| **Hygiène launch** | `ensure-dev-out.ps1` · `npm run code-dogfood` |

## Restait concrètement (au freeze)

Trois seaux — **aucun n’est un WIP dans le code 1.6.0**.

### A. Preuve jamais faite (qualité) → **1.6.1 / dogfood**, pas un patch latent

| Item | Pourquoi ce n’est pas « code latent » |
|------|----------------------------------------|
| Smokes **S1–S4** ([DIAGNOSTIC](DIAGNOSTIC-BOUCLES-CONTEXTE.md) §8) | Checklists manuelles, lots déjà ✅ |
| Dogfood acting après Explore (writes, pas 271 reads) | Comportement modèle + vérité tools ; lots F1/F2 déjà là |
| Tool-result bash **non vide** en session réelle (`echo` / `git status`) | P0+P1 en code ; smoke manuel dû |

### B. Réserves **jamais commencées** → backlog **1.6.1** (infra) ou plus tard

| Item | Note |
|------|------|
| **P2** wrap Windows (fichier temp + `type`) | Seulement si P0+P1 encore vides en dogfood |
| **D5** restant `GIT_PAGER=cat` | Classifieur git globals déjà fait |
| **D6** orphan `tool_finish` | Panic UTF-8 Explore déjà traité ; D6 = hygiène fin de run |
| **OBS-1/2** export `messages[]` prod | Dogfood via export transcript |
| Kind `rewrite_plan` | Optionnel si merge intact et acting encore flou |
| Lot B host partagé reload | Seulement si survie A insuffisante |
| Désempilage `params.system` IDE | Non mesuré |

### C. Ship produit → **après** 1.6.1 (ou décision explicite de tagger 1.6.0 tel quel)

| Item | État |
|------|------|
| Push / merge / tag `v1.6.0` | ⬜ volontairement |
| Popup / RELEASE_NOTES Option A / F1–F2 | Code popup 1.6.0 existe ; notes à rafraîchir **si** ship |
| Installeurs win32 + linux | ⬜ |

## Checklist freeze (cette clôture)

- [x] CLOSURE hors brouillon « avant dogfood »
- [x] README 1.6.0 + hub 1.6 pointent **1.6.1**
- [x] Dossier [1.6.1](../1.6.1/README.md) ouvert (profils / presets)
- [ ] Commit du snapshot 1.6.0 **quand tu le demandes** (working tree encore sale au freeze)
- [ ] `cargo build -p drox-cli` + dogfood launch si tu valides un binaire figé (hygiène binaire)

## Docs

- [PASSATION-1.6.0.md](PASSATION-1.6.0.md)
- [README.md](README.md)
- [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md)
- [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md)
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)
- [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)
- [`stable/1.6.0/RELEASE_NOTES.md`](../../../stable/1.6.0/RELEASE_NOTES.md)

## Phrase

**1.6.0 freeze = le drive a des filets et une vérité d’infra commencée.** La preuve « gros chantier propre » et l’adaptation **petits modèles / presets** sont **1.6.1**, pas un 1.6.0 ouvert à l’infini.
