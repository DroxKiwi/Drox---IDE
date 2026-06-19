# Plan 1.4.3 — Boucle « analyser le répertoire » (routage Auto)

**Statut** : **F1 validé** (smoke [`SMOKE-ses_7df5045c`](SMOKE-ses_7df5045c.md) · run 2 OK) — implémentation reportée en **1.4.3** après réflexion [1.4.2](../1.4.2/README.md)  
**Priorité** : **P0** — bloque la dogfood 1.4.3 avant UI chat et signature Windows  
**Branche** : `1.4.3`  
**Prérequis** : [1.4.1](../1.4.1/README.md) livrée · intent probe + rail EDIT en place (1.4.1)

---

## Résumé exécutif

Sur le brief **« Salut, tu peux analyser le répertoire ? »** (mode vignette **Auto**), le run part en **`architect_edit`** avec **`expects_workspace_mutation: true`**, reste bloqué en station **READ**, répète lectures / `internal_plan_write`, produit des analyses en prose stream **sans** `[phase: answering]` + `[phase: done]`, puis s’arrête (`run stopped`) **sans réponse utilisateur canonique**.

Le pattern se reproduit sur **plusieurs modèles** → cause **structurelle** (conducteur + routage), pas un défaut d’un LLM particulier.

**Exigence produit** : corriger le comportement en **Auto** — pas de contournement par mode Discussion forcé côté utilisateur.

---

## Preuve (dogfood)

| Élément | Valeur |
|---------|--------|
| Export | [`chat_north-mini-code`](../chat_north-mini-code) (session `ses_e6c1001f…`, workspace `site-kdds`) |
| Message utilisateur | « Salut, tu peux analyser le répertoire ? » |
| Mode IDE | Auto (`architectInteractionMode` non forcé) |
| Build moteur | `drox.exe` debug · git `bed7e63` (export du 2026-06-18) |
| Itérations LLM | **0 → 16** |
| Événements UI journal | **518** |
| Fin | `Drox: run stopped.` — **aucun** bloc USER-FACING REPLY canonique |

### Trace moteur (Partie E — run routing)

```text
Architect gate: architect_edit
Start run: edit
Greeting only: false
Expects workspace mutation: true
Intent source: llm
```

### Séquence observée

```text
iter 0–1   INTENT     → internal_plan_write (outil seul)
iter 1     ERROR      → statuts invalides ": pending" (1er plan)
iter 2     OK         → plan remplacé
iter 3     RAIL       → INTENT done → READ enter
iter 4–16  READ       → file_read, grep, 5× internal_plan_write, analyses Markdown répétées
jamais              → [gate: hold] | [phase: answering] | [phase: done]
fin                 → run stopped
```

### Ce que le modèle « comprend » (iter 11–16)

Le thinking stream montre que le modèle **sait** que l’utilisateur voulait une analyse, qu’il **n’a pas besoin d’éditer**, mais les **nudges rail READ** continuent de demander mutation / `[gate: advance]` vers ACT.

---

## Modèle mental attendu vs réel

| Attendu (brief analyse, Auto) | Réel (export) |
|---------------------------------|---------------|
| Probe → `expects_workspace_mutation: false` | Probe → **`true`** |
| Auto → discuss avec lectures ou analyze | Auto → **`edit`** |
| READ → synthèse → ANSWER | READ → boucle + nudges « mutez » |
| Réponse dans `[phase: answering]` | Analyses en **stream content** seulement |
| Run `done` avec réponse chat | **`run stopped`** sans reply canonique |

---

## Causes identifiées (par priorité)

### C1 — `gate_chain_for_auto` ignore `expects_workspace_mutation` (P0 structurel)

Fichier : `drox-engine/drox/crates/drox-engine/src/orchestration/intent_probe/resolve.rs`

Logique actuelle :

- `greeting_only` → `DiscussReplyOnly`
- **tout le reste** → `Edit`

