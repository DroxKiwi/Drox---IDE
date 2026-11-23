//! Prix hors taxe, TVA fixe, total.

use crate::orders::Order;

pub const VAT_RATE: f64 = 0.20;

/// Devis : sous-total, TVA, total TTC.
#[derive(Debug, Clone, PartialEq)]
pub struct Quote {
    pub subtotal: f64,
    pub vat: f64,
    pub total: f64,
}

/// Calcule le prix d'une commande.
pub fn price_order(order: &Order) -> Quote {
    let subtotal: f64 = order
        .lines
        .iter()
        .map(|line| line.part.unit_price * line.quantity as f64)
        .sum();
    let vat = subtotal * VAT_RATE;
    Quote {
        subtotal,
        vat,
        total: subtotal + vat,
    }
}
