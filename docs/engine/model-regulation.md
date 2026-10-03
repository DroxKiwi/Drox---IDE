# Auto-régulation modèle — notes & référentiel

Sous-système IDE (`contrib/drox/.../regulation/`) : on n’adapte **pas** les capacités du moteur ; on module **ce qu’on expose au modèle** (contexte, tools, directivité, protocole, retrieval).

Plan de livraison : [`docs/1.5/1.5.22/PLAN-MODEL-AUTO-REGULATION.md`](../1.5/1.5.22/PLAN-MODEL-AUTO-REGULATION.md) · clôture [`CLOSURE-1.5.22.md`](../1.5/1.5.22/CLOSURE-1.5.22.md)  
Lecture guidée : [`docs/pedagogie/15-regulation-et-notes.md`](../pedagogie/15-regulation-et-notes.md)  
Code : [`src/vs/workbench/contrib/drox/common/regulation/`](../../src/vs/workbench/contrib/drox/common/regulation/)

---

## 1. Principe

| Ce n’est pas | C’est |
|--------------|--------|
| Sampling, permissions, choix du modèle | Budget contexte, surface tools, ton system, strictesse protocole, posture retrieval |
| « Le user est content » | Réussite / stress **moteur** (outils, format, loops, cancel…) |

Chaque run terminé (`agent/done`, **chat IDE + Agents**) produit des **notes** et une entrée d’**historique**.  
**Auto ON/OFF** ne change **pas** la sonde : Auto ne décide que si le **module** du levier suit la policy.

---

## 2. Leviers L1–L5

| Id | Levier | Modules |
|----|--------|---------|
| **L1** | Context budget | `minimal` · `compact` · `standard` · `rich` |
| **L2** | Tool surface | `core` · `standard` · `full` |
| **L3** | Directive density | `laissez-faire` · `guided` · `assertive` |
| **L4** | Protocol strictness | `soft` · `normal` · `strict` |
| **L5** | Retrieval posture | `passive` · `nudge` · `aggressive` |

- **Auto** : interrupteur **par levier**.  
- **Override manuel** : choisir un module **fige** le levier jusqu’à réactivation Auto.  
- Wrappers (R6–R10) lisent uniquement `getModule(Lx)`.

---

## 3. Échelle des notes

- Chaque levier : **0–100** pour **un** run.  
- **100** = aucun stress détecté sur cet axe.  
- On **part de 100** et on **retire** des points (formules v0 dans `droxRegulationScorer.ts`).  
- **Note globale run** = moyenne non pondérée des 5 leviers.  
- **Agrégat UI** (par `modelKey` = `provider::model`) = moyenne glissante des runs ; `n=` = nombre de samples.  
- Sans aucun run scoré : affichage neutre **50 / 0 runs** (placeholder, pas une mesure).

### Bandes UI

| Score | Bande |
|------:|--------|
| ≥ 75 | `good` |
| ≥ 50 | `warn` |
| &lt; 50 | `bad` |

---

## 4. Pipeline d’analyse (code)

```text
agent/done (status, error, runId)
        │
        ├─ session.read → engineTrace, uiStats, messages   (best-effort)
        │
        ▼
buildDroxRegulationRunSignals(…)     ← droxRegulationRunSignals.ts
        │
        ▼
scoreRegulationRun(signals)          ← droxRegulationScorer.ts
        │  scoreRegulationL1…L5 → chacun 0–100 (clamp)
        │  scoreRegulationGlobal = moyenne des 5
        ▼
recordRun → agrégat modelKey + history.json
```

### 4.1 Construction des signaux

`buildDroxRegulationRunSignals` **ne relit pas** le prompt pour juger la qualité prose. Il **agrège** des compteurs déjà produits ailleurs :

| Signal | Comment le code le remplit |
|--------|----------------------------|
| `issue` | `extractDroxRegulationRunIssue(status, error)` : `cancel`/`cancelled` → `cancel` ; erreur loop détectée → `loop` ; `status === error` → `error` ; sinon `ok` |
| `schemaErrorContinueCount` | Dernier enregistrement `engineTrace` de kind `run_summary` → champ homonyme (défaut 0) |
| `textToolMarkerStreak` | Idem `run_summary` |
| `llmIterations` | Idem `run_summary` |
| `expectsWorkspaceMutation` | Booléen `run_summary` (le moteur a classé la tâche comme mutation) |
| `greetingOnly` | Booléen `run_summary` |
| `contextTokens` | `uiStats.ctx` (compteur UI session), sinon 0 |
| `toolErrorCount` | Parcourt les messages `role: tool` : chaque `tool_result` avec `is_error` incrémente |
| `usedCodebaseSearch` | Parcourt les `tool_use` assistant : nom `codebase_search` |
| `usedRetrievalTools` | Idem si nom ∈ `{ codebase_search, grep, glob, lsp }` |

Si la lecture session échoue, seuls `issue` (+ zéros) restent → notes souvent proches de 100 sauf error/cancel/loop.

---

## 5. Par levier — analyse puis note (v0)

Pattern commun : `let score = 100` → soustractions → `clamp` / arrondi.

### L1 — Context budget (`scoreRegulationL1`)

**Intention** : le modèle tient-il le format tools sous charge de contexte ?

