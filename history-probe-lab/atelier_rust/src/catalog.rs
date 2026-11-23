//! Chargement du catalogue JSON.

use std::collections::BTreeMap;
use std::path::Path;

use crate::json::{self, Value};

/// Une pièce du catalogue.
#[derive(Debug, Clone, PartialEq)]
pub struct Part {
    pub code: String,
    pub name: String,
    pub unit_price: f64,
}

/// Catalogue de pièces indexé par code.
#[derive(Debug, Clone)]
pub struct Catalog {
    by_code: BTreeMap<String, Part>,
}

impl Catalog {
    pub fn new(parts: Vec<Part>) -> Self {
        let by_code = parts.into_iter().map(|p| (p.code.clone(), p)).collect();
        Catalog { by_code }
    }

    /// Récupère une pièce par code ou renvoie une erreur.
    pub fn get(&self, code: &str) -> Result<&Part, String> {
        self.by_code
            .get(code)
            .ok_or_else(|| format!("pièce inconnue : {code}"))
    }

    /// Codes disponibles, triés.
    pub fn codes(&self) -> Vec<&String> {
        self.by_code.keys().collect()
    }
}

/// Charge le catalogue depuis un fichier JSON (tableau de pièces).
pub fn load_catalog(path: &Path) -> Result<Catalog, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("lecture de {path:?} : {e}"))?;
    let value = json::parse(&text).map_err(|e| e.to_string())?;
    let items = match value {
        Value::Array(items) => items,
        _ => return Err("le catalogue doit être un tableau".to_string()),
    };
    let mut parts = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let obj = match item {
            Value::Object(map) => map,
            _ => return Err(format!("élément {} du catalogue invalide", i)),
        };
        let code = field_string(obj, "code")?;
        let name = field_string(obj, "name")?;
        let unit_price = match obj.get("unit_price") {
            Some(Value::Number(n)) => *n,
            _ => return Err(format!("unit_price manquant à l'élément {i}")),
        };
        parts.push(Part {
            code,
            name,
            unit_price,
        });
    }
    Ok(Catalog::new(parts))
}

fn field_string(map: &std::collections::BTreeMap<String, Value>, key: &str) -> Result<String, String> {
    match map.get(key) {
        Some(Value::String(s)) => Ok(s.clone()),
        _ => Err(format!("champ '{key}' manquant ou invalide")),
    }
}
