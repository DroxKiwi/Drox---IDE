# AMB-16 — Triple confirmation (permission ask / ask_user / confirmFileWrites)

| | |
|--|--|
| **ID** | AMB-16 |
| **Sévérité** | P0 |
| **Surface** | IDE |
| **Statut** | **fait** (plus de double confirm mode Ask/Trust) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

`imNotCrazy` : permission Ask moteur **puis** évent. `confirmFileWrites` (diff + Apply) = double dialog.

## Décision produit

| Mode | Permission | `confirmFileWrites` |
|------|------------|---------------------|
| `trustEdit` | auto-allow | skip (déjà) |
| `imNotCrazy` | Ask | **skip** (Ask = seule confirm) |
| `analyze` | writes interdits | N/A |

`ask_user_question` reste orthogonal (choix modèle).

---

## Modifications

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `common/droxPermissionAsk.ts` | `shouldSkipStackedFileWriteConfirm` | trustEdit **ou** imNotCrazy |
| `electron-browser/tools/droxFileToolHost.ts` | `shouldConfirmFileWrites` | utilise le helper |
| `common/droxConfiguration.ts` | desc `drox.confirmFileWrites` | documente l’ignore Trust / Not Crazy |
| `test/.../droxCommon.test.ts` | unit | assert skip modes |

### Tests

- [x] `shouldSkipStackedFileWriteConfirm`
- [ ] Smoke : imNotCrazy + setting confirmFileWrites on → **une** seule confirm (Allow/Deny)

### Hors scope

- Refonte complète ask_user_question

---

## Acceptation

- [x] Pas de double confirm IDE+moteur en imNotCrazy / Trust
- [x] Aligné AMB-08 sur cancel (si confirmFileWrites encore actif hors modes skip)

## Notes

- Setting `confirmFileWrites` devient inert pour les 3 modes exposés (défaut était déjà `false`).
