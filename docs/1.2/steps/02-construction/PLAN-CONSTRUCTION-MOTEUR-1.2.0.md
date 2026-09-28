# Plan de construction moteur — 1.2.0 (multi-rôles)

**Version** : 1.2.0  
**Date** : 2026-05-20  
**Statut** : plan structurant (référence architecture)  
**Pilotage quotidien** : [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md)  
**Prérequis** : [VISION-ORCHESTRATION-MULTI-ROLES.md](../01-vision/VISION-ORCHESTRATION-MULTI-ROLES.md) · [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](../03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md)  
**Hypothèse** : la 1.2.0 moteur peut **ne pas** être la version finale — le découpage ci-dessous doit permettre de **jeter ou remplacer** la couche « flow » sans toucher outils, session, RPC ni IDE.

---

## 1. Ce qu’on veut séparer (compréhension commune)

| Bloc | Question qu’il répond | Stabilité visée |
|------|----------------------|-----------------|
| **A. Plateforme** | Comment lire un fichier, exécuter bash, persister une session, appeler Ollama, vérifier une permission ? | **Haute** — contrat outils + infra |
| **B. Exécution** | Comment **un** run LLM↔tools est mené (tour, streaming, parallèle outils, annulation, jobs) ? | **Moyenne** — boucle agentique générique |
| **C. Flow / rôles** | **Qui** parle, **quand**, avec **quel** modèle, **quels** outils, **quelle** politique de phases ? | **Basse** — zone d’expérimentation 1.2.0 |
| **D. Contrat IDE** | Qu’est-ce que Nexus envoie / reçoit (`agent.run`, événements NDJSON) ? | **Haute** — évolution additive seulement |

Aujourd’hui, **A + B + C** sont entremêlés surtout dans `drox-engine` (`Agent`, `RunPolicy`, `subagent`, `nudges`, `gates`, `phases`). La 1.2.0 doit **extraire C** et laisser B ignorant du paradigme Low/Medium **ou** Architecte/Chef/Exécutant.

---

## 2. Diagramme des couches (dépendances autorisées)

```text
                    ┌─────────────────────────────────────┐
                    │  D. Contrat IDE (JSON-RPC inchangé   │
                    │     en surface — agent.run, events)   │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  C. Flow / orchestration multi-rôles │  ◄── remplaçable
                    │  séquences · rôles · modèles · plans │
                    └──────────────────┬──────────────────┘
                                       │ RunPlan / RoleSpec
                    ┌──────────────────▼──────────────────┐
                    │  B. Exécution (runtime de run)        │
                    │  boucle LLM · tools · jobs · stream   │
                    └──────────────────┬──────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
  drox-llm                      drox-tools                   drox-session
  drox-permissions              drox-context                 drox-bash / mcp / hooks
```

**Règle d’or** : la couche **B** ne importe **pas** `RunProfileId`, `modelTier`, « Architecte », ni le format des séquences. Elle reçoit un **`RunSpec`** déjà résolu (modèle, allowlist outils, limites, prompts système, profondeur max).

**Règle d’or 2** : la couche **C** ne implémente **pas** `file_read` ni le parsing bash — elle **compose** des runs B et agrège les événements.

---

## 3. Cartographie crates actuelles → couches cibles

| Crate / module actuel | Couche | Action 1.2.0 |
|----------------------|--------|--------------|
| `drox-llm`, `drox-bash`, `drox-mcp` | A | Inchangé sauf besoin transport |
| `drox-tools` (+ `simple/*`) | A | Inchangé ; éventuellement **groupes d’outils par rôle** (config pure) |
| `drox-permissions`, `drox-session`, `drox-context` | A | Inchangé |
| `drox-hooks` | A | Inchangé |
| `drox-engine::agent::*` (loop, stream) | B | **Geler** comme « moteur de run unique » |
| `drox-engine::tool_orchestration`, `subagent_jobs` | B | Reste ; généraliser en « job runner » |
| `drox-engine::run_profile` (`RunPolicy`, gates Low/Medium) | C | **Déprécier** → migrer vers flow |
| `drox-engine::agent::nudges`, `gates`, `phases` | C | Déplacer derrière traits flow |
| `drox-engine::subagent` | C→B | `task` explore = proto **exécutant** ; refactor en worker B piloté par C |
| `drox-engine::professor` | C | Spécifique plan / cours — pas le cœur multi-rôles |
| `drox-cli` handlers RPC | D | Façade mince : délègue à C |

**Cible crate (provisoire)** : `drox-orchestration` (nom ouvert) — **seule** dépendance nouvelle autorisée de `drox-engine` vers le haut pour la logique 1.2.0. Tant que le crate n’existe pas, module `drox-engine/src/orchestration/` **derrière feature** `orchestration_v1_2`.

---

## 4. Interfaces minimales entre B et C (à figer avant code)

### 4.1 Entrées du flow (couche C)

- `UserTurn` : message utilisateur + contexte IDE (workspace, attachments, settings).
- `OrchestrationConfig` : mapping rôle → modèle, profondeur max, parallélisme séquences.
- Sortie planifiée : `RunPlan` = liste ordonnée / parallèle de **`RunUnit`**.

### 4.2 `RunUnit` (contrat vers B)

Chaque unité décrit **un** run de boucle agent, pas toute la conversation :

| Champ | Rôle |
|-------|------|
| `role_id` | `architect` \| `conductor` \| `executor` (extensible) |
| `model_id` | Modèle LLM résolu |
| `system_prompt` | Assemblé par C (prompts par rôle) |
| `user_prompt` | Mission bornée (Architecte : requête user ; Exécuteur : champs `delegate_executor` uniquement — **pas** le chat user) |
| `tool_allowlist` | Sous-ensemble du registre A |
| `limits` | `max_iterations`, `max_tools_per_turn`, tokens, etc. |
| `parent_run_id` | Lien hiérarchie / annulation en cascade |

