//! Profondeur **2** — `…/fill/file_summaries/`
//!
//! Micro-tour : uniquement `file_summaries` (idéal : notes + sortie paths_read).

use super::{impl_fill_stage, FillKindStage};

pub struct FileSummariesFill;

impl_fill_stage!(
	FileSummariesFill,
	"file_summaries",
	"explore.cascade.fill.file_summaries",
	"notes + optional paths_read body",
	"JSON {\"file_summaries\":\"…\"} → file_summaries.md"
);
