"""Chargement du catalogue JSON."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path


@dataclass(frozen=True)
class Part:
    code: str
    name: str
    unit_price: Decimal


class Catalog:
    def __init__(self, parts: list[Part]) -> None:
        self._by_code = {part.code: part for part in parts}

    def get(self, code: str) -> Part:
        try:
            return self._by_code[code]
        except KeyError as error:
            raise KeyError(f"pièce inconnue : {code}") from error

    def codes(self) -> list[str]:
        return sorted(self._by_code)


def load_catalog(path: Path) -> Catalog:
    raw = json.loads(path.read_text(encoding="utf-8"))
    parts = [
        Part(code=item["code"], name=item["name"], unit_price=Decimal(str(item["unit_price"])))
        for item in raw
    ]
    return Catalog(parts)
