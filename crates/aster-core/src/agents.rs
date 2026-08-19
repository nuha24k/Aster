use crate::logs::{LogLevel, LogStore};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentStatus {
    Idle,
    Running,
    Waiting,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone)]
pub struct AgentTask {
    pub id: String,
    pub name: String,
    pub status: AgentStatus,
    pub prompt: String,
    pub result: Option<String>,
}

#[derive(Clone, Default)]
pub struct AgentManager {
    tasks: Arc<Mutex<Vec<AgentTask>>>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn spawn_task(&self, name: String, prompt: String, root_path: PathBuf, log_store: LogStore) {
        let task_id = format!("agent_{}", self.tasks.lock().len() + 1);
        let task = AgentTask {
            id: task_id.clone(),
            name: name.clone(),
            status: AgentStatus::Running,
            prompt: prompt.clone(),
            result: None,
        };

        self.tasks.lock().push(task);
        log_store.push("AgentManager", LogLevel::Info, format!("Started agent task: {}", name));

        let tasks_clone = self.tasks.clone();
        std::thread::spawn(move || {
            // Simulated intelligent workspace analysis
            std::thread::sleep(std::time::Duration::from_millis(300));

            let mut guard = tasks_clone.lock();
            if let Some(t) = guard.iter_mut().find(|t| t.id == task_id) {
                t.status = AgentStatus::Completed;
                t.result = Some(format!(
                    "Analyzed workspace at {}\nPrompt: {}\nResult: Action proposal ready for review.",
                    root_path.display(),
                    prompt
                ));
            }
            log_store.push("AgentManager", LogLevel::Info, format!("Agent task completed: {}", name));
        });
    }

    pub fn get_tasks(&self) -> Vec<AgentTask> {
        self.tasks.lock().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_manager_spawn() {
        let manager = AgentManager::new();
        let log_store = LogStore::new();
        manager.spawn_task("Explain error".into(), "What went wrong?".into(), PathBuf::from("/"), log_store);
        std::thread::sleep(std::time::Duration::from_millis(400));
        let tasks = manager.get_tasks();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].status, AgentStatus::Completed);
    }
}
