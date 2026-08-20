use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct PersistedState {
    /// GitHub account logins (tokens live in the Keychain, one entry each)
    #[serde(default)]
    pub gh_accounts: Vec<String>,
    #[serde(default)]
    pub gh_active: Option<String>,
    /// Folders opened from the File menu, most recent first (capped at 10).
    #[serde(default)]
    pub recent_folders: Vec<String>,
}

fn state_file() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("dev.aster.app")
        .join("state.json")
}

pub fn load() -> PersistedState {
    fs::read_to_string(state_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(state: &PersistedState) -> AppResult<()> {
    let path = state_file();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(state)?)?;
    Ok(())
}
