# Mise à jour 2.0.1 — chantiers avant livraison

Document de **suivi** (pas un plan d’implémentation figé). Chaque lot liste l’état actuel dans le dépôt, le livrable visé, et les **décisions ouvertes** à trancher avant de coder.

**Profils moteur** (vocabulaire produit ↔ technique) :

| Produit | `drox.engine.profile` | Rôle |
|---------|----------------------|------|
| Small local | `local-9b` | Parent allégé, outils en série, clôture moteur |
| Local capable | `local-27b` | Même famille, parent plus riche |
| Full protocol | `cloud-full` | Parallélisme outils, CORE étendu |

---

## Lot 1 — Outil « sauvegarder une règle » (rappel workspace)

### Intention

L’utilisateur dit en chat : *« ça maintenant c’est une règle, sauvegarde-le »* → le modèle appelle un **outil dédié** qui persiste une consigne **formatée pour réinjection** dans le prompt système (annexe rules), pour le workspace ouvert — pas seulement une note de session jetable.

### Déjà en place (à ne pas dupliquer)

| Élément | Où |
|---------|-----|
| Fichiers règles | `.drox/rules/*.instructions.md` (`DROX_RULES_SOURCE_FOLDER`) |
| Parse + frontmatter (`applyTo`, etc.) | `contrib/drox/.../rules/droxRulesParse.ts` |
| Injection run (annexe système) | `droxRulesFs.ts` → `collectDroxRulesSystemAnnex` dans `droxAgentRunBridge.ts` |
| Sélection par chemins éditeur | `droxRulesContextFromEditor.ts` |
| Interrupteur global | `drox.rules.enabled` (`droxConfiguration.ts`) |
| Règles Cursor repo | `.cursor/rules/*.mdc` — **hors périmètre** (outil = règles **projet Drox**, pas Cursor) |

### Manquant

- ~~Aucun outil moteur dédié~~ → **`project_rule_write`** (crate `drox-tools`, profils `local-9b` / `local-27b` / `cloud-full`).
- ~~Pas de consigne CORE~~ → paragraphe CORE + fiche outil `drox-prompts`.
- Validation outil : slug kebab-case, corps plafonné, modes `create` / `update` / `append` ; dédoublonnage = erreur explicite en `create`.

### Livrable cible (proposition)

1. Outil **`project_rule_write`** (nom à figer) :
   - args : `title`, `body`, `applyTo?` (glob), `mode?` (`always` | `auto` aligné sur `droxRuleShouldAutoInject`).
   - écrit ` .drox/rules/<slug>.instructions.md` au format déjà parsé par l’IDE.
   - permission : traiter comme mutation workspace (policy fichiers + confirmation si mode strict).
2. **Disponible sur les 3 profils** — le local 9B en bénéficie autant (écriture fichier rare, fort gain UX).
3. Prompt : paragraphe court dans CORE (tous profils) + description outil (pas de heuristique sur le message utilisateur : le modèle décide d’appeler l’outil sur demande explicite).
4. **Post-écriture** : relire le fichier via le pipeline rules existant au **tour suivant** (pas besoin de hot-reload mid-turn si documenté).

### Critères d’acceptation (brouillon)

- [ ] Après appel outil, la règle apparaît dans l’annexe du run suivant (si `drox.rules.enabled`) — dogfood manuel.
- [x] Fichier valide pour `parseDroxRuleMarkdown` (frontmatter `alwaysApply` / `applyTo` / `description`).
- [x] Tests Rust unitaires `project_rule_write` dans `drox-tools` ; round-trip TS optionnel.

### Liens

- Encadrement rebase : [ENCADREMENT-CHAT-NATIF.md](./ENCADREMENT-CHAT-NATIF.md)
- Règle agent : `.cursor/rules/encadrement-upstream-drox.mdc`

---

## Lot 2 — Page de configuration des outils + presets profil + régulation

### Intention

Une UI dans le fork pour **cocher / décocher** les outils exposés au modèle, avec **presets** liés aux trois profils moteur, sans entrer en contradiction avec **régulation** (L1–L5) ni avec les permissions d’exécution.

### Déjà en place

| Couche | Rôle | Fichiers clés |
|--------|------|----------------|
| Catalogue outils | Liste toggleable vs toujours actifs | `droxToolCatalog.ts`, `droxToolGroups.js` |
| Settings VS Code | Nombreux `drox.*` (ex. `drox.task.enabled`, `drox.memory.enabled`) | `droxConfiguration.ts` |
| Profil moteur | Select small / capable / full | `drox.engine.profile`, webview Agents |
| Régulation L2 | Allowlist **core / standard / full / custom** → `disabledTools` via `droxEffectiveToolSurface` | `droxRegulationL2Surface.ts`, `droxEffectiveToolSurface.ts`, tests |
| Matrice custom | `.drox/tools-surface.json`, panneau clé chat natif, suffixe `(custom tools)` | `droxToolsSurfaceStore.ts`, `droxNativeChatToolsPanel.ts` |
| Console Regulation | Modules L1–L5, Auto, overrides (R5+) | `droxRegulationConsole.ts`, `regulation/README.md` |
| Moteur | `disabledTools` + profil (`config.rs`) ; pas de réactivation outil coupé par profil | `drox-engine/.../agent/config.rs` |

