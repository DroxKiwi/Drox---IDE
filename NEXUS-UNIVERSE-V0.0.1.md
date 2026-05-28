# Nexus Universe — périmètre V0.0.1 (testable à court terme)

**Version du document :** 0.0.1  
**Objectif :** valider toute la chaîne produit (nuage local, symboles, simulation d’évolution, artefacts scénario) sur le **cas minimal** : **un workspace qui ne contient qu’un seul fichier de code**.

---

## 1. Hypothèses de travail

| Hypothèse | Détail |
|-----------|--------|
| Workspace | Un seul dossier racine ouvert ; **un seul fichier source** (ex. `app.ts`, `main.py`) + fichiers Nexus optionnels (config, scénarios). |
| Pas de graphe inter-fichiers en 0.0.1 | Aucune résolution d’import vers un **autre** fichier du repo (il n’y en a pas). Les `import` peuvent être affichés comme **liaisons décoratives / externes** ou ignorés. |
| Langage cible initial | À trancher : **TypeScript** ou **JavaScript** en premier (API Language Service / parseur déjà présente dans VS Code). Deuxième langage = itération suivante. |
| IA | **Ne construit pas** le graphe de symboles du fichier (sauf repli si parseur indisponible). **Construit** les **simulations d’évolution** (séquence d’injections / états / pas de temps) sous forme structurée (JSON V0). |

---

## 2. Définition du produit 0.0.1 (une phrase)

> À partir **d’un seul fichier**, Nexus affiche un **nuage local** où chaque **fonction, variable, constante, type** (et assimilés) est un **point** (ou un sous-nœud) relié de façon **déterministe**, avec un **switch 2D ↔ 3D** ; l’utilisateur peut **lancer une simulation d’activité** (injection locale) et **charger un scénario** produit par l’IA décrivant l’**évolution** de la donnée sur ce nuage.

---

## 3. Livrables V0.0.1 (checklist)

- [ ] **G0 — Fichier unique détecté** : le service Nexus identifie « le » fichier source principal (ou le seul fichier d’extension cibles ; pas de multi-root complexe en 0.0.1).
- [ ] **G1 — Graphe symbolique local** : pour ce fichier, liste des nœuds `symbol` (kind : function, const, let, class, interface, type, … selon le langage) + plage de lignes / offset.
- [ ] **G2 — Arêtes locales déterministes** : au minimum  
  - « définit » (conteneur → symbole),  
  - « appelle / référence » intra-fichier (si résolution possible sans autre fichier),  
  - liens hiérarchiques simples (ex. méthode → classe).
- [ ] **G3 — Vue 3D** : sous-graphe visible dans Nexus Space (positions : halo autour d’un nœud « fichier » ou grille locale ; pas d’univers multi-dossiers).
- [ ] **G4 — Switch de projection 2D/3D** : l’utilisateur peut basculer à tout moment entre plan **2D** (lecture structurée) et espace **3D** (exploration spatiale) sans perte d’état (focus, filtres, simulation en cours).
- [ ] **S1 — Simulation manuelle locale** : choix d’un nœud source + **injection** d’un payload minimal (type + valeur littérale ou stub) ; **propagation** le long d’arêtes avec **état** affiché (couleur / badge / chronologie simplifiée).
- [ ] **S2 — Schéma JSON scénario V0** : fichier versionné (ex. sous `.nexus/simulations/<uuid>.json`) décrivant une **séquence** d’étapes (injections + deltas d’état + cibles par id de nœud).
- [ ] **S3 — IA génère la simulation** : à partir du **contenu du fichier** + optionnellement une **phrase d’intention**, l’IA **écrit** un JSON V0 valide ; l’utilisateur **charge** le scénario et relance la même moteur que S1.

---

## 4. Étapes détaillées (ordre d’exécution recommandé)

### Étape 0 — Cadrage fichier unique

1. Définir la liste d’extensions « source » pour 0.0.1 (ex. `.ts`, `.tsx`, `.js`, `.mjs`).  
2. Règle de sélection : si **exactement un** fichier correspond → c’est la cible ; sinon message explicite « V0.0.1 : un seul fichier attendu ».  
3. Persistance : pas obligatoire ; un flag dans `nexus-config` optionnel (`singleFileTargetPath`) pour tests.

### Étape 1 — Extraction des symboles (déterministe)

1. Utiliser l’**API TypeScript / Language Service** du workbench (ou équivalent) pour énumérer les symboles du document : `documentSymbolProvider` / `getProgram` selon l’archi Nexus.  
2. Normaliser un modèle intern stable :  
   `NexusSymbolNode { id, kind, name, parentId?, start, end, uri }`  
3. Filtrer ce qui est affiché en 0.0.1 (éviter le bruit : tous les identifiants vs top-level uniquement — à trancher ; recommandation : **top-level + enfants directs** d’abord).

### Étape 2 — Arêtes intra-fichier (déterministe, minimal)

