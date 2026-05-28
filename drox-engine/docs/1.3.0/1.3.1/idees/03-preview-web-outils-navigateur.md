# Idée 03 — Preview web intégrée & outils navigateur pour le modèle

**Statut** : idée brute  
**Date** : 2026-05-28  
**Périmètre initial** : applications **web** (Next, Vite, etc.) — extensible plus tard

---

## Résumé

Donner au modèle un **outil de visualisation en direct** du projet web : un **onglet dans l’IDE** affichant l’app (ex. `http://localhost:3000`), avec accès à la **structure DOM**, aux **devtools** (console, réseau, éléments), pour qu’il puisse **naviguer**, **inspecter** et **valider** le rendu pendant le dev.

Complément naturel du terminal qui lance `npm run dev` (cf. dogfooding site vitrine).

---

## Problème actuel

| Aujourd’hui | Limite |
|-------------|--------|
| `file_read` / edits | Pas de **rendu** ni de feedback visuel |
| Terminal | Logs serveur, pas DOM ni layout |
| Navigateur externe | Hors boucle agent ; pas d’outils structurés |

Le modèle infère le CSS/JS sans « voir » la page — erreurs UI découvertes tard.

---

## Vision produit

```text
┌─ Éditeur ─────────────────┐  ┌─ Preview web (onglet IDE) ────────┐
│  page.tsx                 │  │  http://localhost:3000            │
│                           │  │  [ snapshot / DOM tree / console ] │
└───────────────────────────┘  └────────────────────────────────────┘
         ▲                                    ▲
         │         tools: browser_*           │
         └──────────── moteur Drox ───────────┘
```

### Capacités cibles (par phases)

| Phase | Capacité |
|-------|----------|
| P0 | Onglet **Simple Browser** amélioré — URL fixe, reload manuel |
| P1 | Outils `browser_navigate`, `browser_snapshot` (accessibility tree ou HTML simplifié) |
| P2 | Extraction **console** / erreurs réseau vers le modèle |
| P3 | **DevTools** ciblés (sélecteur CSS → node, computed styles) — garde-fous sécurité |
| P4 | Screenshots + comparaison visuelle (optionnel) |

---

## Pistes techniques

### IDE (Drox IDE)

- Réutiliser / étendre **Simple Browser** ou webview dédiée `contrib/drox/browser/previewWeb`.  
- CDP (Chrome DevTools Protocol) si Electron l’expose — aligné skill `launch` (ports debug).  
- Lier au terminal : détecter port depuis sortie `npm run dev` (regex `localhost:3000`).

### Moteur

- Nouveaux tools simples : `browser_open`, `browser_click`, `browser_eval` (sandbox).  
- Permissions : mode **Analyze** = snapshot seul ; **Trust** = navigation limitée au localhost.  
- Quotas : taille max DOM / screenshot, timeout.

### Sécurité

- Allowlist origines (`localhost`, `127.0.0.1`, ports déclarés).  
- Pas de cookies/session prod par défaut.  
- Confirmation utilisateur pour navigation hors workspace web.

---

## Liens existants

- Extension référence / MCP browser (Cursor) — étudier contrat, ne pas dupliquer aveuglément.  
- Skill `.agents/skills/launch` — CDP, ports.  
- Dogfooding : terminal Next.js sur `site-kdds` (capture utilisateur).

---

## Questions ouvertes

| ID | Question |
|----|----------|
| Q1 | Webview **intégrée** vs contrôle **Chrome externe** via CDP ? |
| Q2 | Un onglet preview **par workspace** ou par **run** agent ? |
| Q3 | Format d’échange : HTML brut, **accessibility snapshot** (comme MCP browser), les deux ? |
| Q4 | Apps non-web (Rust, mobile) : hors scope ou preview générique plus tard ? |
| Q5 | Qui lance le serveur dev — utilisateur seul ou tool `dev_server_start` ? |

---

## Critères de succès (si promu)

- Sur un projet Next standard, le modèle détecte une erreur console après navigation et propose un correctif ciblé.  
- Latence snapshot &lt; 3 s sur page locale typique.  
- Aucune navigation arbitraire vers Internet sans opt-in.
