# Idée 14 — Persona & onboarding identité (première activation Drox)

**Statut** : idée brute (brainstorm)  
**Date** : 2026-06-07  
**Auteur** : produit / marque KDDS

---

## Résumé

Lors de la **première activation** de Drox sur un workspace (ou au premier lancement IDE), lancer un **mini-run onboarding** : le modèle se **présente**, demande de **confirmer l’identité** de l’utilisateur (prénom, rôle, langue) et le **style de discussion** (concis / détaillé, tutoiement, niveau technique).

La persona choisie est **persistée** (`.drox/` ou profil utilisateur) et **réinjectée** dans les prompts système des runs suivants — sans recompiler le moteur.

Complète [13-agents-window-kdds-drox.md](13-agents-window-kdds-drox.md) (shell UX) et la phase fiabilité 1.3.2 (premier « Salut » doit être accueillant, pas mécanique).

---

## Problème actuel

| Constat | Limite |
|---------|--------|
| Premier message = run agent classique | Pas de cadre relationnel ; le modèle peut partir en règles internes / outils |
| `drox.primaryLanguage` existe | Langue seulement — pas de ton, pas d’identité |
| Prompts `01_core` génériques | Même voix pour tous les utilisateurs |
| Onboarding VS Code / Copilot | Auth GitHub Agents — **hors** identité Drox locale |

---

## Vision produit

### Déclenchement

- **Premier** `agent.run` sur un workspace sans fichier `.drox/persona.json` (ou flag `onboarding_completed`).
- Ou commande palette **« Drox : Configurer l’assistant »** (re-run volontaire).

### Déroulé (discussion, pas edit)

```text
┌─ Drox — Bienvenue ─────────────────────────────────────────┐
│ Thinking (replié)                                           │
│                                                             │
│ Salut ! Je suis l’assistant Drox pour ce projet.           │
│ Comment dois-je t’appeler ? Et tu préfères un style plutôt  │
│ direct ou détaillé ?                                        │
│                                                             │
│ [Champs rapides optionnels UI : Prénom · Style · Langue]   │
└─────────────────────────────────────────────────────────────┘
```

1. Run **`architect_discussion`** dédié (prompt onboarding injecté).
2. Pas d’outils workspace sauf `memory_list` / `session_note` si besoin.
3. Le modèle propose un **récap** → l’utilisateur confirme (« oui » / ajuste).
4. Persistance → `persona` + `onboarding_completed: true`.

### Données persistées (schéma indicatif)

```json
{
  "version": 1,
  "display_name": "Corentin",
  "addressing": "tu",
  "tone": "concise",
  "technical_level": "expert",
  "primary_language": "fr",
  "assistant_name": "Drox",
  "confirmed_at": "2026-06-07T12:00:00Z"
}
```

### Réinjection moteur

- Préfixe system ou bloc `literal_user_message` : « User prefers … »
- Ou variable `{{persona.*}}` dans `assemble_system_prompt` / snapshot cycle
- **Ne pas** dupliquer tout `01_core` — un fichier `persona.md` ou fragment prompt suffit

---

## Pistes techniques

| Couche | Piste |
|--------|--------|
| **IDE** | Détecter absence persona au `webviewReady` ; bannière « Configurer Drox » ; formulaire structuré en plus du chat |
| **RPC** | Champ optionnel `persona` dans `agent.run` ou lecture auto depuis `.drox/persona.json` côté CLI |
| **Moteur** | Prompt `onboarding_discuss.md` ; gate soft : pas de `delegate_executor` pendant onboarding |
| **Marque KDDS** | Texte de présentation par défaut aligné Drox / KDDS — pas Copilot |
| **Strictness** | Onboarding toujours en preset **relaxed** (éviter boucles sur premier contact) |

---

## Hors scope MVP

- Avatar / voix / multi-personas par projet
- Sync cloud compte KDDS
- Persona par rôle (Architect vs Executor différents)
- Génération persona par LLM sans validation utilisateur

---

## Questions ouvertes

1. Onboarding **obligatoire** ou skippable (« Configurer plus tard ») ?
2. Persona **par workspace** ou **global utilisateur** ?
3. Re-onboarding si l’utilisateur change de modèle LLM ?
4. Fichier `.drox/persona.json` versionné git — risque vie privée ?
5. Intégration future **Agents Window** ([fiche 13](13-agents-window-kdds-drox.md)) : même persona ?

---

## Critères de promotion

- [ ] Prototype : 1 run onboarding → fichier persona → 2ᵉ run utilise le prénom
- [ ] Pas d’outils exploration sur « première activation »
- [ ] Textes FR/EN selon `primary_language`
- [ ] Dogfood : 3 profils (concis / détaillé / expert) — runs suivants cohérents

---

## Liens

- [07 — Réponses légères sans plan](07-reponses-legere-sans-plan.md)
- [VALIDATION-PRESETS-ENGINE-1.3.2.md](../1.3/1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md)
- [UI Phase 1 chat natif](../0.0/ide/UI-PHASE1-CHAT-NATIF.md)