**Analyse** : lit `schemaErrorContinueCount`, `textToolMarkerStreak`, `contextTokens`, `issue`.

| Étape code | Effet |
|------------|------:|
| −14 × `schemaErrorContinueCount` | Chaque reprise après erreur de schéma |
| −10 × `textToolMarkerStreak` | Outils « en clair » au lieu d’appels structurés |
| `contextTokens` &gt; 48k / 24k / 12k | −18 / −10 / −4 (un seul palier) |
| `issue === cancel` | −12 |
| `issue === error` **et** schéma &gt; 0 | −8 |

### L2 — Tool surface (`scoreRegulationL2`)

**Intention** : la palette d’outils est-elle bien utilisée (pas de loop / erreurs) ?

**Analyse** : schéma + markers + `toolErrorCount` (transcript) + `issue`.

| Étape code | Effet |
|------------|------:|
| −16 × schéma | Plus cher qu’en L1 |
| −12 × markers texte | Idem |
| −8 × `toolErrorCount` (max −40) | Résultats outils en erreur |
| `issue === loop` | −35 |
| `issue === error` et au moins 1 tool error | −10 |

### L3 — Directive density (`scoreRegulationL3`)

**Intention** : proxy de rumination (trop de tours LLM, surtout sur trivial).

**Analyse** : `greetingOnly`, `llmIterations`, `issue`.

| Étape code | Effet |
|------------|------:|
| Greeting **et** `llmIterations` &gt; 2 | −25 |
| `llmIterations` &gt; 12 / 8 / 5 | −20 / −12 / −5 (un seul palier) |
| `issue === loop` | −15 |

### L4 — Protocol strictness (`scoreRegulationL4`)

**Intention** : sur une tâche **mutation**, le run se termine-t-il proprement ?

**Analyse** : si `expectsWorkspaceMutation` alors pénalise `error` / `cancel` / tool errors ; `loop` toujours.

| Étape code | Effet |
|------------|------:|
| Mutation + `error` | −22 |
| Mutation + `cancel` | −14 |
| Mutation + tool errors | −6 chacune (max −24) |
| `loop` (même hors mutation) | −12 |

Run **sans** `expectsWorkspaceMutation` : seule la pénalité `loop` peut appliquer → souvent **100**.

### L5 — Retrieval posture (`scoreRegulationL5`)

**Intention** : tâche « code » sans chercher dans le repo = stress retrieval.

**Analyse** : `codeTask = expectsWorkspaceMutation && !greetingOnly`, puis scan transcript des tools retrieval.

| Étape code | Effet |
|------------|------:|
| `codeTask` et aucun retrieval tool | −18 |
| `codeTask` et pas de `codebase_search` | −8 (cumulable avec la ligne dessus) |
| `error` + `codeTask` + aucun retrieval | −10 |

Hors `codeTask` → **100** (pas de jugement retrieval).

### Globale

`scoreRegulationGlobal` = moyenne arrondie/clampée des cinq notes **du même run** (pas des agrégats UI).

---

## 6. Policy Auto (note → module)

`recommendDroxRegulationModule` — **uniquement** si le levier est en mode `auto`.  
Score **haut** → posture légère / offre plus riche. Score **bas** → on serre.

| Levier | Seuils (approx.) → modules |
|--------|----------------------------|
| L1 | ≥80 `rich` · ≥55 `standard` · ≥35 `compact` · sinon `minimal` |
| L2 | ≥75 `full` · ≥45 `standard` · sinon `core` |
| L3 | ≥75 `laissez-faire` · ≥45 `guided` · sinon `assertive` |
| L4 | ≥75 `soft` · ≥45 `normal` · sinon `strict` |
| L5 | ≥75 `passive` · ≥45 `nudge` · sinon `aggressive` |

La console peut afficher `suggest …` même en Auto OFF ; l’application n’a lieu qu’en Auto ON.

---

## 7. Persistance & UI

| Élément | Emplacement |
|---------|-------------|
| History | `.drox/regulation/history.json` (sous la **racine discussion**) |
| Surface (modules / modes) | `.drox/regulation/surface.json` |
| Console IDE | Vue Activity Bar **Regulation** |
| Console Agents | Même vue + icône toolbar historique + chip composer |
| Sonde | `electron-browser/droxRegulationProbeContribution.ts` (+ bridge Agents) |

Au chargement d’une racine, les agrégats de notes sont **reconstruits** depuis l’historique.  
Côté Agents, `setActiveWorkspaceResource` + `ensureHistoryLoaded` suivent la session active (voir [codebase-and-rag.md](codebase-and-rag.md) §4 et [`PLAN-AGENTS-PARITY.md`](../1.5/1.5.22/PLAN-AGENTS-PARITY.md)).

---

## 8. Fichiers clés

| Fichier | Rôle |
|---------|------|
| `droxRegulationRunSignals.ts` | Extraction signaux |
| `droxRegulationScorer.ts` | Formules L1–L5 + globale |
| `droxRegulationScoreAggregate.ts` | Moyenne glissante par modèle |
| `droxRegulationAutoPolicy.ts` | Note → module (Auto) |
| `droxRegulationService.ts` | Sonde + history + surface |
| `droxRegulationProbeContribution.ts` | `agent/done` → `recordRun` |
| `browser/regulation/*` | Console Observatory |
