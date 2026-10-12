//! Profondeur **2** — `…/fill/gaps/`
//!
//! Idéalement **après** les autres fills : reçoit leurs corps en entrée minimale.

use super::{impl_fill_stage, FillKindStage};

pub struct GapsFill;

impl_fill_stage!(
	GapsFill,
	"gaps",
	"explore.cascade.fill.gaps",
	"notes + prior kind bodies (paths / summaries / map)",
	"JSON {\"gaps\":\"…\"} → gaps.md"
);
