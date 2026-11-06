# 1.6.9 — carte sans plafond, racine choisie

**Statut** : en cours. Le lot décrit ci-dessous est celui qui s’applique.

## Constat

L’arbre SDTCM s’arrêtait à 120 fichiers source et à 12 niveaux de dossiers (`listDroxSdtcmSources`). La liste envoyée au modèle était coupée au même nombre. Un dépôt plus grand perdait le reste, dans l’ordre du disque.

Les fichiers qui ne sont pas du code (ignore `.drox/.SDTCMignore`, extensions hors sources) doivent continuer d’être écartés.

## Patch

1. Plus de plafond de quantité ni de profondeur. Le parcours lit tout le dossier retenu. Les ignores et le filtre d’extensions restent.
2. Avant la génération, le panneau SDTCM propose **Map root**. Vide : tout le dossier ouvert. Un chemin relatif plus profond ne prend que cette zone. Le choix est dans `.drox/sdtcm/root.txt`. **Launch a run** et **Realign** lisent cette racine. Un fichier qui n’y est plus est traité comme absent au réalignement.

La release n’est pas faite dans ce lot. `droxVersion` reste `1.6.8` tant que la branche n’est pas shippée.
