# Drox — Première passe UI (chat natif)

**Date** : 2026-05-20  
**Statut** : journal des jalons UI (optionnel — les changements sont appliqués directement dans le code)  
**Objectif** : chat agent Drox dans la **barre auxiliaire** (droite), pas dans la barre latérale ni en onglet par défaut à côté de Copilot.

**Documents liés** :

| Document | Rôle |
|----------|------|
| [../plans/PLAN-INTEGRATION.md](../plans/PLAN-INTEGRATION.md) | Intégration moteur / workbench (backend) |
| [../nexus/DESIGN-VISION.md](../nexus/DESIGN-VISION.md) | Vision produit Nexus + charte |
| [../../../DROX.md](../../../DROX.md) | Onboarding dev |
| [../README.md](../README.md) | Index documentation Drox |

---

## 1. Constat (captures du 2026-05-20)

### 1.1 Nexus aujourd’hui (capture Drox)

- Panneau avec onglets type **DROX · CHAT · TERMINAL** en tête de zone.
- Composer webview MVP en bas (placeholder, mode Default, actions ☰ + ⚙, Send).
- Sensation d’**agrégat multi-rôles** plutôt que d’un **agent panel** dédié comme Cursor.

### 1.2 Cursor (référence)

- **Barre latérale secondaire (Auxiliary Bar)** : conversation agent pleine hauteur.
- En-tête de session (« Analyse du projet »), actions **nouveau chat / historique**.
- Composer intégré en bas du même panneau (mode Agent, pièces jointes, micro).
- **Pas** d’onglet « Chat Copilot » concurrent dans la même bande — un seul fil agent principal.

### 1.3 Écart à combler

| Aspect | Nexus actuel | Cible (type Cursor) |
|--------|--------------|---------------------|
| Emplacement | Sidebar activité **Drox** (+ confusion onglets) | **Auxiliary Bar** (droite), panneau agent principal |
| Cohabitation | Chat Copilot (Auxiliary Bar) + Drox (Sidebar) + Terminal (Panel) | **Drox = agent local** ; Copilot optionnel / secondaire |
| Identité | Vue enregistrée comme « Chat » dans conteneur « Drox » | Marque **Drox** claire, titre de session, pas un sous-onglet générique |
| Chrome | Toolbar MVP intégrée au webview | En-tête workbench + composer (progressif) |

---

## 2. État technique actuel (fork)

```text
Auxiliary Bar (panneau agent à droite, défaut Nexus)
  └── Drox (isDefault)                         ← drox.contribution.ts
  └── Chat Copilot (optionnel)                 ← chatParticipant.contribution.ts

Panel
  └── Terminal
```

**Fichiers clés UI** :

| Fichier | Rôle |
|---------|------|
| `src/vs/workbench/contrib/drox/browser/drox.contribution.ts` | Enregistrement conteneur + vue |
| `src/vs/workbench/contrib/drox/browser/droxChatViewPane.ts` | ViewPane + webview overlay |
| `src/vs/workbench/contrib/drox/browser/media/droxChatMvp.{js,css}` | UI conversation (MVP) |
| `src/vs/workbench/contrib/drox/browser/droxChatDragAndDrop.ts` | Drop explorateur → composer |

**Déjà livré (UX composer)** : drag-and-drop fichiers/dossiers/images dans la zone de saisie ; chips `#refs` ; vue latérale « Références » **supprimée** (redondante).

---

## 3. Principes de la première passe UI

1. **Un seul « chez-soi » pour l’agent Drox** — le panneau où l’utilisateur discute avec Ollama / le moteur Rust.
2. **Ne pas fusionner** Drox, Copilot et Terminal dans la même rangée d’onglets — ce sont trois produits distincts.
3. **Réutiliser le webview MVP** — pas de réécriture React workbench en P1 ; déplacer le conteneur et améliorer le chrome.
4. **Parité fonctionnelle avant pixel-perfect** — le moteur (I-26+) reste la source de vérité ; l’UI suit.

---

## 4. Phases et jalons

### UI-P0 — Cadrage (ce document) ✅

- [x] Analyse Cursor vs Nexus
- [x] Cartographie emplacements workbench
- [x] Découpage phases UI-P1 → P4

### UI-P0c — Page Welcome Drox ✅

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| P0c.1 | Supprimer colonne **Walkthroughs** (VS Code / Copilot) | `gettingStarted.ts` (`showFeaturedWalkthrough = false`, pas de liste) | ✅ |
| P0c.2 | Sous-titre et actions **Drox** (Open Drox, dossier, fichier, clone Git) | `gettingStartedContent.ts` (`nexusWelcomeStartEntries`) | ✅ |
| P0c.3 | Grille **cartes** actions + projets récents (2 colonnes) | `gettingStarted.ts`, `gettingStarted.css` | ✅ |

**Contenu** : logo KDDS inchangé ; sous-titre *« Local AI agent for your codebase — powered by Drox »* ; action principale **Open Drox** ; pas de « Generate Workspace », « Connect to… », walkthroughs Copilot.

