//! Construction d'une commande à partir du catalogue.

use crate::catalog::{Catalog, Part};

/// Une ligne de commande.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub part: Part,
    pub quantity: i64,
}

/// Une commande : liste de lignes.
#[derive(Debug, Clone, PartialEq)]
pub struct Order {
    pub lines: Vec<Line>,
}

/// Construit une commande depuis des paires (code, quantité).
pub fn build_order(catalog: &Catalog, pairs: &[(String, i64)]) -> Result<Order, String> {
    if pairs.is_empty() {
        return Err("commande vide".to_string());
    }
    let mut lines = Vec::new();
    for (code, quantity) in pairs {
        if *quantity <= 0 {
            return Err(format!("quantité invalide pour {code}"));
        }
        let part = catalog.get(code)?.clone();
        lines.push(Line {
            part,
            quantity: *quantity,
        });
    }
    Ok(Order { lines })
}
