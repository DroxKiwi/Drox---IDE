# Idée 02 — Onglet « Parcours modèles » (à côté de Terminal)

**Statut** : idée brute  
**Date** : 2026-05-28  
**Référence UI** : panneau inférieur (onglets Problems, Chat, Output, **Terminal**, …)

---

## Résumé

Ajouter un **onglet dédié** dans la barre du panneau bas (à côté de **TERMINAL**) qui affiche en **direct** comment les modèles parcourent le projet : lectures, recherches, éditions — mélange entre **graphe de navigation** (style Mermaid) et **aperçus de diffs** de fichiers.

But : transparence et confiance — l’utilisateur **voit** l’activité sans tout lire dans le fil Drox Chat.

---

## Problème actuel

| Canal | Limite |
|-------|--------|
| Fil chat Drox | Riche mais **linéaire** ; explore replié ; outils empilés |
| Timeline run | Orientée **orchestration** (architecte / exécuteurs), pas carte spatiale du repo |
| Diff / file changes | Par fichier, pas vue **globale** du parcours |

L’utilisateur qui fait tourner `npm run dev` + agent sur un gros repo (cf. capture site vitrine) ne voit pas d’un coup d’œil *où* le modèle « se promène ».

---

## Vision produit (ébauche)

```text
[ Problems | Chat | Output | … | Terminal | ► Parcours ◄ ]

┌─ Graphe (Mermaid live) ─────────────┐  ┌─ Fichier focus ─────────┐
│  src/                               │  │  diff inline ou mini     │
│   ├─ app/ ──► page.tsx (read)       │  │  preview du dernier      │
│   └─ components/ ──► Hero.tsx (edit)│  │  fichier touché          │
└─────────────────────────────────────┘  └──────────────────────────┘
```

- **Nœuds** : dossiers / fichiers ; **arêtes** : ordre temporel (read → grep → edit).  
- **Couleur / forme** : read vs write vs search (glob/grep).  
- Clic sur un nœud → ouvre diff ou éditeur (comme file-change chat).  
- Mode **live** pendant le run ; mode **replay** après coup (session).

---

## Pistes techniques

### Sources d’événements (déjà proches)

- JSON-RPC / événements agent : `tool/start`, `tool/end`, chemins `file_read`, `grep`, `file_edit`…  
- Journal UI replay (`droxUiReplayJournal`) — étendre pour le panneau parcours.  
- Stats explore (`exploreStats`) — inspiration pour compteurs, pas la carte.

### IDE

- Nouvelle **View** dans `ViewContainer` Panel (à côté terminal) — `registerView` workbench.  
- Rendu : webview (Mermaid.js + diff viewer) ou canvas natif.  
- Perf : throttle / fenêtre glissante (derniers N fichiers) pour gros monorepos.

### Moteur

- Optionnel : événement structuré `navigation_graph` (si agrégation côté moteur utile).  
- Sinon **client-only** à partir du flux tools existant (moins de changement Rust).

---

## Liens existants

- UI chat : trays outils, explore bundle, `12-fileChange.js`  
- [FLOW-DECISIONS-MOTEUR.md](../1.2.0/cartographie/FLOW-DECISIONS-MOTEUR.md) — phases explore / answering

---

## Questions ouvertes

| ID | Question |
|----|----------|
| Q1 | Graphe **par run** ou **par workspace** (session longue) ? |
| Q2 | Nombre max de nœuds avant simplification (cluster par dossier) ? |
| Q3 | Même onglet pour **architecte seul** et **N exécuteurs** (sous-graphes) ? |
| Q4 | Accessibilité : alternative liste tabulaire si Mermaid illisible ? |
| Q5 | Export PNG / SVG du parcours pour partage ? |

---

## Risques

- Surcharge visuelle si synchronisé 1:1 avec chaque tool call.  
- Coût DOM sur projets énormes — besoin d’échantillonnage.  
- Duplication avec le fil chat si mal calibré (deux sources de vérité).

---

## Critères de succès (si promu)

- Pendant un run explore + edits, l’onglet se met à jour en &lt; 500 ms après chaque outil significatif.  
- L’utilisateur identifie en 10 s les **3 fichiers les plus touchés**.  
- Pas de régression perf du chat (panneau isolé, lazy load).
