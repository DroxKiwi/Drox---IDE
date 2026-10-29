# Architecture

`main.py` lit les arguments, charge le catalogue, construit une commande, calcule le total, puis imprime un reçu.

Dépendances internes :

- `atelier.catalog` charge `data/pieces.json` et retrouve une pièce par code.
- `atelier.orders` transforme les paires code/quantité en lignes. Il refuse une quantité nulle ou un code inconnu.
- `atelier.pricing` applique le prix unitaire et la TVA fixe de 20 %. Il n'y a pas de remise. Les montants sont des `Decimal` quantizés à 2 décimales (arrondi `ROUND_HALF_UP`) ; les prix unitaires sont convertis en `Decimal` dès le chargement du catalogue.
- `atelier.receipts` met en forme le texte affiché. Il ne calcule rien.

Le flux est à sens unique : catalogue, puis commande, puis prix, puis reçu. Aucun module ne rappelle `main`.
