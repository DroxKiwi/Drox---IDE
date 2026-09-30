Rédigé à l'aide de Cursor Agent

# Contexte, snip et compaction — faire tenir l’historique dans la fenêtre du modèle

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : la gestion du **contexte** (tout ce qu’on envoie au LLM à chaque tour). Les modèles ont une **fenêtre limitée** (ex. 8k, 32k, 128k tokens). Sans stratégie, un long run explose le budget ou devient hors de prix / hors mémoire.

Socle : [01](01-contact-ollama.md) (appel `stream_chat`), [02](02-boucle-agent.md) (`maybe_snip` dans la boucle).

### L’histoire en une phrase

Avant un nouvel appel coûteux au modèle, le moteur peut **couper** des passages froids (snip) ou **résumer** une partie de l’historique (compaction), puis continuer avec une version allégée.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`drox-context`](../../drox-engine/drox/crates/drox-context/src/lib.rs) | Primitives budget / snip / traits |
| [`context.rs`](../../drox-engine/drox/crates/drox-engine/src/context.rs) | Politique côté agent |
| [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) | Compaction live / résumé |
| [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | `maybe_snip` |
| Réf. | [sessions-and-memory.md](../engine/sessions-and-memory.md) |

---

## Partie A — Qu’est-ce qu’un token ?

Un **token**, c’est une petite unité de texte pour le modèle (souvent un morceau de mot).  
« Bonjour » peut compter pour 1 ou 2 tokens selon le tokenizer.

Drox estime la taille via **tiktoken-rs** (crate `drox-context`) pour savoir si on dépasse le budget (`num_ctx` / politique).

**Côté machine** : compter les tokens ≠ compter les caractères. D’où une lib dédiée plutôt qu’un `len()` naïf.

---

## Partie B — Deux stratégies, deux coûts

| Stratégie | Idée | Coût |
|-----------|------|------|
| **Snip** | Retirer / tronquer des blocs **déterministes** (vieux tool outputs volumineux, etc.) | Pas d’appel LLM — rapide |
| **Compact** | Demander à un modèle de **résumer** une portion d’historique | Coût tokens + latence |

Ordre mental dans Drox : d’abord snip (cheap), puis compaction si encore trop plein.

Événements UI possibles : `ContextSnip`, `ContextCompacted` — tu peux les voir passer dans le fil ([04](04-moteur-et-affichage.md)).

---

## Partie C — `maybe_snip` dans la boucle

Au début d’un tour (idée) :

```text
si politique de contexte active :
    estimer tokens(messages)
    si trop gros → snip
    si encore trop gros → try_live_compact
```

`messages` est la variable **mutable** de l’historique ([02](02-boucle-agent.md)) : après snip/compact, les tours suivants voient la version réduite.

Attention : sniper trop agressivement peut faire « oublier » une décision — d’où archives / mémoire projet ([09](09-sessions-et-memoire.md)).

---

## Partie D — Compaction RPC vs live

| Chemin | Déclencheur |
|--------|-------------|
| Live (`try_live_compact`) | Automatique dans `drive_inner` |
| `session.compact` | Demande explicite client / outil UI |

Les deux visent le même problème (budget), pas au même moment.

---

## Partie E — Lien avec `num_ctx` Ollama

Dans la config LLM ([01](01-contact-ollama.md)), `num_ctx` dit à Ollama la taille de fenêtre.  
Si Drox envoie plus que ce que le serveur accepte, le serveur peut tronquer **silencieusement** — d’où des defaults élevés côté client Ollama et la compaction côté moteur.

---

## Récapitulatif

1. Le contexte = ce qui part dans `stream_chat`.
2. Snip = coupe déterministe ; compact = résumé LLM.
3. Ça se joue **dans** la boucle, avant l’appel coûteux.
4. L’UI peut montrer snip/compact via des événements.

## Suite

[09-sessions-et-memoire.md](09-sessions-et-memoire.md). Index : [README.md](README.md).
