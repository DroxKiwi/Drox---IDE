# Les grands axes du moteur Drox

Sommaire en une requête — parcours linéaire typique (IDE).

```text
TOI  « corrige ce bug »
  │
  ▼
1. CLIENT          (IDE / TUI · agent.run)
  │
  ▼
2. RÉGULATION      (notes L1–L5 · Auto)
  │
  ▼
3. CONTEXTE        (Codebase / RAG · .drox · session)
  │
  ▼
4. BOUCLE AGENT    (tours jusqu’à done)
  │
  ├─► 5. BACKEND LLM     (Ollama / OpenAI-compat)
  ├─► 6. PHASES          ([phase:] · todos · done)
  ├─► 7. GATES / NUDGES  (freins · relances)
  └─► 8. OUTILS          (bash · edit · permissions)
  │
  ▼
9. RÉPONSE         (agent/done · visible)
```

**Dans l’ordre :**

1. **Client** (IDE / TUI · `agent.run`) — envoie ta question au moteur.
2. **Régulation** (notes L1–L5 · Auto) — décide ce que le modèle a le droit de voir / utiliser.
3. **Contexte** (Codebase / RAG · `.drox` · session) — historique, mémoire, éventuellement extraits de code.
4. **Boucle agent** (tours jusqu’à done) — cœur du moteur : on répète 5→8 jusqu’à clôture.
5. **Backend LLM** (Ollama / OpenAI-compat) — le modèle *génère* du texte, il n’orchestre pas.
6. **Phases** (`[phase:]` · todos · done) — le modèle annonce où il en est.
7. **Gates / nudges** (freins · relances) — le moteur bloque ou relance si ça dérive.
8. **Outils** (bash · edit · permissions) — le moteur agit sur le projet selon les droits.
9. **Réponse** (`agent/done` · visible) — résultat final, parcours rejouable.

Le modèle **génère**. Le moteur **orchestre**. Chaque axe a sa place dans ce parcours.
