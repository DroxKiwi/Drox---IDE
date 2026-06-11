use std::sync::Arc;

use drox_llm::LlmClient;
use drox_tools::{ToolContext, ToolRegistry};
use drox_types::{Content, Message};
use futures::stream::BoxStream;
use futures::StreamExt;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing::instrument;

use crate::error::EngineError;
use crate::event::AgentEvent;

use super::config::AgentConfig;

/// Stream typÃ© d'Ã©vÃ©nements agent.
pub type AgentStream = BoxStream<'static, Result<AgentEvent, EngineError>>;

/// Agent : boucle LLM streaming + dispatch de tool calls.
///
/// Cheap-to-clone : toutes les ressources lourdes sont derriÃ¨re `Arc`.
#[derive(Clone)]
pub struct Agent {
    pub(in crate::agent) llm: Arc<dyn LlmClient>,
    pub(in crate::agent) registry: Arc<ToolRegistry>,
    pub(in crate::agent) ctx: ToolContext,
    pub(in crate::agent) config: AgentConfig,
}

impl Agent {
    pub fn new(
        llm: Arc<dyn LlmClient>,
        registry: Arc<ToolRegistry>,
        ctx: ToolContext,
        config: AgentConfig,
    ) -> Self {
        Self {
            llm,
            registry,
            ctx,
            config,
        }
    }

    /// Lance la boucle agent et retourne un stream d'Ã©vÃ©nements.
    ///
    /// La tÃ¢che async est spawnÃ©e sur le runtime courant ; le stream se ferme
    /// quand l'agent atteint `Stop`, `MaxIterations`, ou une erreur.
    pub fn run(&self, prompt: impl Into<String>) -> AgentStream {
        self.run_with_history(Vec::new(), prompt)
    }

    /// Comme [`Self::run`], mais prÃ©fixe l'historique chargÃ© depuis le disque
    /// (transcript JSONL) avant le nouveau message utilisateur.
    pub fn run_with_history(
        &self,
        history: Vec<Message>,
        prompt: impl Into<String>,
    ) -> AgentStream {
        self.run_with_history_blocks(history, vec![Content::text(prompt.into())])
    }

    /// Variante multimodale de [`Self::run_with_history`] : permet de pousser
    /// un message `user` constituÃ© de blocs `Content` arbitraires (texte +
    /// images). UtilisÃ©e par le serveur JSON-RPC pour relayer des piÃ¨ces
    /// jointes au modÃ¨le.
    #[instrument(skip(self, history, user_blocks), fields(max_iter = self.config.max_iterations, blocks = user_blocks.len()))]
    pub fn run_with_history_blocks(
        &self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
    ) -> AgentStream {
        let (tx, rx) = mpsc::channel::<Result<AgentEvent, EngineError>>(32);
        let agent = self.clone();
        tokio::spawn(async move {
            agent.drive_inner(history, user_blocks, tx).await;
        });
        ReceiverStream::new(rx).boxed()
    }

}
