//! Budget de contexte (fenêtre, seuils, alertes).
//!
//! Modélise les zones successives autour de la fenêtre de contexte du modèle :
//! - **Effective window** : fenêtre brute moins la réserve de sortie.
//! - **Autocompact threshold** : seuil où l'agent doit déclencher une
//!   compaction proactive (effective − `autocompact_buffer`).
//! - **Warning threshold** / **Error threshold** : signaux UI/log lorsque le
//!   contexte se rapproche dangereusement de la fin.
//! - **Blocking limit** : effective − `manual_compact_buffer` ; au-dessus, le
//!   moteur refuse d'envoyer un nouveau tour tant qu'aucune compaction n'a
//!   eu lieu.
//!
//! Les buffers par défaut sont alignés sur l'ordre de grandeur du TS
//! (`autoCompact.ts`) mais légèrement plus prudents pour démarrer.
//!
//! Pour les fenêtres utilisateur (`num_ctx`), [`Self::from_user_window`] applique
//! des ratios type Cline (90 % autocompact, 97 % blocage) sur la fenêtre effective.

/// Remplissage estimé (%) de la fenêtre effective déclenchant l'autocompact.
pub const AUTOCOMPACT_FILL_RATIO: usize = 90;
/// Remplissage estimé (%) au-dessus duquel on refuse un tour LLM sans shrink réussi.
pub const BLOCKING_FILL_RATIO: usize = 97;
/// Signaux UI progressifs.
pub const WARNING_FILL_RATIO: usize = 85;
pub const ERROR_FILL_RATIO: usize = 92;

/// État d'alerte pour un nombre de tokens donné.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(clippy::struct_excessive_bools)]
pub struct WarningState {
    /// Pourcentage de fenêtre encore disponible (0–100), tronqué.
    pub percent_left: u8,
    /// Au-dessus du seuil d'alerte « warning ».
    pub above_warning: bool,
    /// Au-dessus du seuil d'alerte « error ».
    pub above_error: bool,
    /// Au-dessus du seuil de déclenchement d'autocompact.
    pub above_autocompact: bool,
    /// Au-dessus de la limite bloquante (refuser un nouveau tour).
    pub at_blocking_limit: bool,
}

/// Configuration d'un budget de contexte.
#[derive(Debug, Clone, Copy)]
pub struct ContextBudget {
    /// Taille brute de la fenêtre du modèle (200k tokens par défaut pour les grands contextes).
    pub window_size: usize,
    /// Tokens réservés pour la sortie du modèle (sommaire de compaction, etc.).
    pub reserved_output: usize,
    /// Marge avant déclenchement de l'autocompact (`autocompact_buffer`).
    pub autocompact_buffer: usize,
    /// Marge avant alerte « approche du remplissage » (`warning_buffer`).
    pub warning_buffer: usize,
    /// Marge avant alerte « contexte presque plein » (`error_buffer`).
    pub error_buffer: usize,
    /// Marge minimale avant blocage dur (`manual_compact_buffer`).
    pub manual_compact_buffer: usize,
}

impl Default for ContextBudget {
    fn default() -> Self {
        Self {
            window_size: 200_000,
            reserved_output: 20_000,
            autocompact_buffer: 13_000,
            warning_buffer: 20_000,
            error_buffer: 20_000,
            manual_compact_buffer: 3_000,
        }
    }
}

impl ContextBudget {
    /// Construit un budget pour une fenêtre donnée, avec les buffers par
    /// défaut. Pratique pour tester d'autres modèles (Ollama llama 8k, etc.).
    #[must_use]
    pub fn with_window(window_size: usize) -> Self {
        Self {
            window_size,
            ..Self::default()
        }
    }

    /// Budget aligné sur la fenêtre annoncée (Ollama `num_ctx`) avec ratios 90/97 %
    /// sur la fenêtre **effective** (après [`reserved_output`], plafonné).
    ///
    /// Sur grands contextes, les seuils ratio ne sont pas plus laxistes que les
    /// buffers fixes hérités de [`Self::default`].
    #[must_use]
    pub fn from_user_window(num_ctx: usize, reserved_output: usize) -> Self {
        let window_size = num_ctx.max(2048);
        let reserved_output = reserved_output
            .min(window_size.saturating_mul(25) / 100)
            .max(512);
        let effective = window_size.saturating_sub(reserved_output);

        let legacy = Self::with_window(window_size.max(Self::default().window_size));
        let ratio_autocompact = effective.saturating_mul(AUTOCOMPACT_FILL_RATIO) / 100;
        let ratio_blocking = effective.saturating_mul(BLOCKING_FILL_RATIO) / 100;
        let ratio_warning = effective.saturating_mul(WARNING_FILL_RATIO) / 100;
        let ratio_error = effective.saturating_mul(ERROR_FILL_RATIO) / 100;

        let autocompact_threshold = if window_size >= Self::default().window_size {
            ratio_autocompact.min(legacy.autocompact_threshold())
        } else {
            ratio_autocompact
        };
        let blocking_limit = if window_size >= Self::default().window_size {
            ratio_blocking.min(legacy.blocking_limit())
        } else {
            ratio_blocking
        };

        let autocompact_buffer = effective.saturating_sub(autocompact_threshold);
        let manual_compact_buffer = effective.saturating_sub(blocking_limit);
        let warning_buffer = effective.saturating_sub(ratio_warning.min(legacy.warning_threshold()));
        let error_buffer = effective.saturating_sub(ratio_error.min(legacy.error_threshold()));

        Self {
            window_size,
            reserved_output,
            autocompact_buffer,
            warning_buffer,
            error_buffer,
            manual_compact_buffer,
        }
    }

