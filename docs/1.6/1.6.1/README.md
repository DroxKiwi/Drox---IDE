# 1.6.1 — Profils moteur (petits modèles · presets · même paradigme)

**Statut** : **ouvert** (cadrage) · pas de code tant que lots non validés  
**Précédent** : [1.6.0](../1.6.0/README.md) — **freeze** ([CLOSURE](../1.6.0/CLOSURE-1.6.0.md)) · pas ship qualité  
**Git** : **pas** de merge `1.6.0` → `main`. Branche `1.6.1` **depuis** `1.6.0`. Merge `main` **quand 1.6.1 est un produit stable et un historique propre** ; sinon `1.6.2` de lissage. Voir [hub 1.6](../README.md) § Git.

**Cadrage** : [CADRAGE.md](CADRAGE.md)

## Cap

Garder le paradigme 1.6.0 (phases, tools, MEMORY/DROX, L1–L5, Explore). **Ne pas** supprimer la sur-spécification cloud.

**Adapter** le drive au modèle via :

1. **Presets** (produit) — peu de profils nommés, reproductibles.
2. **Onglet réglages moteur** (avancé) — knobs derrière les presets, pas 40 cases dès l’install.
3. **Canari `ornith-1.5:9b`** — un gros chantier **peut aboutir**, même **mal** (écrit, Stop propre).
4. **Référence qualité `qwen3.8` ~27B** — même profil, meilleur rendu.
5. Infra **toujours vraie** (tools qui ne mentent pas, compaction persistée, clôture) — **hors** presets.

Sans RAG vectoriel sur le transcript. Sans nouveau protocole d’agent.

## Avancement

| Volet | État |
|-------|------|
| Cadrage (knobs vs toujours-vrai, presets) | 📐 [CADRAGE](CADRAGE.md) |
| Inventaire tour-0 (ce que voit un 9B) | ⬜ |
| Settings UI + `drox.*` | ⬜ |
| Presets câblés au drive / prompts / gates | ⬜ |
| Dogfood Ornith 9B (autonomie sale) | ⬜ |
| Dogfood Qwen 27B | ⬜ |
| Reprise réserves 1.6.0 (P2 bash, D5 pager, D6, S1–S4) | ⬜ si encore bloquant |

## Docs

| Fiche | Sujet |
|-------|--------|
| [CADRAGE.md](CADRAGE.md) | Décisions produit + seaux knobs |
| [1.6.0 PASSATION](../1.6.0/PASSATION-1.6.0.md) | Obstacles infra déjà vus — ne pas les « fixer » par un preset |
