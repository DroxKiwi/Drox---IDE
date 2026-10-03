# Plan — Port forwarding (1.5.23)

**Parent** : [README 1.5.23](README.md)  
**Statut** : ✅ **MVP livré** (1.5.23) · smoke dogfood post-ship  
**Contrainte produit** : **pas** de dépendance à un compte / tunnel cloud tiers — config déclarative + outil extérieur interchangeable.

> **Décision** : le forward **local** est déjà natif VS Code. Le travail Drox = (1) config déclarative, (2) brancher un **outil extérieur** de forward, suffisamment **bas niveau / universel** pour n’importe quel hôte.

---

## 0. But

Rendre utilisable chez Drox un **forward de ports** pour :

- un serveur lancé par l’agent ou l’utilisateur (`npm run dev`, preview, …) ;
- et/ou un service que l’utilisateur a déjà mis en place (reverse proxy, tunnel maison, hosting).

Sécurité : **pas** d’exposition publique par défaut ; opt-in clair via config.

---

## 1. Comment ça marche dans VS Code (amont)

### 1.1 Deux mondes distincts

| Contexte | Problème | Ce que fait VS Code |
|----------|----------|---------------------|
| **Local** (desktop, workspace sur la machine) | Le serveur écoute déjà sur `localhost:PORT` | Souvent **rien à « forwarder »** pour ouvrir dans le navigateur local. La vue **Ports** sert surtout à **détecter**, **labeliser**, **preview**, et à mémoriser des attributs. |
| **Remote** (SSH, WSL, Container, Codespaces, …) | Le process écoute sur la machine **distante** ; le UI tourne ailleurs | Il faut un **tunnel** : `remoteHost:remotePort` → `localAddress` (ex. `127.0.0.1:localPort`) pour que le client puisse ouvrir l’URL. |

Drox desktop est surtout dans le cas **local** aujourd’hui ; la stack tunnel amont reste pertinente si on ouvre un jour Agents/IDE sur une machine distante, ou si on veut un **proxy local contrôlé** (bind, label, preview).

### 1.2 Couches code (repo)

```text
Détection candidats (process / sortie terminal / debug)
        ↓
remote.portsAttributes  (+ providers d’extensions)
        ↓
TunnelModel  (état des ports forwardés / candidats)
        ↓
ITunnelService.openTunnel(...)
        ↓
ITunnelProvider.forwardPort(...)   ← pluggable
        ↓
RemoteTunnel { localAddress, privacy, protocol, dispose }
        ↓
Vue Ports + Simple Browser / opener externe
```

Fichiers utiles :

| Zone | Chemin |
|------|--------|
| Contrat tunnel | `src/vs/platform/tunnel/common/tunnel.ts` |
| État / restore | `src/vs/workbench/services/remote/common/tunnelModel.ts` |
| Settings | `remote.autoForwardPorts`, `remote.autoForwardPortsSource`, `remote.portsAttributes`, `remote.forwardedPortsView.enabled` — dans `remote.contribution.ts` |
| Vue UI | `src/vs/workbench/contrib/remote/browser/tunnelView.ts` |
| Provider injectable | `tunnelFactory.ts` / `ITunnelProvider` |
| Bridge extensions | `mainThreadTunnelService.ts` |

### 1.3 Auto-forward

Settings clés :

- **`remote.autoForwardPorts`** — active la détection → forward auto.
- **`remote.autoForwardPortsSource`** :
  - `process` — surveille les process qui écoutent (peu effectif en remote Win/mac → bascule souvent) ;
  - `output` — parse la sortie terminal / debug (`localhost:3000`, …) ;
  - `hybrid` — output + un-forward quand le process meurt.
- **`remote.portsAttributes`** — par port / plage / regex de cmdline :
  - `onAutoForward`: `notify` | `openBrowser` | `openPreview` | `silent` | `ignore` | …  
  - `label`, `protocol` (`http`/`https`), `elevateIfNeeded`, …

### 1.4 Forward manuel

