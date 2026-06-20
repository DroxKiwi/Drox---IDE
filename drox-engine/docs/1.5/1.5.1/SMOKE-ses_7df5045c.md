# Smoke `ses_7df5045c` — Routage F1 + session multi-tours (north-mini)

**Version** : juin 2026 — branche `1.5.1` · pilier **routage Auto**  
**Statut** : **analysé** — F1 validé sur run 2 ; run 3 expose des régressions EDIT distinctes  
**Export** : [`chat_north-mini-code`](../../chat_north-mini-code) (PARTIE A + B + C · 17 096 lignes)  
**Plan cible** : [PLAN-1.5.1-ROUTING-ANALYZE-LOOP.md](PLAN-1.5.1-ROUTING-ANALYZE-LOOP.md)

> Session dogfood **3 tours** dans le même chat, workspace `site-kdds`, binaire debug **`1.4.1.1781809204`** (git `f82e92f`, compilé 2026-06-18T19:00:04Z).  
> À comparer : export pré-F1 [`ses_e6c1001f`](../../chat_north-mini-code) (même brief analyse → boucle EDIT 16 iter, `run stopped`).

---

## Contexte du run

| Champ | Valeur |
|-------|--------|
| **Session** | `ses_7df5045c-272e-45ea-912e-2e634fa636bf` |
| **Workspace** | `c:\Users\coren\Desktop\GitHub\site-kdds` |
| **Build moteur** | `1.4.1.1781809204` · git `f82e92f8f3b` · `drox.exe` debug |
| **Tours utilisateur** | **3** (salut · analyse repo · moderniser background) |
| **Tokens session** | **42 241 in** / **1 312 out** / **22 431 ctx** |
| **Journal UI** | 1 450 événements · **502** steps structurés (PARTIE A) |
| **Transcript moteur** | 72 messages · 32 tool results indexés (PARTIE B) |

### Briefs utilisateur

| Run | Message (abrégé) |
|-----|------------------|
| 1 | « Salut ! » |
| 2 | « Tu peux analyser le répertoire de code ? » |
| 3 | « J'ai un problème avec mon background animé … tu peux le moderniser ? … pas trop gourmand cpu/gpu … produit Drox fork vscode » |

### Verdict synthétique (session)

| Run | Routage attendu | Routage observé | Livraison | Verdict |
|-----|-----------------|-----------------|-----------|---------|
| **1** | `discuss_reply_only` | ✅ `architect_discuss` · greeting_only | Réponse courte | ✅ **OK** (fuite thinking mineure) |
| **2** | `discuss_with_reads` | ✅ `architect_discuss` · mutation false | USER-FACING REPLY + `busy: false` | ✅ **F1 validé** |
| **3** | `edit` | ✅ `architect_edit` · mutation true | Aucune mutation · pas de réponse canonique | ❌ **ÉCHEC EDIT** |

**Lecture globale** : le fix **F1** (`gate_chain_for_auto` → `DiscussWithReads` quand `!expects_workspace_mutation`) corrige la régression P0 du run « analyser le répertoire ». Le run 3 montre des problèmes **orthogonaux** sur le rail EDIT (gate `read_workspace`, schéma `file_edit`, boucle schema_error) — hors périmètre F1 mais bloquants pour dogfood mutation.

---

## Méthode d'analyse

Croisement des trois parties de l'export :

| Source | Usage dans ce smoke |
|--------|---------------------|
| **PARTIE A** | Steps `RUN ROUTING`, `ROLE`, `RAIL STATION`, `USER-FACING REPLY`, diagnostic fin run 3 |
| **PARTIE B** | Tool calls / results chronologiques, args JSON réels, contenu `file_read` |
| **PARTIE C** | JSONL brut (`runRouting`, `orchestrationRole`, compteurs engine) |

Indices de repérage :

