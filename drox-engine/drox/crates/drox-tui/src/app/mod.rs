//! Boucle application TUI.

mod event_loop;
mod state;

pub use event_loop::{print_sessions_list, App};
pub use state::{
    AiServerDialog, AiServerField, AiServerStep, AppConfig, AppPhase, AppState, ComposerMode,
    ComposerSuggestionDialog, CourseSnapshot, CourseStepView, OnboardingDialog, PromptDialog,
    RunStatus, TodoItemView, TodoSnapshot, WorkspaceDialog, WorkspaceField, WorkspaceStep,
};
