pub mod agent;
pub mod fs;
pub mod github;
pub mod git;
pub mod lsp;
pub mod pty;
pub mod state;
pub mod store;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use state::ServerState;
use std::io::Write;
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

#[derive(Deserialize, Debug)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize, Debug)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize, Debug)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

fn make_success(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: Some(result),
        error: None,
    }
}

fn make_error(id: Option<Value>, code: i32, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message,
            data: None,
        }),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("[aster-core] Starting sidecar process (PID: {})...", std::process::id());

    let state = ServerState::new();
    let (notif_tx, mut notif_rx) = mpsc::channel::<Value>(100);

    // Task to forward server notifications to stdout
    tokio::spawn(async move {
        while let Some(notif) = notif_rx.recv().await {
            if let Ok(json_str) = serde_json::to_string(&notif) {
                let mut stdout = std::io::stdout().lock();
                let _ = writeln!(stdout, "{}", json_str);
                let _ = stdout.flush();
            }
        }
    });

    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let req: JsonRpcRequest = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(e) => {
                let err_resp = make_error(None, -32700, format!("Parse error: {}", e));
                send_response(&err_resp);
                continue;
            }
        };

        let id = req.id.clone();
        let resp = match req.method.as_str() {
            // System
            "system/handshake" => make_success(
                id.clone(),
                serde_json::json!({
                    "protocolVersion": "1.0.0",
                    "wsPort": 0,
                    "pid": std::process::id(),
                    "status": "ready"
                }),
            ),
            "system/ping" => make_success(id.clone(), serde_json::Value::String("pong".into())),
            "system/getCwd" => {
                let cwd = std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                make_success(id.clone(), serde_json::Value::String(cwd))
            }

            // Workspace
            "workspace/getCurrent" => {
                let ws_guard = state.current_workspace.lock().unwrap();
                let res = ws_guard.as_ref().map(|ws| {
                    serde_json::json!({
                        "id": ws.id.0.clone(),
                        "name": ws.name.clone(),
                        "root_path": ws.root_path.to_string_lossy().to_string(),
                    })
                });
                make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null))
            }
            "workspace/create" => {
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let path_str = req.params["path"].as_str().unwrap_or_default().to_string();
                let root = PathBuf::from(&path_str);
                let ws = aster_core::Workspace {
                    id: aster_core::WorkspaceId(format!("ws_{}", name)),
                    name: name.clone(),
                    root_path: root,
                    layout: aster_core::LayoutNode::Surface(aster_core::SurfaceId("term_1".into())),
                    metadata: aster_core::WorkspaceMetadata::default(),
                };
                let dto = serde_json::json!({
                    "id": ws.id.0.clone(),
                    "name": ws.name.clone(),
                    "root_path": path_str,
                });
                *state.current_workspace.lock().unwrap() = Some(ws);
                make_success(id.clone(), dto)
            }

            // Filesystem
            "fs/readContent" => {
                let path = req.params["path"].as_str().unwrap_or_default();
                match fs::read_file_content(path) {
                    Ok(content) => make_success(id.clone(), serde_json::Value::String(content)),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }
            "fs/saveContent" => {
                let path = req.params["path"].as_str().unwrap_or_default();
                let content = req.params["content"].as_str().unwrap_or_default();
                match fs::save_file_content(path, content) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }
            "fs/listDir" => {
                let path = req.params["path"].as_str().unwrap_or_default();
                match fs::list_dir_files(path) {
                    Ok(items) => make_success(id.clone(), serde_json::to_value(items).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }
            "fs/getTypeDefs" => {
                let root_path = req.params["rootPath"].as_str().unwrap_or_default();
                match fs::get_workspace_type_defs(root_path) {
                    Ok(defs) => make_success(id.clone(), serde_json::to_value(defs).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }
            "fs/getSourceFiles" => {
                let root_path = req.params["rootPath"].as_str().unwrap_or_default();
                match fs::get_workspace_source_files(root_path) {
                    Ok(files) => make_success(id.clone(), serde_json::to_value(files).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }

            // Terminal / PTY
            "pty/spawn" => {
                let session_id = req.params["sessionId"].as_str().map(String::from);
                let cwd = req.params["cwd"].as_str().map(String::from);
                let ws_root = state.current_workspace.lock().unwrap().as_ref().map(|w| w.root_path.clone());
                match state.pty_manager.spawn(session_id, cwd, ws_root) {
                    Ok(spawner_id) => make_success(id.clone(), serde_json::json!({ "sessionId": spawner_id })),
                    Err(e) => make_error(id.clone(), -32002, e),
                }
            }
            "pty/write" => {
                let session_id = req.params["sessionId"].as_str().unwrap_or_default();
                let data = req.params["data"].as_str().unwrap_or_default();
                match state.pty_manager.write(session_id, data) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32002, e),
                }
            }
            "pty/readOutput" => {
                let session_id = req.params["sessionId"].as_str().unwrap_or_default();
                match state.pty_manager.read_output(session_id) {
                    Ok(data) => make_success(id.clone(), serde_json::json!({ "data": data })),
                    Err(e) => make_error(id.clone(), -32002, e),
                }
            }
            "pty/getCwd" => {
                let session_id = req.params["sessionId"].as_str().unwrap_or_default();
                match state.pty_manager.get_cwd(session_id) {
                    Ok(cwd) => make_success(id.clone(), serde_json::json!({ "cwd": cwd })),
                    Err(e) => make_error(id.clone(), -32002, e),
                }
            }
            "pty/resize" => {
                let session_id = req.params["sessionId"].as_str().unwrap_or_default();
                let cols = req.params["cols"].as_u64().unwrap_or(80) as u16;
                let rows = req.params["rows"].as_u64().unwrap_or(24) as u16;
                match state.pty_manager.resize(session_id, cols, rows) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32002, e),
                }
            }

            // Git
            "git/branch" => {
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                let res = git::git_branch(path);
                make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null))
            }
            "git/repoRoot" => {
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                let res = git::git_repo_root(path);
                make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null))
            }
            "git/branches" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                match git::git_branches(repo) {
                    Ok(branches) => make_success(id.clone(), serde_json::to_value(branches).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/checkout" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let branch = req.params["branch"].as_str().unwrap_or_default().to_string();
                let create = req.params["create"].as_bool().unwrap_or(false);
                match git::git_checkout(repo, branch, create) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/status" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                match git::git_status(repo) {
                    Ok(st) => make_success(id.clone(), serde_json::to_value(st).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/diff" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                let staged = req.params["staged"].as_bool().unwrap_or(false);
                let untracked = req.params["untracked"].as_bool().unwrap_or(false);
                match git::git_diff(repo, path, staged, untracked) {
                    Ok(diff) => make_success(id.clone(), serde_json::Value::String(diff)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/fileHead" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                match git::git_file_head(repo, path) {
                    Ok(head) => make_success(id.clone(), serde_json::Value::String(head)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/discard" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let tracked = req.params["tracked"]
                    .as_array()
                    .map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                let untracked = req.params["untracked"]
                    .as_array()
                    .map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                match git::git_discard(repo, tracked, untracked) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stage" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let paths = req.params["paths"]
                    .as_array()
                    .map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                match git::git_stage(repo, paths) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stageAll" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                match git::git_stage_all(repo) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/unstage" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let paths = req.params["paths"]
                    .as_array()
                    .map(|v| v.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                match git::git_unstage(repo, paths) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/commit" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let summary = req.params["summary"].as_str().unwrap_or_default().to_string();
                let description = req.params["description"].as_str().map(String::from);
                match git::git_commit(repo, summary, description) {
                    Ok(res) => make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/prTemplate" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let res = git::git_pr_template(repo);
                make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null))
            }
            "git/log" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let limit = req.params["limit"].as_u64().unwrap_or(15) as u32;
                match git::git_log(repo, limit) {
                    Ok(commits) => make_success(id.clone(), serde_json::to_value(commits).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stashList" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                match git::git_stash_list(repo) {
                    Ok(list) => make_success(id.clone(), serde_json::to_value(list).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stashPush" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let message = req.params["message"].as_str().map(String::from);
                match git::git_stash_push(repo, message) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stashApply" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let index = req.params["index"].as_u64().unwrap_or(0) as u32;
                match git::git_stash_apply(repo, index) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stashDrop" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let index = req.params["index"].as_u64().unwrap_or(0) as u32;
                match git::git_stash_drop(repo, index) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/commitAmend" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let summary = req.params["summary"].as_str().unwrap_or_default().to_string();
                let description = req.params["description"].as_str().map(String::from);
                match git::git_commit_amend(repo, summary, description) {
                    Ok(res) => make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/cherryPick" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let hash = req.params["hash"].as_str().unwrap_or_default().to_string();
                match git::git_cherry_pick(repo, hash) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/blame" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                match git::git_blame(repo, path) {
                    Ok(blame) => make_success(id.clone(), serde_json::to_value(blame).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/stageHunk" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let patch = req.params["patch"].as_str().unwrap_or_default().to_string();
                match git::git_stage_hunk(repo, patch) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }
            "git/conflictResolve" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                let resolution = req.params["resolution"].as_str().unwrap_or_default().to_string();
                match git::git_conflict_resolve(repo, path, resolution) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32001, e),
                }
            }

            // LSP
            "lsp/startServer" => {
                let language = req.params["language"].as_str().unwrap_or_default().to_string();
                let root_path = req.params["rootPath"].as_str().unwrap_or_default().to_string();
                match state.lsp_manager.start_server(language, root_path, notif_tx.clone()).await {
                    Ok(server_id) => make_success(id.clone(), serde_json::json!({ "serverId": server_id })),
                    Err(e) => make_error(id.clone(), -32003, e),
                }
            }
            "lsp/sendRequest" => {
                let server_id = req.params["serverId"].as_str().unwrap_or_default().to_string();
                let method = req.params["method"].as_str().unwrap_or_default().to_string();
                let params = req.params["params"].clone();
                match state.lsp_manager.send_request(server_id, method, params).await {
                    Ok(val) => make_success(id.clone(), val),
                    Err(e) => make_error(id.clone(), -32003, e),
                }
            }
            "lsp/sendNotification" => {
                let server_id = req.params["serverId"].as_str().unwrap_or_default().to_string();
                let method = req.params["method"].as_str().unwrap_or_default().to_string();
                let params = req.params["params"].clone();
                match state.lsp_manager.send_notification(server_id, method, params).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32003, e),
                }
            }
            "lsp/stopServer" => {
                let server_id = req.params["serverId"].as_str().unwrap_or_default().to_string();
                match state.lsp_manager.stop_server(server_id).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32003, e),
                }
            }

            // Agent
            "agent/spawnTask" => {
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let prompt = req.params["prompt"].as_str().unwrap_or_default().to_string();
                let root_path = req.params["rootPath"].as_str().unwrap_or_default().to_string();
                match agent::spawn_agent_task(&state, name, prompt, root_path) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32603, e),
                }
            }
            "agent/getTasks" => {
                match agent::get_agent_tasks(&state) {
                    Ok(tasks) => make_success(id.clone(), serde_json::to_value(tasks).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32603, e),
                }
            }

            // GitHub
            "github/status" => {
                match github::gh_status(&state).await {
                    Ok(st) => make_success(id.clone(), serde_json::to_value(st).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/setPat" => {
                let token = req.params["token"].as_str().unwrap_or_default().to_string();
                match github::gh_set_pat(&state, token).await {
                    Ok(usr) => make_success(id.clone(), serde_json::to_value(usr).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/switch" => {
                let login = req.params["username"].as_str().unwrap_or_default().to_string();
                match github::gh_switch(&state, login) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/logout" => {
                let login = req.params["username"].as_str().map(String::from);
                match github::gh_logout(&state, login) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/deviceStart" => {
                let client_id = req.params["clientId"].as_str().unwrap_or("Iv1.b507a08c87ec2d81").to_string();
                match github::gh_device_start(client_id).await {
                    Ok(dc) => make_success(id.clone(), serde_json::to_value(dc).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/devicePoll" => {
                let client_id = req.params["clientId"].as_str().unwrap_or("Iv1.b507a08c87ec2d81").to_string();
                let device_code = req.params["deviceCode"].as_str().unwrap_or_default().to_string();
                match github::gh_device_poll(&state, client_id, device_code).await {
                    Ok(res) => make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/remoteInfo" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                let res = github::gh_remote_info(repo);
                make_success(id.clone(), serde_json::to_value(res).unwrap_or(Value::Null))
            }
            "github/push" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                match github::gh_push(repo).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/pull" => {
                let repo = req.params["repo"].as_str().unwrap_or_default().to_string();
                match github::gh_pull(repo).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prForBranch" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let branch = req.params["branch"].as_str().unwrap_or_default().to_string();
                match github::gh_pr_for_branch(&state, owner, name, branch).await {
                    Ok(pr) => make_success(id.clone(), serde_json::to_value(pr).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prReviews" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                match github::gh_pr_reviews(&state, owner, name, number).await {
                    Ok(rev) => make_success(id.clone(), serde_json::to_value(rev).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/listPrs" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                match github::gh_list_prs(&state, owner, name).await {
                    Ok(prs) => make_success(id.clone(), serde_json::to_value(prs).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/createPr" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let head = req.params["head"].as_str().unwrap_or_default().to_string();
                let base = req.params["base"].as_str().unwrap_or_default().to_string();
                let title = req.params["title"].as_str().unwrap_or_default().to_string();
                let body = req.params["body"].as_str().map(String::from);
                match github::gh_create_pr(&state, owner, name, head, base, title, body).await {
                    Ok(pr) => make_success(id.clone(), serde_json::to_value(pr).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prDetail" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                match github::gh_pr_detail(&state, owner, name, number).await {
                    Ok(detail) => make_success(id.clone(), serde_json::to_value(detail).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prFiles" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                match github::gh_pr_files(&state, owner, name, number).await {
                    Ok(files) => make_success(id.clone(), serde_json::to_value(files).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prReplyThread" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                let comment_id = req.params["commentId"].as_u64().unwrap_or(0);
                let body = req.params["body"].as_str().unwrap_or_default().to_string();
                match github::gh_pr_reply_thread(&state, owner, name, number, comment_id, body).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prResolveThread" => {
                let thread_id = req.params["threadId"].as_str().unwrap_or_default().to_string();
                let resolved = req.params["resolved"].as_bool().unwrap_or(true);
                match github::gh_pr_resolve_thread(&state, thread_id, resolved).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prComment" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                let body = req.params["body"].as_str().unwrap_or_default().to_string();
                match github::gh_pr_comment(&state, owner, name, number, body).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prMerge" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                let method = req.params["method"].as_str().unwrap_or("merge").to_string();
                match github::gh_pr_merge(&state, owner, name, number, method).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/issuesList" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                match github::gh_issues_list(&state, owner, name).await {
                    Ok(issues) => make_success(id.clone(), serde_json::to_value(issues).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prMarkReady" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let number = req.params["number"].as_u64().unwrap_or(0);
                match github::gh_pr_mark_ready(&state, owner, name, number).await {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/workflowRuns" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let branch = req.params["branch"].as_str().map(String::from);
                match github::gh_workflow_runs(&state, owner, name, branch).await {
                    Ok(runs) => make_success(id.clone(), serde_json::to_value(runs).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/workflowJobs" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let run_id = req.params["runId"].as_u64().unwrap_or(0);
                match github::gh_workflow_jobs(&state, owner, name, run_id).await {
                    Ok(jobs) => make_success(id.clone(), serde_json::to_value(jobs).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/jobLog" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let job_id = req.params["jobId"].as_u64().unwrap_or(0);
                match github::gh_job_log(&state, owner, name, job_id).await {
                    Ok(log_text) => make_success(id.clone(), serde_json::Value::String(log_text)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }
            "github/prChecks" => {
                let owner = req.params["owner"].as_str().unwrap_or_default().to_string();
                let name = req.params["name"].as_str().unwrap_or_default().to_string();
                let sha = req.params["sha"].as_str().unwrap_or_default().to_string();
                match github::gh_pr_checks(&state, owner, name, sha).await {
                    Ok(summary) => make_success(id.clone(), serde_json::to_value(summary).unwrap_or(Value::Null)),
                    Err(e) => make_error(id.clone(), -32004, e),
                }
            }

            // Recent Folders Persistence
            "store/addRecentFolder" => {
                let path = req.params["path"].as_str().unwrap_or_default().to_string();
                let mut s = state.store.lock().unwrap();
                s.recent_folders.retain(|p| p != &path);
                s.recent_folders.insert(0, path);
                s.recent_folders.truncate(10);
                match store::save(&s) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }
            "store/clearRecentFolders" => {
                let mut s = state.store.lock().unwrap();
                s.recent_folders.clear();
                match store::save(&s) {
                    Ok(()) => make_success(id.clone(), Value::Null),
                    Err(e) => make_error(id.clone(), -32000, e),
                }
            }

            _ => make_error(id.clone(), -32601, format!("Method not found: {}", req.method)),
        };

        send_response(&resp);
    }

    eprintln!("[aster-core] Stdio closed. Shutting down.");
    Ok(())
}

fn send_response(resp: &JsonRpcResponse) {
    if let Ok(json_str) = serde_json::to_string(resp) {
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(stdout, "{}", json_str);
        let _ = stdout.flush();
    }
}