Le champ `expects_workspace_mutation` est **calculé** par le probe (et exposé dans la trace / RPC) mais **non utilisé** pour le routage Auto.

Conséquence : *toute* question repo (hors salut pur) passe par le rail **EDIT** complet (`internal_plan_write` obligatoire, nudges mutation, etc.).

**Référence test existant** : le cas `DiscussWithReads` n’est testé qu’en **RPC** `ArchitectGate::Discuss`, pas en Auto (`start_run.rs` tests).

---

### C2 — Intent probe sur-classifie « analyser » (P1, amplificateur)

Fichier prompt : `orchestration/prompts/system/blocks/intent/run_intent_probe.md`

Règle explicite (l.29) : analyse / explication **sans** edits → `expects_workspace_mutation: false`.

Sur ce run, le probe LLM a renvoyé **`true`** malgré un brief sans verbe de modification. Causes possibles :

- confusion « analyser le répertoire » = travail « sérieux » → mutation ;
- salutation composée (« Salut, … ») ;
- variabilité du petit modèle probe (96 tokens max).

Même avec un probe parfait, **C1** empêche toutefois le bon rail tant que `gate_chain_for_auto` n’est pas corrigé.

---

### C3 — Closure : pas de `[phase: answering]` + gate `done_requires_answering` (P1 comportement run)

Le moteur exige une réponse canonique (`[phase: answering]` puis `[phase: done]`) — voir `RunSpec` / `gate_done_requires_answering`.

Le modèle rédige de longues analyses **hors** ce canal (exploration / content stream). Le run ne se termine pas proprement ; l’UI n’a pas de **USER-FACING REPLY**.

---

### C4 — Nudges READ inadaptés quand le brief n’est pas une édition (P1–P2)

Fichier : `agent/nudges/stall_read.rs`

Messages du type *« you have spent many turns exploring without mutating »* / *« Further file_read alone will not satisfy an edit request »*.

Sur un brief analyse, ces nudges **contredisent** l’intention utilisateur et poussent vers ACT au lieu de `[gate: hold]` + réponse.

---

### C5 — Friction `internal_plan_write` (P2, aggravant)

- Erreur schéma au 1er tour (`": pending"` au lieu de `pending`) — tour perdu.
- **5 réécritures** du même plan en station READ — nudges « refresh notebook » alors que l’exploration est déjà suffisante.

---

## Schéma de la boucle

```mermaid
flowchart TD
    U[User: analyser le répertoire] --> P[Intent probe LLM]
    P --> G[gate_chain_for_auto]
    G -->|non greeting_only| E[StartRunKind::Edit]
    E --> IP[internal_plan_write requis]
    IP --> R[Station READ]
    R --> T[file_read / grep / replan]
    T --> S[Analyse en prose stream]
    S --> Q{[phase: answering]?}
    Q -->|Non| N[Nudge: muter / advance]
    N --> R
    Q -->|Jamais| X[run stopped]
```

---

## Pistes de fix (à discuter — pas de décision ici)

> **2026-06-18** — **F1 livré** : `gate_chain_for_auto` branche sur `expects_workspace_mutation` ; exemples probe FR/EN analyse seule. **F3** déjà couvert (`mutation_expected` + pas de rail EDIT en discuss).

### F1 — Routage Auto sur `expects_workspace_mutation` ✅ fait

`gate_chain_for_auto` :

| Flags | Gate / StartRunKind |
|-------|---------------------|
| `greeting_only` | `Discuss` / `DiscussReplyOnly` |
| `!greeting_only && !expects_workspace_mutation` | `Discuss` / `DiscussWithReads` |
| `!greeting_only && expects_workspace_mutation` | `Edit` |

Fichiers : `intent_probe/resolve.rs`, `start_run.rs`, `run_intent_probe.md`, tests `runner.rs`.

---

### Pistes restantes (si dogfood insuffisant)

