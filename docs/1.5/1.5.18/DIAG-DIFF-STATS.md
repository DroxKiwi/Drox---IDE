# DIAG — Écart badges diff chat vs éditeur

> **Statut** : archive (cosmétique, pas de correctif 1.5.18).

**Symptôme** : carte chat `edited layout.tsx` affiche **`+97 −95`** (ou `+82 −80`) ; à l’ouverture du diff éditeur, ~**5 lignes vertes** et **1 rouge**.  
**Question** : le modèle réécrit-il tout le fichier ? Les chiffres sont-ils faux ?

---

## Verdict

| Question | Réponse |
|----------|---------|
| Le modèle réécrit-il toujours tout le fichier ? | **Pas forcément.** `file_edit` = patch ; `file_write` = overwrite total. Gros +/− ≠ réécriture sémantique. |
| Les badges sont-ils « faux » ? | **Honnêtes mais trompeurs** : ils comptent un diff naïf, pas le diff minimal Myers/LCS de l’éditeur. |

Signature typique : **+97/−95** (net ≈ +2) → insertion/décalage de quelques lignes, pas 97 lignes de contenu nouveau.

---

## Deux algorithmes, deux vérités

```text
before / after (texte disque)
        │
        ├─► droxUnifiedDiff (zip indexé i↔i)  → countDiffLines → badge +N −M
        │
        └─► DiffEditor VS Code (Myers / LCS)   → gutter ~5 verts / 1 rouge
```

### Chat — `droxUnifiedDiff.ts`

Comparaison **ligne i avec ligne i** :

```ts
for (let i = 0; i < max; i++) {
  if (bl !== al) {
    if (bl !== undefined) lines.push(`-${bl}`);
    if (al !== undefined) lines.push(`+${al}`);
  }
}
```

Une insertion en haut **décale** tout le reste → presque chaque ligne est `−` puis `+`.  
`countDiffLines` (`droxFileChange.ts`) compte ces lignes : badge gonflé.

Même pipeline pour `file_write` et `file_edit` (stats = before/after texte, pas la taille du hunk outil).

### Éditeur — DiffEditor session

Ouverture via snapshot `.drox/diff-snapshots/*.before` vs fichier courant  
→ `DefaultLinesDiffComputer` (LCS) → compte **minimal** de hunks → gutter réaliste.

---

## Write vs edit

| Outil | Disque | Stats chat |
|-------|--------|------------|
| `file_write` | Remplace tout le contenu | `unifiedDiff(before, after)` |
| `file_edit` | Remplace `old_string` → `new_string` | Idem sur before/after fichier |

Donc un **petit** `file_edit` peut afficher +97/−95 si le patch décale le fichier.

Note : le moteur Rust / TUI utilise `similar::TextDiff` (vrai diff) ; le **workbench IDE** a une version simplifiée — commentaire « lib similar » côté IDE est trompeur.

---

## Lien avec 1.5.17

Pas introduit par les adaptateurs LLM. Dette UX **préexistante** du chemin workbench `droxUnifiedDiff`.

---

## Correctifs candidats

1. Remplacer `unifiedDiff` IDE par un LCS (réutiliser logique proche de `similar` / VS Code lines diff).
2. Afficher sur la carte le même compteur que le DiffEditor (ou un « ~N lignes touchées »).
3. Garder le diff naïf uniquement pour un aperçu debug, pas pour le badge utilisateur.