1. **F1** — step `RUN ROUTING` run 2 : `startRun: discuss_with_reads`, `expectsWorkspaceMutation: false` (événement `#26` PARTIE C).
2. **Boucle pré-F1** — run 2 **ne** passe **pas** par `architect_edit` ni station READ bloquée (contrairement à `ses_e6c1001f`).
3. **Échec EDIT** — run 3 : `schema_error_continue_count: 12`, 18/39 tool calls en erreur, phase finale `internal_reasoning`, **aucun** `USER-FACING REPLY` run 3.

---

## Run 1 — Salutation

### Routage

```text
Architect gate: architect_discuss
Start run: discuss_reply_only
Greeting only: true
Expects mutation: false
Role: architect_discussion
```

### Exécution

- **1** itération LLM (`iter 0`).
- Aucun outil appelé (conforme aux règles discussion).
- `USER-FACING REPLY` livré · `busy: false`.

### Anomalie mineure (B-REPLY-02)

La réponse canonique contient une fuite de raisonnement interne :

```text
Thus I will just respond politely.Bonjour ! Comment puis-je vous aider aujourd'hui ?
```

Le préfixe anglais provient du thinking ; seul « Bonjour ! … » devrait être exposé.

| Critère | Résultat |
|---------|----------|
| Routage salut | ✅ |
| Pas d'outils | ✅ |
| Clôture run | ✅ |
| Qualité réponse affichée | ⚠️ fuite thinking |

---

## Run 2 — « Analyser le répertoire de code » (validation F1)

### Routage — preuve F1

```text
Architect gate: architect_discuss
Start run: discuss_with_reads
Greeting only: false
Expects mutation: false
Intent source: llm
Role: architect_discussion
```

**Comparaison pré-F1** (`ses_e6c1001f`, même intention utilisateur) :

| | Pré-F1 | Post-F1 (ce smoke) |
|--|--------|-------------------|
| Gate | `architect_edit` | `architect_discuss` |
| Start run | `edit` | `discuss_with_reads` |
| `expects_workspace_mutation` | `true` (incorrect) | `false` ✅ |
| Itérations | 16 · boucle READ | **5** (`iter 0`–`4`) |
| USER-FACING REPLY | ❌ absent | ✅ step 84 |
| Fin | `run stopped` | `busy: false` |

### Séquence observée

```text
iter 0   workspace_map_read  → OK (arbre 54 nœuds, app-kdds-main/…)
iter 1–3 file_read × 6       → OK (package.json, page.tsx, layout, animated-background, utils, …)
iter 4   synthèse            → USER-FACING REPLY (analyse Markdown structurée)
```

Outils en mode discussion : `file_read`, `workspace_map_read`, `grep`, `lsp`, `memory_*` — **pas** de rail INTENT/READ/ACT, **pas** de `internal_plan_write` obligatoire.

### Livrable utilisateur

- Réponse longue en anglais (stack Next.js 16, structure `src/`, Framer Motion, etc.).
- Question de relance : « Would you like me to dive deeper… »
- **~10 008 tokens in** / **1 016 out** pour ce tour (step 83).

### Écarts mineurs (non bloquants F1)

| ID | Observation | Gravité |
|----|-------------|---------|
| B-LANG-01 | Brief FR · réponse EN | P3 |
| B-PATH-02 | Arborescence décrite en `src/` alors que les chemins réels sont `app-kdds-main/src/` | P2 |

| Critère | Résultat |
|---------|----------|
| F1 routage analyse | ✅ **validé** |
| Lecture repo réelle | ✅ |
| Réponse canonique | ✅ |
| Efficacité (5 iter) | ✅ |

---

## Run 3 — Moderniser `animated-background` (échec EDIT)

### Routage (correct pour une mutation)

```text
Architect gate: architect_edit
Start run: edit
Greeting only: false
Expects mutation: true
Role: architect
```

Le routage mutation est **correct** — ce run ne valide pas F1 mais le chemin EDIT nominal.

### Métriques fin de run (diagnostic PARTIE A)

