//! Tool folder types — virtual LLM surface → wire tools.

/// Virtual folder name exposed to the LLM at ACT.
pub const FOLDER_EDIT_FILE: &str = "edit_file";
/// Virtual folder at READ (distinct from `read_file` wire alias).
pub const FOLDER_READ_WORKSPACE: &str = "read_workspace";
/// Virtual folder at VERIFY.
pub const FOLDER_VERIFY_PROJECT: &str = "verify_project";
