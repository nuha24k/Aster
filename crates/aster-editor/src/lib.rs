use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EditorError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditorTab {
    pub path: PathBuf,
    pub name: String,
    pub content: String,
    pub is_dirty: bool,
    pub undo_stack: Vec<String>,
    pub redo_stack: Vec<String>,
}

impl EditorTab {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, EditorError> {
        let path = path.as_ref().to_path_buf();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let content = fs::read_to_string(&path)?;
        Ok(Self {
            path,
            name,
            content,
            is_dirty: false,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        })
    }

    pub fn save(&mut self) -> Result<(), EditorError> {
        fs::write(&self.path, &self.content)?;
        self.is_dirty = false;
        Ok(())
    }

    pub fn update_content(&mut self, new_content: String) {
        if new_content != self.content {
            self.undo_stack.push(self.content.clone());
            self.redo_stack.clear();
            self.content = new_content;
            self.is_dirty = true;
        }
    }

    pub fn undo(&mut self) {
        if let Some(prev) = self.undo_stack.pop() {
            self.redo_stack.push(self.content.clone());
            self.content = prev;
            self.is_dirty = true;
        }
    }

    pub fn redo(&mut self) {
        if let Some(next) = self.redo_stack.pop() {
            self.undo_stack.push(self.content.clone());
            self.content = next;
            self.is_dirty = true;
        }
    }
}

pub struct FileExplorer;

#[derive(Debug, Clone)]
pub struct FileItem {
    pub path: PathBuf,
    pub name: String,
    pub is_dir: bool,
}

impl FileExplorer {
    pub fn list_dir<P: AsRef<Path>>(root: P) -> Result<Vec<FileItem>, EditorError> {
        let mut items = Vec::new();
        let entries = match fs::read_dir(root.as_ref()) {
            Ok(e) => e,
            Err(_) => return Ok(items),
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // Filter out noise / build directories
            if name == "node_modules" || name == "target" || name == ".git" || name == "dist" || name == ".DS_Store" {
                continue;
            }

            let is_dir = path.is_dir();
            items.push(FileItem {
                path,
                name,
                is_dir,
            });
        }

        // Sort: directories first, then alphabetically by name
        items.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(items)
    }
}



#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_editor_tab_open_edit_save() {
        let file = NamedTempFile::new().unwrap();
        let path = file.path().to_path_buf();
        std::fs::write(&path, "hello world").unwrap();

        let mut tab = EditorTab::open(&path).unwrap();
        assert_eq!(tab.content, "hello world");
        assert!(!tab.is_dirty);

        tab.update_content("hello aster".to_string());
        assert!(tab.is_dirty);

        tab.save().unwrap();
        assert!(!tab.is_dirty);
    }
}
