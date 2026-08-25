use crate::state::ServerState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct AgentTaskDto {
    pub id: String,
    pub name: String,
    pub status: String,
    pub prompt: String,
    pub result: Option<String>,
}

pub fn spawn_agent_task(state: &ServerState, name: String, prompt: String, root_path: String) -> Result<(), String> {
    state.agent_manager.spawn_task(name, prompt, PathBuf::from(root_path), state.log_store.clone());
    Ok(())
}

pub fn get_agent_tasks(state: &ServerState) -> Result<Vec<AgentTaskDto>, String> {
    let tasks = state.agent_manager.get_tasks();
    Ok(tasks
        .into_iter()
        .map(|t| AgentTaskDto {
            id: t.id,
            name: t.name,
            status: format!("{:?}", t.status),
            prompt: t.prompt,
            result: t.result,
        })
        .collect())
}
