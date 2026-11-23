//! Point d'entrée : atelier devis CODE QTE [CODE QTE ...]
//!
//! Reproduit le comportement de `main.py`.

mod catalog;
mod json;
mod orders;
mod pricing;
mod receipts;

use std::path::PathBuf;
use std::process::ExitCode;

use catalog::load_catalog;
use orders::build_order;
use pricing::price_order;
use receipts::format_receipt;

const CATALOG_PATH: &str = "data/pieces.json";

/// Parse les paires (code, quantité) depuis les arguments.
fn parse_pairs(args: &[String]) -> Result<Vec<(String, i64)>, String> {
    if args.len() % 2 != 0 {
        return Err("arguments attendus : CODE QTE [CODE QTE ...]".to_string());
    }
    let mut pairs = Vec::new();
    let mut iter = args.iter();
    while let (Some(code), Some(qte)) = (iter.next(), iter.next()) {
        let quantity: i64 = qte
            .parse()
            .map_err(|_| format!("quantité invalide : {qte}"))?;
        pairs.push((code.clone(), quantity));
    }
    Ok(pairs)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || args[0] != "devis" {
        eprintln!("usage : atelier devis CODE QTE [CODE QTE ...]");
        return ExitCode::from(2);
    }
    let pairs = match parse_pairs(&args[1..]) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    let catalog_path = PathBuf::from(CATALOG_PATH);
    let catalog = match load_catalog(&catalog_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("erreur : {e}");
            return ExitCode::from(1);
        }
    };
    let order = match build_order(&catalog, &pairs) {
        Ok(o) => o,
        Err(e) => {
            eprintln!("erreur : {e}");
            return ExitCode::from(1);
        }
    };
    let quote = price_order(&order);
    println!("{}", format_receipt(&order, &quote));
    ExitCode::SUCCESS
}
