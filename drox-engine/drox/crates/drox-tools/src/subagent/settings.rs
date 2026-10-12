//! Paramètres run / workspace pour activer et borner les sous-agents.

/// Paramètres workspace / run pour les sous-agents.
#[derive(Debug, Clone)]
pub struct SubagentSettings {
	/// Si `false`, le tool `task` n'est pas enregistré et ne doit pas être appelé.
	pub enabled: bool,
	/// Plafond d'itérations LLM de la **phase exécution** par sous-agent Explore.
	/// Pas de plafond artificiel côté client — min 1. Défaut 25.
	pub max_iterations: usize,
	/// Nombre max de sous-agents en parallèle (V1 : file d'attente via sémaphore).
	pub max_concurrent: usize,
	/// Thinking natif en **phase exécution** Explore.
	/// Défaut `false` (évite notes CoT polluant la synthèse).
	pub execution_think: bool,
	/// Thinking natif en **phase rapport** (synth JSON kinds).
	/// Défaut `false` — peut fuir du CoT dans les artefacts si on.
	pub report_think: bool,
}

impl Default for SubagentSettings {
	fn default() -> Self {
		Self {
			enabled: false,
			max_iterations: 25,
			max_concurrent: 3,
			execution_think: false,
			report_think: false,
		}
	}
}