    /// Fenêtre disponible une fois la réserve de sortie soustraite.
    #[must_use]
    pub const fn effective_window(&self) -> usize {
        self.window_size.saturating_sub(self.reserved_output)
    }

    /// Seuil de déclenchement de l'autocompact.
    #[must_use]
    pub const fn autocompact_threshold(&self) -> usize {
        self.effective_window()
            .saturating_sub(self.autocompact_buffer)
    }

    /// Seuil d'alerte « warning ».
    #[must_use]
    pub const fn warning_threshold(&self) -> usize {
        self.effective_window().saturating_sub(self.warning_buffer)
    }

    /// Seuil d'alerte « error ».
    #[must_use]
    pub const fn error_threshold(&self) -> usize {
        self.effective_window().saturating_sub(self.error_buffer)
    }

    /// Limite bloquante (refus d'envoyer un nouveau tour si dépassée).
    #[must_use]
    pub const fn blocking_limit(&self) -> usize {
        self.effective_window()
            .saturating_sub(self.manual_compact_buffer)
    }

    /// Évalue l'état d'alerte pour un nombre de tokens consommé.
    #[must_use]
    pub fn evaluate(&self, tokens_used: usize) -> WarningState {
        let effective = self.effective_window().max(1);
        let pct = (effective.saturating_sub(tokens_used) as u128) * 100 / effective as u128;
        let percent_left = u8::try_from(pct).unwrap_or(100);
        WarningState {
            percent_left,
            above_warning: tokens_used >= self.warning_threshold(),
            above_error: tokens_used >= self.error_threshold(),
            above_autocompact: tokens_used >= self.autocompact_threshold(),
            at_blocking_limit: tokens_used >= self.blocking_limit(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_budget_has_sensible_thresholds() {
        let b = ContextBudget::default();
        assert_eq!(b.effective_window(), 180_000);
        assert_eq!(b.autocompact_threshold(), 167_000);
        assert_eq!(b.warning_threshold(), 160_000);
        assert_eq!(b.error_threshold(), 160_000);
        assert_eq!(b.blocking_limit(), 177_000);
    }

    #[test]
    fn evaluate_below_thresholds_reports_clear() {
        let b = ContextBudget::default();
        let s = b.evaluate(10_000);
        assert!(!s.above_warning);
        assert!(!s.above_error);
        assert!(!s.above_autocompact);
        assert!(!s.at_blocking_limit);
        assert!(s.percent_left > 90);
    }

    #[test]
    fn evaluate_above_autocompact_triggers_flag() {
        let b = ContextBudget::default();
        let s = b.evaluate(170_000);
        assert!(s.above_autocompact);
        assert!(!s.at_blocking_limit);
    }

    #[test]
    fn evaluate_above_blocking_reports_at_limit() {
        let b = ContextBudget::default();
        let s = b.evaluate(178_000);
        assert!(s.at_blocking_limit);
        assert!(s.above_autocompact);
        assert_eq!(s.percent_left, 1);
    }

    #[test]
    fn custom_window_scales_thresholds() {
        let b = ContextBudget {
            window_size: 8_000,
            reserved_output: 1_000,
            autocompact_buffer: 1_000,
            warning_buffer: 1_500,
            error_buffer: 500,
            manual_compact_buffer: 200,
        };
        assert_eq!(b.effective_window(), 7_000);
        assert_eq!(b.autocompact_threshold(), 6_000);
        assert_eq!(b.blocking_limit(), 6_800);
    }

    #[test]
    fn from_user_window_32k_uses_ratio_thresholds() {
        let b = ContextBudget::from_user_window(32_768, 20_000);
        let effective = b.effective_window();
        assert_eq!(effective, 32_768 - 8_192);
        assert_eq!(b.autocompact_threshold(), effective * AUTOCOMPACT_FILL_RATIO / 100);
        assert_eq!(b.blocking_limit(), effective * BLOCKING_FILL_RATIO / 100);
    }

    #[test]
    fn from_user_window_200k_triggers_autocompact_earlier_than_legacy_buffers() {
        let b = ContextBudget::from_user_window(200_000, 20_000);
        let legacy = ContextBudget::default();
        assert!(b.autocompact_threshold() < legacy.autocompact_threshold());
        assert_eq!(
            b.autocompact_threshold(),
            b.effective_window() * AUTOCOMPACT_FILL_RATIO / 100
        );
    }

    #[test]
    fn evaluate_32k_triggers_autocompact_near_90_percent() {
        let b = ContextBudget::from_user_window(32_768, 20_000);
        let at_trigger = b.autocompact_threshold();
        assert!(!b.evaluate(at_trigger.saturating_sub(1)).above_autocompact);
        assert!(b.evaluate(at_trigger).above_autocompact);
    }
}
