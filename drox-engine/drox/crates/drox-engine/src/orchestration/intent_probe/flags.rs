//! Run intent flags produced by the boot probe or RPC defaults.

/// How [`RunIntentFlags`] were obtained.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeSource {
    /// Parsed from an LLM probe tour.
    Llm,
    /// RPC `edit` — probe skipped; conservative mutation expectation.
    RpcEditDefault,
    /// RPC `analyze` — probe skipped.
    RpcAnalyzeDefault,
    /// JSON parse failed after retries.
    FallbackDefault,
}

/// Booleans set at run boot (before the main agent loop).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunIntentFlags {
    pub greeting_only: bool,
    pub expects_workspace_mutation: bool,
    pub source: ProbeSource,
}

impl RunIntentFlags {
    #[must_use]
    pub const fn with_source(mut self, source: ProbeSource) -> Self {
        self.source = source;
        self
    }

    /// Conservative default when the probe cannot be parsed.
    #[must_use]
    pub const fn fallback_default() -> Self {
        Self {
            greeting_only: false,
            expects_workspace_mutation: true,
            source: ProbeSource::FallbackDefault,
        }
    }

    #[must_use]
    pub const fn rpc_edit_default() -> Self {
        Self {
            greeting_only: false,
            expects_workspace_mutation: true,
            source: ProbeSource::RpcEditDefault,
        }
    }

    #[must_use]
    pub const fn rpc_analyze_default() -> Self {
        Self {
            greeting_only: false,
            expects_workspace_mutation: false,
            source: ProbeSource::RpcAnalyzeDefault,
        }
    }

    #[must_use]
    pub const fn from_llm(greeting_only: bool, expects_workspace_mutation: bool) -> Self {
        Self {
            greeting_only,
            expects_workspace_mutation,
            source: ProbeSource::Llm,
        }
    }
}
