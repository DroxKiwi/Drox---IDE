//! Lint strict du catalogue (ids uniques + claims non contradictoires).

use std::collections::BTreeMap;
use std::fmt;

use crate::catalog::all_entries;
use crate::entry::PromptEntry;

/// Erreur de cohérence du catalogue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CatalogLintError {
	DuplicateId {
		id: String,
	},
	ClaimConflict {
		claim_key: String,
		value_a: String,
		entry_a: String,
		value_b: String,
		entry_b: String,
	},
	EmptyBody {
		id: String,
	},
	MalformedClaim {
		id: String,
		claim: String,
	},
}

impl fmt::Display for CatalogLintError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::DuplicateId { id } => write!(f, "duplicate prompt id `{id}`"),
			Self::ClaimConflict {
				claim_key,
				value_a,
				entry_a,
				value_b,
				entry_b,
			} => write!(
				f,
				"claim `{claim_key}` conflict: `{value_a}` ({entry_a}) vs `{value_b}` ({entry_b})"
			),
			Self::EmptyBody { id } => write!(f, "empty body for prompt `{id}`"),
			Self::MalformedClaim { id, claim } => {
				write!(f, "malformed claim on `{id}` (want key=value): `{claim}`")
			}
		}
	}
}

/// Vérifie le catalogue entier — **strict** (toute erreur fait échouer les tests).
pub fn lint_catalog() -> Result<(), Vec<CatalogLintError>> {
	let mut errors = Vec::new();
	let mut seen_ids = BTreeMap::<&str, ()>::new();
	// claim_key → (value, entry_id)
	let mut claims = BTreeMap::<&str, (&str, &str)>::new();

	for entry in all_entries() {
		if entry.body.trim().is_empty() {
			errors.push(CatalogLintError::EmptyBody {
				id: entry.id.to_string(),
			});
		}
		if seen_ids.insert(entry.id, ()).is_some() {
			errors.push(CatalogLintError::DuplicateId {
				id: entry.id.to_string(),
			});
		}
		for claim in entry.claims {
			if !claim.contains('=') || PromptEntry::claim_key(claim).is_empty() {
				errors.push(CatalogLintError::MalformedClaim {
					id: entry.id.to_string(),
					claim: (*claim).to_string(),
				});
				continue;
			}
			let key = PromptEntry::claim_key(claim);
			let value = PromptEntry::claim_value(claim);
			if let Some((prev_value, prev_id)) = claims.get(key) {
				if *prev_value != value {
					errors.push(CatalogLintError::ClaimConflict {
						claim_key: key.to_string(),
						value_a: (*prev_value).to_string(),
						entry_a: (*prev_id).to_string(),
						value_b: value.to_string(),
						entry_b: entry.id.to_string(),
					});
				}
			} else {
				claims.insert(key, (value, entry.id));
			}
		}
	}

	if errors.is_empty() {
		Ok(())
	} else {
		Err(errors)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn catalog_lint_passes() {
		lint_catalog().unwrap_or_else(|errs| {
			panic!(
				"catalog lint failed:\n{}",
				errs.iter()
					.map(|e| format!("- {e}"))
					.collect::<Vec<_>>()
					.join("\n")
			);
		});
	}

	#[test]
	fn outside_ws_file_read_claim_is_shared() {
		let a = crate::entry_by_id("session.outside_ws.read").expect("outside read entry");
		let b = crate::entry_by_id("tools.file_read.description").expect("file_read entry");
		assert!(a.claims.iter().any(|c| *c == "outside_ws.file_read=always"));
		assert!(a.claims.iter().any(|c| *c == "outside_ws.grep_glob=always"));
		assert!(b.claims.iter().any(|c| *c == "outside_ws.file_read=always"));
	}
}
