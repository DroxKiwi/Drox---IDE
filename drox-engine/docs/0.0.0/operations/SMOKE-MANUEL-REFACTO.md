# Smoke manuel — refactoring structure (référence figée)

**Date** : 2026-05-20  
**Usage** : rejouer **à l’identique** après chaque phase de [REFACTO-STRUCTURE-CODE](../plans/REFACTO-STRUCTURE-CODE.md).  
**Attendu** : aucune différence visible vs baseline Phase 0.

## Prérequis

- `cargo build -p drox-cli` OK
- Ollama + modèle configuré (`drox-engine/drox/.drox/.env`)
- IDE lancé (`npm run watch` + `scripts/code.bat`) ou extension F5

## Validation automatisée (avant cette checklist)

Rejouée le **2026-05-20** pendant le refactoring structurel :

```powershell
cd drox-engine\drox
cargo test --workspace

cd ..\..   # racine Nexus-IDE---VsCode
npm run test-drox
# ou
.\scripts\test-drox.ps1
```

Si ces commandes passent, seule la **régression UX** ci-dessous reste à vérifier à la main.

## Checklist (~10 min)

| # | Action | OK |
|---|--------|-----|
| 1 | Ouvrir le chat Drox, mode **Accept Edits** (défaut) | ☐ |
| 2 | Envoyer : « Lis README.md à la racine et résume en 3 puces » | ☐ |
| 3 | Vérifier : bloc **Exploring** (réflexion + outils repliés), réponse finale hors exploring | ☐ |
| 4 | Nouveau message : créer un fichier `.drox/scratch/smoke-refacto.txt` avec une ligne via l’agent | ☐ |
| 5 | Vérifier : micro-annonces `answering`, diff ou confirmation selon mode | ☐ |
| 6 | Recharger la fenêtre / rouvrir l’onglet — historique replay correct (pas de JSON brut) | ☐ |
| 7 | Annuler un run en cours (bouton stop) — retour idle sans crash | ☐ |

## Critère d’échec

- Trace phases absente ou JSON outils dans le fil principal
- Boucle infinie sans `[phase: done]`
- Erreur spawn moteur / canal RPC
- Régression onglets / titres session

*Cocher la date dans REFACTO §6 après validation de phase.*
