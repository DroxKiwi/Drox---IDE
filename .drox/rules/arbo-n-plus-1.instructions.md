---
description: Arborescence n+1 — découper un fichier dense en module
alwaysApply: true
---

# Arborescence n+1

Quand on te demande une **arborescence n+1** (ou « arbo n+1 ») pour un fichier :

1. Créer un **dossier du même nom** que le fichier (sans extension) à sa place.
2. Remplacer le fichier unique par un module (`mod.rs` / `index.ts` / équivalent) qui réexporte l'API publique.
3. **Découper** le contenu en plusieurs fichiers dans ce dossier, séparés par responsabilité claire.

Exemple Rust : `situation.rs` → `situation/mod.rs` + `situation/card.rs` + …

Ne pas inventer d'autre sens pour « n+1 » dans ce repo.