L’utilisateur (ou une commande) demande un port → `TunnelModel` → `ITunnelService.openTunnel` → le **provider** crée le tunnel et renvoie `localAddress`.

### 1.5 Privacy / public

Sur Codespaces / certains remotes, un tunnel peut être **private** (localhost client) ou **public** (URL externe).  
Ça suppose un **provider** qui sait publier (souvent un service cloud).  
**Hors scope Drox v1** : pas de publication cloud obligatoire.

### 1.6 Ce qui est « gratuit » en local

Si le serveur bind déjà `127.0.0.1:5173` sur la même machine que l’IDE :

- ouvrir `http://127.0.0.1:5173` suffit ;
- la valeur Drox = **découverte**, **config déclarative**, **preview**, éventuellement **rebind / proxy** si le process n’écoute que sur une interface inaccessible depuis l’UI.

---

## 2. Direction produit Drox (décision figée)

### 2.1 Ce qu’on ne réimplémente pas

Le **forward local** (détection Ports, preview `localhost`, `remote.portsAttributes`, auto-forward terminal) est **déjà là** dans VS Code.  
Drox ne recrée pas cette couche.

### 2.2 Ce qu’on construit vraiment

Deux briques seulement :

| Brique | Rôle |
|--------|------|
| **A. Config déclarative** | Décrire *quoi* forwarder : hôte, port distant, port local, protocole, label, outil. |
| **B. Adapter d’outil extérieur** | Lancer / piloter un binaire ou commande que **l’utilisateur choisit** (ssh, socat, cloudflared, frp, ngrok self-host, script maison…). |

Principe : Drox reste **bas niveau et universel** —

```text
localBind (host:port)  ←outil→  remoteTarget (host:port)
```

- **n’importe quel hôte** distant (IP, hostname, bastion) ;  
- **n’importe quel outil** tant qu’il est exprimable en commande / argv / env ;  
- **pas** de SDK cloud propriétaire imposé.

### 2.3 Où l’utilisateur déclare ça ?

**Source de vérité** = settings VS Code / Drox (`droxConfiguration`), comme Traffic / Codebase — pas une base à part.

| Quoi | Clé | Scope recommandé | Où l’éditer |
|------|-----|------------------|-------------|
| **Outil extérieur** (la « connexion » : ssh, socat, script…) | `drox.ports.tools` (+ `drox.ports.defaultToolId`) | **User** (machine / compte) | **Settings Drox** (`Open Drox Settings` → requête `drox.ports`) **et** panneau Ports (formulaire profil) |
| **Forwards** (quoi exposer : host/port → bind local) | `drox.ports.forwards` | **Workspace** (projet) en priorité ; User possible | **Panneau Ports** (liste + add/remove, comme tags Traffic) qui écrit le setting ; JSON OK pour power users |

Fichiers concrets côté disque :

```text
User (outil / bastion perso)
  %APPDATA%/…/User/settings.json
    → "drox.ports.tools": [ { id, command, args, … } ]

Workspace (forwards du projet)
  <repo>/.vscode/settings.json
    → "drox.ports.forwards": [ { id, remoteHost, remotePort, toolId?, … } ]
```

**UX cible (alignée Traffic)** :

1. Onglet / vue **Ports** (IDE + Agents) — surface principale : profils d’outil + liste des forwards + Start / Stop / Open.  
2. **Settings UI** — même clés, pour édition JSON / recherche `drox.ports`.  
3. Pas de wizard cloud ; l’utilisateur colle sa commande.

Pourquoi séparer User (outil) / Workspace (forwards) :

- le **binaire + bastion** est personnel (`user@mon-vps`, chemin `ssh`) ;  
- les **ports du projet** (5173, 3000…) se commitent dans le repo si l’équipe veut.

### 2.4 Contrat config (brouillon)

