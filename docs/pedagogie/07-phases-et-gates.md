# Phases et gates — le protocole `[phase:]` et les règles de clôture

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le **protocole de phases** (lignes `[phase: answering]`, `[phase: done]`, …) et les **gates** (verrous) qui empêchent de terminer un run trop tôt ou de muter sans plan.

C’est le « règlement de conduite » du modèle, à moitié dans le **prompt** (`drox-prompts`), à moitié dans le **Rust** (`agent/gates/`, `drive.rs`).

Socle : [01](01-contact-ollama.md), [02](02-boucle-agent.md).

### L’histoire en une phrase

Le modèle annonce où il en est avec des marqueurs texte ; le moteur **parse** ces lignes, **applique** des règles dures, et **relance** avec un nudge si la clôture n’est pas valide — sauf en profil **local**, où la clôture peut être **portée par le moteur** sans `[phase: done]`.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`drox-prompts/`](../../drox-engine/drox/crates/drox-prompts/) | **Texte** CORE, gates, nudges runtime (`gates.rs`, `local.rs`, …) |
| [`drox-cli/src/prompts/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts/mod.rs) | Façade : CORE selon `EngineProfile` |
| [`agent/run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) | Ordre des branches : clôture locale, `done`, nudges |
| [`agent/consume_llm_stream.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs) | Parse `[phase:…]` → `PhaseEnter` |
| [`agent/gates/`](../../drox-engine/drox/crates/drox-engine/src/agent/gates/) | Verrous todo / mutation / professor |
| [`agent/nudges.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/nudges.rs) | Re-exports des constantes nudge injectées |
| [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) | Enum `Phase` |
| Réf. | [system-prompts-and-phases.md](../engine/system-prompts-and-phases.md) |

---

## Partie A — Une phase, c’est quoi ?

Une **phase**, c’est une **étiquette narrative** du tour : « je lis », « j’édite », « je réponds », « j’ai fini ».

Format — **seul sur sa ligne** :

```text
[phase: reading]
[phase: acting]
[phase: answering]
[phase: done]
```

Ce n’est **pas** un tool.  
`consume_stream` détecte la ligne → `AgentEvent::PhaseEnter` pour l’UI.

---

## Partie B — Prompt vs gate (deux couches)

| Couche | Où | Rôle |
|--------|-----|------|
| **Prompt** | **`drox-prompts`** (+ injection RPC) | Explique les règles au modèle |
| **Gate / clôture** | **`drive.rs`** + **`gates/`** | **Applique** : bloque un tool, refuse `done`, ou clôt en local |

Sans gates, un modèle pourrait ignorer le prompt.  
Les règles critiques sont **non négociables** côté Rust.

### Profil moteur (`EngineProfile`)

