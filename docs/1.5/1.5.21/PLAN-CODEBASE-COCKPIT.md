# Plan CB0b — Cockpit `@Codebase` (shell partagé)

**Statut** : **spec CB0b prête** · IDs `DroxViews` / commandes figés · go CB1 après acceptation  
**Version** : 1.5.21  
**Parent** : [README](README.md) · [AMBITION-CODEBASE-INDEX.md](AMBITION-CODEBASE-INDEX.md)  
**Suite code** : CB1 (store lexical + branchement cockpit) → CB2 (llama.cpp embed)

---

## 1. Objectif

Spécifier la **vue unique** de gestion / supervision index codebase, montable :

1. IDE — **activity bar** (comme Changes)  
2. IDE — **zone outils agent** (comme Terminal / Web)  
3. Agents — **même entrée outils**

Sans implémenter encore le vector store ni llama.cpp : la spec doit permettre un stub CB1 (états mock / lexical) puis le vrai pipeline.

---

## 2. Module partagé

| Élément | Id / nom figé |
|---------|----------------|
| Container sidebar | `DroxViews.CodebaseViewContainerId` = `workbench.view.drox.codebaseContainer` |
| Vue sidebar | `DroxViews.CodebaseViewId` = `workbench.view.drox.codebase` |
| Container panel (optionnel) | `DroxViews.CodebasePanelViewContainerId` = `workbench.view.drox.codebasePanelContainer` |
| Vue panel | `DroxViews.CodebasePanelViewId` = `workbench.view.drox.codebasePanel` |
| Focus commande | `DroxCommands.FocusCodebase` |
| Actions | `CodebaseReindex` · `CodebasePause` · `CodebasePurge` · `CodebaseExportDiag` |
| Classe UI | `DroxCodebaseCockpitView` (ou Pane) — **une** implémentation |
| Service | `IDroxCodebaseSupervisionService` au-dessus de `IDroxCodebaseIndexService` |
| Racine active | Host : IDE `folders[0]` · Agents `session.workingDirectory` |

Constants déjà dans [`drox.ts`](../../../src/vs/workbench/contrib/drox/common/drox.ts) (CB0b).

```text
Host (IDE sidebar | IDE panel | Agents)
        │  provideActiveWorkspaceRoot()
        ▼
IDroxCodebaseSupervisionService
        │
        ▼
IDroxCodebaseIndexService (CB1+)
        │
        ▼
DroxCodebaseCockpitView  ← rendu unique
```

**Règle** : zéro logique métier dans le host ; le host ne fait qu’embarquer la vue + fournir la racine.

---

## 3. Layout cockpit (v1 visible)

Une colonne scrollable, sections repliables (accordéon). Ordre haut → bas = priorité lecture 10 s.

### 3.1 En-tête instance

| Champ | Source |
|-------|--------|
| Path racine (canonique) | Active root |
| Badge état | `idle` · `indexing` · `paused` · `error` · `missing` |
| Modèle embed (ou « lexical only » en CB1) | Manifest / settings |
| Actions rapides | Pause · Reindex · Purge · Ouvrir dossier `.drox/codebase-index` |

### 3.2 Santé + anticipation

- Voyants : store ouvert, embed chargé (N/A en CB1), dérive (stale count), cap disque %  
- Liste **alertes** actives (severityité : error > warn) — cliquables → journal filtré

### 3.3 Pipeline live

| Indicateur | Affichage |
|------------|-----------|
| Queue | N fichiers en attente |
| Courant | path relatif + phase (chunk / embed / upsert) |
| Débit | chunks/s (moyenne courte) |
| Dernière activité | relative time |

### 3.4 Stockage

- Totaux : fichiers indexés, chunks, vecteurs, octets disque, soft cap  
- Chemin absolu index  
- Boutons : Vacuum/GC soft · (CB3b compactage fort)

### 3.5 Sonde retrieval

- Input requête + toggle `lexical` / `hybrid` (hybrid greyé jusqu’à CB2)  
- Bouton Probe → liste hits : path, lignes, score, preview 2 lignes  
- Bouton « Probe store / embed » (store dès CB1 ; embed CB2)

### 3.6 Journal