### Problème : trois leviers qui peuvent se contredire

Aujourd’hui l’utilisateur peut avoir :

1. un **profil** (`local-9b`…) qui change prompts, parallélisme, clôture ;
2. des **settings** `drox.*` qui désactivent des familles d’outils ;
3. **régulation L2** (manuel ou Auto) qui restreint encore le catalogue.

Sans modèle de priorité clair → confusion (« j’ai coché bash mais le run ne le voit pas »).

### Proposition de modèle (à valider)

**Principe : une seule liste effective `disabledTools` calculée à chaque run, affichée en UI.**

Ordre de fusion (du plus fort filtre au plus faible) :

```text
effectiveDisabled =
  merge(
    profilePreset.disabled,     // défaut du profil (nouveau JSON / settings)
    userToolMatrix.disabled,    // cases décochées par l’utilisateur
    regulationL2.extras,        // outils hors allowlist du module L2 actif
  )
  ∪ settingsFamilyOff          // ex. memory off → memory_* forcés
```

**Règles anti-contradiction :**

| Règle | Détail |
|-------|--------|
| **Descendant seulement** | Régulation et presets ne peuvent qu’**enlever** des outils du schéma, jamais réactiver un outil désactivé par l’utilisateur (déjà esquissé moteur : `disabledTools` IDE). |
| **Always-active** | `ask_user_question`, `todo_write` : hors grille (déjà `DROX_ALWAYS_ACTIVE_TOOLS`). |
| **Profil ≠ régulation** | Le profil choisit un **preset de grille** ; la régulation L2 est une **couche adaptative** (notes → module) qui peut resserrer davantage si Auto ON — pas élargir. |
| **Override utilisateur** | Si l’utilisateur fige un module en manuel dans Regulation, Auto ne touche plus ce levier (`regulation/README.md` R11). La **grille outils** doit refléter « manual frozen » (cases grisées + tooltip). |
| **Source de vérité persistée** | `surface.json` + nouveau bloc optionnel `toolMatrix` (workspace ou profil utilisateur) — à trancher. |

### Où mettre la page ? (options)

| Option | Pour | Contre |
|--------|------|--------|
| **A. Extension Drox Settings** (section existante Paramètres) | Découverte, cohérent `droxConfiguration` | Éloigné de Regulation ; deux endroits si on ne fusionne pas |
| **B. Onglet Regulation → panneau L2 enrichi** | Déjà L2 = tool surface ; proche Auto | Mélange observabilité (scores) et config utilisateur |
| **C. Page dédiée « Agent / Outils »** (nouvelle entrée menu Drox) | UX claire : profil preset + matrice + aperçu effectif | Plus de chrome UI |
| **D. Hybride C + lien depuis Regulation** | Presets + cases ; Regulation = lecture seule effective + Auto | Deux fichiers UI, un service commun |

**Recommandation doc (non figée)** : **D** — service `droxEffectiveToolSurface.ts` (calcul + preview), UI principale sous Paramètres Drox **ou** custom editor Agents ; Regulation affiche le même calcul en lecture seule.

### Décisions (2026-11-24)

| Sujet | Choix |
|-------|--------|
| **UI config outils** | **Hybride D** : page Agent/Outils + Regulation en lecture seule (même calcul `effectiveDisabled`). |
| **Presets profil** | Persistance **workspace** (`.drox/` — fichier à nommer, ex. `tool-preset.json`). |

## Décisions ouvertes (discussion)

1. Cocher un outil **interdit par L2 core** : case désactivée, ou autoriser l’intention utilisateur et laisser L2 gagner au run (avec bandeau explicatif) ?
2. Synchronisation avec **permissions** bash (`drox-permissions`) : la grille ne fait qu’exposer le schéma ; l’exécution reste Evaluate — OK ?
3. **Explore** (`task`) : déjà double gate (`drox.task.enabled` + L2 ≠ core) — documenter dans la même page.

### Livrables (phases)

| Phase | Contenu |
|-------|---------|
| **2a** | Spec JSON + `droxEffectiveToolSurface` + tests (sans UI) |
| **2b** | UI matrice + 3 presets + preview « ce que le modèle voit » |
| **2c** | Liaison Regulation (override, frozen, Auto) + copy UX |
| **2d** | Doc utilisateur + tutoriel |

---

## Lot 3 — Mécaniques Cline (discussion + moteur Drox)

### Intention

