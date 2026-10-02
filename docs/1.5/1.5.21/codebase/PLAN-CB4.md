# Plan CB4 — Contexte `@Codebase` automatique + forçage utilisateur

**Parent** : [PLAN-CB3.md](PLAN-CB3.md) · [ARCHITECTURE.md](ARCHITECTURE.md)  
**Suite** : [PLAN-CB4b.md](PLAN-CB4b.md)  
**Impl** : [IMPLEMENTATION-CB4-CB4b.md](IMPLEMENTATION-CB4-CB4b.md)  
**Statut** : ✅ **done** · auto-inject + chip forçage + ancrage éditeur (2026-10-02)

## Décision produit

L’utilisateur veut le système **le plus automatique et indépendant**, **le plus pertinent pour le modèle**, tout en pouvant **forcer** l’embed quand il le sent nécessaire.

| Couche | Comportement | Défaut |
|--------|----------------|--------|
| **Auto-inject** | À chaque `agent.run`, retrieval hybrid → bloc contexte borné injecté **sans action UI** | **ON** |
| **Forçage utilisateur** | Chip « Joindre Codebase » : maxHits ↑ + **ancrage éditeur actif** (`pathPrefixes` = fichier + dossier parent) | Opt-in par tour |
| **Tool** | `codebase_search` pour raffiner | Toujours (sauf disabled tools) |
| **Hint système** | Intention → index ; symbole exact → `grep` | Toujours |

Le chip = **override**, pas le chemin nominal.

## Livré

1. Pack + hook `agent.run` + settings autoInject  
2. Chip forçage + cockpit Last inject + export `lastInject`  
3. Force + éditeur → `forcePathPrefixes`  

## Critères dogfood

Voir [IMPLEMENTATION-CB4-CB4b.md](IMPLEMENTATION-CB4-CB4b.md) § Critères dogfood.

## Hors scope

CB3b · CB5 · SAV → [1.5.22](../../1.5.22/README.md)
