# Plan — Auto-régulation moteur ↔ modèle (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : 📋 cadrage · **R0–R11 ✅** · AG / DOC (§9 + README) · PF/THEME → [1.5.23](../1.5.23/README.md)  
**Remplace** : ancien plan « tool calling universel » (abandonné)

## 0. Principe produit

**On n’adapte pas les capacités du moteur.**  
On adapte **ce qu’on met à disposition du modèle** (charge cognitive) pour l’aider à rester pertinent.

| Ce n’est pas | C’est |
|--------------|--------|
| Sampling, permissions, choix modèle, maxIterations « hard » | Contexte injecté, présentation des tools, directivité du system, strictesse protocole, posture retrieval |
| Couper des features parce que le modèle est « nul » | Alléger / clarifier l’offre quand le modèle est fragile |

Exemples :

- Modèle ~9B : long contexte → perte d’appels d’outils / hallucinations → **réduire le budget contexte** + **simplifier la surface tools**.  
- Think 30 s puis `ls` trivial → **system plus directif**.

---

## 1. Leviers (L1–L5) — hors paramétrage utilisateur

| Id | Levier | Ce qu’on module | Modules (échelons discrets) |
|----|--------|-----------------|----------------------------|
| **L1** | Context budget | Volume de contexte « offert » (historique utile, memory, pack Codebase, annexes) | `minimal` · `compact` · `standard` · `rich` |
| **L2** | Tool surface | Nombre + **présentation** (descriptions / schémas courts vs longs) | `core` · `standard` · `full` |
| **L3** | Directive density | Ton system : souple → très directif (anti-rumination) | `laissez-faire` · `guided` · `assertive` |
| **L4** | Protocol strictness | Rappel / gate phases & todos avant mutation | `soft` · `normal` · `strict` |
| **L5** | Retrieval posture | Hint / pression retrieval | `passive` · `nudge` · `aggressive` |

**Exclus** : sampling, permissions, sélection modèle, réglages user « métier » hors leviers.

---

## 2. Auto, override, N_min

| Règle | Décision |
|-------|----------|
| **Auto** | **Par levier** (5 switches indépendants) |
| **Override manuel** | Choisir un module à la main **fige** ce levier : Auto ne le touche plus jusqu’à réactivation Auto |
| **N_min** | **Dès le 1er run** : la note existe ; tant que Auto est ON sur le levier, le module **peut bouger en continu** |
| **Cohérence** | Bundles recommandés documentés ; Auto peut dévier levier par levier |

---

## 3. Architecture code — **découplage obligatoire**

Sous-système isolé : **sonde + store historique + policy + console + wrappers**.

```
┌──────────────────────────────────────────────────────────┐
│  contrib/drox/.../regulation/                            │
│  types · scorer · history store · policy · console UI    │
└───────────────┬───────────────────────────┬──────────────┘
     observe    │                           │ apply (wrappers)
                ▼                           ▼
     events run/tool/inject/…      bords: system / tools /
                                   inject / protocol
```

### 3.1 Sonde

- Lit des événements déjà émis.  
- Produit notes **par levier** + **note globale run**.  
- Persiste une **entrée d’historique par prompt/run**.  
- **Aucune** mutation du run.

### 3.2 Wrappers

- Bords minces : `getModule(Lx)` → application.  
- Override manuel / Auto OFF / Auto ON — voir §2.  
- Zéro logique de scoring hors `regulation/`.

### 3.3 Règles de découplage

1. Pas de scoring dans `agent.rs` / services unrelated.  
2. Package `regulation` unique (common + browser console).  
3. Contrats : `IDroxRegulationProbe` · `IDroxRegulationHistory` · `IDroxRegulationSurface`.  
4. Producteurs d’events ignorants du régulateur.  
5. Tests scorer / history / policy sans workbench.

---

## 4. Notes & signaux

Échelle **0–100** par levier + **note globale run** (moyenne).  
**Référentiel formules v0 (source de vérité doc)** : [`docs/engine/model-regulation.md`](../../engine/model-regulation.md) · pédagogie : [`15-regulation-et-notes.md`](../../pedagogie/15-regulation-et-notes.md).

| Levier | Signaux « mal » |
|--------|-----------------|
| L1 | Tools invalides après gros contexte ; perte de format ; cancel mid-tool |
| L2 | Mauvais outil / args hallucinés / retries cosmétiques (loop) |
| L3 | Think long puis tool trivial |
| L4 | Mutation sans phase / todo |
| L5 | 0 retrieval utile sur tâche code ; Forced fréquent |

---

## 5. Console de régulation (UI)

Emplacement : **onglet Activity Bar dédié** « Regulation » (pas une section du cockpit Codebase).

### 5.1 Rôle

Console = **observatoire moteur** + **pilotage des leviers** + **mémoire dans le temps**.

Pas un dashboard marketing : lecture **réussite / échec purement moteur** (outils, contexte, protocole, retrieval, directivité), pas « le user est content ».

### 5.2 Bloc Leviers (live)

Pour **chaque L1–L5** :

- Note live + `n` samples  
- Select **module** (override manuel)  
- Toggle **Auto** (par levier)  
- Suggestion colorée du module recommandé (vert / orange / rouge)

### 5.3 Historique par prompt / run

Chaque run (prompt utilisateur → fin de run) est **historisé** avec :

| Champ | Contenu |
|-------|---------|
| Identité | timestamp, sessionId, runId, extrait prompt |
| Environnement | `provider` + `modelId` (+ workspace root optionnel) |
| Modules effectifs | L1–L5 modules au moment du run |
| Notes | L1–L5 + **note globale** |
| Issue moteur | ok / error / cancel / loop (+ codes courts) |

