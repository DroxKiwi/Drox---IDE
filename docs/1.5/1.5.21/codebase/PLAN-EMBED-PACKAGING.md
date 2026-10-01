# Packing embed — dev **et** ship (même chemin)

**Statut** : **direction packaging** · avant CB2  
**Parent** : [AMBITION.md](AMBITION.md) §4–5 · [ARCHITECTURE.md](ARCHITECTURE.md)  
**Code futur** : runtime dans / à côté de `drox.exe` · poids sous resources ou user-data

---

## 1. Contrainte

Le système `@Codebase` doit marcher **identiquement** :

| Contexte | Attente |
|----------|---------|
| **Dev** (repo + `cargo build`, IDE non packagé) | Index / embed sans « installer Ollama » ni npm magique |
| **Ship** (installeur Drox IDE) | Out-of-the-box : runtime + modèle minimal **inclus ou provisionnés une fois** |

Pas de « `pip install` / `npm install` chez l’utilisateur final ».

---

## 2. Ce qu’on n’embarque **pas** comme « dépendance utilisateur »

| Approche | Verdict |
|----------|---------|
| Demander Ollama + `ollama pull` pour indexer | ❌ Contredit embed shippé / RAM-first |
| `npm i node-llama-cpp` au runtime utilisateur | ❌ Fragile (ABI Electron), double stack IDE/Agents |
| Télécharger le runtime depuis internet à chaque run | ❌ Hors offline-first |

---

## 3. Ce qu’on intègre — deux briques séparées

```text
┌─────────────────────────────────────┐
│  A. Runtime d’inférence (code)      │  ← compilé dans le produit
│     llama.cpp via stack Drox        │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  B. Poids modèle (fichier GGUF)     │  ← asset, pas du source
│     MiniLM / BGE-small              │
└─────────────────────────────────────┘
```

On **n’intègre pas** le « code source » du modèle (ce n’est pas du code).  
On **lie** llama.cpp (ou équivalent) **au build** ; on **ship** un fichier de poids.

---

## 4. Runtime — recommandation Drox

### Direction : **dans le moteur Rust (`drox.exe`)**, pas un module Node ad hoc

| Option | Dev | Ship | Notes |
|--------|-----|------|--------|
| **A — Crate Rust** (`llama-cpp-2` / binding officiel) dans workspace `drox-engine` | `cargo build` → même `drox.exe` | Binaire déjà copié dans l’app | **Favori** : un seul artefact, IDE + Agents |
| **B — Sidecar** `drox-embed.exe` à côté de `drox.exe` | Build script parallèle | Même dossier resources | OK si A trop lourd / feature-flag |
| **C — Native addon Node** dans Electron | Rebuild native à chaque Electron | Cauchemar ABI | **Éviter** |
| **D — Vendor tree complet llama.cpp** dans le monorepo IDE | Possible mais bruyant | Duplique ce que Cargo gère déjà | Seulement si binding Rust insuffisant |

**Verdict** : **A** (feature Cargo optionnelle `embed` sur `drox` / crate dédiée `drox-embed`).  
Le code « moteur embed » = **dépendance de build Cargo** (crates.io + linking llama.cpp), pas une install utilisateur.

Source llama.cpp : **via le crate** (téléchargé au `cargo build`, éventuellement vendored dans `drox-engine/vendor/` pour builds offline CI) — pas copié à la main dans `src/vs/`.

---

## 5. Modèle GGUF — asset

| Stratégie | Dev | Ship |
|-----------|-----|------|
| **S1 — Bundlé** dans resources app (~20–45 Mo MiniLM) | Copie / symlink depuis `drox-engine/models/` ou cache | Inclus dans l’installeur |
| **S2 — First-run download** vers `%APPDATA%\.drox-ide\models\` | Script `fetch-embed-model` | Download une fois + checksum |
| **S3 — Hybride** | Petit modèle bundlé ; qualité optionnelle en download | Défaut offline immédiat |

**Verdict v1** : **S1** — modèle défaut **toujours** dans l’app (`resources/drox/models/`). Pas de download utilisateur.

```text
1. drox.codebase.embedModelPath (override cockpit / settings — optionnel)
2. DROX_EMBED_MODEL_PATH (env, dev)
3. {appRoot}/resources/drox/models/<id>.gguf   // défaut ship + F5 si copié
4. {userData}/drox/models/<id>.gguf
5. {repo}/drox-engine/models/<id>.gguf         // dev
```

Même fonction `resolveDroxEmbedModelPathDetailed()` en dev et en prod — la **source** est affichée dans le cockpit.  
`scripts/fetch-drox-embed-model.ps1` = outil **packaging/dev** uniquement ; `package-drox.ps1` copie le GGUF dans `resources/drox/models/`.  
**Reset to defaults** dans le cockpit efface l’override et recharge le MiniLM bundlé.

---

## 6. Flux unifié

```text
IDE / Agents
    │  RPC ou API locale
    ▼
drox.exe  (+ feature embed)
    │  charge GGUF (chemin résolu)
    │  encode chunk / query
    ▼
vecteurs → store workspace .drox/codebase-index/
```

Le **chunker / store** peuvent rester côté workbench TypeScript (CB1) ; l’**encode** passe par le moteur (CB2) pour éviter Node-native.

Alternative acceptable : encode via JSON-RPC `embed.encode` sur `drox --serve` (déjà le bus IDE ↔ moteur).

---

## 7. Dev — checklist

1. `cargo build -p drox --features embed` (nom exact à figer).  
2. Placer / fetcher le GGUF sous `drox-engine/models/` (gitignore des poids si licence / taille ; script `scripts/fetch-drox-embed-model.ps1|.sh`).  
3. Settings / env pointent vers ce path.  
4. Smoke : probe embed dans le cockpit = latence + dim.

Pas besoin d’un `npm install` spécial pour l’embed.

---

## 8. Ship — checklist

1. Pipeline release build `drox.exe` **avec** feature embed (même job que aujourd’hui).  
2. Copier GGUF défaut dans le payload installateur / `resources/drox/models/`.  
3. Vérifier résolution de path sur Windows / Linux / macOS packagés.  
4. Cockpit : si modèle manquant → alerte + action « localiser / retélécharger » (pas un crash silencieux).

---

## 9. Décisions

| # | Choix | État |
|---|--------|------|
| P1 | Runtime via **Cargo / drox.exe**, pas npm native | ✅ direction |
| P2 | llama.cpp **lié au build**, pas install user | ✅ |
| P3 | Poids = **fichier GGUF** asset (bundlé ou first-run) | ✅ |
| P4 | Même resolve path dev/ship | ✅ |
| P5 | Feature Cargo exacte + crate | 🔲 CB2 |
| P6 | Bundlé vs first-run pour le défaut MiniLM | 🔲 (viser bundlé si &lt; ~50 Mo) |

---

## 10. Lien phases

- **CB1** : store lexical — **sans** runtime embed (badge « non chargé ») ✅ compatible.  
- **CB2** : activer feature Cargo + resolve modèle + probe cockpit.  
- Ne pas bloquer CB1 sur le packaging ; ne pas improviser un `node-llama` en attendant.
