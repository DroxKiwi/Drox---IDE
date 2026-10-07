# Vérification comportementale (étape 4)

Checklist manuelle / dogfood — pas un test unitaire. Cocher après un changement de dose ou de mécanique d’injection.

## Scénarios

| Id | Prompt user (idée) | Attendu injection | Attendu modèle |
|----|--------------------|-------------------|----------------|
| V1 | « salut » / « merci » | Classif `isWork≈false` ; pas de WORK PLAN FRAME | answering → done, sans todo |
| V2 | Work multi-fichier + Explore on | CORE pointeur + **un** supplement Explore + WORK PLAN **court** | Plan puis `task` au kickoff ; pas de dump parent |
| V3 | Ingest / rewrite docs tree | + DOC INGESTION **delta** (pas un 2e playbook) | 2–4 explores ; parent 1–2 pages |
| V4 | Analyse repo | + éventuellement analyzing delta si explore sans marqueur | `[phase: analyzing]` |
| V5 | Tour `[phase: acting]` sans tool | Nudge intent-write (acting sans tools) | tool_call ou answering+done ; abort après 2 nudges |
| V6 | Explore enfant | Pas d’ask boot sur le brief tâche | report / summary parent |

## Comment vérifier

1. Lancer un run réel (IDE ou CLI) avec Explore on pour V2/V3.
2. Dans le transcript / logs : compter les blocs system turn-0 qui mentionnent « Plan → Assign » en **protocole détaillé** — cible **≤ 1** (le supplement).
3. Pour V5 : forcer un tour acting sans tools (ScriptedLlm ou modèle complaisant) → texte nudge + pas d’abort au 1er strike.

## Hors scope

- Claims lint (`cargo test -p drox-prompts`) — déjà automatisé.
- Contenu des docs historiques `docs/1.6/*` — ne pas les réécrire ; le journal `drox-prompts` fait foi.
