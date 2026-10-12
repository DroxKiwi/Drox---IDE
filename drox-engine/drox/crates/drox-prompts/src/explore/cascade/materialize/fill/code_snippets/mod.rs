//! Profondeur **2** — `…/fill/code_snippets/`

use super::{impl_fill_stage, FillKindStage};

pub struct CodeSnippetsFill;

impl_fill_stage!(
	CodeSnippetsFill,
	"code_snippets",
	"explore.cascade.fill.code_snippets",
	"notes + caps (maxSnippets / maxChars)",
	"JSON {\"code_snippets\":\"…\"} → code_snippets.md"
);
