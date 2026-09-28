# Clôture 1.5.18

**Branche** : `1.5.18` (conservée après merge)  
**Version** : `droxVersion` **1.5.18**

## Livré

| Pilier | Contenu |
|--------|---------|
| **Reprise session** | Layout `.last` + startup différé + sync layout natif — cold boot reprend la dernière conversation |
| **Hang IDE** | Fallback workspace sans SessionsProvider · anti-race `waitForContentProvider` · timeout overlay 15 s |
| **Stop / edit** | Stop pré-réponse → restore input · mid → keep · edit + Keep/Discard |

## Docs

- [PLAN-SESSION-RESUME.md](PLAN-SESSION-RESUME.md)
- [IMPLEMENTATION-S0-S3.md](IMPLEMENTATION-S0-S3.md)
- [IMPLEMENTATION-F1-STOP-EDIT.md](IMPLEMENTATION-F1-STOP-EDIT.md)
- [README.md](README.md)

## Popup nouveautés

`droxReleaseNotes.ts` — case `1.5.18` (lead + items). Affichée à la première ouverture après install si `seenVersion` ≠ `1.5.18`.

## Ship

Windows + Linux → repo OR `Drox---IDE---OR` tag `v1.5.18`.
