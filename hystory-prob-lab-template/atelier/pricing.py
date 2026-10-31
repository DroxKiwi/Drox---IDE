"""Prix hors taxe, TVA fixe, total."""

from __future__ import annotations

from dataclasses import dataclass

from atelier.orders import Order

VAT_RATE = 0.20


@dataclass(frozen=True)
class Quote:
    subtotal: float
    vat: float
    total: float


def price_order(order: Order) -> Quote:
    subtotal = sum(line.part.unit_price * line.quantity for line in order.lines)
    vat = subtotal * VAT_RATE
    return Quote(subtotal=subtotal, vat=vat, total=subtotal + vat)
