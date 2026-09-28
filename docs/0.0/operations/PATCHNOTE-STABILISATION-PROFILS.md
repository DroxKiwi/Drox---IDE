# Patchnote — stabilisation profils Low puis Medium

**Créé** : 2026-05-22  
**Statut** : **brouillon actif** — carnet de bugs / incohérences à corriger avant de figer une release  
**Stratégie** : stabiliser **Low** en premier (cycles de test plus rapides), puis **Medium** (régression parité gelée).

**Plans liés** : [PLAN-PROFIL-LOW-ACCOMPAGNEMENT](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) · [PLAN-M5c-SOUS-AGENTS-ASYNC](../plans/PLAN-M5c-SOUS-AGENTS-ASYNC.md) · [SMOKE-6b-M5c-ASYNC](./SMOKE-6b-M5c-ASYNC.md) · [SMOKE-MANUEL-REFACTO](./SMOKE-MANUEL-REFACTO.md)

---

## 0. Contexte de référence (à remplir une fois)

| Champ | Valeur |
|-------|--------|
| Testeur | |
| Branche / commit | |
| IDE | Nexus (`.\scripts\code.bat`) |
| Moteur | `drox-engine\drox\target\debug\drox.exe` ou `release` |
| `npm run compile` / watch | ☐ fait avant session |
| Workspace de test | |
| Modèle parent (Low) | |
| `nexus.drox.modelTier` | `low` |
| `nexus.drox.subagents.enabled` | ☐ true ☐ false |
| Modèle sous-agent | |
| Ollama / VRAM | |

**Changements récents à garder en tête** (effets de bord probables) :

- Sessions chat : `<workspace>/.drox/sessions/` (plus `~/.drox/sessions/` par défaut côté IDE).
- Jauge `#ctx` : `ContextUsage` parent uniquement (plus `Stop.usage` → `#ctx`).
- M5c : `task` + `background: true/false`, gates Low, UI Sync/Async + cartes `job_id`.
- Reset workspace : panneau historique → dialogue + `workspace.reset`.
- Revert dernier run (M6), diffs fil chat, modes M4.

---

## 1. Comment noter un bug

Copier ce bloc sous la section concernée (Low §2 ou Medium §3).

```markdown
### L-XXX — Titre court

| Champ | Valeur |
|-------|--------|
| Sévérité | blocker / majeur / mineur / cosmétique |
| Statut | ⬜ ouvert · 🔄 en cours · ✅ corrigé · ❌ wontfix |
| Zone | sessions · ui-fil · m5c-async · gates · jauge · reset · revert · modes · tools · autre |
| Profil | low |
| Repro | 1. … 2. … |
| Attendu | … |
| Obtenu | … |
| Notes / logs | … |
| Correctif | (lien commit ou PR — vide tant que ouvert) |
```

**ID** : `L-001`, `L-002`, … pour Low · `M-001`, … pour Medium.

---

## 2. Profil Low — patchnote

### 2.0 Triage session 1 (2026-05-22)

**Verdict global** : manque d’**accompagnement moteur** — le modèle sait réfléchir mais, livré à lui-même en Low, dérive (boucles, répétition, pas de plan/verify, éditions trop larges). Une partie des symptômes est **UI** (phases / bandeaux), une partie **moteur** (archivage, plan forcé, persistance, découpe d’objectifs).

| Thème | IDs | Priorité suggérée |
|-------|-----|-------------------|
| UI phases / fil / raisonnement | L-003, L-006, L-012, L-013 | P0 — lisibilité fil |
| Accompagnement Low (plan, verify, objectifs, anti-boucle) | L-004, L-005, L-007, L-008, L-009, L-010, L-011 | P0 — produit Low |
| Sessions | L-001 | P1 |
| Édition fichier ciblée | L-014 | P1 — tokens + erreurs |
| Rendu code (couleur) | L-002 | P2 |

**Hypothèse transversale (L-003 / L-013)** : le modèle sort d’`explore` correctement côté moteur, mais la phase `answering` n’est pas clôturée → relance → 2ᵉ réponse en format *reasoning* (bandeau bleu) sur la réponse finale.

---

### 2.1 Checklist smoke (cocher au fil de l’eau)

Référence : [PLAN-PROFIL-LOW §5.2](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md).

