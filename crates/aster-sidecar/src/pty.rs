use aster_terminal::TerminalSession;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        session_id: Option<String>,
        cwd: Option<String>,
        default_root: Option<PathBuf>,
    ) -> Result<String, String> {
        let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
        let id = session_id.unwrap_or_else(|| format!("term_{}", map.len() + 1));

        if map.contains_key(&id) {
            return Ok(id);
        }

        let path = if let Some(c) = cwd.filter(|s| !s.is_empty()) {
            PathBuf::from(c)
        } else if let Some(root) = default_root {
            root
        } else {
            std::env::current_dir().unwrap_or_default()
        };

        let session = TerminalSession::new(id.clone(), path, 80, 24).map_err(|e| e.to_string())?;
        map.insert(id.clone(), session);
        Ok(id)
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let map = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = map.get(session_id) {
            session.write_bytes(data.as_bytes()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn read_output(&self, session_id: &str) -> Result<String, String> {
        let map = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = map.get(session_id) {
            let bytes = session.read_output();
            return Ok(String::from_utf8_lossy(&bytes).to_string());
        }
        Ok(String::new())
    }

    pub fn get_cwd(&self, session_id: &str) -> Result<String, String> {
        let map = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = map.get(session_id) {
            return Ok(session.cwd.to_string_lossy().to_string());
        }
        Ok(String::new())
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let mut map = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = map.get_mut(session_id) {
            session.resize(cols, rows).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