Liste consultable (filtre modèle / période) : voir **dans le temps** l’impact du sérieux du modèle et de son environnement sur le projet.

### 5.4 Statistiques & graphiques

- Courbe **note globale** dans le temps (par modèle et/ou agrégé workspace).  
- Séries par levier (sparkline ou multi-lignes).  
- Répartition issues (ok / error / loop / cancel) — code couleur.  
- Comparaison optionnelle modèle A vs B (si assez de samples).

Couleurs : succès moteur vs échec / dérive (alignées suggestions modules).

### 5.5 Persistance

- Store local **par racine discussion** : `.drox/regulation/` (history + surface).  
- Pas de télémétrie cloud dans le cadrage 1.5.22.

### 5.6 Parité Agents (AG)

- Même service + même vue sidebar **Regulation**.  
- Entrées Agents : icône toolbar historique session + chip composer.  
- Au focus session : `setActiveWorkspaceResource` + `ensureHistoryLoaded(root)`.  
- Voir [`PLAN-AGENTS-PARITY.md`](PLAN-AGENTS-PARITY.md) et [`docs/engine/model-regulation.md`](../../engine/model-regulation.md).

---

## 6. Critères d’acceptation

1. Auto OFF partout → parity moteur.  
2. Package `regulation` découplé ; wrappers = bords.  
3. Override manuel non écrasé par Auto.  
4. Dès le 1er run : notes + entrée historique.  
5. Console : leviers + historique + au moins un graphique note globale.  
6. Formules scorer documentées + tests.

---

## 7. Hors scope

- Sampling / permissions / fine-tune.  
- SAV erreurs chat.  
- Universalisation tool calling.  
- « Score bonheur utilisateur » subjectif.

---

## 8. Décisions figées (rappel)

| Sujet | Choix |
|-------|--------|
| Leviers | L1–L5 |
| Auto | Par levier |
| Override | Manuel fige le levier |
| N_min | Dès le 1er run ; Auto peut bouger tout de suite |
| Console | Scores + override + histo prompts + graphiques |
| Code | Sonde / history / policy / console / wrappers découplés |

---

## 9. Roadmap — **une étape à la fois**

Ordre volontairement séquentiel : chaque étape livre quelque chose de **testable** sans tirer toute la feature.

| Étape | Livrable | Done quand |
|-------|----------|------------|
| **R0** | Scaffold `regulation/` : types L1–L5, modules, contrats vides, README package | ✅ types + Probe/History/Surface + stub Delayed + test smoke |
| **R1** | **Sonde + scorer** : events → notes L1–L5 + globale (formules v0 + tests unitaires) | ✅ `droxRegulationScorer` + `agent/done` contribution + tests |
| **R2** | **History store** : 1 entrée / run (prompt extrait, notes, modules, issue, model) | ✅ `.drox/regulation/history.json` + tests |
| **R3** | **Console observatoire** : onglet Regulation — leviers (notes + couleurs) + liste historique | ✅ view sidebar dédiée + live scores/histo ; **aucun Auto apply** |
| **R4** | **Graphiques** : note globale dans le temps + breakdown issues (couleur) | ✅ sparkline SVG + barre issues sur histo |
| **R5** | **Overrides UI** : select module + Auto par levier (state persisté) — **encore sans wrap moteur** | ✅ `surface.json` + select/Auto cockpit |
| **R6** | **Wrapper L1** Context budget | ✅ inject Codebase (`maxChars`/`maxHits`) + session notes truncate/omit via `getModule('L1')` |
| **R7** | **Wrapper L2** Tool surface | ✅ allowlist `core`/`standard`/`full` → `disabledTools` + executable filter |
| **R8** | **Wrapper L3** Directive density | ✅ annex system `laissez-faire` (omit) / `guided` / `assertive` via `getModule('L3')` |
| **R9** | **Wrapper L4** Protocol strictness | ✅ annex system `soft` (omit) / `normal` / `strict` via `getModule('L4')` |
| **R10** | **Wrapper L5** Retrieval posture | ✅ hint Codebase `passive` / `nudge` / `aggressive` via `getModule('L5')` |
| **R11** | **Policy Auto** branchée (note → module) + dogfood multi-modèles + polish console | ✅ `droxRegulationAutoPolicy` après `recordRun` ; manuel figé ; suggest UI |
| **R12** | **Pass docs fin de maj** : relire et mettre à jour / compléter la documentation au regard de **1.5.21 + 1.5.22** (pédagogie, `docs/engine`, README 1.5.x, CLOSURE, surface utilisateur) | Docs alignées sur le livré ; plus de mentions obsolètes (ex. Explore « depuis 1.5.21 » si non câblé, OR releases, etc.) |

**Règle d’or** : ne pas démarrer Rn+1 tant que Rn n’est pas smoke-ok.  
**Interdit** : mélanger scorer dans les wrappers, ou UI avant store/types stables (sauf stubs R0).  
**R12** se fait **en toute fin de 1.5.22** (après R11, puis **AG** parité Agents — voir [README](README.md)), pas au milieu de la régulation. **PF** / **THEME** → [1.5.23](../1.5.23/README.md).

---

## 10. Suite immédiate

1. ~~Cadrage~~ · ~~**R0–R11**~~.  
2. Fin de maj 1.5.22 : **AG** → **DOC** (R12) — voir [README](README.md). PF/THEME → [1.5.23](../1.5.23/README.md).