| # | Scénario | OK | Notes |
|---|----------|----|-------|
| 1 | Question simple — discover → answer | ☐ | L-003, L-013 |
| 2 | Refacto « je dois vérifier » — mode verify | ☐ | L-005 |
| 3 | Chantier multi-fichiers — todo / modes | ☐ | L-004, L-008 |
| 5 | M3b — `file_edit` Windows | ☐ | |
| 6 | M5a — `task` sync (`background: false`) | ☐ | |
| 6b | M5c — `task` async + gate + jauge parent | ☐ | [procédure](./SMOKE-6b-M5c-ASYNC.md) |
| 7 | M6 — Undo last run | ☐ | |
| — | Reset workspace (dialog + données supprimées) | ☐ | |
| — | Historique sessions (liste + rechargement) | ☐ | |
| — | Re-perspective / modes / bandeau | ☐ | L-003, L-012, L-013 |
| — | Plan visible parties / sous-parties (Low) | ☐ | L-004 |
| — | Vérification utilisateur / mode verify | ☐ | L-005 |

### 2.2 Sessions & persistance

*(incohérences historique, onglets, chemins `.drox/sessions/`, layout, reset, archivage)*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| L-001 | Archivage session en plein run | majeur | ⬜ ouvert |

#### L-001 — Archivage session en plein run

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | sessions |
| Profil | low |
| Source test | point #1 |
| Repro | Lancer un run long ; observer « Session archived » avant fin de tâche |
| Attendu | Archivage **uniquement** sur décision explicite du modèle (mécanique logique / tool ou signal moteur), jamais en milieu de run actif |
| Obtenu | Archivage automatique ou déclenché hors modèle, coupant ou perturbant le run en cours |
| Notes / logs | Rendre l’archivage **indépendant du modèle** côté trigger : le **modèle** doit archiver ; pas de side-effect timing/run-state |
| Correctif | |
| Liens | — |

---

### 2.3 UI chat (fil, phases, diffs, replay, rendu)

*(bandeaux phases, raisonnement bleu, fil discussion, coloration code)*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| L-002 | Exemples de code sans coloration | mineur | ⬜ ouvert |
| L-003 | Bandeau raisonnement sur réponse finale | majeur | ⬜ ouvert |
| L-006 | Historique fil discussion empilé | majeur | ⬜ ouvert |
| L-012 | Pavés raisonnement hors phase après explore | majeur | ⬜ ouvert |
| L-013 | Incohérence phases UI (explore → pavé → bleu) | majeur | ⬜ ouvert |

#### L-002 — Exemples de code sans coloration

| Champ | Valeur |
|-------|--------|
| Sévérité | mineur |
| Statut | ⬜ ouvert |
| Zone | ui-fil |
| Profil | low |
| Source test | point #2 |
| Repro | Demander au modèle un extrait de code en réponse |
| Attendu | Blocs code avec **coloration syntaxique** (langage détecté) |
| Obtenu | Code en exemple brut, peu lisible |
| Notes / logs | Rendu markdown / webview chat |
| Correctif | |
| Liens | — |

#### L-003 — Bandeau raisonnement sur réponse finale

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | ui-fil |
| Profil | low |
| Source test | point #3 |
| Repro | Run avec tâche assignée ; modèle termine la tâche puis répond |
| Attendu | Réponse finale en phase **answering** (format réponse, pas reasoning) ; phase clôturée proprement |
| Obtenu | Bandeau **bleu** (reasoning) sur la réponse finale ; répétition du contenu |
| Notes / logs | Hypothèse : phase `answering` non clôturée → moteur relance → 2ᵉ passe en format reasoning. Le modèle semble respecter les phases côté contenu ; l’affichage UI dérape. |
| Correctif | |
| Liens | L-013 (racine UI probable), L-012 |

#### L-006 — Historique fil discussion empilé

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | ui-fil |
| Profil | low |
| Source test | point #6 |
| Repro | Conversation longue ; observer le fil de discussion (sidebar / bandeau historique) |
| Attendu | **Un seul** message d’historique visible (le dernier) ; scroll + **sticky** conservés |
| Obtenu | Messages d’historique qui **s’empilent** les uns sur les autres |
| Notes / logs | Calibrage UI fil discussion — pas de pile, toujours dernier état |
| Correctif | |
| Liens | L-007 (perte de fil après boucle) |

