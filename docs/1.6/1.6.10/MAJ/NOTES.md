# 1.6.10 — notes de mise à jour

**Statut** : sections 1, 3 et 4 portées depuis `2.0.1-1.147.0` (`e94b6e10632`) sur la branche `1.6.10`. La section 2 reste pour plus tard. Le chat natif de la 1.147 n’a pas été repris.
**Base produit** : `1.6.9` sur VS Code `1.127.0`.
**Source** : branche locale `2.0.1-1.147.0`, pointe `e94b6e10632`. Suivi d’origine : `docs/2.0/2.0.1-1.147.0/MAJ-AVANT-LIVRAISON.md` et `docs/cline_compareer/` sur cette branche.

## 1. Reprendre le lot Cline déjà fait

Réappliquer sur le moteur de `1.6.9` les modifications Cline déjà présentes sur `2.0.1-1.147.0` (commit de clôture `e94b6e10632`, et l’historique moteur qui le précède).

Périmètre visé : clôture de run, budget de contexte, estimation de requête, rétrécissement avant le tour, blocage avant l’appel modèle, reprise après dépassement provider, arguments d’outils conscients du schéma, checkpoints workspace en revert d’abord, notices de clôture, première vague de compaction.

Référence d’étude, à relire sur la branche source avant chaque portage : `docs/cline_compareer/03-axes-dimplementation.md` (axes A à G) et `05-plan-transformation-moteur.md`.

Hors de ce portage : le compositeur natif, le masquage du chat Microsoft, et les seams `contrib/drox` écrits pour la base 1.147.

## 2. Finir plus tard le reste Cline

Après le portage du lot déjà écrit, reprendre ce qui était encore ouvert dans l’étude.

| Reste | Où c’est décrit | Quand |
|-------|-----------------|-------|
| Axe B `complete_run` optionnel | doc 03, axe B | plus tard, décision produit |
| Hooks unifiés | doc 04 | plus tard |
| Mentions `@file` | doc 04, B3 | plus tard |
| Teams / cron | doc 04, C2 | plus tard |
| Shadow-git au-delà du revert-first déjà posé | doc 04, B1 | plus tard |
| Axe G, journal des décisions de clôture | doc 03 | après la clôture portée |

Règle de portage : s’inspirer du contrat Cline, réécrire en Rust Drox, ne pas coller le TypeScript Cline.

## 3. Règles du dépôt et outil agent

Réappliquer le système de règles projet et l’outil qui les écrit.

Déjà sur `2.0.1-1.147.0` :

- fichiers `.drox/rules/*.instructions.md` ;
- lecture, parse, injection dans l’annexe système du run ;
- outil `project_rule_write` dans `drox-tools` (`3a8465e3801`), modes `create` / `update` / `append`.

À vérifier en le ramenant sur `1.6.9` : le fichier écrit est relu au tour suivant, et les règles Cursor (`.cursor/rules`) restent hors de cet outil.

## 4. Droits d’outils, mode custom

Réappliquer le passage de la surface d’outils en mode **custom**.

Déjà sur `2.0.1-1.147.0` (`3a8465e3801` et la suite du lot 2) :

- allowlist L2 `core` / `standard` / `full` / `custom` ;
- matrice `.drox/tools-surface.json` ;
- calcul unique de la liste effective `disabledTools` ;
- sortie du mode custom quand le profil moteur change.

Le profil choisit un preset. La régulation ne peut qu’enlever des outils. L’utilisateur qui décoche un outil n’est pas réactivé par un preset.

## 5. Ensuite — ce qui est inutile dans le dépôt

Étude, pas un effacement. Lister dans ce dossier, quand le portage ci-dessus tient :

- code du fork VS Code qui ne sert plus le produit Drox ;
- appels de télémétrie encore présents ;
- outils ou branches qui dépendent de Cursor, de Copilot, ou d’un service extérieur.

Inventaire : [INVENTAIRE.md](INVENTAIRE.md). Chaque piste y est marquée garder, couper, ou plus tard. Rien n’est retiré dans ce document.

## 6. Ensuite — ce qui est nouveau côté VS Code

À partir de la dernière version upstream, relever ce qui vaut un cherry-pick sur la base `1.127.0` :

- correctifs de sécurité ;
- features utiles au produit Drox.

Livrable prévu : une liste dans ce même dossier. On ne remonte pas toute la 1.147. L’agent Drox reste le code Drox.

## Ordre

```text
1. Lot Cline déjà écrit sur 2.0.1
2. Règles projet + project_rule_write
3. Surface d’outils en mode custom
4. Reste Cline (section 2), plus tard
5. Inventaire du dépôt inutile
6. Liste upstream VS Code (sécurité, features)
```
