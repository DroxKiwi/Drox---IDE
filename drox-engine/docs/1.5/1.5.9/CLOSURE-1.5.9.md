# Clôture 1.5.9 — UX chat : scroll, reset, composer

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.9**  
**Statut** : **livré**

---

## Périmètre livré (code)

| # | Livrable | Statut |
|---|----------|--------|
| P1 | Scroll **stick-to-bottom** pendant un run | ✅ |
| P2 | Reset workspace : `.drox/` + **`MEMORY.md`** racine | ✅ |
| P3 | Composer épuré (4 icônes redondantes retirées) | ✅ |
| P4 | Splash / release notes **1.5.9** | ✅ |

---

## Technique

- `stream/messages/scroll.js` : `scrollLog()` / `pinLogToBottom()` / `syncLogStickToBottom()`.
- `droxWorkspaceResetFs.ts` : `memoryMdRemoved` ; conserve `.drox/.env`.
- `droxChatWebview.ts` : `#actions` sans boutons settings / refs / attach / reload.

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Merge `1.5.9` → `main` | ✅ |
| R2 | `npm run drox:ship` Windows | ✅ |
| R3 | Release `v1.5.9` + `stable/latest.json` | ✅ |
| R4 | Linux `.deb` **1.5.9** | reporté (`.deb` reste **1.5.8** dans `latest.json`) |

---

## Liens

- [PLAN-1.5.9.md](PLAN-1.5.9.md)
- [CLOSURE 1.5.8](../1.5.8/CLOSURE-1.5.8.md)
- [Hub 1.5](../README.md)
