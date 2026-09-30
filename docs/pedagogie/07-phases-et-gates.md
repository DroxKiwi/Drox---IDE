Rédigé à l'aide de Cursor Agent

# Phases et gates — le protocole `[phase:]` et les règles de clôture

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le **protocole de phases** (lignes `[phase: answering]`, `[phase: done]`, …) et les **gates** (verrous) qui empêchent de terminer un run trop tôt ou de muter sans plan.

C’est le « règlement de conduite » du modèle, à moitié dans le **prompt**, à moitié dans le **Rust**.

Socle : [01](01-contact-ollama.md), [02](02-boucle-agent.md).

### L’histoire en une phrase

Le modèle annonce où il en est avec des marqueurs texte ; le moteur **lit** ces marqueurs, applique des règles dures (todos, testing…), et refuse un `done` invalide en **relançant** avec un nudge.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) | Texte imposé au modèle |
| [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | Parse phases, gates, nudges |
| [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) | `Phase` / `PhaseEnter` |
| Réf. | [system-prompts-and-phases.md](../engine/system-prompts-and-phases.md) |

---

## Partie A — Une phase, c’est quoi ?

Une **phase**, c’est une **étiquette narrative** du tour en cours : « je lis », « j’édite », « je réponds à l’utilisateur », « j’ai fini ».

Format obligatoire — **seul sur sa ligne** :

```text
[phase: reading]
[phase: acting]
[phase: answering]
[phase: done]
```

Ce n’est **pas** un tool. Pas de `tool_call` nommé `phase`.  
`consume_stream` détecte la ligne → souvent un `AgentEvent::PhaseEnter` pour l’UI.

**Pourquoi du texte plat ?** Simple à parser, visible dans le transcript, indépendant du format tool du provider LLM.

---

## Partie B — Prompt vs gate (deux couches)

| Couche | Rôle |
|--------|------|
| **Prompt** (`prompts.rs`) | Explique les règles au modèle en langage naturel |
| **Gate** (`agent.rs`) | **Applique** la règle : bloque un tool ou refuse `done` |

Si on n’avait que le prompt, un modèle distrait pourrait ignorer.  
Les gates rendent certaines règles **non négociables**.

---

## Partie C — Gates essentielles (résumé)

| Gate | Comportement typique |
|------|----------------------|
| Todo avant mutation | Pas de `file_edit` / écriture / bash mutateur tant qu’aucun `todo_write` réussi dans le run (les lectures peuvent précéder) |
| Todos ouverts | `[phase: done]` refusé si des items restent `pending` / `in_progress` |
| Testing après code | Après mutation de sources, exiger `[phase: testing]` + outil de vérif avant le done final |
| Answering avant done | `done` sans `answering` → nudge « réécris » |
| Anti-boucle | Tours identiques répétés → nudge puis abort (`LoopDetected`) |

Le détail vivant est dans le code + [référence phases](../engine/system-prompts-and-phases.md).

---

## Partie D — Qu’est-ce qu’un nudge ?

Un **nudge**, c’est un **message système injecté** dans l’historique quand le modèle dévie : pas de `done`, todos sales, etc.

Ce n’est pas l’humain qui parle.  
Au tour suivant, le modèle « voit » le rappel et (en théorie) corrige.

Constantes du genre `NUDGE_PROMPT`, `DONE_ONLY_NUDGE_PROMPT` dans `agent.rs`.

---

## Partie E — `todo_write` n’est pas une phase

Anti-pattern : écrire `[phase: todo_write]` + JSON dans le texte.  
Correct : `[phase: planning]` puis un **vrai** tool_call `todo_write` avec arguments structurés.

Même logique pour `glob`, `file_read`, etc.

---

## Partie F — Lien UI

Les phases alimentent l’affichage ([04](04-moteur-et-affichage.md)).  
Le shim peut encore fabriquer d’anciens `rail_station_*` pour compat — le moteur réel, lui, est **phase-driven** (`tui_mono`).

---

## Récapitulatif

1. Phases = balises texte lues par le moteur et l’UI.
2. Gates = verrous Rust ; nudges = rappels injectés.
3. Seul un `done` valide **termine** la boucle proprement.
4. Prompt et code doivent rester **alignés**.

## Suite

[08-contexte-et-compaction.md](08-contexte-et-compaction.md). Index : [README.md](README.md).
