# Refacto app web (`/web`) — chantier Drox Code

**Document de suivi** pour réutiliser l’interface web issue du leak original dans ce dépôt (fork Drox), **sans** passer par un fork VS Code en premier temps.

**Dernière analyse du dossier** : 2026-05-10 (structure `web/` telle que présente dans le repo).

---

## 1. Contexte et objectif

| Élément | Détail |
|--------|--------|
| **Origine** | Dossier `web/` : application **Next.js 14** (App Router), UI chat + paramètres + export + collaboration (hooks / types). |
| **Nom de paquet actuel** | `claude-code-web` (`web/package.json`) — à aligner sur Drox. |
| **Cible produit** | Réutiliser cette UI comme **frontend** du même produit que la CLI Drox : branding neutre, **pas** de dépendance implicite à Anthropic / claude.ai, backend **Ollama** ou **endpoint compatible Messages** comme le reste du fork. |
| **Non-objectif (phase 1)** | Intégration dans un fork VS Code ; duplication massive de `src/` dans le bundle Next sans passer par une couche API claire. |

> ### ⚠️ Clarification fondamentale (à lire avant tout)
>
> - **`web/` est totalement autonome** vis-à-vis de `src/` : aucun import croisé, aucune dépendance partagée, aucun lien runtime. Vérifié par grep / lecture statique le 2026-05-10.
> - **Origine probable** : prototype d’UI navigateur d’Anthropic (ou side-project) destiné à parler **directement** à un service HTTP exposant la **Messages API streaming d’Anthropic** + un endpoint **MCP Streamable HTTP**. Pas conçu pour la CLI Claude Code / Drox.
> - **Notre CLI actuelle (`src/`) n’expose AUCUN serveur HTTP.** C’est un binaire REPL Ink qui consomme le LLM en interne (Ollama / `DROX_API_BASE_URL`). Brancher l’UI sur la CLI telle quelle est **impossible** sans écrire une couche serveur.
> - **Ce que ce document appelle « backend 3001 » est donc à CRÉER**, ce n’est pas un composant existant. Il s’agira soit d’un nouveau process Node/Bun (option A), soit de Route Handlers Next réutilisant `src/` (option B). Voir §3.
> - **Conséquence pratique** : tant que le backend 3001 n’existe pas, lancer `cd web && npm run dev` affichera une UI fonctionnelle mais **`Connection failed`** sur `/health`, **0 réponse** sur `/api/chat`, **0 outil** côté MCP. C’est attendu.

---

## 2. Inventaire technique (état actuel)

### 2.1 Stack

- **Framework** : Next.js `^14.2`, React 18, TypeScript 5, Tailwind 3.4, Radix UI, Zustand (persist), SWR, Framer Motion, Shiki, react-markdown.
- **Entrée** : `web/app/page.tsx` → `ChatLayout`.
- **Config** : `web/next.config.ts` (bundle analyzer, règles webpack pour **workers** — voir §5.2).

### 2.2 Couche « API » côté navigateur

| Fichier / zone | Rôle |
|----------------|------|
| `web/lib/api.ts` | `streamChat` → `POST /api/chat` (Next), parsing SSE `data: …` + `[DONE]`. |
| `web/lib/api/client.ts` | Client HTTP vers **`NEXT_PUBLIC_API_URL`** (défaut `http://localhost:3001`), header `Authorization: Bearer` si `NEXT_PUBLIC_API_KEY`. |
| `web/lib/api/files.ts` | Client **MCP JSON-RPC** vers `POST {baseUrl}/mcp` (initialize + tools). `clientInfo.name`: `claude-code-web`. |
| `web/lib/api/stream.ts`, `conversations.ts` | Compléments API / conversations. |

**Conclusion** : l’UI suppose un **service HTTP séparé** sur le port **3001** (ou URL configurable), avec au minimum :

- `GET /health` (utilisé par `ApiSettings` et `lib/api.ts` `fetchHealth`),
- `POST /api/chat` (streaming renvoyé tel quel au client, **format Messages API SSE** d’après `web/lib/api/types.ts`: `message_start`, `content_block_delta`, `message_stop`, etc.),
- `POST /mcp` (transport MCP streamable HTTP, session `mcp-session-id`).

Ce service **n’existe pas** dans ce dépôt. Le binaire CLI Drox actuel n’ouvre aucun port et ne consomme le LLM qu’en process. Pour brancher l’UI sur le moteur `src/`, il faut **créer ce service** (cf. §3).

