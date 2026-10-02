# Plan — Auto-régulation moteur ↔ modèle (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : 📋 **préparé** · brief produit à affiner à l’impl  
**Remplace** : ancien plan « tool calling universel » (abandonné)

## 1. But

Chaque modèle (local / cloud, petit / grand) n’a pas les mêmes capacités.  
Aujourd’hui le moteur expose souvent la **même** palette d’outils et la **même** densité de prompt → certains modèles se perdent, d’autres sous-utilisent le terrain.

**1.5.22** introduit un **régulateur** :

1. **Mesurer** en continu la réussite des missions (scores multi-axes).  
2. **Afficher** ces scores en live (panel).  
3. **Adapter** automatiquement (si option ON) : outils exposés, hints système, longueur / structure des prompts, éventuellement seuils de retry — pour **simplifier ou complexifier** le moteur selon la capacité observée du modèle à répondre **vite et correctement**.

## 2. Scores (brouillon d’axes)

Exemples d’axes (noms provisoires) — chacun avec formule + fenêtre glissante :

| Axe | Signaux typiques |
|-----|------------------|
| **Mission success** | run `completed` vs `error` / cancel ; objectifs todo clos |
| **Tool fitness** | appels utiles vs échecs `isError` ; mauvais outils (ex. `session_search` vs `codebase_search`) |
| **Latency** | TTFB / durée run / tokens·s |
| **Protocol** | phases respectées, mutations sans plan, boucles tool |
| **Retrieval** | hits utilisés, forçage embed, fallback lexical |
| **Transport** | erreurs HTTP / retry (lien futur SAV 1.5.21) |

Agrégats : score modèle (par `provider+modelId`) + score session + score workspace optionnel.

## 3. Adaptation (effets)

Si option **activée**, le régulateur peut notamment :

- **Réduire** la liste `executableTools` / tools LLM (mode « simple ») pour un modèle fragile.  
- **Enrichir** hints / inject `@Codebase` pour un modèle qui oublie le retrieval.  
- **Assouplir ou durcir** les garde-fous protocole (todo, phases).  
- **Changer** la densité du system prompt (court vs lecture longue).

Si option **désactivée** : scores toujours collectés (ou collectés en mode shadow) mais **aucun** effet sur le run — panel = observatoire.

## 4. UI

- **Panel** dédié (Agents ou sidebar) : scores live, historique court, modèle courant, mode Simple / Full / Auto.  
- Lien possible avec pastille composer (état « régulateur ON · score X »).

## 5. Hors scope 1.5.22

- Universalisation tool calling tous providers (abandonné comme thème de release).  
- Fine-tuning / LoRA des poids.  
- Remplacement du SAV erreurs chat (reste fin 1.5.21).

## 6. Critères d’acceptation (cibles)

1. Option OFF : comportement moteur inchangé (parity).  
2. Option ON : un modèle « faible » reçoit une palette / prompt simplifiés après N runs scorés.  
3. Panel affiche au moins 3 axes + score agrégé en live pendant un run.  
4. Formules documentées (pas de boîte noire totale).

## 7. Suite

Affiner les formules et le mapping score → politique à l’implémentation ; dogfood multi-modèles (Ollama cloud + local).
