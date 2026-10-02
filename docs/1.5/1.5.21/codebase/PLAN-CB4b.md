# Plan CB4b — Ranking + compréhension modèle (pas d’heuristique NL)

**Parent** : [PLAN-CB4.md](PLAN-CB4.md)  
**Statut** : 🔄 **impl** · aligné RULES §6

## Principe (strict)

**Interdit** : listes de mots FR/EN / stopwords / NLP sur le message utilisateur.  
**Obligatoire** : étape **compréhension** = question **anglaise versionnée** au modèle → JSON filtre → application **mécanique**.

```text
user message
  → ModelQuestion (catalog, variant v1 | v1-compact | …)
  → IDroxCodebaseRetrievalFilter { searchQuery, pathPrefixes, preferCodeFiles, skipRetrieval }
  → index.search(searchQuery) + re-rank(flags du filtre seulement)
  → inject / lastInject
```

## Code

| Zone | Rôle |
|------|------|
| `common/modelQuestions/` | Catalogue, parse, resolve variant, LLM one-shot, service |
| `questions/codebaseRetrievalComprehension.ts` | Textes EN v1 / v1-compact |
| Setting `drox.modelQuestions.codebaseRetrievalComprehensionVariant` | Choix de variante (SAV / auto-reg 1.5.22) |
| `droxCodebaseRerank.ts` | Boost path **uniquement** si `preferCodeFiles` vient du filtre modèle |
| Ignore `.tsbuildinfo` / `.map` | Filtre fichiers (pas du NL) |

## Hors scope ici

- Auto-sélection de variante par scores modèle (1.5.22)  
- Autres questions catalogue (SAV erreurs, etc.) — même dossier `modelQuestions/`
