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
4. BOUCLE AGENT    (tours jusqu’à clôture · profil moteur)
  │
  ├─► 5. BACKEND LLM     (Ollama / OpenAI-compat)
  ├─► 6. PHASES          ([phase:] · todos · done ou clôture locale)
  ├─► 7. GATES / NUDGES  (freins · relances · SyntheticDone)
  └─► 8. OUTILS          (bash · edit · permissions)
  │
  ▼
9. RÉPONSE         (agent/done · visible)
```

**Dans l’ordre :**

1. **Client** (IDE / TUI · `agent.run`) — envoie ta question au moteur (`engineProfile` optionnel).
2. **Régulation** (notes L1–L5 · Auto) — décide ce que le modèle a le droit de voir / utiliser.
3. **Contexte** (Codebase / RAG · `.drox` · session) — historique, mémoire, éventuellement extraits de code.
4. **Boucle agent** — cœur du moteur (`drive_inner`) : on répète 5→8 jusqu’à **clôture** :
   - **`cloud-full`** : protocole complet, fin sur **`[phase: done]`** (sous gates) ;
   - **`local-9b` / `local-27b`** : souvent fin moteur sur un tour **sans outil** (CORE allégé).
5. **Backend LLM** (Ollama / OpenAI-compat) — le modèle *génère* du texte, il n’orchestre pas.
6. **Phases** — balises `[phase:]` ; **`done`** surtout requis en **`cloud-full`**.
7. **Gates / nudges** — le moteur bloque ou relance si ça dérive ; anti-boucle → **SyntheticDone**.
8. **Outils** (bash · edit · permissions) — le moteur agit sur le projet selon les droits.
9. **Réponse** (`agent/done` · visible) — résultat final, parcours rejouable.

Le modèle **génère**. Le moteur **orchestre**. Chaque axe a sa place dans ce parcours.

Détail pédagogique : [02-boucle-agent.md](../../02-boucle-agent.md) · [07-phases-et-gates.md](../../07-phases-et-gates.md).