| Métrique | Valeur |
|----------|--------|
| Itérations LLM | **42** (`iter 0`–`41`) |
| Tool calls (journal UI) | 39 |
| Tool errors | **18** (46 %) |
| `schema_error_continue_count` | **12** |
| `text_tool_marker_streak` | 0 |
| Phase finale | `internal_reasoning` |
| USER-FACING REPLY | ❌ **absent** |
| `busy` fin export | `false` (run terminé sans livrable) |
| Tokens ctx max | ~22 431 |

### Chronologie par station

```text
iter 0      INTENT  → internal_plan_write (plan s1–s5)
iter 1–18   READ    → ~15× file_read ERROR « read_workspace not expanded »
iter 18     READ    → read_workspace {"action":"describe"} → OK, outils débloqués
iter 19–27  READ    → file_read OK (animated-background.tsx, background-animations.css, package.json)
iter 28     READ→ACT → file_edit ERROR (args invalides) → transition rail act
iter 28–41  ACT     → boucle : file_edit ERROR ×2, lectures, internal_plan_write, prose code
                      jamais [phase: answering] / [phase: done]
                      plan interne marque s4 « completed » sans mutation disque
```

### Problèmes identifiés

#### 1 — Gate `read_workspace` en station READ (B-READ-GATE-01) — P1

**Symptôme** : dès l'entrée en rail EDIT READ, `file_read` échoue systématiquement :

```text
Tool folder `read_workspace` is not expanded yet.
Call `read_workspace` with {"action":"describe"} first;
wire tools `file_read`, `grep`, `workspace_map_read` unlock on the next turn.
```

**Impact** : ~18 itérations perdues avant le premier `read_workspace` describe (iter 18). Le modèle réutilise le contexte du run 2 mais ne peut pas relire sans débloquer le dossier outil.

**Cause hypothétique** : asymétrie protocolaire — en `architect_discussion`, `file_read` est direct ; en EDIT READ, passage obligatoire par `read_workspace` describe. Le prompt rail ne force pas ce describe **avant** la première lecture.

#### 2 — Schéma `file_edit` invalide (B-EDIT-SCHEMA-01) — P0

**Symptôme** : deux appels `file_edit` (steps 367, 494 PARTIE A) avec libellé UI « → Edited — … » mais erreur client :

```json
{
  "error": "file_edit: input requires `path` or `file_path` (string) and `edits` (array)",
  "hint": "{ \"path\": \"…\", \"edits\": [{ \"old_string\": \"…\", \"new_string\": \"…\" }] }"
}
```

En PARTIE B, le dernier appel mélange outil et action :

```json
// Tool call: file_edit — args réels
{ "path": "app-kdds-main/src/components/animated-background.tsx", "action": "describe" }
```

`action: describe` appartient à **`edit_file`**, pas à `file_edit`.

**Impact** : aucune écriture disque ; le composant source reste l'aurora mesh d'origine (vérifié par `file_read` iter 41).

#### 3 — `edit_file` describe jamais exécuté correctement (B-EDIT-PROTO-01) — P1

Le thinking cite à plusieurs reprises la règle « call `edit_file` with describe first » (step 492) mais le modèle appelle `file_edit` directement ou avec de mauvais args. Le rail ACT expose bien `edit_file` dans la liste d'outils (iter 28+).

#### 4 — Plan interne déconnecté de la réalité (B-PLAN-01) — P2

`internal_plan_write` marque **s4 completed** (« Nouveau composant créé ») alors qu'aucun `file_edit`/`file_write` n'a réussi. **s5** reste `in_progress` en fin de run.

#### 5 — Nudges schema_error en boucle (B-NUDGE-02) — P1

12 occurrences de `schema_error_continue_count` — nudges « Continue as Architect: re-read your last tool results » (boot_35…36 PARTIE B) sans progression vers `[phase: answering]`.

#### 6 — Pas de clôture utilisateur (B-CLOSURE-01) — P0

Aucun bloc `USER-FACING REPLY` pour le run 3. L'utilisateur n'a reçu ni code appliqué ni rapport final structuré.

