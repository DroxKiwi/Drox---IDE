# 🎨 Guide de Style Graphique Drox

Ce document présente la direction artistique, les couleurs et les valeurs CSS utilisées dans le site vitrine Drox.

## Couleurs primaires
*   **Accent Drox (Primaire) :** `#888888` (accents, liens actifs, indicateurs, sélections).
*   **Fond Surface :** `#1e1e1e` (Couleur de fond semi-transparent/blur).
*   **Texte Principal :** `#cccccc` / `#666666` (Bright / Muted). 
*   **Bordure :** `#333333` (Délimitation des cartes et éléments interactifs).

## Direction Artistique
Le style est **technique, minimaliste et axé sur la souveraineté numérique**. L'utilisation du *blur* (`backdrop-blur`) et des bordures douces donne un sentiment de modernité et d'intégration dans un environnement moderne (comme VS Code).

## Exemples CSS (via Tailwind/Custom)
*   `border: 1px solid #333333;`
*   `background-color: #1e1e1e;`
*   `backdrop-blur;`

## Thèmes workbench par défaut

- **Drox Dark** / **Drox Light** — `extensions/theme-defaults/themes/drox-dark.json`, `drox-light.json` (IDs `Drox Dark`, `Drox Light`).
- Les anciens IDs **Nexus Dark** / **Nexus Light** sont migrés automatiquement au chargement des réglages.