Paramètre RPC / IDE : `engineProfile` → `local-9b` | `local-27b` | `cloud-full` ([`config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs)).

| Profil | CORE prompt | Clôture |
|--------|-------------|---------|
| **`cloud-full`** | Protocole 1.6.0 complet | **`[phase: done]`** obligatoire (+ gates) |
| **`local-9b` / `local-27b`** | `CORE_LOCAL` allégé | Tour **sans outil** → fin moteur ; `done` optionnel |

Même boucle `drive_inner` — **knobs** différents, pas un second moteur.

---

## Partie C — Gates essentielles (résumé)

### Surtout en **`cloud-full`**

| Gate | Comportement |
|------|----------------|
| Todo avant mutation | **Gate dure** : pas de mutateurs sans `todo_write` réussi avant (lectures / bash inspectif OK avant) |
| Todos ouverts | `[phase: done]` refusé si `pending` / `in_progress` |
| Testing après code | Mutation sources → `[phase: testing]` + vérif avant `done` final |
| Answering avant done | `done` sans `answering` → nudge réécriture |
| Tour sans `done` | `DONE_ONLY` ou `NUDGE_PROMPT` selon l’état |

En **`local-9b` / `local-27b`** : pas de gate dure « todo avant mutation » ; todos souvent **soft** ; clôture **moteur** avant d’exiger `done`.

### Tous profils (parent)

| Mécanisme | Comportement |
|-----------|----------------|
| **Anti-boucle** | `LoopDetector` : répétition → nudge → tools off → souvent **`SyntheticDone`** (Stop propre), pas toujours une erreur brutale |
| **Intent-only write** | `[phase: acting]` sans tool → nudges FX-B |

Le détail : [agent-internals.md](../engine/agent-internals.md).

### Exemple concret — gate « todo avant mutation »

Logique dans [`agent/gates/`](../../drox-engine/drox/crates/drox-engine/src/agent/gates/) (ex. `requires_todo_write_gate`) :

```rust
fn requires_todo_write_gate(/* tool_name, arguments, … */) -> bool {
    // … selon le nom d’outil et parfois le contenu bash …
}
```

Appelée depuis [`run/lifecycle.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs) **avant** `execute` : si le gate exige un plan todo et qu’aucun `todo_write` réussi n’a eu lieu, l’appel mutateur est **bloqué**.

| Idée | Code |
|------|------|
| Décision pure | `fn … -> bool` |
| Emprunts | `&str`, `&Value` — on lit sans prendre ownership |
| Pipeline tool | Entre demande modèle et exécution |

---

## Partie D — Qu’est-ce qu’un nudge ?

Un **nudge** = **`Message::system(...)`** injecté quand le modèle dévie.

Le **texte** vit dans **`drox-prompts`** (`NUDGE_PROMPT`, `DONE_ONLY_NUDGE_PROMPT`, `unfinished_todos_prompt`, `LOCAL_SOFT_CLOSE_CHECK_NUDGE`, …).  
Le moteur les importe via [`agent/nudges.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/nudges.rs).

### Exemple concret — injection

Dans `drive_inner`, quand le modèle s’arrête sans clôture valide :

```rust
messages.push(Message::system(DONE_ONLY_NUDGE_PROMPT));
// … la boucle for continue → nouvel stream_chat …
```

Autre cas :

```rust
messages.push(Message::system(NUDGE_PROMPT));
```

| Morceau | Détail |
|---------|--------|
| Constantes | Définies dans **`drox-prompts`**, pas copiées dans `drive.rs` |
| `Message::system(…)` | Rôle **system** dans l’historique |
| `messages.push(…)` | Le prochain `stream_chat` voit le rappel |
| Pas de `return` | On enchaîne un nouvel `iter` |

### Anti-boucle (ne pas confondre avec un nudge « done »)

Si le modèle **répète** le même tour (texte + tools) :

1. **Warn** — nudge `LOOP_DETECTED`  
2. **ForceConclude** — tools désactivés  
3. **`SyntheticDone`** — le moteur émet **Stop** sans forcément planter le process

Voir aussi [03-gestion-erreurs.md](03-gestion-erreurs.md) — `LoopDetected` reste possible sur d’**autres** chemins, mais la fin de run répétitif est souvent **`SyntheticDone`**.

---

## Partie E — `todo_write` n’est pas une phase

Anti-pattern : `[phase: todo_write]` + JSON inline.  
Correct : texte en `planning` puis **tool_call** `todo_write`.

---

## Partie F — Lien UI

Phases → [04-moteur-et-affichage.md](04-moteur-et-affichage.md).  
Shim `rail_station_*` = compat UI ; le moteur reste **`tui_mono`** + phases.

---

## Récapitulatif

1. Phases = balises lues par `consume_stream`.
2. **Prompt** (`drox-prompts`) + **gates** (`drive` / `gates/`) doivent rester alignés.
3. **`cloud-full`** : seul un **`done` valide** (sous gates) termine proprement la boucle protocolaire.
4. **Profils locaux** : clôture **moteur** possible sans `done` — lire [02](02-boucle-agent.md).

## Suite

[08-contexte-et-compaction.md](08-contexte-et-compaction.md). Index : [README.md](README.md).
