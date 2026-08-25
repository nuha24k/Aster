use aster_core::{agents::AgentManager, logs::LogStore, Workspace};
use std::sync::{Arc, Mutex};

use crate::lsp::LspManager;
use crate::pty::PtyManager;
use crate::store::{self, PersistedState};

#[derive(Clone)]
pub struct ServerState {
    pub current_workspace: Arc<Mutex<Option<Workspace>>>,
    pub pty_manager: PtyManager,
    pub lsp_manager: LspManager,
    pub agent_manager: AgentManager,
    pub log_store: LogStore,
    pub store: Arc<Mutex<PersistedState>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            current_workspace: Arc::new(Mutex::new(None)),
            pty_manager: PtyManager::new(),
            lsp_manager: LspManager::new(),
            agent_manager: AgentManager::new(),
            log_store: LogStore::new(),
            store: Arc::new(Mutex::new(store::load())),
        }
    }
}
