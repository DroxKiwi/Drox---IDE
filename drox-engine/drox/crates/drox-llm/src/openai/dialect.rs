//! Variantes du protocole Chat Completions (OpenAI vs Mistral).

/// Dialecte wire OpenAI-compatible.
///
/// Mistral documente [`random_seed`](https://docs.mistral.ai/api/#tag/chat) (pas `seed`)
/// et rejette en runtime `top_p <= 0` (`greater_than 0`, HTTP 422).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum OpenAiCompatDialect {
	/// OpenAI / vLLM / LM Studio / proxies : champ `seed`, `top_p` tel quel.
	#[default]
	OpenAi,
	/// API Mistral Cloud (`api.mistral.ai`).
	Mistral,
}

impl OpenAiCompatDialect {
	/// `top_p` prêt pour le wire (omit si invalide pour le dialecte).
	#[must_use]
	pub fn sanitize_top_p(self, top_p: Option<f32>) -> Option<f32> {
		let v = top_p?;
		if !v.is_finite() {
			return None;
		}
		match self {
			// Runtime Mistral : exclusiveMinimum 0 (erreur 422 si 0.0).
			Self::Mistral if v <= 0.0 => None,
			_ => Some(v),
		}
	}

	/// Mappe le seed Drox → champs wire `(seed, random_seed)`.
	#[must_use]
	pub fn seed_wire_fields(self, seed: Option<i64>) -> (Option<i64>, Option<i64>) {
		match self {
			Self::OpenAi => (seed, None),
			Self::Mistral => (None, seed),
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn mistral_drops_non_positive_top_p() {
		assert_eq!(OpenAiCompatDialect::Mistral.sanitize_top_p(Some(0.0)), None);
		assert_eq!(OpenAiCompatDialect::Mistral.sanitize_top_p(Some(-0.1)), None);
		assert_eq!(
			OpenAiCompatDialect::Mistral.sanitize_top_p(Some(0.9)),
			Some(0.9)
		);
	}

	#[test]
	fn mistral_maps_seed_to_random_seed() {
		assert_eq!(
			OpenAiCompatDialect::Mistral.seed_wire_fields(Some(42)),
			(None, Some(42))
		);
		assert_eq!(
			OpenAiCompatDialect::OpenAi.seed_wire_fields(Some(42)),
			(Some(42), None)
		);
	}
}