1. **Arête de containment** : fichier → symbole racine ; classe → méthode ; etc. (arbre).  
2. **Arête « reference »** : pour V0.0.1, implémenter un **sous-ensemble** :  
   - appels de fonction **dont le symbole cible est résolu dans le même fichier** ; ou  
   - utilisation d’identifiants liés à une déclaration unique dans le fichier.  
3. Si résolution impossible → pas d’arête (pas d’IA pour combler en 0.0.1 pour cette couche).

### Étape 3 — Intégration graphe ↔ Nexus Space (3D)

1. Étendre le modèle de **liens / nœuds** au-delà des URI fichier : identifiants stables `symbol:<uri>#<id>`.  
2. Layout : **micro-caméra** autour du fichier — échelle distincte de l’univers multi-fichiers (réutiliser `_layoutWorldScale` ou facteur « focus fichier »).  
3. Bascule UI minimale : **« Mode fichier unique / symboles »** (toggle ou automatique si une seule cible).

### Étape 3bis — Projection 2D ↔ 3D (UX testable)

1. Ajouter un contrôle UI explicite : `Projection: 2D | 3D` (toggle ou select).  
2. **2D** : vue orthographique/plan XY (ou projection figée) pour lecture claire des liens, sans perspective.  
3. **3D** : vue orbit actuelle (caméra perspective) pour l’exploration spatiale.  
4. Exigence clé : le switch conserve le **même sous-graphe actif** et l’**état de simulation** (pas de reset implicite).

### Étape 4 — Moteur de simulation locale (sans IA)

1. **Modèle d’état** V0 : `Map<nodeId, { label: string, payload?: string, hue?: number }>`.  
2. **Événement** : `inject { targetId, seed }` → marque le nœud ; propagation « vague » sur arêtes `reference` puis `contain` (ordre paramétrable, 1 pas par tick utilisateur ou animation).  
3. **Rendu** : surbrillance arêtes / nœuds + libellé d’état (overlay ou couleur spectrale dérivée de l’état).

### Étape 5 — Format JSON scénario V0 (contrat testable)

Exemple **indicatif** (à figer dans le code + doc) :

```json
{
  "nexusSimulationVersion": "0.0.1",
  "fileUri": "file:///…/app.ts",
  "steps": [
    { "at": 0, "action": "inject", "targetSymbolId": "fn:handleLogin", "seed": "UserId" },
    { "at": 1, "action": "propagate", "maxHops": 2 },
    { "at": 2, "action": "setState", "targetSymbolId": "var:token", "state": { "label": "issued" } }
  ]
}
```

1. Valider le JSON à l’ouverture ; erreurs lisibles dans l’UI.  
2. Emplacement : `.nexus/simulations/<uuid>.json` (répertoire gitisable ou ignoré selon choix équipe).

### Étape 6 — IA : génération de simulations uniquement

1. **Entrées** : contenu du fichier (tronqué si trop long) + schéma JSON V0 + **phrase d’intention** optionnelle.  
2. **Sortie** : **uniquement** le JSON scénario (pas de modification du graphe symbolique).  
3. **Garde-fous** : `targetSymbolId` doivent correspondre aux **ids** issus de l’étape 1 ; post-validation côté Nexus (rejeter / corriger les ids inconnus avec rapport).  
4. Point d’entrée UI : « Générer scénario (IA) » → écriture fichier UUID → « Charger scénario ».

### Étape 7 — Critères de « done » 0.0.1

1. Ouvrir un workspace avec **un seul** `app.ts` documenté en interne.  
2. Voir le **nuage des symboles** + arêtes minimales.  
3. Basculer **2D ↔ 3D** à chaud sans perte de focus ni d’état.  
4. Lancer une **simulation manuelle** sur au moins 2 nœuds reliés.  
5. Générer (ou coller) un **JSON V0** et **rejouer** la séquence sans crash.  
6. **Aucune** dépendance à un second fichier source pour valider la démo.

---

## 5. Hors périmètre explicite V0.0.1

- Multi-fichiers, imports résolus cross-file, SSO / Google / infra réelle.  
- Exécution du runtime (Node, navigateur) — la simulation est **sur le graphe**, pas un vrai debugger.  
- IA pour **inférer** des symboles manquants ou du code non parsable — reporté.

---

## 6. Synthèse rôle IA vs déterministe

| Couche | V0.0.1 |
|--------|--------|
| Symboles & arêtes locales | **Déterministe** (Language Service / parseur) |
| Layout & propagation | **Déterministe** (règles + moteur) |
| Scénario d’évolution (séquence métier / storytelling) | **IA** génère le JSON ; **Nexus** exécute et valide |

---

## 7. Prochaine révision du document

Quand le **premier langage** est bouclé et le **JSON V0** stabilisé après 1–2 itérations terrain : passer en **0.0.2** (deux fichiers + import résolu) ou **0.1.0** (schéma scénario enrichi).
