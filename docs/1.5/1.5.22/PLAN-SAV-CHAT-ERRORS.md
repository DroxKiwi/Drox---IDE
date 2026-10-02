# Plan SAV — Capture / retry erreurs chat (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : 📋 **backlog** · reporté depuis 1.5.21 · détail à préciser avant impl  
**Priorité** : après auto-régulation / Explore selon arbitrage produit

## Pourquoi

Dogfood cloud Ollama : un run peut avancer (tools, phases) puis s’arrêter avec un bandeau peu actionnable (`HTTP transport error` vers `ollama.com/api/chat`).  
L’utilisateur ne sait pas si c’est réseau, quota, timeout, payload trop gros, ou bug Drox.

On veut un **SAV produit** : garde-fous + erreurs lisibles + piste d’origine — pas seulement un retry manuel opaque.

## Intention (brouillon — à figer avec le produit)

1. **Try / retry** contrôlé sur les erreurs transport / 5xx / timeout LLM (backoff court, N borné, pas de boucle infinie).
2. **Erreur claire dans le chat** : message utilisateur + **cause technique exacte** (status HTTP, URL host, code moteur, extrait body si safe).
3. **Indication d’origine** : checklist courte (réseau · endpoint · auth/quota · taille contexte · modèle · moteur `drox.exe`).
4. **Système de capture** : encadrer **l’ensemble** des erreurs de run (LLM, tools/`tool/exec`, embed/index, permissions) dans un format commun (UI + éventuellement diag export).

## Hors scope pour l’instant

- Implémentation code (attendre le brief SAV détaillé).
- Remplacer le monitoring Ollama Cloud côté fournisseur.
- Refonte complète des notifications VS Code.

## Critères d’acceptation (cibles)

1. Sur panne transport cloud : retry automatique puis bandeau avec message précis + piste « pourquoi ».
2. Les erreurs tool / LLM / index passent par le même cadre (pas N widgets divergents).
3. Un export / copie diag inclut le dernier échec structuré (pour support).

## Suite

Quand on y revient : préciser UX (Retry vs Continuer run), politiques retry par type d’erreur, et surface Agents vs IDE.
