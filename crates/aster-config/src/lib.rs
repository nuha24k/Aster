use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] ron::Error),
    #[error("Parse error: {0}")]
    Parse(#[from] ron::error::SpannedError),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceState {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub sidebar_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct AppConfig {
    pub active_workspace_id: Option<String>,
    pub workspaces: Vec<WorkspaceState>,
}

impl AppConfig {
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let content = fs::read_to_string(path)?;
        let config: AppConfig = ron::from_str(&content)?;
        Ok(config)
    }

    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<(), ConfigError> {
        let content = ron::ser::to_string_pretty(self, ron::ser::PrettyConfig::default())?;
        if let Some(parent) = path.as_ref().parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_config_save_load() {
        let config = AppConfig {
            active_workspace_id: Some("ws_default".into()),
            workspaces: vec![WorkspaceState {
                id: "ws_default".into(),
                name: "Aster".into(),
                root_path: "/tmp".into(),
                sidebar_open: true,
            }],
        };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path();

        config.save_to_file(path).unwrap();
        let loaded = AppConfig::load_from_file(path).unwrap();

        assert_eq!(config, loaded);
    }
}