```jsonc
// User settings — connexion / outil extérieur
"drox.ports.defaultToolId": "ssh-bastion",
"drox.ports.tools": [
  {
    "id": "ssh-bastion",
    "label": "SSH bastion",
    "command": "ssh",
    // Placeholders : {{localHost}} {{localPort}} {{remoteHost}} {{remotePort}}
    "args": [
      "-N",
      "-L", "{{localHost}}:{{localPort}}:{{remoteHost}}:{{remotePort}}",
      "user@bastion.example"
    ],
    "env": {}
  }
],

// Workspace settings — ce que ce projet expose
"drox.ports.forwards": [
  {
    "id": "vite",
    "label": "Vite",
    "remoteHost": "127.0.0.1",   // hôte vu *depuis* le côté distant du tunnel
    "remotePort": 5173,
    "localHost": "127.0.0.1",
    "localPort": 5173,
    "protocol": "http",
    "onReady": "preview",
    "toolId": "ssh-bastion"      // optionnel : sinon defaultToolId
  }
]
```

Override : `toolId` **par** forward pour mixer ssh + frp + script.

Exemple profils possibles (doc utilisateur, pas de code vendor) :

| Outil | Idée d’args |
|-------|-------------|
| `ssh -L` | forward TCP classique vers n’importe quel hôte via bastion |
| `socat` | `TCP-LISTEN:{{localPort}},fork TCP:{{remoteHost}}:{{remotePort}}` |
| `cloudflared` / `frpc` / script | l’utilisateur colle sa ligne ; Drox substitue les placeholders |

### 2.5 Rôle de Drox dans le runtime

```text
Config drox.ports.*
    → resolve placeholders
    → spawn outil (child process, logs dans Output)
    → attendre localBind prêt (connect probe)
    → onReady (preview / notify / rien)
    → dispose = kill process groupe
```

UI minimale : liste des forwards déclarés, état (idle / starting / up / error), Open, Stop.  
Réutiliser la vue Ports amont **seulement** si ça simplifie le preview local ; sinon panneau Drox mince.

### 2.6 Hors scope

- Imposer un broker cloud / OAuth.  
- Réécrire l’auto-forward local VS Code.  
- Facturation / multi-tenant.

---

## 3. Travaux prévus

1. ✅ Recherche amont (§1).  
2. ✅ Décision produit (§2) — local natif ; Drox = config + outil extérieur universel.  
3. ✅ **MVP** : schema `drox.ports.*` + spawn outil (main IPC) + probe + open preview/browser/notify + stop.  
4. ✅ Surface IDE / Agents (vue Ports + AuxBar Sessions) + action cockpit Sessions.  
5. ✅ Tests unitaires placeholders / parse (`droxPortsConfig.test.ts`).  
6. ⏳ Smoke : forward vers un hôte non-local → `localHost:localPort` ouvre dans l’IDE.  
7. ⏳ Doc courte utilisateur : 2–3 exemples de profils (`ssh`, `socat`, script) — §2.4 suffit pour dogfood.

### 3.1 Carte code MVP

| Zone | Chemin |
|------|--------|
| Settings | `droxConfiguration` → `drox.ports.tools` / `defaultToolId` / `forwards` |
| Parse / placeholders | `common/ports/droxPortsConfig.ts` |
| Service | `electron-browser/ports/droxPortsServiceImpl.ts` |
| Spawn / probe | `electron-main/droxPortsProcessHost.ts` (+ channel engine) |
| UI | `browser/ports/droxPortsViewPane.ts` · CSS · contributions IDE + Sessions |

## 4. Done quand

- ✅ Config déclarative stable (placeholders `{{localHost|localPort|remoteHost|remotePort|label|id}}`).  
- ⏳ Au moins **un** outil extérieur dogfoodable (ex. `ssh -L` ou `socat`) vers un hôte arbitraire — smoke manuel.  
- ✅ Aucun vendor cloud obligatoire.  
- ✅ Surface IDE / Agents utilisable (liste + start/stop/open).

## 5. Suite

Smoke dogfood PF, puis pass docs / CLOSURE 1.5.23.
