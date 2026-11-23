"""Texte du devis. Pas de calcul ici."""

from __future__ import annotations

from atelier.orders import Order
from atelier.pricing import Quote


def format_receipt(order: Order, quote: Quote) -> str:
    rows = [
        f"{line.quantity} x {line.part.code} {line.part.name}"
        for line in order.lines
    ]
    rows.append(f"HT {quote.subtotal:.2f}")
    rows.append(f"TVA {quote.vat:.2f}")
    rows.append(f"TTC {quote.total:.2f}")
    return "\n".join(rows)
