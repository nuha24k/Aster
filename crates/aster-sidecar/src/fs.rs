use aster_editor::FileExplorer;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Debug)]
pub struct FileItemDto {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileContentDto {
    pub path: String,
    pub content: String,
}

pub fn read_file_content(path: &str) -> Result<String, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).to_string()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn save_file_content(path: &str, content: &str) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn list_dir_files(path: &str) -> Result<Vec<FileItemDto>, String> {
    let items = FileExplorer::list_dir(path).map_err(|e| e.to_string())?;
    Ok(items
        .into_iter()
        .map(|item| FileItemDto {
            path: item.path.to_string_lossy().to_string(),
            name: item.name,
            is_dir: item.is_dir,
        })
        .collect())
}

fn collect_dts_files(dir: &Path, acc: &mut Vec<FileContentDto>, max_files: usize) {
    if acc.len() >= max_files || !dir.is_dir() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if acc.len() >= max_files {
                break;
            }
            let path = entry.path();
            if path.is_dir() {
                let folder_name = path.file_name().unwrap_or_default().to_string_lossy();
                if folder_name == ".bin"
                    || folder_name == ".cache"
                    || folder_name == "test"
                    || folder_name == "tests"
                {
                    continue;
                }
                collect_dts_files(&path, acc, max_files);
            } else if path.is_file() {
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                if file_name.ends_with(".d.ts") {
                    if let Ok(metadata) = entry.metadata() {
                        if metadata.len() <= 200_000 {
                            if let Ok(bytes) = std::fs::read(&path) {
                                acc.push(FileContentDto {
                                    path: path.to_string_lossy().to_string(),
                                    content: String::from_utf8_lossy(&bytes).to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn get_workspace_type_defs(root_path: &str) -> Result<Vec<FileContentDto>, String> {
    let root = PathBuf::from(root_path);
    let mut acc = Vec::new();
    let node_modules = root.join("node_modules");
    if node_modules.exists() {
        collect_dts_files(&node_modules, &mut acc, 80);
    }
    Ok(acc)
}

fn collect_source_files(dir: &Path, acc: &mut Vec<FileContentDto>, max_files: usize) {
    if acc.len() >= max_files || !dir.is_dir() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if acc.len() >= max_files {
                break;
            }
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if path.is_dir() {
                if name == "node_modules"
                    || name == "target"
                    || name == ".git"
                    || name == "dist"
                    || name == "build"
                    || name == ".next"
                {
                    continue;
                }
                collect_source_files(&path, acc, max_files);
            } else if path.is_file() {
                if (name.ends_with(".ts") || name.ends_with(".tsx")) && !name.ends_with(".d.ts") {
                    if let Ok(metadata) = entry.metadata() {
                        if metadata.len() <= 200_000 {
                            if let Ok(bytes) = std::fs::read(&path) {
                                acc.push(FileContentDto {
                                    path: path.to_string_lossy().to_string(),
                                    content: String::from_utf8_lossy(&bytes).to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn get_workspace_source_files(root_path: &str) -> Result<Vec<FileContentDto>, String> {
    let root = PathBuf::from(root_path);
    let mut acc = Vec::new();
    let src = root.join("src");
    if src.exists() {
        collect_source_files(&src, &mut acc, 30);
    } else if root.exists() {
        collect_source_files(&root, &mut acc, 30);
    }
    Ok(acc)
}
