# Finalisation 1.3.0 — Distribution, launcher, dépôt production

**Statut** : cadrage 1.3.0 (archive) — **plan** : [PLAN-DISTRIBUTION-LAUNCHER.md](./PLAN-DISTRIBUTION-LAUNCHER.md) · **clôture active** : [1.3.1](../../1.3.1/finalisation/CLOSURE-1.3.1.md)  
**Date** : 2026-05-27 (cadrage) · 2026-05-28 (plan détaillé)  
**Public** : équipe produit / build / release

---

## 1. Vision produit

> Un utilisateur télécharge **Drox IDE**, l’installe une fois, reçoit des **notifications de mise à jour** depuis l’app ou le launcher, et **n’a pas accès au code source** du monorepo VS Code + Drox + moteur — seulement aux binaires et assets nécessaires au run.

Objectifs :

| # | Objectif |
|---|----------|
| F1 | Installation **one-click** (ou proche) sur la plateforme cible prioritaire (Windows). |
| F2 | **Mises à jour** contrôlées par nous (canal stable ; bêta optionnel plus tard). |
| F3 | **Téléchargement gratuit** sans donner le repo `Drox---IDE` ni `drox-engine` en clair. |
| F4 | Traçabilité des versions (manifest, changelog, signature si possible). |

Hors scope immédiat (1.3.0) sauf décision explicite :

- Marketplace d’extensions tierces « type VS Code ».
- Comptes utilisateurs / licence payante.
- Builds Linux ARM, Snap, Flatpak (à prioriser après Windows).

---

## 2. Composants à construire

### 2.1 Installateur

**Rôle** : première installation (répertoire d’install, raccourcis, désinstalleur, éventuellement VC++ redist / WebView2 check sur Windows).

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **Inno Setup / NSIS** + artefact `win32-x64` déjà produit par le build VS Code | Mature, léger, contrôle total | Pipeline release à maintenir |
| **electron-builder** (si on repackage Electron) | Auto-update intégré possible | Duplication avec le flux Code OSS existant |
| **MSIX / Store** | Distribution « propre » Windows | Review, contraintes, délai |

**Recommandation provisoire** : s’appuyer sur le **build Code OSS / Nexus** existant (`gulp vscode-win32-x64` ou équivalent du fork), puis **Inno Setup** (ou NSIS) pour l’installeur — aligné avec l’écosystème VS Code.

**Contenu du package installé** (minimum) :

- Binaire IDE (Electron) + extensions embarquées Drox.
- Moteur `drox-engine` (binaire Rust ou sidecar selon packaging actuel).
- Fichiers de branding (icônes, `product.json` **Drox IDE**).
- **Pas** : sources TypeScript, `drox-engine/crates/`, historique git.

### 2.2 Launcher & mises à jour

**Rôle** : point d’entrée optionnel ou intégré qui :

1. Vérifie une **URL de manifest** (JSON) : `{ version, url, sha256, notes, mandatory? }`.
2. Compare avec la version installée (`product.json` / registre / fichier version).
3. **Notifie** l’utilisateur dans l’IDE (« Mise à jour 1.3.1 disponible »).
4. Télécharge le patch ou l’installeur incrémental / full, vérifie l’intégrité, relance.

| Approche | Description |
|----------|-------------|
| **A — Update dans l’IDE** | Module workbench `contrib/nexus/update` : check au démarrage + menu Aide ; téléchargement + script silencieux ou ouverture installeur. |
| **B — Launcher externe** | Petit exe `DroxUpdater.exe` (ou `inno_updater.exe`) qui update puis lance `Drox IDE.exe` — utile si l’IDE ne peut pas s’auto-remplacer sous Windows. |
| **C — Hybride** | Launcher fait le remplacement de fichiers ; l’IDE affiche seulement la notification et délègue. |

**Recommandation provisoire** : **C (hybride)** — notification dans l’IDE (meilleure UX), remplacement fichiers par un **launcher / updater** minimal (évite « fichier verrouillé » sous Windows).

Références à étudier :

- Mécanisme **VS Code update** (win32 : `inno_updater`, buckets Azure) — inspiration, pas réutilisation directe des serveurs Microsoft.
- **Squirrel.Windows** (si stack Electron compatible).
- Signature **Authenticode** pour éviter SmartScreen (budget certificat).

### 2.3 Dépôt / canal de production (sans sources)

**Rôle** : héberger ce que le public télécharge — **pas** le monorepo dev.

