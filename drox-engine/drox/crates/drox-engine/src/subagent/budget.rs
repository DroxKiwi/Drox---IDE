//! Budget d'itérations de la **phase exécution** Explore.

const EXPLORE_VERY_THOROUGH_BONUS: usize = 10;

/// Setting client + bonus thoroughness. Pas de plafond artificiel.
#[must_use]
pub fn explore_iteration_budget(settings_max: usize, thoroughness: Option<&str>) -> usize {
	let base = settings_max.max(1);
	let bonus = match thoroughness
		.unwrap_or("medium")
		.trim()
		.to_ascii_lowercase()
		.as_str()
	{
		"very thorough" | "very_thorough" | "very-thorough" => EXPLORE_VERY_THOROUGH_BONUS,
		_ => 0,
	};
	base.saturating_add(bonus).max(1)
}
