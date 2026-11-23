//! Formatage du texte du devis. Pas de calcul ici.

use crate::orders::Order;
use crate::pricing::Quote;

/// Formate un reçu (devis) au format texte.
pub fn format_receipt(order: &Order, quote: &Quote) -> String {
    let mut rows: Vec<String> = order
        .lines
        .iter()
        .map(|line| format!("{} x {} {}", line.quantity, line.part.code, line.part.name))
        .collect();
    rows.push(format!("HT {:.2}", quote.subtotal));
    rows.push(format!("TVA {:.2}", quote.vat));
    rows.push(format!("TTC {:.2}", quote.total));
    rows.join("\n")
}
