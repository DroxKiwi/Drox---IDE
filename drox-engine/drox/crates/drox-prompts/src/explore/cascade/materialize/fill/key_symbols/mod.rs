//! Profondeur **2** — `…/fill/key_symbols/`

use super::{impl_fill_stage, FillKindStage};

pub struct KeySymbolsFill;

impl_fill_stage!(
	KeySymbolsFill,
	"key_symbols",
	"explore.cascade.fill.key_symbols",
	"notes (+ paths / summaries if already filled)",
	"JSON {\"key_symbols\":\"…\"} → key_symbols.md"
);
