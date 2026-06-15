# INTEGRATION — Plan interne L2 (fil d'Ariane moteur)

**Version** : 1.4.1 · chantier **1.4.1.3**  
**Statut** : spec d'intégration validée (juin 2026) — **Phase A livrée**, Phases B–E à implémenter  
**Parent** : [PLAN.md](PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [frames-v0.yaml](frames-v0.yaml)

---

## En une phrase

Le plan interne est un **carnet de bord moteur** (fil d'Ariane cognitif), **obligatoire à l'ouverture** de chaque run architecte, **évolutif** tout au long du cycle, **fortement encouragé** mais **sans contredire** le rail ni les todos L1 — avec **branchement transcript** pour debug, replay et continuité session.

---

## Principes validés

| Principe | Décision |
|----------|----------|
| Rôle | Fil d'Ariane / bloc-note de réflexion du modèle — pas un second orchestrateur |
| Parallélisme | **Outil parallèle** au rail, aux gates `done`, et à `todo_write` L1 |
| Création | **1 plan obligatoire par run** avant tout autre outil (hard gate) |
| Évolution | Le modèle peut **ajouter, retirer, reformuler** des étapes au fil de la découverte |
| Discipline d'exécution | **Pas** de workflow « sélectionner une étape → clôturer avant la suivante » (trop pénalisant) |
| Enforcement post-création | **Incitations fortes** (nudges, snapshot visible), pas de blocage dur des outils rail |
| Session longue | À terme : journal cumulatif inter-runs (hors scope immédiat, spec ci-dessous) |
| UI utilisateur | Plan L2 **non visible** par défaut (engine-only) |

---

## Position dans l'architecture (3 couches parallèles)

```text
┌─────────────────────────────────────────────────────────────┐
│  Rail (Intent → Read → Plan → Act → Verify)                 │
│  → loi : quels outils, quelles stations, [gate: advance]    │
├─────────────────────────────────────────────────────────────┤
│  todo_write (L1)                                            │
│  → contrat utilisateur, UI todos, gates clôture run          │
├─────────────────────────────────────────────────────────────┤
│  internal_plan_write (L2)                                   │
│  → carnet moteur : où j'en suis, ce que j'ai appris, suite  │
└─────────────────────────────────────────────────────────────┘
```

Le L2 **ne remplace pas** le rail : il répond à une question différente.

- Rail : *« Dans quelle phase suis-je et quels outils ai-je le droit d'utiliser ? »*
- L1 : *« Qu'est-ce que je montre / promets à l'utilisateur ? »*
- L2 : *« Quelle est ma carte micro-étape par micro-étape, et est-elle encore à jour ? »*

---

## État actuel du code (Phase A — livré)

### Moteur Rust

| Zone | Comportement |
|------|--------------|
| `agent/state/internal_plan.rs` | État `InternalPlanState`, shape guard, `ingest_internal_plan` (remplacement total) |
| `agent/gates/tool_pre.rs` | Gate **hard** : tout outil architecte bloqué tant que `has_internal_plan()` est faux |
| `agent/loop/drive/llm_turn.rs` | Tant que pas de plan : specs LLM = `[internal_plan_write]` uniquement |
| `orchestration/tool_folders/folder_exec.rs` | Exécution virtuelle (pas de wire IDE) |
| `agent/state/internal_plan_snapshot.rs` | Snapshot system `## Internal work plan (engine only)` |
| `orchestration/context_frame/apply/iteration.rs` | Layer `internal_plan_snapshot` à chaque `iteration_start` |
| `orchestration/prompts/.../internal_plan_write.md` | Protocole outil (mandatory first) |
| `agent/rail/pre_gate.rs` + `policy.rs` | `internal_plan_write` autorisé à toutes les stations |

### Ce qui manque encore (Phases B–E)

- Nudges de **fraîcheur** (plan non mis à jour depuis N outils)
- Sémantique **merge / patch** (au lieu du remplacement brutal)
- Métadonnées `updated_at`, `tools_since_last_touch`
- Gate **soft** avant `answering` (« ton carnet reflète-t-il la réalité ? »)
- **Export transcript riche** pour `internal_plan_write` (comme `todo_write`)
- **Persistance session** inter-runs du journal L2
- Vérification dogfood sur build **≥ gate mandatory** (voir § dogfood)

---

## Dogfood — `ses_2ea65385` (`chat_qwen27b.txt`)

**Contexte** : Qwen 3.6 27B · workspace `site-kdds` · build **1.4.0.340742** (antérieur à la gate mandatory L2).

| Observation | Impact |
|-------------|--------|
| Premier outil = `workspace_map_read` (step 8) | Pas de `internal_plan_write` — build sans gate obligatoire |
| Aucune occurrence `internal_plan_write` / `## Internal work plan` dans l'export | Le carnet L2 n'a jamais existé dans ce run |
| Boucle `file_read` répétée sur `src/app/page.tsx` | Perte de fil ; le thinking remplace les résultats d'outils |
| Réponse `answering` avec code complet (steps 149–150) **sans** `file_edit` | Hallucination de livraison — cohérence rompue |
| Aucun `todo_write` L1 | Gates `done` contournées ou assouplies par le flux answering |
| 20 616 events UI / 58 messages transcript | Run long, difficile à auditer sans L2 + export dédié |

**Leçons pour l'intégration** :

1. La gate **création obligatoire** (Phase A) aurait forcé un premier tour structuré.
2. Sans **nudges de fraîcheur** ni référence au carnet, le modèle dérive vers le thinking stream.
3. Le **transcript** doit rendre visible les appels `internal_plan_write` et l'évolution des statuts — sinon impossible de diagnostiquer.
4. Re-dogfood requis sur build incluant Phase A + au moins Phase B transcript.

---

## Ce qu'on ne fait pas (garde-fous)

- Pas de gate « `file_read` interdit sans étape `in_progress` »
- Pas de gate « clôturer l'étape avant tout autre outil »
- Pas de verrouillage du plan après création (découverte = révisions normales)
- Pas de blocage `done` sur complétion L2 (reste sur todos L1 + phases)
- Pas d'exposition UI du plan L2 à l'utilisateur final (sauf mode dev / export)

---

## Spécification cible — comportement moteur

### Hard (déjà en place ou à conserver)

1. **Premier outil du run** = `internal_plan_write` avec ≥ 1 étape valide.
2. Shape guard inchangé : ids uniques, `action` non vide, ≤ 32 steps, ≤ 1 `in_progress` **dans le payload** lors d'un call.
3. Snapshot system injecté à chaque `iteration_start` (layer `internal_plan_snapshot`).

### Medium (Phase B — à implémenter)

| Mécanisme | Détail |
|-----------|--------|
| **Compteur de fraîcheur** | `ArchitectRunState.internal_plan_meta.tools_since_touch` incrémenté à chaque outil non-L2 ; reset sur `internal_plan_write` réussi |
| **Nudge seuil** | Si `tools_since_touch >= N` (défaut 5–8, tunable) → `append_gate_nudge` : *« Mets à jour ton plan interne — ta carte n'a pas bougé depuis N actions. »* |
| **Nudge transition rail** | Sur `[gate: advance]` vers Act : rappel si aucune étape `in_progress` dans le carnet (suggestion, pas blocage) |
| **Nudge pre-answering** | Avant acceptation `answering` : *« Vérifie que ton plan interne reflète ce qui a été fait / découvert. »* |
| **Protocole prompt** | Renforcer : « mets à jour le carnet quand ta compréhension change » ; distinguer L1 / L2 |

### Soft (convention modèle)

- Une étape `in_progress` à la fois **dans le carnet** (convention, pas gate universelle).
- Étapes concrètes : paths, critères `done_when`.
- Réécrire le plan quand une hypothèse est invalidée (ex. mauvais chemin de fichier).

### Évolution du carnet — merge vs replace

**Actuel** : chaque `internal_plan_write` **remplace** intégralement le plan.

**Cible Phase B** :

```json
{
  "mode": "replace | merge",
  "steps": [ ... ],
  "remove_step_ids": ["s4"],
  "append_steps": [ ... ]
}
```

- `replace` (défaut, rétro-compatible) : comportement actuel.
- `merge` : met à jour par `id`, ajoute `append_steps`, supprime `remove_step_ids`.
- Toujours **un seul document logique** par run — pas de versioning multi-plans.

---

## Intégration transcript

Le plan L2 doit être **auditable** sur toute la chaîne : persistance → export → replay → trace.

### 1. Persistance JSONL (`drox-session`)

Les appels `internal_plan_write` passent déjà par le transcript assistant (`tool_use` + `tool_result`) comme tout outil virtuel.

**À vérifier / garantir** :

- [ ] `tool_use.name = "internal_plan_write"` présent dans le JSONL session
- [ ] `tool_result` contient le payload normalisé retourné par `ingest_internal_plan`
- [ ] Snapshots system (`## Internal work plan`) persistés comme messages `role: system` (déjà le cas via `refresh_internal_plan_snapshot`)

### 2. Export IDE — PARTIE B (transcript moteur)

**Actuel** (`droxTranscriptExport.ts`) :

- Snapshots system L2 : **masqués** en export utilisateur (`includeEngineContext: false`)
- Visibles en export dev (`includeEngineContext: true`) avec tag `System · internal_plan`
- `internal_plan_write` tool results : format **générique** (pas de rendu plan structuré)

**Cible Phase C** :

Ajouter `formatInternalPlan()` symétrique à `formatTodoPlan()` :

```text
### Plan interne (internal_plan_write) — engine only

[~] s1: Lire src/app/page.tsx (in_progress)
[ ] s2: Identifier SVG transition section 1→2 (pending)
[x] s3: Explorer workspace_map (completed)

Summary: 1 in_progress · 1 pending · 1 completed
Meta: updated_at · tools_since_touch · mode merge|replace
```

| Export | Snapshot system L2 | Tool `internal_plan_write` |
|--------|-------------------|---------------------------|
| Utilisateur (défaut) | Omis | Omis ou une ligne `(plan interne mis à jour — détail masqué)` |
| Dev / dogfood | Complet (PARTIE B + E) | Format structuré + JSON brut repliable |
| UI journal (PARTIE C) | Inchangé | Event `tool_finish` standard ; pas de carte UI utilisateur |

Fichier : `src/vs/workbench/contrib/drox/common/chat/droxTranscriptExport.ts`

### 3. UI journal (`droxUiReplayExport.ts`)

**Actuel** : journal chronologique UI ; pas de carte dédiée L2 (correct — engine-only).

**Cible** :

- [ ] En export dev : section optionnelle **« Internal plan timeline »** en fin de PARTIE A — liste des versions du plan (timestamps des `internal_plan_write` successifs)
- [ ] Ne pas afficher dans le chat utilisateur

### 4. Engine trace (PARTIE E)

**Déjà branché** :

- Layer `internal_plan_snapshot` dans `layers_applied`
- `system_blocks` classifie `internal_plan` via marker `## Internal work plan (engine only)`

**Cible Phase C** :

- [ ] Ajouter dans `LlmTurnPreparedTrace` : `internal_plan_steps`, `internal_plan_in_progress_id`, `tools_since_touch`
- [ ] Permettre de corréler « tour 14 : 6 outils sans MAJ plan » dans le dogfood

Fichiers : `drox-session` trace types · `agent/loop/engine_trace.rs`

### 5. Replay session

**Actuel** : replay transcript rejeu les messages ; snapshots system L2 rejoués tels quels.

**Cible** :

- [ ] `transcriptMessageToReplayAppends` : ignorer snapshots L2 en replay UI utilisateur
- [ ] Mode dev replay : option `showInternalPlan: true`

### 6. Compaction / microcompact

**Cible Phase D** :

- Snapshots L2 **compactables** (comme `workspace_map_read`) une fois stabilisés — garder dernière version + historique des deltas dans engine trace
- À la compaction session : résumer le carnet L2 du run en **« Session work log »** injecté au boot du run suivant

```text
## Session work log (engine only)

Runs précédents dans cette session :
- Run 1 (ses_…): fil d'Ariane SVG page principale — découvert Next.js app router, page.tsx lu, pas de edit livré
- Run 2 (…): …
```

Emplacement futur : frame boot `iteration_start` ou layer dédié `session_work_log_snapshot`.

---

## Plan d'implémentation (1.4.1.x)

| Phase | Contenu | Priorité | Statut |
|-------|---------|----------|--------|
| **A** | Création obligatoire + gate + specs LLM | P0 | ☑ Livré |
| **B** | Fraîcheur + nudges + merge mode + meta état | P0 | ☑ |
| **C** | Export transcript structuré + engine trace enrichi | P1 | ☑ |
| **D** | Session work log inter-runs + compaction | P2 | ☐ |
| **F** | Correctifs protocole `[tool_use]` (nudges, circuit breaker, UX) | P0 | ☐ — voir [PLAN-PROTO-FIXES.md](PLAN-PROTO-FIXES.md) |
| **E** | Smoke dogfood + doc closure 1.4.1.3 | P1 | ☐ |

### Ordre recommandé

```text
A (fait) → B (nudges) → C (transcript) → F (protocole outil) → E (smoke + closure) → D (session)
```

Ne pas attendre D pour livrer B+C : la valeur dogfood est surtout en B+C.

---

## Fichiers impactés (checklist implémentation)

### Rust — moteur

| Fichier | Phase | Changement |
|---------|-------|------------|
| `agent/state/internal_plan.rs` | B | `InternalPlanMeta`, merge ingest, `touch()` |
| `agent/state/fields.rs` | B | champs meta |
| `agent/gates/nudge.rs` ou `loop/drive/outcome.rs` | B | nudges fraîcheur / answering |
| `orchestration/prompts/.../internal_plan_write.md` | B | merge mode, conventions carnet |
| `agent/loop/engine_trace.rs` | C | champs trace enrichis |
| `orchestration/context_frame/manifest.rs` | D | layer `session_work_log` (futur) |

### TypeScript — IDE / export

| Fichier | Phase | Changement |
|---------|-------|------------|
| `common/chat/droxTranscriptExport.ts` | C | `formatInternalPlan`, filtrage export |
| `common/chat/droxUiReplayExport.ts` | C | timeline L2 optionnelle (dev) |
| `test/common/droxCommon.test.ts` | C | tests export L2 |

### Docs / smoke

| Fichier | Phase |
|---------|-------|
| `docs/1.4/1.4.1/SMOKE-ses_*.md` | E — nouveau smoke post-gate |
| `docs/chat_qwen27b.txt` | E — référence dogfood avant/après |

---

## Tests de non-régression

| Test | Attendu |
|------|---------|
| `internal_plan_required_blocks_reads_until_plan_exists` | Bloqué sans plan ; OK après ingest |
| `ScriptedLlm::new_architect` | Préfixe plan obligatoire dans tests drive |
| Export dev | `internal_plan_write` rendu structuré PARTIE B |
| Export user | snapshot L2 omis, pas de fuite UI |
| Rail inchangé | `file_read` en station Read toujours gouverné par rail, pas par L2 |
| `done` gates | Toujours sur todos L1 uniquement |

---

## Critères de clôture chantier (1.4.1.3 + L2)

- [ ] Dogfood même scénario SVG (`site-kdds`) sur build avec Phase A+B
- [ ] Transcript montre ≥ 1 `internal_plan_write` initial + ≥ 1 mise à jour en run long
- [ ] Export dev permet audit complet sans lire le JSONL brut
- [ ] Aucune régression tests `cargo test -p drox-engine --lib`
- [ ] Matrice [MATRIX-ACTUAL.md](MATRIX-ACTUAL.md) mise à jour (layer `internal_plan_snapshot` + nudges)

---

## Références

- Spec initiale L2 : [PLAN.md § III.2](PLAN.md) (phase 4)
- Manifest frame : [frames-v0.yaml](frames-v0.yaml) (`internal_plan`)
- Dogfood analyse : [chat_qwen27b.txt](../../../chat_qwen27b.txt) · session `ses_2ea65385`
- Export transcript : `src/vs/workbench/contrib/drox/common/chat/droxTranscriptExport.ts`
