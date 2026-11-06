# 1.6.9 — carte sans plafond, racine choisie

**Statut** : en cours. Le lot décrit ci-dessous est celui qui s’applique.

## Constat

L’arbre SDTCM s’arrêtait à 120 fichiers source et à 12 niveaux de dossiers (`listDroxSdtcmSources`). La liste envoyée au modèle était coupée au même nombre. Un dépôt plus grand perdait le reste, dans l’ordre du disque.

Les fichiers qui ne sont pas du code (ignore `.drox/.SDTCMignore`, extensions hors sources) doivent continuer d’être écartés.

## Patch

1. Plus de plafond de quantité ni de profondeur. Le parcours lit tout le dossier retenu. Les ignores et le filtre d’extensions restent.
2. Avant la génération, le panneau SDTCM propose **Map root**. La liste montre les dossiers, avec le nombre de fichiers source en dessous, et une recherche par nom. Plusieurs dossiers peuvent être retenus. Un clic droit sur un dossier propose **Map this folder**. **whole folder** prend tout le dossier ouvert. Les dossiers choisis laissent la carte entière visible et assombrissent le reste. Le choix est dans `.drox/sdtcm/root.txt`, un chemin par ligne. **Launch a run** et **Realign** ne lisent que ces dossiers. Une brique hors de cette zone reste. Un fichier de la zone qui n’existe plus est traité comme absent au réalignement.

`droxVersion` est `1.6.9`. La base VS Code reste `1.127.0`.

## Affichage

Le monde de la carte est complet. Une image n’en dessine qu’une partie : les nœuds assez grands à l’écran, dans la fenêtre, au plus 480. La mise en page d’un dossier se fait en un seul passage. L’index des fichiers avance par paquets, pour que la fenêtre reste réactive pendant la lecture du dépôt. Dézoomer montre la silhouette. Zoomer fait entrer les fichiers.
