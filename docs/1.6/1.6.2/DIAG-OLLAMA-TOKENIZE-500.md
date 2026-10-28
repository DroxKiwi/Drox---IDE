# Diagnostic — erreur Ollama 500 `/tokenize` (contexte local lourd)

**Symptôme** (message Drox typique) :

```text
LLM error: LLM API error (status 500) at http://localhost:11434/api/chat:
{"error":"Post \"http://127.0.0.1:<port>/tokenize\": dial tcp 127.0.0.1:<port>: connectex: …"}
```

(sous Windows : « l’hôte n’a pas répondu » / timeout de connexion TCP.)

---

## Ce que ce n’est pas

| Hypothèse fréquente | Réalité |
|---------------------|--------|
| Timeout « réponse trop lente » côté **Drox** sur le stream | Drox remonte l’**erreur HTTP du serveur** ; ce n’est pas le même mécanisme qu’un `AbortSignal` applicatif sur une autre requête. |
| Modèle « trop lent » uniquement en génération | Souvent l’échec arrive au **tokenize** (début de tour), avant ou pendant la préparation du contexte. |
| Bug JSON-RPC Drox | Le corps d’erreur vient d’**Ollama** (`/api/chat` → 500). |

---

## Chaîne technique

```text
Drox (drox-llm)  --HTTP-->  Ollama :11434  /api/chat
                                |
                                +--> runner interne (process enfant)
                                        |
                                        +--> http://127.0.0.1:<port>/tokenize
```

- **11434** : API publique Ollama.
- **`<port>` éphémère** : service **interne** du runner (tokenisation / modèle chargé). Ce n’est pas un port configuré dans Drox.
- Si ce processus **ne démarre pas**, **crash** (souvent OOM) ou **ne répond plus**, Ollama renvoie **500** avec le message `Post ".../tokenize"`.

---

## Causes probables (local + gros contexte + petit modèle)

1. **RAM / VRAM insuffisante** — transcript long, `num_ctx` élevé, nombreux `tool_result` : tokenisation + KV cache dépassent la machine → le runner tombe.
2. **Modèle léger** — ne réduit pas la taille du **prompt** ; il peut même laisser **moins de marge** mémoire pour le même contexte.
3. **État Ollama dégradé** — runner zombie après plusieurs runs ; redémarrer le service Ollama.
4. **Version / modèle GGUF** — bug ou quantification limite ; mettre à jour Ollama ou tester un autre tag.

---

## Pistes utilisateur

1. **Immédiat** : arrêter le run, `ollama ps`, redémarrer Ollama, **Retry** ou nouveau message après compaction.
2. **Réduire la fenêtre** : compaction / nouveau fil ; baisser `num_ctx` si monté ; laisser le moteur snip/compacter (L1, `maybe_snip`).
3. **Observer** Task Manager (RAM/VRAM) au moment de l’erreur.
4. **Repro hors IDE** : `ollama run <model>` ou curl `/api/chat` avec un extrait du transcript.
5. **Logs Ollama** (app Windows / journal du service).

---

## Côté Drox (évolutions possibles, hors correctif Ollama)

- Message UX dédié si le corps contient `/tokenize` (suggestion compact + redémarrage Ollama).
- Doc engine : voir [llm-backends.md](../../engine/llm-backends.md) (pièges fréquents).

Réf. runtime : [`drox-llm` Ollama](../../drox-engine/drox/crates/drox-llm/src/adapters/ollama.rs), pas d’appel direct au port `tokenize` depuis Drox.