- Stream append-only (niveau, timestamp, message, path optionnel)  
- Export **rapport diag** (JSON ou markdown) : snapshot santé + 200 dernières lignes + versions schéma/modèle

### 3.7 Ressources (CB2+ branché, UI présente dès CB1 disabled/stub)

- Budget RAM, threads, batch, priorité — sliders ; valeurs affichées même si no-op en lexical-only

### 3.8 Catalogue connaissances — **placeholder CB0b / impl CB3b**

- Section présente avec empty state : « Catalogue admin — phase CB3b »  
- Capacité cible rappelée (parcourir / delete / espace / compact) pour ne pas oublier le design

---

## 4. Événements live (contrat service → UI)

Le service expose un observable / event de snapshot + deltas.

```ts
// Direction — noms provisoires
interface IDroxCodebaseCockpitSnapshot {
  readonly rootFsPath: string;
  readonly state: 'missing' | 'idle' | 'indexing' | 'paused' | 'error';
  readonly storage: { files: number; chunks: number; vectors: number; bytes: number; softCapBytes: number };
  readonly pipeline: { queueDepth: number; currentPath?: string; phase?: string; chunksPerSec: number };
  readonly embed: { modelId?: string; loaded: boolean; rssBytes?: number; lastProbeMs?: number };
  readonly alerts: readonly IDroxCodebaseAlert[];
  readonly mode: 'lexical' | 'hybrid';
}

interface IDroxCodebaseAlert {
  readonly id: string;
  readonly severity: 'error' | 'warn' | 'info';
  readonly code: string;   // ex. DISK_NEAR_CAP, STALE_FILES, EMBED_OOM
  readonly message: string;
  readonly at: number;
}
```

Refresh : push à chaque changement d’état / ~1 Hz pendant `indexing`.

---

## 5. Actions (API supervision)

| Action | CB1 | CB2 | CB3b |
|--------|-----|-----|------|
| `ensureIndexed` / Reindex | ✅ | ✅ | ✅ |
| Pause / Resume | ✅ | ✅ | ✅ |
| Purge instance | ✅ | ✅ | ✅ |
| Open index folder | ✅ | ✅ | ✅ |
| Probe store | ✅ | ✅ | ✅ |
| Probe retrieval | lexical ✅ | hybrid ✅ | ✅ |
| Probe embed | — | ✅ | ✅ |
| Set resource budgets | stub | ✅ | ✅ |
| Export diag report | ✅ | ✅ | ✅ |
| Catalogue list/delete/compact | — | — | ✅ |

---

## 6. Hosts — checklist d’intégration

### 6.1 IDE activity bar (comme Changes)

- [ ] `registerViewContainer` Sidebar + icon (ex. `Codicon.database` / custom)  
- [ ] `registerViews` → `DroxCodebaseCockpitViewPane`  
- [ ] Commande « Drox: Focus Codebase »  
- [ ] Root = `folders[0]` ; empty state si pas de folder

### 6.2 IDE zone agent

- [ ] Entrée panneau / view container panel (miroir Terminal) **ou** vue secondaire dans le stack agent — à trancher en impl. (préférence : **Panel** bottom pour parité Terminal)  
- [ ] Même ctor vue ; même service

### 6.3 Agents

- [ ] Enregistrement miroir dans `sessions.desktop` (même module `contrib/drox`)  
- [ ] Root = workingDirectory session ; si absent → empty state « Choisissez un dossier de travail »

---

## 7. Hors scope CB0b / CB1

- llama.cpp / poids modèle  
- Fusion parent/enfant  
- `@Codebase` dans le composer / tool agent (CB4)  
- Catalogue admin complet (CB3b)  
- Carte visuelle code  

---

## 8. Critères « CB0b done »

1. ✅ Plan layout + hosts + contrat snapshot (ce doc).  
2. ✅ IDs vue / container / commandes dans `DroxViews` / `DroxCommands`.  
3. ✅ Ambition §9 marque CB0b.  
4. 🔲 Acceptation produit → **CB1** (store + vue stub branchée).

---

## 9. Prochaine étape après acceptation

**CB1** : SQLite metadata + chunker lexical + file d’indexation + **brancher le cockpit** sur vrais compteurs / probe lexical (embed = badge « non chargé »).
