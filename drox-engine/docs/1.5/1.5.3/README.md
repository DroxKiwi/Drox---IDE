# Drox 1.5.3 — Profils de sampling par contexte

**Statut** : **planifié** (après [1.5.2](../1.5.2/README.md))  
**Prérequis** : [single profile moteur](../../1.4/1.4.1/README.md) · [context frame / tool folders](../../1.4/1.4.1/1.4.1.3/README.md) · réglages LLM avancés **dev-only** (IDE `droxSurface: dev`)

---

## En une phrase

Fichier de configuration **arboré** (workspace ou machine) qui associe **paramètres de sampling** (`top_p`, `repeat_penalty`, `temperature`, …) au **contexte du tour LLM** — phase, station rail, outil attendu, mode architecte — pour dogfood et tuning modèle sans multiplier les réglages IDE.

---

## Problème

Aujourd’hui, un run `agent.run` partage **un seul** jeu de paramètres LLM (Settings ou `.drox/.env`) pour toute la durée du run :

- en **discussion** initiale, on veut souvent plus de créativité (`top_p` élevé, `repeat_penalty` léger) ;
- en **édition de fichier** (`file_edit` / `acting`), on veut plus de déterminisme (température basse, pénalités ajustées) ;
- les **gates** et **stations rail** changent déjà le prompt et les outils — pas le sampling.

Résultat dogfood (Qwen 27B, etc.) : même profil sur des tâches hétérogènes → répétitions en edit, ou réponses trop plates en discuss.

---

## Piste 1.5.3

```text
.drox/llm-sampling.yaml   (ou chemin machine dev)
        │
        ├─ defaults          ← base héritée par tous les tours
        ├─ profiles.*        ← nœuds nommés, merge en cascade
        │     match: { phase, rail_station, tool, architect_mode, … }
        │     sampling: { top_p, repeat_penalty, … }
        └─ resolve(tour)     ← moteur, avant stream_chat
              → ChatOptions du tour
              → trace LlmTurnPrepared (+ champ sampling_profile)
```

**Hors scope release** : pas d’UI Settings utilisateur ; fichier versionné en dev / CI dogfood uniquement.

---

## Liens

- [Plan détaillé](PLAN-1.5.3.md)
- [Exemple de fichier](examples/llm-sampling.example.yaml)
- [Hub 1.5](../README.md)
- [Événements & phases](../../1.4/moteur/10-evenements-phases/README.md)
- [Run rail](../../1.4/moteur/09-run-rail/README.md)