#### L-012 — Pavés raisonnement hors phase après explore

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | ui-fil |
| Profil | low |
| Source test | point #12 |
| Repro | Run avec phase explore puis sortie |
| Attendu | Raisonnement **rattaché** à la phase explore (replié / groupé), pas libre dans le chat |
| Obtenu | Segments de raisonnement qui sortent **après** la fin d’explore et flottent en **pavé** dans le fil |
| Notes / logs | Lisibilité fil dégradée |
| Correctif | |
| Liens | L-013 |

#### L-013 — Incohérence phases UI (explore → pavé → bleu)

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | ui-fil |
| Profil | low |
| Source test | point #13 (consolidation #3, #12) |
| Repro | 1. Modèle en explore — OK. 2. Sortie explore — toute la réflexion accumulée sort en **immense pavé**. 3. Modèle conclut — **phase reasoning réapparaît** avec trait bleu, hors contexte UI précédent |
| Attendu | Une seule représentation cohérente par phase ; pas de double affichage reasoning ; clôture answering sans relance |
| Obtenu | Séquence : explore OK → dump réflexion en bloc → conclusion → **reasoning** réapparaît (bleu) ≠ contexte UI antérieur |
| Notes / logs | Probable bug **mapping événements moteur → phases UI** (`07-log.js` / agent events), pas seulement comportement modèle |
| Correctif | |
| Liens | L-003, L-012 |

---

### 2.4 M5c — sous-agents async (`task` + `background`)

*(badge Sync/Async, cartes job, drain report, parent actif pendant running, 2ᵉ task)*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| | | | |

_Détail des entrées :_

---

### 2.5 Accompagnement moteur Low

*(plan forcé, verify, découpe objectifs, anti-boucle, anti-répétition, persistance — voir [PLAN-PROFIL-LOW](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md))*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| L-004 | Aucun plan visible (parties / sous-parties) | majeur | ⬜ ouvert |
| L-005 | Aucune vérification effective | majeur | ⬜ ouvert |
| L-007 | Perte du fil après sortie de boucle | majeur | ⬜ ouvert |
| L-008 | Boucles fréquentes | majeur | ⬜ ouvert |
| L-009 | Phase réflexion trop longue | majeur | ⬜ ouvert |
| L-010 | Répétition forte à chaque prompt | majeur | ⬜ ouvert |
| L-011 | Persistance insuffisante (abandon prématuré) | majeur | ⬜ ouvert |

#### L-004 — Aucun plan visible (parties / sous-parties)

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | modes |
| Profil | low |
| Source test | point #4 |
| Repro | Chantier Low multi-étapes sans plan explicite |
| Attendu | **Plan obligatoire** visible (parties + sous-parties) ; modèle **tenu** de s’y conformer ; contextualisation très aiguillée (déjà prévu moteur / plan M4) |
| Obtenu | Pas de plan structuré ; dérive d’exécution |
| Notes / logs | Renforce L-005, L-008, L-009 |
| Correctif | |
| Liens | PLAN-PROFIL-LOW M4 checkpoints / todo |

#### L-005 — Aucune vérification effective

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | modes |
| Profil | low |
| Source test | point #5 |
| Repro | Après implémentation ; utilisateur non invité à valider |
| Attendu | Mode **verify** ou étapes de contrôle ; invitation utilisateur à tester ; validation solution |
| Obtenu | Pas de vérification, ou invitation inefficace |
| Notes / logs | Probablement lié à L-004 (sans plan, pas de checkpoint verify) |
| Correctif | |
| Liens | L-004, smoke #2 |

#### L-007 — Perte du fil après sortie de boucle

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | sessions |
| Profil | low |
| Source test | point #7 |
| Repro | Boucle longue ; modèle se rend compte seul d’être bloqué ; sortie de boucle |
| Attendu | Reprise sur le **dernier message utilisateur** / objectif courant ; fil de discussion cohérent |
| Obtenu | Après sortie de boucle, **perte du fil** ; réponse au **mauvais** message |
| Notes / logs | Contexte session + UI fil (L-006) |
| Correctif | |
| Liens | L-006, L-008 |

#### L-008 — Boucles fréquentes

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | modes |
| Profil | low |
| Source test | point #8 |
| Repro | Runs variés Low |
| Attendu | Détection / coupure boucle côté moteur ; fil lisible |
| Obtenu | Boucles **fréquentes** ; fil impossible à suivre |
| Notes / logs | Le modèle peut auto-diagnostiquer la boucle (L-007) mais trop tard |
| Correctif | |
| Liens | L-007, L-009, L-010, L-011 |

