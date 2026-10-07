//! Métadonnées d'intention pour chaque prompt injecté.

/// Qui consomme le texte.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptAudience {
	/// Agent parent (session master).
	Parent,
	/// Sous-agent Explore.
	ExploreChild,
	/// Modèle de compaction / résumé.
	Compaction,
	/// Schéma d'outil (toujours visible quand l'outil est enregistré).
	ToolSchema,
	/// Classificateur / probe one-shot (hors boucle agent).
	ModelQuestion,
}

/// Nature du message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptIntent {
	/// Procédure préférée (Plan → Assign → Merge, etc.).
	Procedure,
	/// Capacité / permission (hors-WS, tools disponibles…).
	Capability,
	/// Contrainte / interdiction préférée (soft).
	Constraint,
	/// Filet après échec / dérive (S-5, rescue…).
	Rescue,
	/// Compaction / mémoire.
	Compaction,
	/// Description d'outil (JSON schema companion text).
	ToolSchema,
	/// Question modèle one-shot (classif boot, etc.) — pas un nudge injecté.
	ModelQuestion,
}

/// Force du message — **soft produit** : les tools restent appelables
/// sauf refus `blocks` / gates moteur (hors de ce enum).
///
/// Deux niveaux seulement : `Prefer` (guidance) et `MustText` (formulation
/// forte dans le texte). Pas de `Soft` séparé — ça diluait la taxonomie.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptStrength {
	/// Guidance / procédure préférée (tools libres).
	Prefer,
	/// Formulation « MUST » / « STOP » dans le texte (pas un hard gate tools par soi).
	MustText,
}

/// Fiche catalogue — une source de vérité pour body + intention.
#[derive(Debug, Clone, Copy)]
pub struct PromptEntry {
	/// Identifiant stable (`session.outside_ws`, `tools.file_read`, …).
	pub id: &'static str,
	pub intent: PromptIntent,
	pub strength: PromptStrength,
	pub audience: PromptAudience,
	/// Condition d'injection / d'exposition (`always`, `explore_enabled`, `outside_ws_toggle`, …).
	pub when: &'static str,
	/// Thèmes libres pour regroupement manuel.
	pub topics: &'static [&'static str],
	/// Assertions `clé=valeur` — deux valeurs différentes pour la même clé = lint fail.
	pub claims: &'static [&'static str],
	/// Corps injecté / exposé au LLM.
	pub body: &'static str,
}

impl PromptEntry {
	/// Parse `clé` depuis un claim `clé=valeur`.
	#[must_use]
	pub fn claim_key(claim: &str) -> &str {
		claim.split_once('=').map(|(k, _)| k).unwrap_or(claim)
	}

	/// Parse `valeur` depuis un claim `clé=valeur`.
	#[must_use]
	pub fn claim_value(claim: &str) -> &str {
		claim.split_once('=').map(|(_, v)| v).unwrap_or("")
	}
}
