//! Profondeur **2** — `…/fill/paths_read/`
//!
//! Micro-tour : produire uniquement la clé JSON `paths_read`.

use super::{impl_fill_stage, FillKindStage};

pub struct PathsReadFill;

impl_fill_stage!(
	PathsReadFill,
	"paths_read",
	"explore.cascade.fill.paths_read",
	"telegraphic notes (and optional prior lists)",
	"JSON {\"paths_read\":\"…paths…\"} → paths_read.md"
);
