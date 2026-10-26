# 1.6.1 — Sous-run par défaut (presets = véhicule)

**Statut** : **ouvert** (cadrage figé) · pas de code tant que lots non validés  
**Précédent** : [1.6.0](../1.6.0/README.md) — **freeze** ([CLOSURE](../1.6.0/CLOSURE-1.6.0.md)) · pas ship qualité  
**Git** : **pas** de merge `1.6.0` → `main`. Branche `1.6.1` **depuis** `1.6.0`. Merge `main` **quand 1.6.1 est un produit stable et un historique propre** ; sinon `1.6.2` de lissage. Voir [hub 1.6](../README.md) § Git.

**Cadrage** : [CADRAGE.md](CADRAGE.md)

## Cap

Même paradigme 1.6.0 (phases, tools, MEMORY/DROX, L1–L5, Explore). **Ne pas** supprimer la sur-spécification cloud.

**But** : un petit modèle accomplit un **gros** chantier parce que le travail est des **sous-runs** à contexte étroit, **portés par le moteur** — pas parce que le parent 9B exécute le protocole Plan→Assign→Merge à la main.

Les **presets** (et l’onglet derrière) sont le **véhicule** : `local-9b` = sous-run cheap / rituel synthétisé ; `cloud-full` = protocole 1.6.0 entier.

| Barre | Critère |
|-------|---------|
| Canari `ornith-1.5:9b` | Gros run **termine** (writes + Stop), même **sale** |
| Qualité Qwen ~27B | Même contrat, plus propre |
| Infra | Tools / merge / host **ne mentent pas** — hors presets |

Sans RAG vectoriel sur le transcript. Sans nouveau protocole d’agent.

## Avancement

| Volet | État |
|-------|------|
| Cadrage (sous-run défaut · presets véhicule) | ✅ [CADRAGE](CADRAGE.md) |
| Inventaire tour-0 parent vs child | ✅ [INVENTAIRE-TOUR-0](INVENTAIRE-TOUR-0.md) · 2026-10-20 |
| Table knobs × presets | ✅ [CADRAGE](CADRAGE.md) §3bis |
| Défaut produit | ✅ `local-9b` |
| Libellés UI sélecteur | 📐 [CADRAGE](CADRAGE.md) §3ter |
| Settings UI + `drox.engine.profile` | ✅ Lot 1 — valeur jusqu’à `agent.run` / `AgentConfig` ; protocole identique 1.6.0 |
| Presets câblés (dont orchestration Explore) | 🟡 Étages 0–2 (2026-10-26) — schéma Ollama, spill/hot-snip, `.drox/scratch`, CORE local, clôture moteur, surface parent §3bis, rapport `task` inline, retry Explore, annexe L4 par profil · à valider en dogfood |
| Dogfood Ornith 9B (gros chantier / sous-runs) | 🟡 Run 1 (1h21, pré-étages) analysé · run 2 à faire |
| Dogfood Qwen 27B | ⬜ |
| Reprise réserves 1.6.0 (P2 bash, D5, D6, S1–S4) | ⬜ si encore bloquant |

## Docs

| Fiche | Sujet |
|-------|--------|
| [CADRAGE.md](CADRAGE.md) | Décisions produit |
| [INVENTAIRE-TOUR-0.md](INVENTAIRE-TOUR-0.md) | Photo premier prompt parent vs child |
| [1.6.0 PASSATION](../1.6.0/PASSATION-1.6.0.md) | Obstacles infra — ne pas les « fixer » par un preset |