### 4.3 Sorties du runtime (couche B)

- Stream `AgentEvent` **inchangé** pour l’IDE (compat D).
- `RunResult` : transcript slice, stats, erreur, **résumé structuré** pour le parent (C synthétise).

### 4.4 Ce que C fait avec les résultats

- Enchaînement séquence / séquence.
- Re-planification Architecte (nouveau `RunPlan`).
- **Pas** de re-parsing des sorties outils dans B.

---

## 5. Séparation « flow modèles » vs « reste »

### 5.1 Flow modèles (couche C — fortement mutable)

- Décision : plan ou pas, découpage en **séquences** et **objectifs**.
- Assignation modèle par rôle (remplace `modelTier` Low/Medium).
- Prompts système / nudges / phases **par rôle** (l’Architecte n’a pas les mêmes gates qu’un exécutant).
- Politique de synthèse remontante (parent reçoit un résumé, pas le transcript brut enfant).
- Parallélisme **métier** (séquences disjointes, N exécutants).

### 5.2 Exécution (couche B — stable relativement)

- Un tour LLM : requête, tool calls, fin de tour.
- `partition_tool_calls`, limite outils **numérique** du `RunSpec`.
- Exécution tool → registry A.
- Sous-processus / jobs (ex. `task` background) comme **workers** avec même stream.
- Compaction **technique** mid-run (`try_live_compact`) — déclenchée par budget du `RunSpec`, pas par « phase produit ».

### 5.3 Plateforme (couche A — ne pas casser)

- Catalogue outils, schémas JSON, handlers.
- Permissions, session JSONL, mémoire longue.
- Client LLM (Ollama, retry, streaming).

---

## 6. Phases de construction (ordre recommandé)

| Phase | Livrable | Critère done |
|-------|----------|--------------|
| **P0 — Doc & traits** | Ce plan + `SPEC-INTERFACES-RUN.md` (à rédiger) | Interfaces B↔C validées à la main |
| **P1 — Extraction sans comportement** | Module `orchestration/` + `RunSpec` ; `Agent` lit `RunSpec` au lieu de `RunPolicy` interne | `cargo test` vert ; chemin actuel Medium = `RunSpec` équivalent |
| **P2 — Feature flag** | `DROX_ORCHESTRATION=legacy\|v1_2` | IDE inchangé ; bascule CLI |
| **P3 — Rôles minimaux** | 2 rôles : Architecte (plan + séquences) + Exécutant (1 outil mutation) | Smoke : tâche simple + tâche 2 fichiers |
| **P4 — Chefs + récursion** | Niveau intermédiaire + synthèse parent | Tests intégration Rust |
| **P5 — Décommission Low/Medium** | Retrait `RunProfileId` du chemin par défaut | Doc 0.0.0 référencée archive only |

**Ne pas faire en P1** : réécrire tous les outils, changer le RPC, fusionner les crates A.

---

## 7. Stratégie « version peut-être pas finale »

| Mécanisme | But |
|-----------|-----|
| Crate / module **`drox-orchestration`** isolé | Supprimer ou réécrire C sans toucher A/B |
| Feature flag + chemin **legacy** (boucle actuelle Medium) | Régression zéro pendant mois de dev |
| **`RunSpec` versionné** (`spec_version: 1`) | Évolution sans casser B |
| Pas de logique rôle dans `drox-tools/src/simple/*` | Éviter `if role == architect` dans file_edit |
| Contrat RPC **additif** (`orchestrationMode` optionnel) | IDE ancien continue de fonctionner |

Si la vision multi-rôles est abandonnée : on retire C, on garde B+A+D.

---

## 8. Anti-patterns à interdire

1. **Gates métier** (`MutatingRequiresTodo`, phases `[phase:…]`) dans `drox-tools` ou `drox-llm`.
2. **Choix du modèle** dans `agent_stream.rs` (B) — uniquement dans C via `RunSpec`.
3. **Nouveaux outils « sequence_launch »** qui contiennent la logique d’orchestration — préférer API interne C.
4. **Dupliquer** la boucle agent dans `subagent.rs` et un futur chef — une seule implémentation B, N invocations.
5. **Étendre** `RunPolicy` Low/Medium pour simuler les rôles — dette 0.0.0, pas la base 1.2.0.

---

## 9. Documents dérivés

| Fichier | Statut |
|---------|--------|
| [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md) | Plan de pilotage P0–P5 |
| [SPEC-INTERFACES-RUN.md](../05-spec-p0/SPEC-INTERFACES-RUN.md) | Brouillon P0 |
| [SPEC-SEQUENCES-ET-OBJECTIFS.md](../05-spec-p0/SPEC-SEQUENCES-ET-OBJECTIFS.md) | Brouillon P0 |
| [SPEC-OUTILS-PAR-ROLE.md](../05-spec-p0/SPEC-OUTILS-PAR-ROLE.md) | Brouillon P0 |
| [PLAN-IDE-1.2.0.md](../10-ide/PLAN-IDE-1.2.0.md) | Brouillon piste IDE |

---

## 10. Synthèse

**Oui** : on sépare clairement (1) **l’exécution mécanique** d’un run, (2) **le flow** que suivent les modèles / rôles / séquences, (3) **le reste** (outils, permissions, session, LLM, RPC). La 1.2.0 vit surtout dans **(2)** derrière une frontière jetable ; **(1)** et **(3)** restent l’investissement durable.

---

## 11. Journal

| Date | Action |
|------|--------|
| 2026-05-20 | Création plan construction — couches A/B/C/D, phases P0–P5 |
