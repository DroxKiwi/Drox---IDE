# Plan de suivi — M5c : sous-agents asynchrones + jauge contexte parent

**Date** : 2026-05-21  
**Statut** : plan actif — **M5a ✅** · **M5c** C1–C17 ✅ · **C18–C20 + smoke 6b** restants  
**Cible produit** : profils **Low** et **Medium** avec `nexus.drox.subagents.enabled` ; setups **12–24 Go VRAM** (deux modèles Ollama possibles).

**Documents liés** : [PLAN-PROFIL-LOW-ACCOMPAGNEMENT](./PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) (§2.9, M5a/M5b) · [PLAN-MODELES-TIER](./PLAN-MODELES-TIER.md) · [MODELES-PAR-TAILLE](../architecture/MODELES-PAR-TAILLE.md) · [GUIDE-MOTEUR-DROX](../guides/GUIDE-MOTEUR-DROX.md) (§2.10 sous-agents)

---

## ⚠️ Règle absolue — Medium inchangé sauf opt-in explicite

| Interdit | Autorisé |
|----------|----------|
| Forcer `background: true` sur tous les `task` Medium | Le **modèle** choisit `background` par appel ; défaut documenté + nudge, pas de gate cachée |
| Multiplier les explores sans gain (spam `task`) | Nudges + plafond `maxConcurrent` ; défaut conservateur |
| Compter le contexte explore (8192 interne) dans la jauge parent | Jauge = **tokens réellement ingérés** par l’historique parent |

**Critère de merge Medium** : `background: false` (sync) = comportement **équivalent M5a** (parent bloqué jusqu’au report). `background: true` = nouveau chemin async uniquement.

---

## 0. Décisions produit (validées 2026-05-21)

| Question | Décision |
|----------|----------|
| Async vs sync | **`background` explicite** sur chaque `task` : le modèle choisit selon le besoin (`true` = continuer le parent pendant l’explore ; `false` = attendre le report avant la suite). Le flag doit être **visible** (schéma tool, carte UI, logs). |
| Gate Low pendant explore | **Blocage dur** des mutations (`file_edit`, `file_write`, `notebook_edit`, `bash` mutateur…) tant qu’au moins un job explore **running**. Lecture / plan / `todo_write` / `ask_user_question` : **autorisés**. |
| Jauge contexte (footer) | Compter **ce que le parent ingère réellement** dans `messages` (JSON structuré `task` complet après sync ou injection job async) — **pas** l’historique interne du sous-agent, **pas** `usage.input_tokens` Ollama ambigu. Jobs **running** : rien à ingérer → **pas** de hausse jauge. |
| `maxConcurrent` Medium | **Défaut conservateur : 1** (comme aujourd’hui) jusqu’à smoke VRAM documenté ; pas d’incitation à « redistribuer » en sous-agents sans gain. Multi-explore **opt-in** (setting utilisateur) + nudge moteur : périmètres **orthogonaux** uniquement. |

---

## 1. Vision — pourquoi M5c

### 1.1 Problème actuel (M5a)

| Limite | Cause technique |
|--------|-----------------|
| Parent **bloqué** pendant un `task` | `run_explore` synchrone dans `execute` ; `task` en lot **Serial** |
| Jauge `#ctx` peut **diverger** du budget parent réel | Mise à jour via `usage.input_tokens` (Stop) en plus de `count_tokens(messages)` |
| Pas de travail parent **pendant** l’audit | Une seule boucle agent ; await sur tout l’explore |

### 1.2 Cible M5c

```text
Modèle appelle task(background: true)
  → job_id, status running (retour immédiat)
  → parent enchaîne (read, todo, answering partiel…)
  → explore tourne sur modèle / num_ctx sous-agent (isolé)
  → fin job → injection parent (report structuré)
  → jauge += tokens du message réellement ajouté au parent
```

**VRAM** : le parallélisme est **orchestration** (deux agents logiques), pas une promesse de deux inférences GPU simultanées — la file `maxConcurrent` + sémaphore protège déjà la machine.

### 1.3 Principe « pas de redistribution gratuite »

Le sous-agent doit servir à un **gain net** :

| Bon usage `task` | Mauvais usage (à décourager) |
|------------------|------------------------------|
| Cartographie large, audit module, grep multi-dossiers | `file_read` d’un fichier déjà identifié |
| Périmètre **orthogonal** en parallèle (ex. explore `src/` pendant que le parent lit `docs/`) | Deux explores sur le **même** scope « au cas où » |
| `background: true` quand le parent peut avancer sans le report | `background: true` puis mutation immédiate sur le même fichier (gate Low bloque) |