### 2.3 Routes Next (`app/api/*`)

| Route | Comportement | Risque / note Drox |
|-------|----------------|---------------------|
| `POST /api/chat` | Proxy vers `{NEXT_PUBLIC_API_URL}/api/chat`, ajoute `Authorization: Bearer` si **`ANTHROPIC_API_KEY`** (serveur). | Marque + clé **Anthropic** ; à remplacer par `DROX_API_KEY` / pas de clé côté serveur si tout passe par le backend 3001. |
| `GET /api/files/read` | **Lecture disque serveur Next** via `?path=…` (`fs`, `path.resolve`). | **Sécurité** : en prod, exposition arbitraire du FS de la machine qui héberge Next — à **sandboxer**, désactiver par défaut, ou déléguer au backend 3001 uniquement. |
| `POST /api/files/write` | (à auditer de la même façon) | Idem. |
| `POST /api/export`, `POST /api/share`, `GET /api/share/[id]` | Export / partage (store côté serveur pour share). | OK pour UI locale ; définir politique données (pas de cloud tiers sans config). |

### 2.4 Marque et textes (grep ciblé)

Références encore **Anthropic / Claude / claude.ai** (non exhaustif) : `web/lib/constants.ts` (IDs modèles), `web/app/api/chat/route.ts`, `web/.env.example`, `web/components/settings/ApiSettings.tsx`, `web/public/manifest.json`, `web/app/layout.tsx`, plusieurs composants chat / export / data settings.

À traiter en parallèle du chantier backend (même grille que `docs/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md`).

### 2.5 Collaboration

- `NEXT_PUBLIC_WS_URL` dans `.env.example` (`ws://localhost:3001`).
- Code présent (`lib/collaboration/*`, hooks) — **vérifier** qu’un serveur WS compatible est bien prévu dans le futur backend ; sinon : phase « désactiver / masquer » ou mock.

---

## 3. Stratégies d’intégration (choix à trancher)

**Option A — Backend dédié « contrat 3001 » (recommandé pour itérer vite)**  
Petit service Node/Bun (nouveau dossier type `apps/web-api` ou `services/web-bridge`) qui :

1. Implémente `GET /health`, `POST /api/chat` (stream identique à ce qu’attend le front),
2. En interne appelle **Ollama** ou `DROX_API_BASE_URL` + `DROX_API_KEY` (réutiliser la logique Messages du repo si possible),
3. Optionnel : proxy MCP vers le même runtime que la CLI ou stub sécurisé.

**Option B — Tout dans Next (Route Handlers)**  
Réimplémenter chat + MCP dans `web/app/api/*` en important des modules partagés depuis `src/`.  
**Pro** : un seul déploiement. **Con** : couplage fort, risque de tirer la moitié du CLI dans le bundle serveur, maintenance lourde.

**Recommandation** : commencer par **A**, documenter le **contrat OpenAPI / README** du port 3001, puis fusionner vers B si besoin.

---

## 4. Phases de chantier (cases à cocher)

Utiliser cette section comme **backlog** ; mettre à jour les dates dans `GUIDE-REFONTE-DROX.md` quand une phase est bouclée.

### Phase 0 — Qualification build

- [ ] `cd web && npm ci` (ou `pnpm`) puis `npm run type-check` et `npm run build`.
- [ ] Corriger les écarts : **`worker-loader`** est référencé dans `next.config.ts` mais **absent** de `web/package.json` — soit ajouter la dépendance, soit migrer vers `new URL(..., import.meta.url)` + bundler Next 14 pour les workers.
- [ ] `npm run lint` sans erreurs bloquantes.

**Critère de fin** : build production vert en local.

### Phase 1 — Contrat backend minimal (chat + santé)

- [ ] Spécifier dans un fichier `web/BACKEND-CONTRACT.md` (ou section ici) : schéma JSON `POST /api/chat`, format SSE des chunks (`StreamChunk` dans `web/lib/api.ts`), codes erreur.
- [ ] Implémenter le service **3001** (option A) qui :
  - [ ] `GET /health` → 200 si le LLM configuré est joignable,
  - [ ] `POST /api/chat` → stream compatible avec le parseur existant (`data: …`, `[DONE]`).
- [ ] Remplacer **`ANTHROPIC_API_KEY`** dans `web/app/api/chat/route.ts` par variables **`DROX_*`** alignées sur le reste du monorepo (ou supprimer le header si l’auth est uniquement côté 3001).

