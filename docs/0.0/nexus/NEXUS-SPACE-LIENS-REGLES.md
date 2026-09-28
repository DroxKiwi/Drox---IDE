# Nexus Space — Liens graphe (imports) et règles configurables

Ce document définit l’**algorithme** qui produit les arêtes du graphe à partir des **imports entre fichiers**, ainsi que le **fichier de règles** versionnable au fil du développement.

**Contexte** : vues par niveau d’arborescence + cercles type Obsidian — voir [`VISION-NEXUS-SPACE-GRAPHE.md`](./VISION-NEXUS-SPACE-GRAPHE.md).

---

## 1. Données d’entrée

1. **Imports résolus** : liste d’arêtes au niveau **fichier**, chacune de la forme « le fichier `A` référence le fichier `B` » (chemins/URI résolus dans le workspace).
2. **Racine workspace** : pour calculer les dossiers parents et les chemins relatifs.
3. **Jeu de règles** : objet JSON (schéma ci-dessous) fusionné avec des valeurs par défaut embarquées.

*Remarque* : la **détection** des imports dans le code source (regex, service langage, etc.) est une étape **amont** ; le moteur de liens consomme uniquement des **fichier → fichier** déjà résolus.

---

## 2. Algorithme (noyau)

Pour chaque import résolu `(fromFile → toFile)` :

1. Ignorer si `fromFile` et `toFile` sont identiques (boucle).
2. Calculer `fromDir = parent(fromFile)` et `toDir = parent(toFile)` (URI de dossier).
3. **Même dossier** (`fromDir` égal `toDir` selon la politique de comparaison des chemins)  
   - Si `sameDirectory.emitFileLinks` : émettre un lien **`file`** `fromFile → toFile`.
4. **Dossiers différents**  
   - Si `crossDirectory.emitFolderLinks` : émettre un lien **`folder`** `fromDir → toDir` (les dossiers **contenant** les deux fichiers).  
   - Si `crossDirectory.alsoEmitFileLinks` : émettre en plus un lien **`file`** `fromFile → toFile`.
5. Si `deduplicate` : fusionner les liens ayant la même clé `(kind, from, to)`.

**Sémantique** : les liens sont **orientés** (importeur → importé). Une variante future pourrait proposer `edgeDirection: "directed" | "undirected"` dans les règles.

**Pourquoi lier les dossiers** : quand les fichiers ne sont pas dans le même répertoire, afficher un lien uniquement entre fichiers peut être incohérent avec une vue « par niveau de dossier ». Le lien **folder → folder** matérialise la dépendance entre **zones** de l’arbo ; la vue détaillée d’un dossier peut toujours montrer les liens **fichier** locaux.

---

## 3. Fichier de configuration

- **Emplacement recommandé (workspace)** : `.nexus-space/link-rules.json`  
  (chemin exact défini dans le code du service Nexus Space ; peut être rendu configurable plus tard.)
- **Format** : **JSON** (pas de dépendance YAML ajoutée au dépôt pour l’instant). Du YAML peut être pris en charge plus tard ou converti en JSON en amont.
- **Évolution** : le schéma porte un champ `version` ; les versions futures peuvent ajouter des champs optionnels en conservant la rétrocompatibilité.

### 3.1 Schéma (version 1)

| Champ | Type | Description |
|--------|------|-------------|
| `version` | `1` | Version du schéma. |
| `sameDirectory` | objet | Comportement quand les deux fichiers partagent le même parent. |
| `sameDirectory.emitFileLinks` | booléen | Émettre des liens fichier ↔ fichier (défaut `true`). |
| `crossDirectory` | objet | Comportement quand les parents diffèrent. |
| `crossDirectory.emitFolderLinks` | booléen | Émettre des liens dossier ↔ dossier (défaut `true`). |
| `crossDirectory.alsoEmitFileLinks` | booléen | Émettre aussi les liens fichier ↔ fichier (défaut `false`). |
| `deduplicate` | booléen | Dédupliquer les arêtes (défaut `true`). |

### 3.2 Exemple minimal

```json
{
  "version": 1,
  "sameDirectory": {
    "emitFileLinks": true
  },
  "crossDirectory": {
    "emitFolderLinks": true,
    "alsoEmitFileLinks": false
  },
  "deduplicate": true
}
```

### 3.3 Évolution des règles (dev)

- Modifier le JSON du workspace pour itérer sans recompiler le cœur de Nexus.
- Pour des règles **programmatiques** (fonctions, conditions complexes), l’extension prévue est : **hooks nommés** ou contribution dans un module TypeScript dédié (roadmap) — le JSON reste le point d’entrée le plus simple pour 90 % des cas.

---

## 4. Implémentation dans le dépôt

| Élément | Rôle |
|---------|------|
| `common/graphLinks/graphLinkTypes.ts` | Types + jeu de règles par défaut + clé storage. |
| `common/graphLinks/buildGraphLinks.ts` | Algorithme pur `buildLinksFromResolvedImports`. |
| `common/graphLinks/parseGraphLinkRules.ts` | Fusion JSON → `INexusGraphLinkRuleSet`. |
| `browser/nexusSpaceImportScanner.ts` | Parcours workspace, extraction imports relatifs, résolution fichier. |
| `browser/nexusSpaceService.ts` | Charge `.nexus-space/link-rules.json`, scan, construit les liens, `onDidChangeGraph`. |
| `browser/nexusSpaceViewPane.ts` | Aperçu WebGL (cercle de nœuds + arêtes), compteur imports / arêtes. |
| `browser/nexusSpace.contribution.ts` | Commande **Refresh Nexus Space graph** (`nexusSpace.refreshGraph`). |

---

## 5. Historique

| Date | Note |
|------|------|
| 2026-04-02 | Première version : algorithme fichier/dossier, config JSON `.nexus-space/link-rules.json`. |
