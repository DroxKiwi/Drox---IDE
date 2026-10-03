//! API publique de [`super::Agent`] : démarrage et reprise de run.

use std::sync::Arc;

use drox_llm::LlmClient;
use drox_tools::{ToolContext, ToolRegistry};
use drox_types::{Content, Message};
use futures::StreamExt;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing::instrument;

use crate::error::EngineError;
use crate::event::AgentEvent;

use super::super::config::AgentConfig;
use super::{Agent, AgentStream};

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

    /// Lance la boucle agent et retourne un stream d'événements.
    ///
    /// La tâche async est spawnée sur le runtime courant ; le stream se ferme
    /// quand l'agent atteint `Stop`, `MaxIterations`, ou une erreur.
    pub fn run(&self, prompt: impl Into<String>) -> AgentStream {
        self.run_with_history(Vec::new(), prompt)
    }

    /// Comme [`Self::run`], mais préfixe l'historique chargé depuis le disque
    /// (transcript JSONL) avant le nouveau message utilisateur.
    pub fn run_with_history(
        &self,
        history: Vec<Message>,
        prompt: impl Into<String>,
    ) -> AgentStream {
        self.run_with_history_blocks(history, vec![Content::text(prompt.into())])
    }

    /// Variante multimodale de [`Self::run_with_history`] : permet de pousser
    /// un message `user` constitué de blocs `Content` arbitraires (texte +
    /// images). Utilisée par le serveur JSON-RPC pour relayer des pièces
    /// jointes au modèle.
    #[instrument(skip(self, history, user_blocks), fields(max_iter = self.config.max_iterations, blocks = user_blocks.len()))]
    pub fn run_with_history_blocks(
        &self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
    ) -> AgentStream {
        self.run_with_history_blocks_inner(history, user_blocks, false)
    }

    /// Reprend un run depuis le transcript courant sans ajouter de tour `user`.
    #[instrument(skip(self, history), fields(max_iter = self.config.max_iterations))]
    pub fn continue_from_history(&self, history: Vec<Message>) -> AgentStream {
        self.run_with_history_blocks_inner(history, Vec::new(), true)
    }

    fn run_with_history_blocks_inner(
        &self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
        skip_new_user_turn: bool,
    ) -> AgentStream {
        let (tx, rx) = mpsc::channel::<Result<AgentEvent, EngineError>>(32);
        let agent = self.clone();
        tokio::spawn(async move {
            agent
                .drive_inner(history, user_blocks, tx, skip_new_user_turn)
                .await;
        });
        ReceiverStream::new(rx).boxed()
    }
}
