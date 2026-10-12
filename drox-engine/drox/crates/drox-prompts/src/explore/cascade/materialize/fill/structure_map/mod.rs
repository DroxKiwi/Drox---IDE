//! Profondeur **2** — `…/fill/structure_map/`

use super::{impl_fill_stage, FillKindStage};

pub struct StructureMapFill;

impl_fill_stage!(
	StructureMapFill,
	"structure_map",
	"explore.cascade.fill.structure_map",
	"notes + optional paths_read",
	"JSON {\"structure_map\":\"…\"} → structure_map.md"
);
