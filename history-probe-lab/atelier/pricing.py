"""Prix hors taxe, TVA fixe, total."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from atelier.orders import Order

VAT_RATE = Decimal("0.20")
CENT = Decimal("0.01")


@dataclass(frozen=True)
class Quote:
    subtotal: Decimal
    vat: Decimal
    total: Decimal


def price_order(order: Order) -> Quote:
    subtotal = sum(
        (line.part.unit_price * line.quantity for line in order.lines),
        Decimal("0"),
    )
    vat = subtotal * VAT_RATE
    return Quote(
        subtotal=subtotal.quantize(CENT, rounding=ROUND_HALF_UP),
        vat=vat.quantize(CENT, rounding=ROUND_HALF_UP),
        total=(subtotal + vat).quantize(CENT, rounding=ROUND_HALF_UP),
    )
