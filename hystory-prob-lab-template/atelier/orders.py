"""Construction d'une commande à partir du catalogue."""

from __future__ import annotations

from dataclasses import dataclass

from atelier.catalog import Catalog, Part


@dataclass(frozen=True)
class Line:
    part: Part
    quantity: int


@dataclass(frozen=True)
class Order:
    lines: list[Line]


def build_order(catalog: Catalog, pairs: list[tuple[str, int]]) -> Order:
    if not pairs:
        raise ValueError("commande vide")
    lines: list[Line] = []
    for code, quantity in pairs:
        if quantity <= 0:
            raise ValueError(f"quantité invalide pour {code}")
        lines.append(Line(part=catalog.get(code), quantity=quantity))
    return Order(lines=lines)