Structure cible (exemple) :

```text
drox-ide-releases/           # repo public OU bucket S3 / GitHub Releases
  stable/
    latest.json              # manifest pointeur
    1.3.0/
      Drox-IDE-Setup-1.3.0-win32-x64.exe
      Drox-IDE-1.3.0-win32-x64.zip    # portable optionnel
      SHA256SUMS
      RELEASE_NOTES.md
  beta/                        # optionnel plus tard
```

**`latest.json` (exemple)** :

```json
{
  "version": "1.3.0",
  "released": "2026-06-01",
  "platforms": {
    "win32-x64": {
      "installerUrl": "https://…/Drox-IDE-Setup-1.3.0-win32-x64.exe",
      "sha256": "…",
      "sizeBytes": 0
    }
  },
  "mandatory": false,
  "notesUrl": "https://…/RELEASE_NOTES.md"
}
```

**Séparation des dépôts** :

| Dépôt | Visibilité | Contenu |
|-------|------------|---------|
| `Drox---IDE` (actuel) | Privé / équipe | Sources complètes, CI build |
| `drox-ide-releases` (à créer) | Public | Binaires + manifests uniquement |
| Site vitrine (projet en test) | Public | Pages marketing + lien téléchargement → `latest.json` ou Releases |

**Licence** : rappel — Code OSS sous MIT ; obligations d’attribution et de **NOTICE** dans le package ; pas de mélange avec code propriétaire non compatible sans revue.

---

## 3. Pipeline build → release (brouillon)

```text
[CI privé — monorepo]
  compile moteur Rust (release)
  gulp vscode-win32-x64 (ou script Nexus)
  embarquer drox-engine + extension Drox
  smoke install + lancement headless
  produire Setup.exe + zip + SHA256
  signer (si certificat)
  publier vers drox-ide-releases (tag v1.3.0)
  invalider CDN / mettre à jour latest.json

[Poste utilisateur]
  télécharge Setup.exe OU update via launcher
  installe → lance Drox IDE
  au prochain démarrage : check latest.json → notification si version >
```

---

## 4. Décisions ouvertes (ADR à rédiger)

| ID | Question | Options |
|----|----------|---------|
| D-F1 | ~~Nom produit~~ | **Figé : Drox IDE** (moteur **Drox**) |
| D-F2 | Auto-update obligatoire ou opt-in | Sécurité vs contrôle utilisateur |
| D-F3 | Installeur seul vs portable zip | Dev power-users |
| D-F4 | Où héberger les releases | GitHub Releases, S3, Cloudflare R2 |
| D-F5 | Signature code Windows | Certificat EV vs OV vs unsigned (beta) |
| D-F6 | Moteur : binaire embarqué vs install séparé | Taille package vs flexibilité |
| D-F7 | Télémétrie / crash reports au téléchargement | Privacy, charge ops |

---

## 5. Plan d’exécution

→ Détail complet (phases P0, F1–F7, commandes gulp, smoke, CI, module `contrib/drox/update`) : **[PLAN-DISTRIBUTION-LAUNCHER.md](./PLAN-DISTRIBUTION-LAUNCHER.md)**.

| Étape | Livrable | Dépend de |
|-------|----------|-----------|
| **F0** | Grille [CRITERES-TEST-REEL.md](./CRITERES-TEST-REEL.md) validée sur site vitrine | Test utilisateur |
| **P0** | Branding Drox IDE finalisé (assets, electron) | — |
| **F1–F7** | Voir plan détaillé | Enchaînement documenté |

---

## 6. Liens internes

- Build VS Code : scripts racine `package.json`, `.github/copilot-instructions.md`
- Moteur : `drox-engine/`, packaging extension `drox-engine/extension-vscode/`
- Vision 1.3.0 : [VISION-CONSOLIDEE-1.3.0.md](../steps/01-vision/VISION-CONSOLIDEE-1.3.0.md)
- Plans distribution historiques : `docs/0.0.0/plans/PLAN-IDE-DROX.md` (Phase 4 Tauri — **non retenu** pour ce fork VS Code ; garder comme référence d’idées auto-update)

---

## 7. Notes de session (2026-05-27)

- Test terrain prévu sur le **site vitrine** du projet (dogfooding).
- Critère immédiat : **tenir > 15 min** (session, reprise UI, orchestration, pas de fuite mémoire bloquante).
- Finalisation distribution = **lot de clôture 1.3.0**, pas le focus du sprint parallélisme en cours.