**Critère de fin** : depuis l’UI, une conversation complète avec le modèle Ollama (ou endpoint Drox) sans mention Anthropic dans les flux.

### Phase 2 — MCP fichiers / outils web

- [ ] Décider si `POST /mcp` est **obligatoire** pour la v1 web ou si l’UI peut fonctionner en « chat only ».
- [ ] Si obligatoire : exposer sur 3001 un endpoint compatible avec `web/lib/api/files.ts` (initialize + session + tools).
- [ ] **Ne pas** laisser `GET /api/files/read` en l’état sur un déploiement public sans garde-fous (allowlist répertoire, auth, ou désactivation).

**Critère de fin** : parcours « ouvrir un fichier du workspace » documenté et sûr (ou explicitement désactivé).

### Phase 3 — Dé-branding et configuration

- [ ] Renommer package : `drox-code-web` (ou nom défini).
- [ ] Remplacer textes / manifest / exports (`Claude`, `claude.ai`, `Anthropic`, placeholders `sk-ant-…`).
- [ ] `web/lib/constants.ts` : liste modèles pilotée par **`OLLAMA_MODEL`** / liste dynamique depuis `GET /models` du backend, plus de IDs `claude-*` en dur par défaut.
- [ ] Aligner `.env.example` sur : `NEXT_PUBLIC_API_URL`, `DROX_API_KEY` (côté client si politique acceptée — **préférer** auth côté backend 3001 pour limiter l’exposition clé dans le navigateur).

**Critère de fin** : `rg -i "anthropic|claude\\.ai|claude-opus|sk-ant"` sur `web/` ne remonte plus que des commentaires techniques justifiés ou 0 résultat.

### Phase 4 — Monorepo et DX

- [ ] Racine : workspaces npm/pnpm (`"workspaces": ["web", ..."]`) ou turbo si adopté.
- [ ] Scripts racine du type `npm run web:dev` qui lance Next + le backend 3001 (concurrently).
- [ ] CI : job `web` (typecheck + lint + build) sur PR.

**Critère de fin** : un contributeur clone le repo et lance une commande documentée pour UI + API.

### Phase 5 — Collaboration et fonctionnalités secondaires

- [ ] Inventorier l’usage réel de `NEXT_PUBLIC_WS_URL` (connexion effective ou code mort).
- [ ] Soit implémenter le serveur WS, soit retirer / griser l’UI collaboration jusqu’à spec claire.

### Phase 6 — Alignement long terme avec la CLI

- [ ] Documenter si la web UI doit partager **transcripts / sessions** avec `.drox` / `CLAUDE_CONFIG_DIR` — probablement non en v1 (stockage navigateur via Zustand persist déjà en place).
- [ ] Si convergence souhaitée : définir format d’export/import commun avec `src/utils/sessionStorage` (hors scope immédiat).

---

## 5. Risques et points d’attention

| Risque | Mitigation |
|--------|------------|
| **Double source de vérité** (LLM dans CLI vs web) | Contrat API unique + idéalement réutilisation de modules `src/services/api/*` dans le binaire « bridge ». |
| **Secrets dans le navigateur** | `NEXT_PUBLIC_*` expose au client — éviter d’y mettre des clés sensibles ; préférer cookies httpOnly ou proxy Next minimal. |
| **FS arbitraire** (`/api/files/read`) | Désactiver par défaut ou sandbox. |
| **Dérive de marque** | Suivre la même checklist que `docs/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md`. |

---

## 6. Liens avec la doc existante

- **Dé-branding / réseau** : `docs/PLAN-SUPPRESSION-REFERENCES-EXTERNES.md`, `docs/GUIDE-REFONTE-DROX.md`.
- **Après chaque phase majeure** : ajouter une entrée datée dans le journal du `GUIDE-REFONTE-DROX.md` (section déjà utilisée pour la CLI).

---

## 7. Synthèse exécutive

Le dossier `web/` est une **coquille UI mature** (chat, réglages, export, MCP client, collaboration prévue) mais elle **dépend d’un backend HTTP non présent** dans ce repo, avec des **références Anthropic** et un **proxy chat** à corriger. Le chantier prioritaire est : **(0) build fiable**, **(1) service adaptateur 3001 + contrat documenté**, **(2) sécurité fichiers**, **(3) dé-branding + modèles Drox/Ollama**, puis **(4) monorepo/CI** et **(5) collaboration**.
