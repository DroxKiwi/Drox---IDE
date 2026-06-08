# 04 — Segments (délégation repensée)

**Parent** : [README](README.md) · **Prérequis** : [03-STATIONS.md](03-STATIONS.md) · **Suite** : [05-CODE-ARCHITECTURE.md](05-CODE-ARCHITECTURE.md)

---

## Principe

**Un modèle, une instance LLM.** Pas de sub-agent configurable par l’utilisateur.

Un **segment** = sous-boucle agent avec :

| Propriété | Segment | Run parent |
|-----------|---------|------------|
| Transcript | Brief + scope + objectif tâche | Historique user + synthèses segment |
| Outils | Masque étroit (souvent mutation seule) | Rail complet |
| Prompt system | Tranche executor / act slice | Architecte core + rail |
| Durée | Bornée (`max_iterations` segment) | Bornée run global |
| Sortie | Rapport structuré JSON ou `.md` court | Conversation user |

Réutilise le **mécanisme** de `orchestration_delegate.rs` (sous-`Agent::drive`), pas l’**outil** `delegate_executor` exposé au modèle.

---

## Quand spawner un segment

| Déclencheur | Exemple |
|-------------|---------|
| Station `ACT` + todo item `in_progress` | « Implémenter palette abyss » |
| Fichier cible > seuil (ex. 8 Ko) | `globals.css` réécriture |
| Compteur steps station ACT > seuil | Éviter 200 steps dans le parent |

Le **moteur** décide (pas le modèle via outil). Le modèle peut **demander** un segment via `architect_help` — suggestion seulement.

---

## Cycle segment

```text
Parent (ACT)
  │
  ├─ segment_start(task_id, scope[], brief)
  │
  ▼
Segment loop (RunSpec executor-like)
  │  file_edit / file_write / bash dans scope
  │
  ├─ segment_done(report)
  │
  ▼
Parent intègre report dans ArchitectRunState + snapshot
  │
  └─ advance candidat VERIFY
```

---

## Chapeaux (role masks)

Même binaire, prompts différents par segment :

| Chapeau | Prompt source | Outils |
|---------|---------------|--------|
| `explore` | tranche READ | lecture |
| `propose` | tranche PROPOSE | aucun |
| `execute` | `EXECUTOR_SYSTEM_PROMPT` (existant) | mutation scope |
| `verify` | tranche VERIFY | bash, lsp, read |

Fichiers prompts : `orchestration/prompts/segments/*.md` (nouveau dossier, **fichiers courts** < 80 lignes).

---

## Rapport segment

Format minimal (JSON tool result interne) :

```json
{
  "task_id": "t2",
  "status": "completed|partial|blocked",
  "paths_touched": ["src/styles/globals.css"],
  "summary": "Updated CSS variables for abyss theme.",
  "evidence": "file compiles, no unclosed braces"
}
```

Pas d’obligation `.drox/agent-output/` pour segments 1.4 (option Phase 3).

---

## UI

Chaque segment = **sous-bloc repliable** dans le bloc station `ACT`. Voir [06-UI-BLOCKS.md](06-UI-BLOCKS.md).

Events proposés :

- `railSegmentStart` / `railSegmentDone` (nouveaux)
- Réutilisation possible du rendu `subagentStart` / `subagentDone` (IDE)

---

## Ce qu’on ne fait pas

- Réafficher la vignette Executor au composer.
- Exiger `executorDelegationEnabled` côté user.
- Paralléliser plusieurs segments (1.4 = **séquentiel** ; parallèle = 1.5+).
