# Plan — tool calling universel (1.5.21)

**Statut** : **en cours** · U1 livré (normalizer `todo_write`) ; U2–U4 ouverts  
**Version** : 1.5.21  
**Contexte** : sans modèle fine-tuné Drox ; fumée KAT / GGUF en 1.5.19 (`status: {}`, XML dans thinking, wire natif cassé).

---

## 1. Objectif

> Qu’un agent Drox puisse **appeler et réussir des outils** sur une large famille de LLM locaux / API, sans dépendre d’un training spécifique au protocole Drox.

Critère de succès (proposition) : sur au moins **deux** GGUF « fragiles » (ex. KAT + un autre) et un modèle « tools OK », un run avec mutation / todos exécute `todo_write` (ou équivalent) **sans** boucle `InvalidArgs` mortelle.

---

## 2. Constat — ce qui est universel vs fragile

### Les LLM gèrent bien (quasi partout)

| Mode | Pourquoi |
|------|----------|
| Prose libre | Mode par défaut |
| Markdown souple | Imitation, pas validation stricte |
| Petits choix nommés (A/B/C, oui/non) | Espace de réponses borné |
| Canevas texte / slots (`FICHIER:`, `ACTION:`) | Encore du langage, pas de schema API |
| Fences code / commandes | Génération fiable ; exécution = autre problème |
| Conversation multi-tours | Naturel |

### Ce qui n’est pas universel

| Mode | Pourquoi |
|------|----------|
| Function calling wire (`tools` / `tool_calls`) | Template serveur + training |
| JSON Schema riche (`$ref`, enums imbriqués, arrays d’objets) | Forme inventée (`status: {}`) |
| XML d’outils strict | Selon familles / templates |
| Multi-protocoles simultanés (phases + tools + gates) | Charge cognitive |

**Lecture produit** : traiter le canal natif comme **accélérateur optionnel**, pas comme seule porte d’entrée. S’appuyer d’abord sur le **langage** et les **structures textuelles simples**.

---

## 3. Pistes de design (à trancher)

Ces pistes ne sont **pas** toutes retenues ; elles structurent le débat 1.5.21.

| Id | Piste | Idée | Risque |
|----|--------|------|--------|
| **N** | Normalisation args | Réparer avant serde (`{}` → enum string, wrap tableaux) | Couvre le cas « wire OK mais args pourris » seulement |
| **S** | Schémas / descriptions plus simples | Enums string, exemples JSON, `$ref` inlinés partout | Aide le natif, pas les modèles sans tools |
| **C** | Canevas texte → outil | Le modèle remplit un gabarit lisible ; le moteur mappe vers un tool | Plus proche de l’universel ; design UX/prompt |
| **T** | Filet markup unique (ex. DTW) | Un seul `<tool_call>{…}</tool_call>` si wire vide | Rejeté comme *approche unique* en discussion ; peut rester option secondaire |
| **H** | Hybride native-first + filet | Natif si présent, sinon texte | Complexité multi-canal |

**Principe directeur** (issu de la discussion) : maximiser ce qui ressemble à du **langage / mini-formulaires**, minimiser la dépendance au seul JSON Schema wire.

---

## 4. Travaux concrets (ordre proposé)

| Phase | Livrable | Notes |
|-------|----------|--------|
| **U0** | Ce plan + smoke baseline (KAT transcript / scénario `todo_write`) | Doc only |
| **U1** | Normalizer args `todo_write` (`status: {}` / null / map → enum string) | ☑ `drox-tools` `todo_write.rs` + tests |
| **U2** | Décision design C vs T vs H (spike court + smoke) | Trancher avant gros code |
| **U3** | Implémentation du contrat retenu + prompt | Cœur 1.5.21 |
| **U4** | Fiche `ENGINE-UNIVERSAL-TOOL-CALLING.md` (E-style) + tests unit + smoke multi-modèles | Clôture |

---

## 5. Hors scope 1.5.21

- Fine-tune / LoRA Drox.
- Second modèle « translator ».
- Templates Ollama par famille (ops, pas ship principal).
- Shell discussion unifié → [1.5.22](../1.5.22/README.md).
- Index `@Codebase` / carte code → [1.5.23](../1.5.23/README.md).
- Stabilisation chat IDE → [1.5.20](../1.5.20/README.md).

---

## 6. Liens

- Correctifs Ollama déjà livrés : [ENGINE-OLLAMA-THINKING-AND-LOOPS.md](../1.5.19/ENGINE-OLLAMA-THINKING-AND-LOOPS.md) (E16–E18)
- Boucles / gates agent : [ENGINE-RUST-AGENT-LOOPS.md](../1.5.19/ENGINE-RUST-AGENT-LOOPS.md)
- Transcripts smoke (hors git) : sessions KAT / Laguna / Qwen / Ornith
