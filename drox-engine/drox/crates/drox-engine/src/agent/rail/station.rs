//! Canonical linear station order (mode A — engine proposes next candidate).

/// Plan depth declared by the model (`[depth: complex]`) — no keyword heuristics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RunDepth {
    #[default]
    Short,
    Complex,
}

/// Stations on the architect run rail (1.4.0).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RunStation {
    Intent,
    Read,
    Propose,
    Plan,
    Act,
    Verify,
    Answer,
}

impl RunStation {
    /// Boot station for a new architect edit run when rail is enabled.
    pub const BOOT: Self = Self::Intent;

    /// All stations in canonical order.
    pub const ORDER: [Self; 7] = [
        Self::Intent,
        Self::Read,
        Self::Propose,
        Self::Plan,
        Self::Act,
        Self::Verify,
        Self::Answer,
    ];

    /// Wire / snapshot token (ASCII, stable).
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Intent => "intent",
            Self::Read => "read",
            Self::Propose => "propose",
            Self::Plan => "plan",
            Self::Act => "act",
            Self::Verify => "verify",
            Self::Answer => "answer",
        }
    }

    /// Mode A: linear successor adjusted by [`super::RunDepth`] (C1: short skips PROPOSE).
    #[must_use]
    pub const fn next_mode_a(self, depth: RunDepth) -> Option<Self> {
        match (self, depth) {
            (Self::Intent, _) => Some(Self::Read),
            (Self::Read, RunDepth::Short) => Some(Self::Act),
            (Self::Read, RunDepth::Complex) => Some(Self::Propose),
            (Self::Propose, _) => Some(Self::Plan),
            (Self::Plan, _) => Some(Self::Act),
            (Self::Act, _) => Some(Self::Verify),
            (Self::Verify, _) => Some(Self::Answer),
            (Self::Answer, _) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_depth_reaches_answer_in_five_stations() {
        use super::RunDepth;
        let mut s = Some(RunStation::BOOT);
        let mut steps = 0usize;
        while let Some(st) = s {
            steps += 1;
            s = st.next_mode_a(RunDepth::Short);
        }
        assert_eq!(steps, 5);
        assert_eq!(s, None);
    }
}
