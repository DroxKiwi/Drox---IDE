# Diagnostic — contexte « sérieux » (hors vectoriel transcript)

**Version** : [1.6.0](README.md) · Vague 4  
**Statut** : 🟢 **S-1…S-5 livrés** · dogfood D1–D5 encore dû  
**Plan opérable** : [PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md)

---

## 1. Comment le modèle reçoit vraiment le contexte

À **chaque** tour LLM, Drox envoie un bloc chat :

1. **System** (CORE + suppléments régulation / Explore / …)
2. **Historique** (user + assistant + **tool results** déjà exécutés)
3. **Schémas des tools** exposés

Les outils ne « captent » rien hors bande : un `file_read` / `bash` ne réduit le futur prompt **que** si le moteur snip/compacte ou si le parent n’a reçu qu’un résumé (Explore). Sinon le stdout reste dans la fenêtre et grossit.

Réf. runtime : [sessions-and-memory.md](../../engine/sessions-and-memory.md).

---

## 2. Vectoriel sur l’historique / les tools ?

| Stocker en embeddings… | Verdict |
|------------------------|---------|
| Fil de discussion du **run courant** | **Non** comme source primaire — on perd l’ordre causal agent |
| Détail brut des tool results | **Non** — les edits ont besoin du contenu **exact**, pas d’un voisin sémantique |
| Codebase / docs stables | **Oui** (déjà proche grep / map / Explore) |
| Mémoire **cross-session** (`session_search`, archives) | **Oui, à la demande** — pas collé à chaque tour |

**Décision produit 1.6.0** : pas de BDD vectorielle pour composer le prompt chaud. Alléger = **curation** (situation card + snip + compact structuré), pas RAG du transcript.

---

## 3. Ce que font les apps sérieuses (cible)

| Technique | Rôle |
|-----------|------|
| Fenêtre active courte | N derniers tours chauds verbatim |
| Compaction / résumé | Historique froid → checkpoint typé |
| Snip / spill tool results | Gros stdout hors prompt ; re-read à la demande |
| **Situation card** | Objectif · todos · fichiers touchés · dernier échec — **réécrit chaque tour** |
| Index codebase | Embeddings / recherche code, pas le fil chat |
| Mémoire durable | Notes / MEMORY — injection sélective |

---

## 4. Déjà là côté Drox (Vagues 1–3 + dogfood FX-B)

| Brique | État |
|--------|------|
| Snip déterministe + compact live (+ rewrite JSONL C-1) | ✅ |
| Spill gros tool results → `.drox/tool-outputs/` (T-1) | ✅ |
| Objectif de run / todos / archives / MEMORY | ✅ |
| Workspace map + Explore (`task`) | ✅ (1.5.23 + défaut ON) |
| FX-B intent-only write + nudge **chunk** large write | ✅ dogfood |
| UI abort `intent_only_write` distincte | ✅ idem |

---

## 5. Écarts restants (Vague 4 — même 1.6.0)

| # | Manque | Effet modèle | Priorité |
|---|--------|--------------|----------|
| **S-1** | Pas de **situation card** par tour | Re-déduit l’état depuis un fil géant | ★★★ |
| **S-2** | Snip/spill encore trop doux sur le **chaud** | Un gros `Get-Content` noie les tours suivants | ★★★ |
| **S-3** | Compact souvent **narratif** | Après compact, plan opérationnel flou | ★★ |
| **S-4** | CORE system **trop dense** | Attention diluée | ★★ |
| **S-5** | Parent lit trop malgré Explore | Contexte parent saturé | ★★ |
| **S-6** | Schémas tools toujours full | Coût fixe (secondaire) | ★ |
| **S-7** | Vectoriel / BM25 cross-session smart | Nice-to-have après S-1…S-5 | ★ |

Dogfood déclencheur (export `ses_*`) : abort `intent_only_write` sur annonce « page complète / 17 fiches / one file_write » sans tool_call — aggravé par contexte massif, **cause principale = écriture monolithique**, pas saturation compaction.

---

## 6. Liens

- [PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md)  
- [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)  
- [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)  
- [engine/sessions-and-memory.md](../../engine/sessions-and-memory.md)
