# Gros modèle vs Drox + petit modèle

```text
┌─────────────────────────────────────────────────────────────────┐
│                     TA QUESTION                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
           ┌─────────────────┴─────────────────┐
           ▼                                   ▼
┌──────────────────────────┐     ┌──────────────────────────────┐
│   GROS MODÈLE            │     │   DROX + PETIT MODÈLE        │
│   « tout seul »          │     │   « ping-pong »              │
├──────────────────────────┤     ├──────────────────────────────┤
│                          │     │                              │
│  Dans les poids /        │     │  Question                     │
│  l'entraînement :        │     │      ↕                       │
│                          │     │  Petit modèle (génère)       │
│  • raisonnement interne  │     │      ↕                       │
│  • gros contexte         │     │  Moteur Drox                 │
│  • découpe du savoir     │     │    · tools                   │
│  • planning implicite    │     │    · phases / gates          │
│  • « intuition » opaque  │     │    · contexte / mémoire      │
│                          │     │    · nudges / régulation     │
│                          │     │      ↕                       │
│  → une génération        │     │  Résultats outils            │
│    opaque, tout-en-un    │     │      ↕                       │
│                          │     │  … jusqu'à une réponse       │
│                          │     │    cadrée, rejouable         │
└──────────────────────────┘     └──────────────────────────────┘
           │                                   │
           ▼                                   ▼
     RÉPONSE                             RÉPONSE
  (boîte noire)                   (parcours visible)
```

Un **gros modèle** porte en lui (poids + entraînement) le raisonnement interne, le gros contexte, la découpe du savoir, et bien d’autres capacités. Tout se joue dans la boîte : question → réponse opaque.

**Drox** mise sur un modèle **modeste** et externalise le reste : outils, phases, contexte, nudges. Question, petit modèle et moteur se renvoient la balle jusqu’à une réponse aussi pertinente que possible — avec un parcours visible et plus déterministe.

Le modèle **génère**. Le moteur **orchestre** le raisonnement. On remet chaque pièce à sa place.
