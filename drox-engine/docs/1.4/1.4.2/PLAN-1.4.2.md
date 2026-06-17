# Plan 1.4.2 — UI chat & distribution Windows

**Version** : juin 2026  
**Prérequis** : [1.4.1](../1.4.1/README.md) livrée (release **1.4.1** publiée) · Phase **2d** FOI faite  
**Base** : [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md) B-UI-* · [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md)

---

## Vision

Deux piliers pour la **1.4.2** :

1. **UI chat** — polish fil de discussion, replay, `ask_user`, blocs rail (backlog B-UI-*).
2. **Distribution Windows** — installeur **signé Authenticode** pour supprimer l’alerte SmartScreen « Éditeur inconnu » observée sur `Drox-IDE-Setup-1.4.1-win32-x64.exe`.

---

## P1 — Signature de code Windows (SmartScreen)

### Problème (1.4.1)

Lors du premier lancement de l’installeur, **Microsoft Defender SmartScreen** affiche :

- *« Éditeur inconnu »*
- blocage jusqu’à **Exécuter quand même**

**Cause** : l’exe publié sur GitHub Releases n’est **pas signé** Authenticode. `AppPublisher=KDDS` dans Inno Setup (`build/win32/code.iss`) ne suffit pas — Windows exige une **signature cryptographique** d’une AC de confiance.

Le hook Inno `#ifdef Sign` + `SignTool=esrp` est le pipeline **Microsoft interne** (VS Code) ; il n’est **pas** actif dans `npm run drox:ship` KDDS.

### Objectif 1.4.2

Chaque release Windows (`Drox-IDE-Setup-<ver>-win32-x64.exe`) publiée sur `Drox---IDE---OR` est :

1. Signée **Authenticode** (SHA-256 + horodatage RFC 3161)
2. Vérifiable : `signtool verify /pa setup.exe` → réussite
3. Accompagnée d’une note README OR si l’alerte persiste encore (certificat OV en montée de réputation)

### Choix certificat (décision produit)

| Option | SmartScreen | Notes |
|--------|-------------|--------|
| **EV Code Signing** (token USB) | Réputation **immédiate** en règle générale | Recommandé si budget ~400–600 €/an |
| **OV Code Signing** | Alerte possible les **premières** semaines | Moins cher ; réputation à construire |
| **[Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/)** | Équivalent pro, facturation à l’usage | À évaluer si entité + abonnement Azure OK |

**Prérequis administratif** : entité identifiable (KDDS / société / auto-entrepreneur) validée par la CA.

### Fichiers à signer (ordre)

| Artefact | Priorité |
|----------|----------|
| `Drox-IDE-Setup-*-win32-x64.exe` | **P0** — ce que l’utilisateur télécharge |
| `Drox IDE.exe` (dans le package) | P1 |
| `resources/drox/win32-x64/drox.exe` | P1 |

### Intégration pipeline

```text
npm run drox:ship
  → build-release-win32.ps1 (-WithSetup)
  → release-publish-win32.ps1 (manifestes OR)
  → [NOUVEAU] sign-drox-win32.ps1
        signtool sign /fd sha256 /tr <timestamp-url> /td sha256 …
        signtool verify /pa setup.exe
  → gh release create (exe signé uniquement)
```

**Emplacement script** : `scripts/sign-drox-win32.ps1` (à créer en 1.4.2).

**Variables d’environnement** (local + CI, jamais en git) :

| Variable | Usage |
|----------|--------|
| `DROX_CODESIGN_PFX` | Chemin `.pfx` ou secret CI |
| `DROX_CODESIGN_PASSWORD` | Mot de passe certificat |
| `DROX_CODESIGN_TIMESTAMP_URL` | ex. `http://timestamp.digicert.com` |

**Option Inno** : `SignTool` custom dans `code.iss` (remplacer `esrp`) — ou signature **post-build** du setup uniquement (plus simple en P0).

### Doc utilisateur (README OR)

Paragraphe **Installation Windows** :

- Si SmartScreen s’affiche **avant** signature livrée : lien Releases officiel + « Exécuter quand même » pour early adopters.
- **Après** signature EV : mentionner que l’éditeur affiché doit être **KDDS** (nom du certificat).

### Livrables

| # | Livrable | Critère |
|---|----------|---------|
| S1 | Certificat acheté + stockage sécurisé | PFX ou Azure Trusted Signing configuré |
| S2 | `scripts/sign-drox-win32.ps1` | Signe setup ; échoue proprement si cert absent |
| S3 | `drox:ship` appelle la signature si env présents | Build non signé OK en dev sans cert |
| S4 | `GUIDE-PUBLICATION-WIN32.md` § signature | Procédure complète |
| S5 | Release **1.4.2** GitHub | `signtool verify` OK ; smoke install sans « Éditeur inconnu » (EV) |

### Non-objectifs

- Signature **macOS** / Linux (hors scope 1.4.2)
- Contournement SmartScreen sans certificat (impossible de façon légitime)

---

## P2 — UI chat (B-UI-*)

Polish interface — périmètre inchangé depuis le README :

| ID | Sujet |
|----|-------|
| B-UI-01 | Fichiers édités repliés |
| B-UI-02 | Lignes Ran / layout tray |
| B-UI-03 | Plan du run précédent non scellé |
| B-UI-04 | `ask_user` markdown + scroll ~8 lignes |
| B-UI-05 | Phase thinking active en tête vs chronologique |
| B-UI-06 | Chargement session à la réouverture (replay journal) |
| B-UI-07 | Run `busy` stale après fin / blur app |

Spéc : [UI-CONDUCTEUR](../1.4.0/archive/UI-CONDUCTEUR.md) § VI · [06-UI-BLOCKS](../1.4.0/archive/06-UI-BLOCKS.md)

---

## Séquence recommandée

```text
1.4.1 publiée
  → 1.4.2a : certificat + sign-drox-win32 + release 1.4.2-rc signée (smoke install)
  → 1.4.2b : B-UI-* (peut chevaucher si 2 devs)
  → tag v1.4.2 + OR latest.json
```

---

## Critères d’acceptation release 1.4.2

- [ ] Installeur Windows signé et publié
- [ ] README OR : section installation / SmartScreen
- [ ] Au moins **B-UI-06** + **B-UI-07** fermés (session replay + busy stale)
- [ ] `droxVersion` → **1.4.2** dans `package.json` au ship

---

## Liens

- [README 1.4.2](README.md)
- [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md)
- `build/win32/code.iss` (Inno, `AppPublisher=KDDS`)
- `scripts/release-publish-win32.ps1`