Nudges existants M5a (`LOW_TASK_RECOMMENDED`) complétés en M5c par rappels **async / sync** et **anti-redondance**.

---

## 2. Contrats techniques

### 2.1 Tool `task` — champ `background`

| Champ | Type | Défaut | Sémantique |
|-------|------|--------|------------|
| `background` | `boolean` | `false` (sync, rétro M5a) ou `true` recommandé en prompt Low — **à figer en implémentation** : défaut `false` pour compat ; nudge « préfère `true` si tu n’as pas besoin du report ce tour » | `false` : await explore, `tool_result` complet comme M5a. `true` : retour immédiat + job async. |
| `description`, `subagent_type`, `thoroughness`, `scope`, `objective_fragment` | inchangés M5a | — | — |

**Sortie sync** (`background: false`) — inchangée :

```json
{ "summary", "findings", "open_questions", "report_markdown", "truncated", "iterations_used", "mode": "sync" }
```

**Sortie async immédiate** (`background: true`) :

```json
{
  "mode": "async",
  "status": "running",
  "job_id": "uuid",
  "description": "...",
  "hint": "Le parent peut continuer ; le report sera injecté à la complétion."
}
```

**Injection à la complétion** (début de tour parent suivant, ou événement dédié) — même payload structuré que sync + `job_id`, `mode: "async_completed"`.

**Visibilité du flag** (obligatoire M5c) :

| Surface | Exigence |
|---------|----------|
| Schéma JSON `task` | `background` documenté dans `description` + `input_schema` |
| Carte UI tool `task` | Badge **Sync** / **Async** sur `ToolStart` |
| Carte sous-agent | Ligne `mode: async` + `job_id` ; état running → done |
| Transcript / logs | Champ `background` dans métadonnées tool si présent |

### 2.2 `SubagentJobRegistry` (moteur, par `run_id`)

| Opération | Comportement |
|-----------|--------------|
| `spawn_explore(...)` | `tokio::spawn` ; acquiert sémaphore ; retourne `job_id` |
| `poll_completed()` | Jobs terminés depuis dernier drain |
| `running_count()` | Pour gates Low + bandeau UI |
| `get(job_id)` | Statut : running / completed / failed |

**Sémaphore** : réutiliser `SubagentSettings.max_concurrent` (défaut **1** Low et Medium jusqu’à smoke §5.2).

### 2.3 Boucle agent parent (`loop.rs`)

| Point | Changement |
|-------|------------|
| Début de tour (avant LLM) | `drain_completed_jobs()` → messages système ou `tool_result` synthétique par job |
| Exécution `task` + `background: true` | Pas d’`await` sur `run_explore` ; enregistrer job ; retour JSON running |
| `task` + `background: false` | Chemin M5a (sync) |
| `is_concurrency_safe("task")` | `true` **uniquement** si `background: true` (retour immédiat) ; sinon `false` |
| Gate Low | Si `running_count() > 0` → refuser mutations (liste §2.4) |

### 2.4 Gate Low — mutations bloquées

Outils **bloqués** tant qu’un job explore est `running` (profil Low uniquement) :

- `file_edit`, `file_write`, `notebook_edit`
- `bash` (toutes invocations en Low si gate globale bash mutation — aligner sur `gates.rs` existant)
- Tout outil classé mutateur dans `MUTATING_TOOLS_FOR_STEP_TRACKING`

**Autorisés** : `file_read`, `grep`, `glob`, `lsp`, `todo_write`, `memory_*`, `ask_user_question`, `task` (sync ou async selon choix modèle).

**Medium** : pas de blocage dur ; nudge système optionnel si mutation pendant job running.

### 2.5 Jauge contexte parent (`parent_ctx_tokens`)

| Règle | Détail |
|-------|--------|
| Source de vérité | `ContextPolicy::count_tokens(messages)` sur l’historique **parent** uniquement |
| Exclu | Messages / tokens du `Agent` explore interne ; KV Ollama du modèle 4b |
| Inclus | Contenu **réellement ajouté** au parent : `tool_result` sync, ou message d’injection async (JSON structuré complet, tronqué comme M5a si seuil report) |
| Job running | **Aucun** ajout tant que le report n’est pas injecté |
| Event wire | `AgentEvent::ContextUsage { parent_tokens, parent_budget }` ou enrichir `ContextSnip` / `context` IDE |
| `merge_ui_stats` | `ui_stats.ctx` ← `parent_tokens` seulement ; ne plus écraser avec `usage` sans scope |
| UI | `09-host.js` / `04-history.js` : `#ctx` = `parent_tokens` ; optionnel badge explore hors jauge (V2) |