Importer les idées **éprouvées** de Cline (voir `docs/cline_compareer/`) — en particulier ce qui améliore le **fil de discussion** et la **clôture de run** — **sans** remplacer le moteur Drox ni recopier du TS dans le Rust.

### Périmètre suggéré pour 2.0.1

| Mécanique Cline | Intérêt Drox | Piste Drox | Hors scope immédiat |
|-----------------|-------------|------------|---------------------|
| **Clôture tour sans outil** | Symptôme boucles / re-stream | Axe A `03-axes-dimplementation.md`, `text_gates.rs` | — |
| **status-notice typés** | Transparence dans le transcript | Axe G doc 03 ; UI discussion shell | — |
| **Compaction prepareTurn unique** | Runs longs | `04-mecanismes` A1–A2 ; moteur `drive/` | Effort M |
| **Discussion / file de run** | UX fil lisible | Voir ci-dessous | — |
| Checkpoints workspace | Revert agent | B1 doc 04 | Coût élevé |
| Teams multi-agent | Parallèle équipes | C2 doc 04 | Déjà `task` / Explore |

### Priorité produit (2026-11-24)

1. **D’abord** : mécanique Cline de **clôture de run** (Axe A, `03-axes-dimplementation.md`) — corrige la cause des boucles, pas seulement l’affichage.
2. **Ensuite** : trier le reste « discussion / UX » par **coût / gain** (grille ci-dessous) — pas de copier-coller Cline sans ROI clair.

### Grille « ça vaut encore le coût ? » (après clôture moteur)

| Idée Cline (doc 04) | Gain utilisateur | Effort | Verdict provisoire |
|---------------------|------------------|--------|-------------------|
| Axe A clôture sans outil | Fin de run fiable | S–M moteur | **À faire** (P0) |
| B4 `status-notice` dans le transcript | Comprendre nudges / overflow | M UI | **Probable** si dogfood encore opaque après A |
| B3 mentions `@file` explicites | Contexte prévisible | L IDE | **Reporter** (Codebase + collage déjà là) |
| A2 compaction plancher provider | Runs longs 9B | M moteur | **Reporter** sauf crash contexte mesuré |
| A4 tolérance args JSON | Moins d’échecs tool 9B | S moteur | **À étudier** (petit, aligné small local) |
| B1 checkpoints | Undo agent | XL | **Hors 2.0.1** |
| B2 règles togglables par fichier | Équipes | M | **Recouvre** Lot 1 + future matrice outils |

### UI discussion (`drox-discussion-shell`)

- Ne pas bloquer la livraison UI 2.0.1 sur Cline ; **re-voir le transcript après** Axe A (notices, libellé de fin) si le symptôme persiste côté ressenti.
- Garder `AgentEvent` / JSON-RPC ; toucher surtout les **renderers** Drox.

### Dépendances

- Clôture moteur (Lot 3 moteur) avant de promettre « fin propre » dans l’UI.
- [ENCADREMENT-CHAT-NATIF.md](./ENCADREMENT-CHAT-NATIF.md) pour Playwright sur le shell discussion.

### Références

- [`docs/cline_compareer/README.md`](../../cline_compareer/README.md)
- [`02-drox-run-gaps.md`](../../cline_compareer/02-drox-run-gaps.md)
- [`03-axes-dimplementation.md`](../../cline_compareer/03-axes-dimplementation.md)

---

## Ordre conseillé (livraison)

```text
UI chat 2.0.1 (encadrement) ──┐
Lot 1 rule tool (S)           ├──> peuvent avancer en parallèle
Lot 2 spec surface (2a) (S)   │
Lot 3 UI discussion notices (M) ┘
Lot 3 moteur clôture Cline A (S–M) — avant ship si symptôme boucles bloquant
Lot 2 UI (2b–2c) (L) — après modèle de priorité validé
```

| Priorité | Lot | Taille indicative |
|----------|-----|-------------------|
| P0 | Clôture run (Cline A) si boucles encore visibles en dogfood | S–M moteur |
| P1 | Outil `project_rule_write` | S |
| P1 | Spec outils effectifs + tests (2a) | S |
| P2 | Page configuration outils (2b) | M |
| P2 | Transcript notices (discussion UI) | M |
| P3 | Regulation ↔ matrice (2c) | M |

---

## Checklist doc / branche

- [x] Lot 2 : UI hybride D + presets workspace.
- [x] Lot 2 (2b partiel) : chat natif — clé ViewTitle, L2 `custom`, persistance workspace, sortie custom au changement de profil.
- [x] Lot 2 : calcul unique effective surface + fusion run (`droxRunSettingsService`, bridge Explore).
- [ ] Nom final outil Lot 1 + spec permissions fichier.
- [ ] Trancher « file de discussion » = UI seulement ou aussi export fichier.
- [ ] Lier commit(s) de livraison dans [README.md](./README.md) quand les lots passent en *Fait*.

---

*Dernière mise à jour : 2026-11-24 — création suivi MAJ avant livraison 2.0.1.*