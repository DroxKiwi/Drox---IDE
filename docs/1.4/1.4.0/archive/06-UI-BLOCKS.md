# 06 — UI blocs repliables

**Parent** : [README](README.md) · **Code** : [05-CODE-ARCHITECTURE.md](05-CODE-ARCHITECTURE.md)

---

## Objectif

L’utilisateur voit **où** en est le run, sans lire 45k tokens :

- un **bloc repliable par station empruntée** ;
- titre court + métriques minimales ;
- segments ACT en **sous-blocs** imbriqués.

---

## Hiérarchie visuelle

```text
▼ Réponse                          ✓ · 1 message
▶ Exploration                      12 outils · repliable
▶ Proposition                      en attente validation
▼ Exécution · palette CSS          en cours
    ▶ Segment t2 — globals.css     3 edits
▶ Vérification                     bash · cargo check
```

Stations **non empruntées** : pas de bloc (pas de bruit).

---

## Champs bloc (info minimale)

| Champ | Exemple |
|-------|---------|
| `station` | `read`, `act`, … |
| `label` | « Exploration », « Exécution · palette CSS » |
| `status` | `running` \| `done` \| `waiting_user` \| `blocked` |
| `tool_count` | 12 |
| `summary` | optionnel, 1 ligne (fin de station) |

Pas de dump transcript dans le bloc.

---

## Events moteur → IDE

| Event | Quand |
|-------|-------|
| `railStationEnter` | `advance` vers nouvelle station |
| `railStationHold` | `hold` — passage vers ANSWER |
| `railStationDone` | station terminée (hold ou advance suivant) |
| `railSegmentStart` | segment ACT spawn |
| `railSegmentDone` | rapport segment intégré |

Payload minimal :

```json
{
  "station": "act",
  "label": "Exécution · palette CSS",
  "task_id": "t2"
}
```

Réutiliser le canal `AgentEvent` existant — nouvelle variante enum, pas canal parallèle.

---

## Mapping stations → libellés FR (défaut UI)

| Station | Libellé |
|---------|---------|
| `intent` | Intention |
| `read` | Exploration |
| `propose` | Proposition |
| `plan` | Plan |
| `act` | Exécution |
| `verify` | Vérification |
| `answer` | Réponse |

i18n : clés `drox.rail.station.*` — pas de strings en dur dans le moteur Rust (sauf logs).

---

## États `waiting_user`

Affiché quand :

- PROPOSE + question ouverte + hold PROPOSE actif ;
- circuit breaker ACT ;
- `ask_user_question` en attente (existant).

Badge discret : « En attente de votre retour ».

---

## Implémentation IDE (phases)

| Phase | Livrable |
|-------|----------|
| U1 | Types + events, pas de rendu |
| U2 | Bloc station repliable (sans segment) |
| U3 | Sous-blocs segment |
| U4 | Export transcript aligné blocs |

**1.4** peut livrer U2 avant U3 si moteur segments en Phase 3.

---

## Non-objectifs UI 1.4

- Refonte complète chat webview ([1.3.4 Phase U](../../../1.3/1.3.4/PLAN-1.3.4.md) reste distincte).
- Timeline Gantt des stations.
- Édition manuelle du plan dans le bloc.