#### L-009 — Phase réflexion trop longue

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | modes |
| Profil | low |
| Source test | point #9 |
| Repro | Tâche ambiguë ou large |
| Attendu | Réflexion bornée ; **découpe d’objectifs** (sous-tâches) pour accompagner |
| Obtenu | Modèle se répète, se pose trop de questions ; phase réflexion **trop longue** |
| Notes / logs | Piste principale : mécanique **découpe d’objectif** moteur (pas seulement nudge prompt) |
| Correctif | |
| Liens | L-004, L-010 |

#### L-010 — Répétition forte à chaque prompt

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | modes |
| Profil | low |
| Source test | point #10 |
| Repro | Quasi systématique sur prompts successifs |
| Attendu | Réponses concises ; pas de re-hash du même contenu |
| Obtenu | **Répétition très forte** ; quand absent, le modèle est excellent → problème d’accompagnement / garde-fous |
| Notes / logs | Anti-répétition : nudges, compact session, plafond réflexion ? |
| Correctif | |
| Liens | L-009, L-003 (double réponse) |

#### L-011 — Persistance insuffisante (abandon prématuré)

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | modes |
| Profil | low |
| Source test | point #11 |
| Repro | Utilisateur signale « ça ne marche pas » |
| Attendu | Le moteur **insiste** mécaniquement (nouvelle hypothèse, verify, plan) jusqu’à résolution ou escalade |
| Obtenu | Modèle s’arrête dès qu’il croit avoir une solution ; **insiste** que ça marche malgré retour utilisateur |
| Notes / logs | Besoin garde-fou **persistance** côté moteur (pas seulement prompt) |
| Correctif | |
| Liens | L-005, L-004 |

---

### 2.6 Jauge contexte `#ctx`

*(stable avant report async, hausse après injection, pas de contexte explore interne)*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| | | | |

_Détail des entrées :_

---

### 2.7 Outils & édition fichier

*(`file_edit`, `file_write`, chemins Windows, permissions, bash, edits ciblés)*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| L-014 | Réécriture complète systématique des fichiers | majeur | ⬜ ouvert |

#### L-014 — Réécriture complète systématique des fichiers

| Champ | Valeur |
|-------|--------|
| Sévérité | majeur |
| Statut | ⬜ ouvert |
| Zone | tools |
| Profil | low |
| Source test | point #14 |
| Repro | Demande de modification localisée sur un fichier existant |
| Attendu | `file_edit` sur **lignes ciblées** ; diffs minimaux |
| Obtenu | Réécriture de **tout** le fichier à chaque fois |
| Notes / logs | Coût tokens + risque d’erreurs ↑ ; accompagnement tool + nudges Low (1 tool/tour) |
| Correctif | |
| Liens | smoke #5 M3b, gates Low |

---

### 2.8 Reset workspace & données `.drox/`

*(dialog, liste supprimée, état UI après reset)*

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| | | | |

_Détail des entrées :_

---

### 2.9 Autres (Low)

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| | | | |

_Détail des entrées :_

---

### 2.10 Synthèse Low

| Métrique | Valeur |
|----------|--------|
| Entrées ouvertes | **14** (L-001 … L-014) |
| Blockers | 0 explicite — **12 majeurs**, 2 mineurs |
| Prêt pour passe Medium ? | ☐ oui ☑ **non** |

**Décision (session 1)** : prioriser **lot UI phases** (L-003, L-012, L-013, L-006) en parallèle du **lot accompagnement Low** (L-004 → L-011). L-001 et L-014 en deuxième vague. L-002 cosmétique.

**Ordre de travail proposé**

1. **UI** : mapping phase answering / reasoning (`07-log.js`, events agent) — ferme L-003, L-012, L-013.
2. **Moteur Low** : plan forcé + verify (L-004, L-005) — déjà dans PLAN-PROFIL-LOW.
3. **Moteur Low** : découpe objectifs + anti-boucle + persistance (L-008, L-009, L-010, L-011).
4. **Sessions** : archivage modèle-only (L-001).
5. **Tools** : edits ciblés (L-014).
6. **UI** : fil historique + coloration code (L-006, L-002).