**Important** : si le parent ingère le report tronqué entier (M5a), la jauge reflète **cet** octet-string — pas une estimation `summary` seule.

### 2.6 Politique `maxConcurrent` et anti-redondance

| Profil | Défaut M5c | Plafond |
|--------|------------|---------|
| Low | `1` | `1` (inchangé) |
| Medium | `1` (conservateur) | Setting `nexus.drox.subagents.maxConcurrent` (max 8) — **recommandé 1** jusqu’à smoke §5.2 |

**Nudges moteur** (Low + Medium) :

- Avant second `task` parallel : « Un explore est déjà en cours sur … ; lance un second explore seulement si le périmètre est **disjoint** et le gain est clair. »
- Si `scope` chevauche un job running : erreur ou nudge **refus soft** (V1 : nudge + gate `max_concurrent`).

---

## 3. Phases de livraison

### M5c.1 — Jauge contexte parent (sans async)

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| C1 | `parent_ctx_tokens` via `count_tokens(messages)` à snip / fin de tour | `loop.rs`, `context.rs` | ✅ |
| C2 | Event `ContextUsage` ou extension `context` JSON-RPC → IDE | `event.rs`, `agent_run.rs`, `droxChatAgentEvents.ts` | ✅ |
| C3 | `merge_ui_stats` : `ctx` = parent seulement | `agent_run.rs` | ✅ |
| C4 | UI footer `#ctx` branché sur `parent_tokens` | `09-host.js`, `04-history.js` | ✅ |
| C5 | Tests : gates M5c + registry jobs ; jauge parent = `ContextUsage` (pas `Stop.usage`) | `gates.rs`, `subagent_jobs.rs`, `tool_orchestration.rs` | ✅ |

### M5c.2 — Jobs + `task(background)`

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| C6 | `SubagentJobRegistry` + spawn / poll / états | `subagent_jobs.rs`, `subagent.rs` | ✅ |
| C7 | `TaskInput.background` + branches sync/async | `task.rs` | ✅ |
| C8 | `EngineSubagentExecutor` : chemin async (spawn) vs sync (await) | `subagent.rs` | ✅ |
| C9 | Drain jobs début de tour + injection report | `loop.rs` | ✅ |
| C10 | `is_concurrency_safe(task)` dynamique selon `background` | `task.rs`, `tool_orchestration.rs` tests | ✅ |
| C11 | RPC / settings : pas de nouveau param obligatoire ; doc `background` | `prompts.rs` | ✅ |

### M5c.3 — Gates Low + visibilité UI

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| C12 | Gate mutations Low si job running | `gates.rs`, `loop.rs` | ✅ |
| C13 | Re-perspective : jobs pending + rappel gate | `nudges.rs`, `loop.rs`, `droxChatAgentEvents.ts` | ✅ |
| C14 | Badge Sync/Async sur carte `task` | `07-log.js`, `droxToolPreview.ts` | ✅ |
| C15 | Carte sous-agent : `job_id`, running/done/failed | `07-log.js`, `droxChatAgentEvents.ts` | ✅ |
| C16 | Nudges anti-redondance + second `task` | `nudges.rs`, `prompts.rs` | ✅ |

### M5c.4 — Medium concurrency + validation

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| C17 | Confirmer défaut `maxConcurrent: 1` + texte setting IDE | `droxConfiguration.ts` | ✅ |
| C18 | Smoke VRAM : 1 vs 2 explores + parent actif (doc résultat) | `docs/operations/` ou §5.2 ci-dessous | ⬜ |
| C19 | Après smoke vert : doc « quand passer à 2 » (périmètres disjoints) | ce plan §5.2 | ⬜ |
| C20 | Maj [PLAN-PROFIL-LOW-ACCOMPAGNEMENT](./PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) statut M5c | lien croisé | ✅ |

**Hors M5c V1** : annulation job (`cancel_subagent`), métriques KV explore dans carte, `task` imbriqué, types `verify`/`plan` (M5b), compression LLM 2ᵉ passe (G4).

---

## 4. Matrice Low vs Medium (M5c)

