# Plan CB3b — Catalogue admin index (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Priorité maj** : **#1** (avant auto-régulation A–D)  
**Spec cockpit** : [PLAN-COCKPIT.md](../1.5.21/codebase/PLAN-COCKPIT.md) §3.8 · [AMBITION §3.5](../1.5.21/codebase/AMBITION.md)  
**Statut** : ✅ **MVP + exclusions + rebuild ciblé**

## Livré

| Capacité | État |
|----------|------|
| Section catalogue cockpit | ✅ |
| Parcourir fichiers → chunks | ✅ |
| Delete sélection | ✅ |
| Compact + delta octets | ✅ |
| Scroll stable au toggle | ✅ |
| Exclusions globs (persist `.drox/codebase-index/exclusions.json`) | ✅ |
| Exclude sélection (retire + ne plus réindexer) | ✅ |
| Rebuild ciblé sélection | ✅ |

## Hors scope restant (§3.5)

- Coût disque exact par chunk + % soft cap détaillé  
- Inspect métadonnées riches (hash, dim vecteur, fraîcheur)  
- Migration sqlite

## Critères done

1. ✅ Cockpit : liste non vide sur un workspace indexé.  
2. ✅ Delete fichier → disparu du catalogue.  
3. ✅ Compact → feedback taille.  
4. ✅ Exclude → absents au prochain Reindex.  
5. ✅ Rebuild sélection → re-chunk sans purge globale.  
6. Smoke : vue Codebase → Knowledge catalogue.  
7. Note release 1.5.22 quand la maj ship.

## Suite maj

**A–D auto-régulation** · puis arbitrage Explore / SAV / CB5.