**État chantier (2026-05-22)** : lots 1–3 **implémentés** côté code ; **validation manuelle** requise (§2.1 + §2.11).

---

### 2.11 Prêt pour tests (session unique)

**Prérequis build**

| Étape | Commande | Statut agent |
|-------|----------|--------------|
| Moteur | `cd drox-engine\drox` puis `cargo build -p drox-cli --release` (ou `debug`) | ☐ |
| Tests moteur | `cargo test -p drox-engine` | ✅ 149 passed (2026-05-22) |
| IDE | `npm run compile` à la racine du fork | ☐ |
| Lancement | `.\scripts\code.bat` · tier `low` dans settings | ☐ |

**Lot 3 — à valider en smoke**

| ID | Changement | Fichiers clés |
|----|------------|---------------|
| L-004 | Gate **plan obligatoire** sur gros chantier Low : seuls `todo_write` / ask / memory jusqu’au plan | `gates.rs`, `loop.rs` |
| L-005 | Nudge **verify** après mutation code sans phase testing | `nudges.rs`, `loop.rs` |
| L-014 | Garde-fou IDE `validateFileEditScope` (hunk > ~50–85 % fichier) | `droxFileEdit.ts`, `droxFileEditTool.ts` |
| — | Objectif auto Low si pas de `run_objective` (cap depuis prompt user + event `RunObjective`) | `loop.rs` |
| L-003 / L-006 | UI : un seul bloc todos ; classe `drox-final-answer` sur réponse finale | `02-chrome.js`, `07-log.js`, `droxChatMvp.css` |

**Procédure suggérée** : parcourir §2.1 dans l’ordre ; pour chaque KO, noter l’ID L-xxx dans la colonne Notes et garder les logs moteur + capture fil chat.

---

### 2.12 Lot 4 — compléments (2026-05-22)

| ID | Changement | Fichiers |
|----|------------|----------|
| L-012, L-013 | Bundle **Exploring** replié (`open=false`) à l’entrée `answering` et en replay | `07-log.js` |
| L-004 | Widget todos : titre **Plan**, compteur `fait/total`, sous-étapes indentées | `02-chrome.js`, `droxChatMvp.css` |
| L-014 | Garde-fou `file_edit` aussi côté moteur Rust | `drox-tools/.../file_edit.rs` |
| E3 | Nudge `LOW_SYNTHESIS_BEFORE_ANSWERING` si première answering >350 car sans `done` | `nudges.rs`, `loop.rs` |

---

## 3. Profil Medium — patchnote (après Low stabilisé)

> **Ne pas remplir en priorité.** Objectif : aucune régression vs comportement legacy ; M5c async en **nudge soft** (pas gate dur mutations).

### 3.1 Checklist smoke Medium

| # | Scénario | OK | Notes |
|---|----------|----|-------|
| 4 | Même scénarios que Low §2.1 — parité Medium | ☐ | |
| — | M5c async : mutations **autorisées** pendant explore running | ☐ | |
| — | Multi-tools par tour (pas plafond 1) | ☐ | |

### 3.2 Incohérences Medium

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| | | | |

_Détail des entrées :_

---

### 3.3 Synthèse Medium

| Métrique | Valeur |
|----------|--------|
| Entrées ouvertes | |
| Blockers | |
| Release candidate ? | ☐ oui ☐ non |

---

## 4. Correctifs appliqués (changelog)