| Mécanisme | Low | Medium |
|-----------|-----|--------|
| `background` choisi par le modèle | Oui, visible | Oui, visible |
| Défaut `background` | `false` + nudge « async si report pas requis ce tour » | `false` + nudge plus léger |
| Gate mutations si job running | **Dur** | Nudge soft seulement |
| `max_concurrent` défaut | 1 | 1 (smoke avant augmentation) |
| Jauge `#ctx` | `parent_tokens` ingérés | idem |
| 1 tool/tour | Tour 1 : `task` async possible ; tours suivants autre outil pendant running | Multi-tools/tour possible avec reads parallèles |
| Re-perspective M4 | Liste jobs pending + gate mutation | Jobs pending informatif |

---

## 5. Validation

### 5.1 Tests automatiques

- [ ] `parent_ctx_tokens` stable avant/après explore interne (sync) : seul le `tool_result` parent augmente la jauge.
- [ ] `background: true` : pas d’augmentation jauge jusqu’à injection du report.
- [ ] Gate Low : `file_edit` refusé avec message clair si job running ; autorisé après `done`.
- [ ] `background: false` : parité comportement M5a (tests existants `task` / report structuré).
- [ ] `is_concurrency_safe` : true avec `background: true`, false sinon.
- [ ] Pas de `task` imbriqué (régression M5a).
- [ ] Medium + `background: false` : inchangé vs M5a.

### 5.2 Smoke manuel

| # | Scénario | Succès |
|---|----------|--------|
| 1 | Low — `task` `background: true` puis `file_read` pendant running | Lecture OK ; jauge inchangée jusqu’à injection report |
| 2 | Low — `file_edit` pendant job running | Bloqué avec message explicite |
| 3 | Low — après report injecté | `file_edit` OK ; jauge += taille réelle du JSON ingéré |
| 4 | Sync — `background: false` | Comportement identique M5a ; parent attend |
| 5 | UI — carte `task` | Badge **Async** ou **Sync** visible |
| 6 | Medium — audit large async + travail parent | Pas de régression autonomie ; pas de 2ᵉ explore « gratuit » sur même scope |
| 7 | VRAM — `ollama ps` | Deux modèles si config OK ; pas de OOM avec `maxConcurrent: 1` |
| 8 | Footer `#ctx` | N’affiche pas le contexte 4b / explore interne |

**Smoke optionnel C18** (avant de recommander `maxConcurrent: 2`) :

- Machine test 24 Go ; parent 9b + explore 4b ; 2 explores **scopes disjoints** + parent actif.
- Critère : pas d’OOM, latence acceptable, gain temps wall-clock mesuré vs 2× sync séquentiel.

---

## 6. Journal

| Date | Entrée |
|------|--------|
| 2026-05-21 | Création plan M5c — décisions produit : `background` explicite, gate Low dur, jauge = ingestion parent réelle, `maxConcurrent` défaut 1 + anti-redondance |
| 2026-05-21 | Suite logique M5a (sync) ; M5b types explore reste indépendant |
| 2026-05-20 | **M5c C1–C17 livré** : `ContextUsage`, jobs async, gates, UI Sync/Async + cartes `job_id`, `merge_ui_stats` sans `Stop.usage` → `#ctx` ; tests gates/registry/orchestration |
| 2026-05-20 | Reste **C18–C19** (smoke VRAM doc) + **smoke 6b** manuel [PLAN-PROFIL-LOW §5.2](./PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) |

---

## 7. Liens code (référence)

```text
drox-tools/.../simple/task.rs              TaskInput.background, sync/async
drox-engine/.../subagent.rs                explore + jobs (à étendre)
drox-engine/.../agent/loop.rs            drain jobs, gates, parent_ctx
drox-engine/.../tool_orchestration.rs    partition task async
drox-engine/.../agent/gates.rs           gate mutations Low
drox-engine/.../event.rs                 ContextUsage
drox-cli/.../jsonrpc/handlers/agent_run.rs merge_ui_stats, events subagent
drox-cli/.../prompts.rs                  nudges background + anti-redondance
src/.../drox/common/droxConfiguration.ts   subagents.maxConcurrent (défaut 1)
src/.../drox/browser/media/droxChat/09-host.js   ctx parent
src/.../drox/browser/media/droxChat/07-log.js    badges Sync/Async, cartes job
```

---

*KDDS Nexus — M5c : le parent avance pendant l’explore **quand le modèle le demande** (`background: true`), sans mentir sur la jauge contexte.*