### UI-P0b — Barre d’activité en bas (type Cursor) ✅

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| P0b.1 | Défaut `workbench.activityBar.location` → `bottom` | `workbench.contribution.ts` | ✅ |

Les icônes (Explorateur, Recherche, Git, Drox, …) s’affichent **en bas de la barre latérale**, pas sur le bord gauche de la fenêtre. Réglage utilisateur inchangé : *View → Appearance → Activity Bar Position*.

**Note** : si votre `settings.json` contient déjà `"workbench.activityBar.location": "default"`, supprimez la ligne ou passez à `"bottom"`.

### UI-P1 — Chat natif : barre auxiliaire ✅

| # | Tâche | Fichiers | Statut |
|---|--------|----------|--------|
| P1.1 | `droxViewContainer` → `AuxiliaryBar` + `isDefault: true` | `drox.contribution.ts` | ✅ |
| P1.2 | Vue et commande nommées **Drox** (plus « Chat ») | `drox.contribution.ts` | ✅ |
| P1.3 | Copilot chat : plus `isDefault` sur Auxiliary Bar | `chatParticipant.contribution.ts` | ✅ |
| P1.4 | `workbench.action.openDroxChat` ouvre le conteneur auxiliaire | `openCommandActionDescriptor` | ✅ |

**Terminal** : reste dans le **panel** bas (inchangé). **Copilot** : toujours accessible via l’icône Chat dans la barre auxiliaire si besoin.

### UI-P2 — Chrome session (type Cursor)

| # | Tâche | Statut |
|---|--------|--------|
| P2.1 | En-tête hors webview : titre session, bouton **nouveau chat**, **historique** | ⬜ |
| P2.2 | Déplacer ☰ historique / + new chat du webview vers le ViewPane (actions workbench) | ⬜ |
| P2.3 | Titre dynamique = premier message ou objectif de run | ⬜ |

### UI-P3 — Composer & fil de conversation

| # | Tâche | Statut |
|---|--------|--------|
| P3.1 | Styles composer alignés charte Nexus ([DESIGN-VISION](./nexus/DESIGN-VISION.md)) | ⬜ |
| P3.2 | Bulles user/assistant distinctes (au lieu du log brut) | ⬜ |
| P3.3 | Phases / tools repliés par défaut (lisibilité) | ⬜ |
| P3.4 | Indicateur busy + file d’attente prompts (déjà partiel MVP) | ⬜ |

### UI-P4 — Produit & cohabitation

| # | Tâche | Statut |
|---|--------|--------|
| P4.1 | Raccourci clavier global **Ctrl+Alt+D** (ex.) → Open Drox | ⬜ |
| P4.2 | Doc utilisateur : où est Drox vs Copilot vs Terminal | ⬜ |
| P4.3 | Option `nexus.drox.preferredAgentPanel` si besoin de basculer défaut | ⬜ |

---

## 5. Hors scope première passe

- Remplacement du chat Copilot par Drox dans la même `ChatWidget` (trop coûteux).
- Refonte 3D / Nexus Space (voir [VISION-NEXUS-SPACE-GRAPHE.md](./nexus/VISION-NEXUS-SPACE-GRAPHE.md)).
- Tauri / client desktop séparé ([PLAN-IDE-DROX.md](../plans/PLAN-IDE-DROX.md) en sommeil).

---

## 6. Critères d’acceptation UI-P1

1. Au lancement Nexus (config par défaut), le panneau **Drox** est visible **à droite**, pleine hauteur, sans onglets DROX/CHAT/TERMINAL dans la même barre.
2. **Terminal** reste dans le **panel** bas (inchangé).
3. **Copilot** n’est plus le panneau agent par défaut (si option A retenue).
4. Drag-and-drop explorateur → chips références dans le composer **fonctionne** toujours.
5. `npm run watch` + `.\scripts\code.bat` : aucune erreur de chargement workbench.

---

## 7. Journal de bord

| Date | Jalon | Note |
|------|-------|------|
| 2026-05-20 | UI-P0 | Document créé ; refs drop sidebar retirées ; drop composer OK |
| 2026-05-20 | UI-P0b | Activity bar par défaut en bas (`workbench.activityBar.location`) |
| 2026-05-20 | UI-P0c | Welcome Drox : walkthroughs retirés, cartes actions + récents |
| 2026-05-20 | UI-P1 | Drox → Auxiliary Bar, défaut Nexus ; Copilot non défaut |
| 2026-05-20 | UI-P1b | Onglets éditeur style Chrome : barre grise, encoches bas actif, pilule verte au survol (`nexusEditorTabs.css`) |
| 2026-05-20 | UI-P1c | To-dos style Cursor + grille 3×3 in-chat ; cadres IA ; bulles user vertes ; `[run_objective]` modèle |

---

## 8. Prochaine action développeur

1. Valider option **P1.3** (A / B / C) avec l’équipe.
2. Implémenter **UI-P1** (1 fichier principal + tests manuels).
3. Mettre à jour ce tableau §7 et cocher les lignes §4.
