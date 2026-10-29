"""Point d'entrée : python main.py devis CODE QTE [CODE QTE ...]"""

from __future__ import annotations

import sys
from pathlib import Path

from atelier.catalog import load_catalog
from atelier.orders import build_order
from atelier.pricing import price_order
from atelier.receipts import format_receipt

ROOT = Path(__file__).resolve().parent
CATALOG_PATH = ROOT / "data" / "pieces.json"


def parse_pairs(args: list[str]) -> list[tuple[str, int]]:
    if len(args) % 2 != 0:
        raise SystemExit("arguments attendus : CODE QTE [CODE QTE ...]")
    pairs: list[tuple[str, int]] = []
    for index in range(0, len(args), 2):
        pairs.append((args[index], int(args[index + 1])))
    return pairs


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[0] != "devis":
        print("usage : python main.py devis CODE QTE [CODE QTE ...]")
        return 2
    catalog = load_catalog(CATALOG_PATH)
    order = build_order(catalog, parse_pairs(argv[1:]))
    quote = price_order(order)
    print(format_receipt(order, quote))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
