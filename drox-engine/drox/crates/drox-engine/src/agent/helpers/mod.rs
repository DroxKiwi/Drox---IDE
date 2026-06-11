//! Fonctions utilitaires partagées par la boucle et les sous-modules.

mod messages;
mod tool_errors;
mod tool_specs;
mod workspace;

pub(crate) use messages::{first_user_text, last_user_text};
pub(crate) use tool_errors::{confirm_with_user, push_tool_error_tracked};
pub(crate) use tool_specs::build_tool_specs;
pub(crate) use workspace::mirror_workspace_map_from_tool;