| Critère | Résultat |
|---------|----------|
| Routage mutation | ✅ |
| Lecture fichiers cibles | ⚠️ tardive (après 18 iter) |
| Mutation disque | ❌ |
| Réponse canonique | ❌ |
| Parcours efficace | ❌ (42 iter, 46 % erreurs outil) |

---

## Backlog problèmes (liste complète)

| # | ID | Problème | Gravité | Run | Plan cible |
|---|-----|----------|---------|-----|------------|
| 1 | **F1** | Analyse repo routée en EDIT | — | 2 | ✅ **livré / validé** |
| 2 | **B-READ-GATE-01** | `file_read` bloqué sans `read_workspace` describe en EDIT READ | **P1** | 3 | 1.5.1 |
| 3 | **B-EDIT-SCHEMA-01** | `file_edit` sans `path`+`edits[]` ou `action` sur mauvais outil | **P0** | 3 | 1.5.1 |
| 4 | **B-EDIT-PROTO-01** | `edit_file` describe non utilisé malgré rail ACT | **P1** | 3 | 1.5.1 |
| 5 | **B-PLAN-01** | `internal_plan_write` marque done sans mutation | **P2** | 3 | 1.5.1 |
| 6 | **B-NUDGE-02** | 12× schema_error continue sans sortie | **P1** | 3 | 1.5.1 |
| 7 | **B-CLOSURE-01** | Pas de USER-FACING REPLY ni `[phase: done]` | **P0** | 3 | 1.5.1 |
| 8 | **B-REPLY-02** | Fuite thinking dans réponse salut | **P3** | 1 | 1.5.1 UI |
| 9 | **B-LANG-01** | Réponse analyse en EN (brief FR) | **P3** | 2 | — |
| 10 | **B-PATH-02** | Doc utilisateur `src/` vs chemins `app-kdds-main/` | **P2** | 2 | — |

---

## Recommandations 1.5.1 (post-smoke)

### Clôturé — F1 routage analyse

- **`gate_chain_for_auto`** : `!greeting_only && !expects_workspace_mutation` → `DiscussWithReads`.
- Re-dogfood run 2 : **5 iter**, réponse livrée — critère d'acceptation PLAN rempli.

### À traiter ensuite (priorité dogfood mutation)

1. **P0** — Valider / durcir le contrat `file_edit` côté moteur + hint quand le modèle confond `edit_file` / `file_edit`.
2. **P1** — Auto-expand `read_workspace` à l'entrée station READ (ou nudge unique obligatoire iter 0) pour éviter 18 tours stériles.
3. **P1** — Plafond ou escalade après N `schema_error_continue` sans mutation (éviter 42 iter).
4. **P2** — Ne pas autoriser `internal_plan_write` status `completed` sur step d'écriture sans tool result OK.

### Non régressé (vs pré-F1)

- Pas de boucle `internal_plan_write` + rail READ sur brief analyse.
- `text_tool_marker_streak: 0` sur les 3 runs (pas de pseudo `[tool_use]` texte).

---

## Test plan (re-smoke cible)

- [x] Run 2 « analyser le répertoire » → `discuss_with_reads`, réponse < 10 iter
- [ ] Run 3 même brief background → `file_edit` OK ou `edit_file`→`file_edit` enchaînés, fichier modifié sur disque
- [ ] Run 3 → `USER-FACING REPLY` + `[phase: done]`
- [ ] Run 1 → réponse sans fuite thinking
- [ ] `schema_error_continue_count` < 3 sur mutation simple 1 fichier

---

## Références

- Export : [`drox-engine/docs/1.4/chat_north-mini-code`](../../chat_north-mini-code)
- Plan routage : [PLAN-1.5.1-ROUTING-ANALYZE-LOOP.md](PLAN-1.5.1-ROUTING-ANALYZE-LOOP.md)
- Fix F1 : `drox-engine/drox/crates/drox-engine/src/orchestration/intent_probe/resolve.rs`
- Smoke format référence : [SMOKE-ses_7d5db0f1.md](../../1.4/1.4.1/SMOKE-ses_7d5db0f1.md)
