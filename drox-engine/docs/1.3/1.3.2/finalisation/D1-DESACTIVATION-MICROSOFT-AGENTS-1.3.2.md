# D1 — Désactivation surface Microsoft / Agents VS Code (1.3.2)

**Statut** : ✅ appliqué — **utilisateur final sans accès** ; pas de branding KDDS sur Agents (produit séparé plus tard).

**Réactiver** : voir §4 (dev / dogfood uniquement pour l’instant).

---

## Ce qui est masqué (utilisateur final)

| Surface | Mécanisme |
|---------|-----------|
| **Agents Window** / « Open in Agents » | `chat.agent.enabled` défaut **false** + fermeture vue `workbench.panel.chat` |
| **Barre agents / command center Copilot** | `chat.agentsControl.enabled` → **hidden** |
| **Sessions chat VS Code** | `chat.viewSessions.enabled` → **false** |
| **Welcome / onboarding Microsoft** | `workbench.startupEditor` → **none** |
| **Liens aka.ms** dans `product.json` | Remplacés par NOTICE Drox (stub) |
| **Auto-update Copilot Chat** | `builtInExtensionsEnabledWithAutoUpdates` vidé |

**Inchangé (produit Drox)** : panneau **Drox Chat**, moteur `drox.exe`, executors `delegate_executor`.

---

## Interrupteur produit (source de vérité)

Dans `product.json` :

```json
"droxMicrosoftAgentsSurfaceEnabled": false
```

| Valeur | Comportement |
|--------|----------------|
| **`false`** (release 1.3.2) | Contribution `DroxMicrosoftAgentsSurfaceContribution` masque chat VS Code + défauts stricts |
| **`true`** | Surfaces Microsoft **autorisées** (défauts config + pas de fermeture forcée du panel chat) — **pas de branding Drox** sur ces flux |

Fichier code : `src/vs/workbench/contrib/drox/common/droxMicrosoftAgentsSurface.ts`

---

## Fichiers modifiés (D1)

| Fichier | Rôle |
|---------|------|
| `product.json` | Flag `droxMicrosoftAgentsSurfaceEnabled`, URLs neutralisées, pas d’auto-update Copilot |
| `src/vs/base/common/product.ts` | Type `droxMicrosoftAgentsSurfaceEnabled?` |
| `droxProductDefaultsConfiguration.ts` | Défauts config chat/agents |
| `droxMicrosoftAgentsSurfaceContribution.ts` | Masquage runtime si flag `false` |
| `assets/product-defaultChatAgent.microsoft-backup.json` | Sauvegarde bloc Copilot upstream |

---

## §4 — Réactiver (checklist dev)

1. **`product.json`**
   - `"droxMicrosoftAgentsSurfaceEnabled": true`
   - Restaurer `defaultChatAgent` + `builtInExtensionsEnabledWithAutoUpdates` depuis  
     [assets/product-defaultChatAgent.microsoft-backup.json](assets/product-defaultChatAgent.microsoft-backup.json)  
     (fusionner avec le bloc actuel — garder `openAiCompatibleProviderBaseUrl` local si besoin).

2. **Rebuild** IDE (`npm run compile` ou watch) + Reload Window.

3. **Settings utilisateur** (optionnel si profil déjà pollué) :
   - `chat.agent.enabled` → `true`
   - `chat.viewSessions.enabled` → `true`
   - `workbench.startupEditor` → `welcomePage` ou `gettingStarted`

4. **Vérifier** : F1 « Open Agents Window », titlebar « Open in Agents », welcome Copilot.

5. **Branding** : tant que KDDS n’a pas de charte Agents — ne pas exposer aux utilisateurs finaux même si réactivé en dev.

---

## Tests manuels D1

| # | Action | Attendu |
|---|--------|---------|
| D1-T1 | Install / Reload profil neuf | Pas de bouton Open in Agents |
| D1-T2 | F1 « Agents » / « Copilot » | Absent ou commande inactive |
| D1-T3 | Drox Chat | Fonctionne |
| D1-T4 | `rg aka\.ms product.json` | Aucune URL aka.ms active |

---

## Liens

- [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md)
- [ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md](ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md)
- [PLAN-DESACTIVATION-AGENTS-VSCODE-1.3.2.md](PLAN-DESACTIVATION-AGENTS-VSCODE-1.3.2.md)