- Exemples FR/EN/DE supplémentaires : *analyser / explorer / décrire le repo* sans edit → `false`.
- Fallback après échec JSON : aujourd’hui `expects_workspace_mutation: true` — discuter d’un fallback **moins agressif** pour briefs ambigus.
- Option : heuristique légère post-probe (mots-clés mutation FR/EN) **uniquement** si probe LLM échoue — à évaluer (risque faux négatifs).

**Fichiers** : `run_intent_probe.md`, `flags.rs`, `runner.rs` (tests).

---

### F3 — Nudges READ sensibles au `StartRunKind` / flags (C4)

- Ne pas injecter `READ_STALL_*_mutating` quand `!expects_workspace_mutation` ou run `DiscussWithReads` / `Analyze`.
- Remplacer par nudge closure : *emit `[gate: hold]` + `[phase: answering]` now*.

**Fichiers** : `stall_read.rs`, appelants dans le drive rail.

---

### F4 — Promotion / détection réponse analysable (C3) — optionnel, risqué

- Détecter une synthèse suffisante en stream et forcer transition ANSWER — **heuristique fragile**.
- À traiter seulement si F1–F3 insuffisants ; préférer le bon rail + prompts discuss.

---

### F5 — `internal_plan_write` sur brief analyse (C5)

- Si routage `DiscussWithReads` / `Analyze` : **ne pas** exiger `internal_plan_write` en INTENT (aligné FOI discuss).
- Tolérance schéma / normalisation statuts (`: pending` → `pending`) — option séparée.

---

## Hors scope / rejet explicite

| Approche | Statut |
|----------|--------|
| Forcer la vignette **Discussion** côté utilisateur | **Rejeté** (exigence produit) |
| Baisser `max_iterations` sans corriger le rail | Masque le symptôme |
| Désactiver `gate_done_requires_answering` globalement | Régression qualité closure edit |

---

## Critères d’acceptation (brouillon — à valider après choix de fix)

Scénarios **Auto**, workspace réel ou fixture :

| ID | Brief | Résultat attendu |
|----|-------|------------------|
| A1 | « Salut, tu peux analyser le répertoire ? » | Pas de rail EDIT ; réponse utilisateur visible ; pas de `run stopped` sans reply |
| A2 | « Explique comment est structuré ce projet » | Idem |
| A3 | « Salut » seul | `DiscussReplyOnly`, pas d’outils |
| A4 | « Analyse le projet et ajoute une transition SVG » | Reste **Edit** ; mutation attendue |
| A5 | Export transcript A1 | `expects_workspace_mutation: false` (si F2) ; gate ≠ `architect_edit` (si F1) |

Métriques dogfood :

- Itérations LLM **&lt; 8** pour A1/A2 sur modèles cibles (north-mini, qwen, …).
- Zéro nudge « without mutating » sur runs A1/A2.

---

## Séquence 1.4.3 proposée

```text
1. Décision fix (F1 ± F2 ± F3)     ← discussion en cours
2. Implémentation + tests Rust
3. Re-dogfood chat_north-mini-code + site-kdds
4. Puis : UI B-UI-* + signature Windows (PLAN-1.4.3.md)
```

---

## Fichiers code de référence

| Zone | Chemin |
|------|--------|
| Routage Auto | `orchestration/intent_probe/resolve.rs` |
| Flags probe | `orchestration/intent_probe/flags.rs` |
| Prompt probe | `orchestration/prompts/system/blocks/intent/run_intent_probe.md` |
| StartRunKind | `orchestration/start_run.rs` |
| Nudges READ | `agent/nudges/stall_read.rs` |
| Rail EDIT prompt | `orchestration/prompts/system/blocks/edit/01_core_rail_solo.md` |
| Gate done | `run_spec/mod.rs` (`done_requires_answering`) |

---

## Liens

- [README 1.4.3](README.md)
- [PLAN 1.4.3 (UI + signature)](PLAN-1.4.3.md)
- [Intent probe — doc moteur](../moteur/) (si présent)
- Export dogfood : [`chat_north-mini-code`](../chat_north-mini-code)
