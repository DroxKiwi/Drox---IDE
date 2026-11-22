# `docs/cline_compareer` — Ce que le run de Cline nous apprend

> **Périmètre strict** : ce dossier ne traite **que du run** — la boucle modèle ↔ outils, la
> clôture d'un run, les gates, les nudges, la terminaison. Rien sur l'UI, la télémétrie, le
> marketplace, la distribution.
>
> **Auteur du document** : analyse lecture seule du 2026-11-17, réalisée sur un clone de Cline
> (`--depth 1`, commit `4cdfb19`, `apps/vscode` v4.1.26) et sur ce dépôt Drox en l'état.
> **Aucune ligne de code n'a été modifiée** — ce dossier est une spécification, pas un patch.
> L'implémentation est un chantier séparé (mené par un autre agent / une autre passe).

## Pourquoi ce dossier existe

Symptôme constaté chez les utilisateurs : **les modèles, quel que soit leur calibre** (petit local,
27B local, full protocol), n'arrivent pas toujours à terminer un run : la réponse finale est
re-générée plusieurs fois, refusée, ou prolongée par des nudges. Le run ne se ferme pas proprement.

Hypothèse de départ vérifiée par lecture : Cline (référence open source la plus mature sur ce
sujet précis) ferme un run avec un **contrat minimal** — « un tour sans appel d'outil termine le
run ». Drox ferme avec une **cascade de gates textuelles** où chaque condition non remplie réinjecte
du texte et relance un tour. C'est ce second modèle qui crée les boucles visibles côté utilisateur.

## Fichiers

| Fichier | Contenu |
|---|---|
| [`01-cline-run-anatomy.md`](01-cline-run-anatomy.md) | Comment Cline exécute un run : boucle, contrat de fin, erreurs, compaction, hooks. Avec références fichier:ligne. |
| [`02-drox-run-gaps.md`](02-drox-run-gaps.md) | Comment Drox ferme un run aujourd'hui, gates par ordre d'exécution, et la liste des défauts (classés par criticité) qui produisent le symptôme. |
| [`03-axes-dimplementation.md`](03-axes-dimplementation.md) | Axes A→G d'implémentation proposés, avec fichiers Drox concernés, référence Cline, critères d'acceptation, et ordre conseillé. |
| [`04-mecanismes-a-etudier.md`](04-mecanismes-a-etudier.md) | Inventaire élargi des mécanismes de Cline au-delà du run : compaction, erreurs provider, hooks, team tooling, checkpoints, evals — avec priorisation. |

## Règles pour l'agent qui implémentera

1. **Ne pas copier-coller du TypeScript Cline dans le Rust Drox.** L'inspiration est conceptuelle
   (sémantique de clôture), pas textuelle. Cline est Apache-2.0 : adaptation possible, mais le code
   Drox reste Rust idiomatique ; noter toute adaptation substantielle dans `NOTICE` si applicable.
2. **Ne pas ajouter de nudge supplémentaire.** Chaque axe ci-dessous *retire* ou *assouplit* une
   gate. Un nouveau nudge est un échec de conception.
3. **Pas de régression sur la détection de boucle** (`loop_detect/`) : c'est un point fort de Drox,
   à garder.
4. **Tests d'abord** : chaque axe liste ses critères d'acceptation ; ils doivent être couverts par
   `drox-engine` (tests d'intégration dans `agent/tests/`) avant clôture.
5. Le format des prompts reste en français, sans numéros de version produit dans les prompts modèle
   (règle RULES §6).
6. Les numéros de ligne cités dérivent vite : toujours re-localiser par symbole avant édition.

## Références externes

- Clone d'étude Cline : `%TEMP%\cline-inspect` (temporaire — si absent, `git clone --depth 1 https://github.com/cline/cline.git`).
- Version étudiée : commit `4cdfb19` (2026-11), `apps/vscode` v4.1.26, SDK `@cline/agents` ~2.9k lignes (`sdk/packages/agents/src/agent-runtime.ts`).
- Drox : `docs/engine/agent-run-loop.md` (documentation moteur existante, à mettre à jour après implémentation, pas avant).