| Date | ID(s) | Résumé | Statut |
|------|-------|--------|--------|
| 2026-05-22 | L-001 | Low : plus d’archive `MemoryPersisted` au jalon todo — uniquement à `[phase: done]` | 🔄 en test |
| 2026-05-22 | L-003, L-013 | UI : ignore reasoning après `answering` ; strip marqueurs parasites ; re-perspective = dernier seul | 🔄 en test |
| 2026-05-22 | L-003 | Moteur Low : clôture auto si `answering` sans `done` (évite 2e tour / bandeau bleu) | 🔄 en test |
| 2026-05-22 | L-004, L-005, L-014 | Gate `MutatingRequiresTodo` Low ; prompt verify + `file_edit` ciblé | 🔄 en test |
| 2026-05-22 | L-006 | Sticky dernier message user (`03b-userPromptSticky.js`) | 🔄 en test |
| 2026-05-22 | L-002 | Coloration keywords basique blocs code (`11-markdown.js`) | 🔄 en test |
| 2026-05-22 | L-007, L-008 | Ancre fil après reroute boucle + détection quasi-répétition Low | 🔄 en test |
| 2026-05-22 | L-009, L-010 | Nudge découpe si prose explore >800 chars sans outil | 🔄 en test |
| 2026-05-22 | L-011 | Nudge pushback si user dit « ça ne marche pas » | 🔄 en test |
| 2026-05-22 | L-012 | `shedOrphanReasoningFromLog` avant stream answering | 🔄 en test |
| 2026-05-22 | L-004 | Gate `LOW_PLAN_REQUIRED_BEFORE_WORK` sur gros chantier (outils bloqués sauf plan/ask/memory) | 🔄 en test |
| 2026-05-22 | L-005 | Nudge `LOW_VERIFY_AFTER_MUTATION_NUDGE` après mutation sans testing | 🔄 en test |
| 2026-05-22 | L-014 | `validateFileEditScope` côté IDE + tests unitaires | 🔄 en test |
| 2026-05-22 | — | Objectif run auto Low depuis prompt user si `run_objective` absent | 🔄 en test |
| 2026-05-22 | L-003, L-006 | UI todos unique + classe `drox-final-answer` | 🔄 en test |
| 2026-05-22 | L-012, L-013 | Exploring replié à `answering` (plus de dump ouvert par défaut) | 🔄 en test |
| 2026-05-22 | L-004 | Widget Plan : compteur fait/total + indent sous-étapes | 🔄 en test |
| 2026-05-22 | L-014 | Garde-fou `validate_edit_scope` moteur Rust (+ tests) | 🔄 en test |
| 2026-05-22 | E3 | Nudge synthèse avant answering longue | 🔄 en test |
| 2026-05-22 | L-001, L-003 | Retrait nudge `run_objective_done_nudge` après `[phase: done]` (boucle) ; persistance = compaction seule | 🔄 en test |
| 2026-05-22 | L-003, L-012, L-013 | UI `runHasFinalAnswer` : raisonnement post-réponse → Exploring replié, pas fil bleu | 🔄 en test |
| 2026-05-22 | L-003 | Clôture auto `done` si réponse déjà publiée (tous profils) | 🔄 en test |
| 2026-05-22 | L-003, L-012, L-013 | Prompt Low unifié (phase map) ; nudge + clôture auto après rapports sous-agents | 🔄 en test |
| 2026-05-22 | — | Orchestration sous-agents : todo → déléguer → synthèse unique ; `file_read`/`file_edit` ciblés documentés | 🔄 en test |

### Politique sauvegarde session (accord produit)

| Déclencheur | Archive `.drox/memory/sessions/` ? |
|-------------|-----------------------------------|
| `/session_end` (utilisateur) | Oui — compaction + mémoire longue côté IDE |
| Contexte plein → compaction live moteur | Oui — `MemoryPersisted` après `ContextCompacted` |
| `[phase: done]` / fin de run | **Non** |
| Jalon `todo_write` tout vert | **Non** |

---

## 5. Journal de session

| Date | Qui | Action |
|------|-----|--------|
| 2026-05-22 | — | Création du patchnote — démarrage campagne stabilisation **Low** |
| 2026-05-22 | testeur | **Session 1** — 14 points remontés → L-001 … L-014 ; triage §2.0 |
| 2026-05-22 | agent | **Chantier Low #1** — correctifs moteur + UI (voir §4) ; retest manuel requis |
| 2026-05-22 | agent | **Chantier Low #2** — boucles, ancrage fil, pushback, découpe prose, reasoning orphelins |
| 2026-05-22 | agent | **Chantier Low #3** — plan gate gros chantier, verify nudge, file_edit scope, objectif auto, UI todos/final answer ; §2.11 prêt pour tests |
| 2026-05-22 | agent | **Chantier Low #4** — repli Exploring, widget Plan, file_edit Rust, nudge E3 synthèse |
| 2026-05-22 | testeur | **Session 2** — boucle clôture analyse repo ; bandeau bleu post-réponse ; archive fin de fil |
| 2026-05-22 | agent | **Chantier Low #5** — fix boucle `done`, politique persistance, UI post-réponse |

---

*Ce document est la source de vérité opérationnelle pour la stabilisation ; les plans M4/M5c restent la référence fonctionnelle, ce patchnote track l’écart réel observé en test.*
