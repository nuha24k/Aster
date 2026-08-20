pub mod error;
pub mod store;
pub mod git;
pub mod github;

use std::path::PathBuf;
use std::sync::Mutex;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use aster_core::{Workspace, WorkspaceId, LayoutNode, SurfaceId, WorkspaceMetadata, agents::AgentManager, logs::LogStore};
use aster_terminal::TerminalSession;
use aster_git::{GitService, GitFileStatus};
use aster_editor::FileExplorer;


#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspaceInfoDto {
    pub id: String,
    pub name: String,
    pub root_path: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GitFileStatusDto {
    pub path: String,
    pub status: String,
    pub is_staged: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GitStatusDto {
    pub branch: String,
    pub staged: Vec<GitFileStatusDto>,
    pub unstaged: Vec<GitFileStatusDto>,
    pub untracked: Vec<GitFileStatusDto>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileItemDto {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AgentTaskDto {
    pub id: String,
    pub name: String,
    pub status: String,
    pub prompt: String,
    pub result: Option<String>,
}

pub struct AppState {
    current_workspace: Mutex<Option<Workspace>>,
    sessions: Mutex<HashMap<String, TerminalSession>>,
    agent_manager: AgentManager,
    log_store: LogStore,
    pub store: Mutex<crate::store::PersistedState>,
}

#[tauri::command]
fn get_current_workspace(state: tauri::State<'_, AppState>) -> Result<Option<WorkspaceInfoDto>, String> {
    let ws_guard = state.current_workspace.lock().map_err(|e| e.to_string())?;
    Ok(ws_guard.as_ref().map(|ws| WorkspaceInfoDto {
        id: ws.id.0.clone(),
        name: ws.name.clone(),
        root_path: ws.root_path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn create_workspace(name: String, path: String, state: tauri::State<'_, AppState>) -> Result<WorkspaceInfoDto, String> {
    let root = PathBuf::from(&path);
    let ws = Workspace {
        id: WorkspaceId(format!("ws_{}", name)),
        name: name.clone(),
        root_path: root,
        layout: LayoutNode::Surface(SurfaceId("term_1".into())),
        metadata: WorkspaceMetadata::default(),
    };
    let dto = WorkspaceInfoDto {
        id: ws.id.0.clone(),
        name: ws.name.clone(),
        root_path: path,
    };
    let mut ws_guard = state.current_workspace.lock().map_err(|e| e.to_string())?;
    *ws_guard = Some(ws);
    Ok(dto)
}

#[tauri::command]
fn spawn_terminal(session_id: Option<String>, cwd: Option<String>, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut map = state.sessions.lock().map_err(|e| e.to_string())?;
    let id = session_id.unwrap_or_else(|| format!("term_{}", map.len() + 1));

    if map.contains_key(&id) {
        return Ok(id);
    }

    let path = if let Some(c) = cwd.filter(|s| !s.is_empty()) {
        PathBuf::from(c)
    } else if let Ok(ws_guard) = state.current_workspace.lock() {
        if let Some(ref ws) = *ws_guard {
            ws.root_path.clone()
        } else {
            let mut curr = std::env::current_dir().unwrap_or_default();
            if curr.ends_with("src-tauri") {
                if let Some(parent) = curr.parent() {
                    curr = parent.to_path_buf();
                }
            }
            curr
        }
    } else {
        let mut curr = std::env::current_dir().unwrap_or_default();
        if curr.ends_with("src-tauri") {
            if let Some(parent) = curr.parent() {
                curr = parent.to_path_buf();
            }
        }
        curr
    };

    let session = TerminalSession::new(id.clone(), path, 80, 24).map_err(|e| e.to_string())?;
    map.insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
fn write_terminal(session_id: String, data: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let map = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = map.get(&session_id) {
        session.write_bytes(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_terminal_output(session_id: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let map = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = map.get(&session_id) {
        let bytes = session.read_output();
        return Ok(String::from_utf8_lossy(&bytes).to_string());
    }
    Ok(String::new())
}

#[tauri::command]
fn get_terminal_cwd(session_id: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let map = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = map.get(&session_id) {
        return Ok(session.cwd.to_string_lossy().to_string());
    }
    Ok(String::new())
}

#[tauri::command]
fn resize_terminal(session_id: String, cols: u16, rows: u16, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut map = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = map.get_mut(&session_id) {
        session.resize(cols, rows).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_git_status(path: String) -> Result<GitStatusDto, String> {
    let status = GitService::get_status(&path).map_err(|e| e.to_string())?;
    let map_file = |f: &GitFileStatus| GitFileStatusDto {
        path: f.path.to_string_lossy().to_string(),
        status: f.status.clone(),
        is_staged: f.is_staged,
    };

    Ok(GitStatusDto {
        branch: status.branch,
        staged: status.staged.iter().map(map_file).collect(),
        unstaged: status.unstaged.iter().map(map_file).collect(),
        untracked: status.untracked.iter().map(map_file).collect(),
    })
}

#[tauri::command]
fn stage_git_file(repo_path: String, file_path: String) -> Result<(), String> {
    GitService::stage_file(&repo_path, PathBuf::from(&file_path).as_path()).map_err(|e| e.to_string())
}

#[tauri::command]
fn unstage_git_file(repo_path: String, file_path: String) -> Result<(), String> {
    GitService::unstage_file(&repo_path, PathBuf::from(&file_path).as_path()).map_err(|e| e.to_string())
}

#[tauri::command]
fn commit_git(repo_path: String, message: String) -> Result<(), String> {
    GitService::commit(&repo_path, &message).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_git_diff(repo_path: String, file_path: String) -> Result<String, String> {
    GitService::get_diff(&repo_path, PathBuf::from(&file_path).as_path()).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir_files(path: String) -> Result<Vec<FileItemDto>, String> {
    let items = FileExplorer::list_dir(&path).map_err(|e| e.to_string())?;
    Ok(items
        .into_iter()
        .map(|item| FileItemDto {
            path: item.path.to_string_lossy().to_string(),
            name: item.name,
            is_dir: item.is_dir,
        })
        .collect())
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    match std::fs::read(&path) {
        Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_file_content(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Return the working directory ASTER was launched from, correcting for src-tauri.
#[tauri::command]
fn get_app_cwd() -> Result<String, String> {
    let mut cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    if cwd.ends_with("src-tauri") {
        if let Some(parent) = cwd.parent() {
            cwd = parent.to_path_buf();
        }
    }
    Ok(cwd.to_string_lossy().to_string())
}

/// Open a native OS folder picker dialog and return the chosen path safely.
/// Uses async callback to avoid macOS AppKit main-thread modal panic.
#[tauri::command]
async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_can_create_directories(true)
        .pick_folder(move |folder_path| {
            let path_str = folder_path.map(|p| p.to_string());
            let _ = tx.send(path_str);
        });
    rx.await.map_err(|e| e.to_string())
}

/// Open a directory safely in native OS Finder / Explorer.
#[tauri::command]
async fn open_in_finder(path: String) -> Result<(), String> {
    let p_str = path.trim();
    if p_str.is_empty() {
        return Err("Path is empty".to_string());
    }
    let p = PathBuf::from(p_str);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", p_str));
    }

    #[cfg(target_os = "macos")]
    {
        tokio::process::Command::new("open")
            .arg(&p)
            .output()
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        tokio::process::Command::new("explorer")
            .arg(&p)
            .output()
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        tokio::process::Command::new("xdg-open")
            .arg(&p)
            .output()
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}


/// Analyse staged git diff and generate a Conventional Commits message.
/// Does not call any external AI — uses diff heuristics.
#[tauri::command]
fn generate_commit_message(repo_path: String) -> Result<String, String> {
    use std::process::Command;

    // Collect staged diff
    let diff_out = Command::new("git")
        .args(["diff", "--staged", "--stat"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;
    let stat = String::from_utf8_lossy(&diff_out.stdout).to_string();

    // Collect staged file names
    let files_out = Command::new("git")
        .args(["diff", "--staged", "--name-only"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;
    let files_raw = String::from_utf8_lossy(&files_out.stdout).to_string();
    let files: Vec<&str> = files_raw.lines().filter(|l| !l.is_empty()).collect();

    if files.is_empty() {
        return Err("No staged changes to generate a commit message for.".to_string());
    }

    // Collect brief diff body for context (limit to 3000 chars)
    let diff_body_out = Command::new("git")
        .args(["diff", "--staged", "--unified=1"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| e.to_string())?;
    let diff_body = String::from_utf8_lossy(&diff_body_out.stdout);
    let diff_body_trimmed: String = diff_body.chars().take(3000).collect();

    // Heuristic: detect type from filenames & diff content
    let commit_type = if files.iter().any(|f| f.contains("test") || f.contains("spec")) {
        "test"
    } else if files.iter().any(|f| f.ends_with(".md") || f.ends_with(".txt") || f.ends_with(".rst")) {
        "docs"
    } else if files.iter().any(|f| {
        f.contains("Cargo.toml") || f.contains("package.json") || f.contains(".lock")
    }) {
        "chore"
    } else if diff_body_trimmed.contains("fix") || diff_body_trimmed.contains("bug") || diff_body_trimmed.contains("error") {
        "fix"
    } else if diff_body_trimmed.contains("refactor") || diff_body_trimmed.contains("rename") || diff_body_trimmed.contains("move") {
        "refactor"
    } else {
        "feat"
    };

    // Derive scope from most common top-level directory among changed files
    let scope = {
        let dirs: Vec<&str> = files
            .iter()
            .filter_map(|f| f.split('/').next())
            .collect();
        let mut counts = std::collections::HashMap::new();
        for d in &dirs {
            *counts.entry(*d).or_insert(0usize) += 1;
        }
        counts
            .into_iter()
            .max_by_key(|(_, c)| *c)
            .map(|(d, _)| d.to_string())
            .unwrap_or_default()
    };

    // Build subject from file list
    let file_summary = if files.len() == 1 {
        // Use stem of single file
        std::path::Path::new(files[0])
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| files[0].to_string())
    } else {
        format!("{} files", files.len())
    };

    let subject = format!("update {}", file_summary);
    let msg = if scope.is_empty() || scope == file_summary {
        format!("{}: {}", commit_type, subject)
    } else {
        format!("{}({}): {}", commit_type, scope, subject)
    };

    // Append brief body with stat
    let body = if stat.trim().is_empty() {
        String::new()
    } else {
        format!("\n\n{}", stat.trim())
    };

    Ok(format!("{}{}", msg, body))
}


#[tauri::command]
fn spawn_agent_task(name: String, prompt: String, root_path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.agent_manager.spawn_task(name, prompt, PathBuf::from(root_path), state.log_store.clone());
    Ok(())
}

#[tauri::command]
fn get_agent_tasks(state: tauri::State<'_, AppState>) -> Result<Vec<AgentTaskDto>, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        current_workspace: Mutex::new(None),
        sessions: Mutex::new(HashMap::new()),
        agent_manager: AgentManager::new(),
        log_store: LogStore::new(),
        store: Mutex::new(store::load()),
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_current_workspace,
            create_workspace,
            spawn_terminal,
            write_terminal,
            read_terminal_output,
            get_terminal_cwd,
            resize_terminal,
            get_git_status,
            stage_git_file,
            unstage_git_file,
            commit_git,
            get_git_diff,
            list_dir_files,
            read_file_content,
            save_file_content,
            get_app_cwd,
            open_folder_dialog,
            open_in_finder,
            generate_commit_message,

            spawn_agent_task,
            get_agent_tasks,

            // New Git Commands
            git::git_branch,
            git::git_repo_root,
            git::git_branches,
            git::git_checkout,
            git::git_status,
            git::git_diff,
            git::git_file_head,
            git::git_discard,
            git::git_stage,
            git::git_stage_all,
            git::git_unstage,
            git::git_commit,
            git::git_pr_template,
            git::git_log,
            git::git_stash_list,
            git::git_stash_push,
            git::git_stash_apply,
            git::git_stash_drop,
            git::git_commit_amend,
            git::git_cherry_pick,
            git::git_blame,
            git::git_stage_hunk,
            git::git_conflict_resolve,

            // New GitHub Commands
            github::gh_status,
            github::gh_set_pat,
            github::gh_switch,
            github::gh_logout,
            github::gh_device_start,
            github::gh_device_poll,
            github::gh_remote_info,
            github::gh_push,
            github::gh_pull,
            github::gh_pr_for_branch,
            github::gh_pr_reviews,
            github::gh_list_prs,
            github::gh_create_pr,
            github::gh_pr_detail,
            github::gh_pr_files,
            github::gh_pr_reply_thread,
            github::gh_pr_resolve_thread,
            github::gh_pr_comment,
            github::gh_pr_merge,
            github::gh_issues_list,
            github::gh_pr_mark_ready,
            github::gh_workflow_runs,
            github::gh_workflow_jobs,
            github::gh_job_log,
            github::gh_pr_checks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

