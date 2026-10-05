# Clôture 1.6.0 (brouillon — avant dogfood / ship)

**Branche** : `1.6.0`  
**Version** : `droxVersion` **1.6.0**  
**Statut** : code Vague 1–2 + L-3 **commité localement** · dogfood S1–S4 **à valider** · ship **pas encore**

## Livré (moteur + UI)

| Lot | Contenu |
|-----|---------|
| **L-1 / L-2** | Plus de reset detector sur DONE_ONLY ; hard-stop text_only |
| **L-tools** | Hash tools global progress-aware |
| **L-3** | Nudges system foldés (pas de faux user reminder) |
| **C-1 / C-3 / C-2** | Compaction / snip → rewrite JSONL ; compact manuel aligné |
| **T-1** | Spill gros tool results |
| **G-1** | Jauge `estim.` / `provider` |

## Reporté

| Sujet | Cible |
|-------|--------|
| OBS-1 / OBS-2 (export messages[] prod) | post-1.6.0 si dogfood l’exige |
| MCP lazy discovery | backlog |

## Docs

- [README.md](README.md)
- [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)
- [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)
- [`stable/1.6.0/RELEASE_NOTES.md`](../../../stable/1.6.0/RELEASE_NOTES.md)

## Checklist avant ship

- [ ] Dogfood S1–S4 (voir DIAGNOSTIC §8)
- [ ] Push `1.6.0` + merge / tag selon process
- [ ] Popup nouveautés (`droxReleaseNotes.ts` case `1.6.0`)
- [ ] Ship win32 + linux `v1.6.0`
- [ ] Finaliser ce fichier (retirer « brouillon »)

## Suite

Après ship : OBS si besoin · merge `main` · ouvrir la prochaine ligne produit.
