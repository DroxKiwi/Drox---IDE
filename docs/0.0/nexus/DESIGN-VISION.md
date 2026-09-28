# Nexus — vision produit, UI/UX et charte graphique

Document de référence pour l’orientation **KDDS Nexus** (fork VS Code). Il fixe l’intention produit et la charte visuelle ; l’implémentation évoluera (composants workbench, flux IA, etc.).

---

## 1. Vision produit

### 1.1 IDE partagé par l’humain et l’IA

Nexus est pensé comme un **environnement de travail commun** : l’utilisateur et le modèle d’IA peuvent **tous deux** naviguer dans l’interface, ouvrir des vues, agir sur le code et suivre l’avancement du travail.

- **L’utilisateur** garde la maîtrise habituelle : ouvrir des fichiers, des panneaux, des fenêtres, utiliser l’explorateur, le terminal, les réglages, etc. Toutes les capacités du fork VS Code restent disponibles.
- **L’IA** est un **co-acteur** : elle peut piloter l’UI (ouvrir des éditeurs, des vues pertinentes, mettre en avant des tâches) pour **montrer** ce qu’elle fait, de façon comparable à un collaborateur humain qui manipule les fenêtres sous vos yeux.
- **Objectif primaire** : l’utilisateur sollicite l’IA pour avancer ; l’IA **rend visible** son travail en cours (fichiers ouverts, étapes, résultats) plutôt que de rester opaque.

### 1.2 Conséquences pour l’UI/UX (prochaines étapes)

Cette vision implique, au fil des itérations :

- Des **signaux visuels clairs** quand l’IA agit sur l’UI (focus, file d’activité, indicateurs de tâche).
- Une hiérarchie visuelle qui **priorise le contexte partagé** (ce que l’IA montre) sans enlever le contrôle à l’utilisateur.
- Des flux **interactifs** : l’humain et l’IA peuvent modifier le code et l’état de l’IDE de concert.

Les détails d’interaction (protocole harness, API workbench, composants dédiés) seront précisés dans des documents techniques et la roadmap ; ce fichier pose le **cadre** et la **charte**.

---

## 2. Charte graphique Nexus

Palette principale : **bleu ciel**, **blanc métallique**, **violet foncé (aubergine)** et **noir**.

| Rôle | Usage | Référence hex (cible) |
|------|--------|----------------------|
| **Bleu ciel** | Accent primaire : liens, focus, badges, sélections, boutons principaux | `#52C0F0` (sombre), `#0EA5E9` (clair) |
| **Aubergine** | Structure du chrome sombre : barres latérales, bordures, profondeur | Fonds type `#1A0F24`, bordures `#3A2548` |
| **Noir** | Fond d’éditeur et zones de lecture profondes | `#06060A` |
| **Blanc métallique** | Fond clair froid (panneaux, éditeur clair) | `#EEF2F9`, surfaces `#F4F7FC` |
| **Violet structurel (clair)** | Accents discrets sur thème clair (onglets, barre d’activité active) | `#5B2D6E` |

Les teintes exactes peuvent être affinées ; les thèmes **Nexus Dark** et **Nexus Light** dans `extensions/theme-defaults/themes/` matérialisent cette charte dans les couleurs du workbench VS Code.

---

## 3. Implémentation actuelle (thèmes)

- **Fichiers** : `nexus-dark.json`, `nexus-light.json` (extension `theme-defaults`).
- **IDs de thème** : `Nexus Dark`, `Nexus Light`.
- **Thèmes par défaut** (nouvelle installation / défauts workbench) : `Nexus Dark` (sombre), `Nexus Light` (clair) — voir `ThemeSettingDefaults` dans `workbenchThemeService.ts`.
- **Splash fenêtre** (Electron) : couleurs de fond par défaut alignées — `themeMainServiceImpl.ts` (`DEFAULT_BG_DARK` / `DEFAULT_BG_LIGHT`).

Les thèmes **Light 2026** / **Dark 2026** restent disponibles dans le sélecteur de thème pour compatibilité et préférence utilisateur.

---

## 4. Nexus Space (onglet workbench)

**Référence courante** : l’onglet **Nexus Space** vise un **graphe de nœuds reliés**, sur le modèle du **Graph View Obsidian**, avec une **couche de profondeur** (Z / 3D ou 2.5D) et un **fond noir uni**. Spécification et périmètre MVP : **[`VISION-NEXUS-SPACE-GRAPHE.md`](./VISION-NEXUS-SPACE-GRAPHE.md)**.

Une exploration plus large du workbench en **espace galaxie / masse / gravité** (fenêtres, corps stellaires) reste archivée dans **[`VISION-ESPACES-3D-GALAXIE.md`](./VISION-ESPACES-3D-GALAXIE.md)** ; ce n’est **plus** la direction du MVP Nexus Space.

---

## 5. Hors périmètre immédiat

- Le dossier **`drox-code-harness-v2/web`** ne fait pas partie du harness final livré avec Nexus (pas d’impact sur cette charte).
- La **mécanique complète** « IA ouvre les vues » dépend du harness, des APIs et des contributions workbench ; elle s’appuie sur cette vision sans être entièrement couverte par les seuls thèmes couleur.
