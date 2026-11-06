# 1.6.8 — Médias du répertoire

**Statut** : en cours. Le lot décrit ci-dessous est celui qui s'applique.
**Précédent** : 1.6.7, stable shippée (`v1.6.7`).

Les images collées dans le chat restent envoyées au modèle. Un média trouvé en parcourant le répertoire ne se lit plus : le modèle reçoit une fiche.

---

## Ce qu'on a vu

Run full protocol, fenêtre alignée sur 256k (`num_ctx` = 262 144), modèle `glm-5.3-flash` (Ollama Cloud). La demande était simple : renommer la page `/tutoriel` en « What is Drox ? », afficher le `README.md` du dossier media, et corriger les chemins des `.gif` et `.png` qui sont à côté.

Après un quart d'heure le modèle tournait encore et disait perdre son contexte. La jauge du composer, sur le même run, montrait deux chiffres :

| Affichage | Chiffre | Source |
|---|---|---|
| `ctx 1M / 256k (427%) estim.` | environ 1 119 000 jetons | `RoughTokenCounter`, avant l'appel |
| `ctx 18k / 256k (7%) provider` | environ 18 000 jetons | `prompt_eval_count` Ollama, chunk `done` |

Le libellé `1M` est un seau : tout compte supérieur ou égal à 1 000 000 s'écrit `1M`. Le pourcentage est le chiffre exact. 427 % de 262 144, c'est environ 4,5 Mo de données comptées (`octets / 4`). C'est la taille du base64 d'une image d'environ 3,2 Mio.

Le plafond 256k, lui, part bien au provider. Le modèle n'a pas reçu un prompt d'un million de jetons de texte.

## Pourquoi le run se bloque

Deux chemins portent une image. Ils ne pèsent pas pareil.

**Image collée dans le chat.** Une copie est écrite dans `.drox/attachments/`. Le texte du message gagne une liste courte :

```text
[Attached images]
- ./.drox/attachments/…png
```

Les mêmes octets partent aussi en bloc vision (`Content::Image`, base64), collés au message utilisateur. Ollama les met dans un tableau `images`, à part du texte. `prompt_eval_count` ne les compte pas : d'où les 18k. Ce chemin reste voulu. Une capture d'écran de quelques centaines de Ko reste sous le seuil d'autocompact (environ 229k pour une fenêtre de 256k). Le modèle travaille avec le chemin, ou avec les pixels déjà joints.

**Média trouvé dans le répertoire.** `file_read` lit jusqu'à 512 Ko et décode en texte, y compris un GIF ou une vidéo. Le compteur traite ces octets comme des jetons. Au-dessus d'environ 229k, `maybe_snip` croit la fenêtre pleine à chaque tour : il coupe les résultats d'outils, puis résume l'historique. Le média, s'il est dans le premier message ou relu, reste. Le compte ne redescend pas. Le modèle relit le README, le perd au tour suivant, et le dit.

Le même compteur est dans `drox-context` (`RoughTokenCounter`). Une image jointe tombe dans le cas par défaut de `content_to_canonical_string` : tout le base64 est sérialisé, puis divisé par 4. `IMAGE_TOKEN_SIZE` (2 000) existe et n'est pas utilisé. Ce n'est pas le patch de cette passe : les images du chat doivent continuer à partir.

## Ce qu'il faut patcher

Quand l'outil tombe sur un média en parcourant le disque, il ne renvoie pas le corps. Il renvoie une fiche : nom, chemin, poids, et le type (extension ou mime). Le modèle s'en sert par le chemin, comme pour une image déjà enregistrée dans `.drox/attachments/`.

Médias concernés : images (png, jpg, jpeg, gif, webp, bmp, ico), audio, vidéo. Le SVG et les sources texte restent lisibles : ce sont des fichiers qu'on édite.

Outils :

- `file_read` — aujourd'hui il renvoie le contenu, tronqué à 512 Ko. C'est le trou principal. Un média répond une fiche, pas des octets.
- `grep` — il lit jusqu'à 512 Ko et passe par `from_utf8_lossy`. Il saute ces fichiers au lieu de chercher dedans.

`glob` continue de lister les noms. Rien ne change pour une image collée dans le chat : persistance `.drox/attachments/`, ligne `[Attached images]`, bloc vision envoyé au provider. Le compteur qui divise ce base64 par 4 reste en place.

`bash` : une sortie texte, même longue, garde la troncature actuelle (30 Ko, puis mise de côté au-delà de 24 Ko). Une sortie qui n'est pas du texte est remplacée par une fiche : commande terminée, sortie binaire, poids, et nom, chemin, poids et type si la commande visait un média.
