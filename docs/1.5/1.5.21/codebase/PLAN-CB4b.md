# Plan CB4b — Ranking + compréhension modèle (pas d’heuristique NL)

**Parent** : [PLAN-CB4.md](PLAN-CB4.md)  
**Impl** : [IMPLEMENTATION-CB4-CB4b.md](IMPLEMENTATION-CB4-CB4b.md)  
**Statut** : ✅ **done** · aligné RULES §6

## Principe (strict)

**Interdit** : stopwords / NLP sur le message utilisateur.  
**Obligatoire** : question **anglaise versionnée** → JSON filtre → application **mécanique**.

```text
user message
  → ModelQuestion (v1 | v1-compact | …)
  → IDroxCodebaseRetrievalFilter
  → index.search + re-rank(flags filtre seulement)
  → inject / lastInject
```

## Code

`common/modelQuestions/` · `droxCodebaseRerank.ts` · ignore `.tsbuildinfo` / `.map`  
Détail fichiers : [IMPLEMENTATION-CB4-CB4b.md](IMPLEMENTATION-CB4-CB4b.md)

## Hors scope

Auto-sélection variante (1.5.22) · autres questions catalogue
