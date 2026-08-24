use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{oneshot, Mutex as TokioMutex};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LspNotificationPayload {
    pub server_id: String,
    pub method: String,
    pub params: Value,
}

pub struct ActiveLspServer {
    pub server_id: String,
    pub language: String,
    pub root_path: String,
    pub stdin: Arc<TokioMutex<ChildStdin>>,
    pub pending_requests: Arc<TokioMutex<HashMap<i64, oneshot::Sender<Value>>>>,
    pub request_id_counter: AtomicI64,
    pub _child: TokioMutex<Child>,
}

pub struct LspState {
    pub servers: Arc<TokioMutex<HashMap<String, Arc<ActiveLspServer>>>>,
}

impl LspState {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }
}

fn is_command_available(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    let mut check = std::process::Command::new("where");
    #[cfg(not(target_os = "windows"))]
    let mut check = std::process::Command::new("which");
    check.arg(cmd).output().map(|out| out.status.success()).unwrap_or(false)
}

fn get_lsp_command(language: &str) -> Option<(String, Vec<String>)> {
    match language.to_lowercase().as_str() {
        "typescript" | "javascript" | "typescriptreact" | "javascriptreact" | "tsx" | "jsx" => {
            // Check for vtsls or typescript-language-server
            if is_command_available("vtsls") {
                Some(("vtsls".into(), vec!["--stdio".into()]))
            } else if is_command_available("typescript-language-server") {
                Some(("typescript-language-server".into(), vec!["--stdio".into()]))
            } else if is_command_available("npx") {
                Some(("npx".into(), vec!["typescript-language-server".into(), "--stdio".into()]))
            } else {
                None
            }
        }
        "rust" | "rs" => {
            if is_command_available("rust-analyzer") {
                Some(("rust-analyzer".into(), vec![]))
            } else {
                None
            }
        }
        "python" | "py" => {
            if is_command_available("pyright-langserver") {
                Some(("pyright-langserver".into(), vec!["--stdio".into()]))
            } else if is_command_available("pylsp") {
                Some(("pylsp".into(), vec![]))
            } else {
                None
            }
        }
        "go" => {
            if is_command_available("gopls") {
                Some(("gopls".into(), vec![]))
            } else {
                None
            }
        }
        "json" => {
            if is_command_available("vscode-json-languageserver") {
                Some(("vscode-json-languageserver".into(), vec!["--stdio".into()]))
            } else {
                None
            }
        }
        _ => None,
    }
}

#[tauri::command]
pub async fn lsp_start_server(
    language: String,
    root_path: String,
    app: AppHandle,
    state: tauri::State<'_, LspState>,
) -> Result<String, String> {
    let server_id = format!("{}_{}", language, root_path.replace(['/', '\\'], "_"));

    let mut servers_guard = state.servers.lock().await;
    if servers_guard.contains_key(&server_id) {
        return Ok(server_id);
    }

    let (cmd, args) = get_lsp_command(&language).ok_or_else(|| {
        format!("No language server binary found on PATH for '{}'", language)
    })?;

    let mut child = tokio::process::Command::new(cmd)
        .args(args)
        .current_dir(&root_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn LSP process: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to open stdin for LSP process")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout for LSP process")?;

    let pending_requests = Arc::new(TokioMutex::new(HashMap::<i64, oneshot::Sender<Value>>::new()));
    let pending_clone = pending_requests.clone();
    let server_id_clone = server_id.clone();
    let app_handle = app.clone();

    // Background task to read JSON-RPC messages from LSP stdout
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut content_length: Option<usize> = None;
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line).await {
                    Ok(0) => return, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            break; // End of HTTP headers
                        }
                        if trimmed.to_lowercase().starts_with("content-length:") {
                            if let Some(val_str) = trimmed.split(':').nth(1) {
                                if let Ok(len) = val_str.trim().parse::<usize>() {
                                    content_length = Some(len);
                                }
                            }
                        }
                    }
                    Err(_) => return,
                }
            }

            if let Some(len) = content_length {
                let mut buf = vec![0u8; len];
                if reader.read_exact(&mut buf).await.is_ok() {
                    if let Ok(val) = serde_json::from_slice::<Value>(&buf) {
                        if let Some(id) = val.get("id").and_then(|v| v.as_i64()) {
                            let mut pending = pending_clone.lock().await;
                            if let Some(tx) = pending.remove(&id) {
                                let _ = tx.send(val);
                            }
                        } else if let Some(method) = val.get("method").and_then(|v| v.as_str()) {
                            let params = val.get("params").cloned().unwrap_or(Value::Null);
                            let _ = app_handle.emit(
                                "lsp_notification",
                                LspNotificationPayload {
                                    server_id: server_id_clone.clone(),
                                    method: method.to_string(),
                                    params,
                                },
                            );
                        }
                    }
                }
            }
        }
    });

    let active_server = Arc::new(ActiveLspServer {
        server_id: server_id.clone(),
        language,
        root_path,
        stdin: Arc::new(TokioMutex::new(stdin)),
        pending_requests,
        request_id_counter: AtomicI64::new(1),
        _child: TokioMutex::new(child),
    });

    servers_guard.insert(server_id.clone(), active_server.clone());
    drop(servers_guard);

    // Send LSP initialize request
    let root_uri = format!("file://{}", active_server.root_path.replace('\\', "/"));
    let init_params = serde_json::json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {
            "textDocument": {
                "hover": { "dynamicRegistration": false, "contentFormat": ["markdown", "plaintext"] },
                "completion": { "completionItem": { "snippetSupport": true } },
                "definition": { "dynamicRegistration": false },
                "publishDiagnostics": { "relatedInformation": true }
            }
        }
    });

    let _ = lsp_send_request(server_id.clone(), "initialize".into(), init_params, state.clone()).await;
    let _ = lsp_send_notification(server_id.clone(), "initialized".into(), serde_json::json!({}), state.clone()).await;

    Ok(server_id)
}

#[tauri::command]
pub async fn lsp_send_request(
    server_id: String,
    method: String,
    params: Value,
    state: tauri::State<'_, LspState>,
) -> Result<Value, String> {
    let server = {
        let guard = state.servers.lock().await;
        guard.get(&server_id).cloned().ok_or_else(|| format!("LSP server '{}' not found", server_id))?
    };

    let id = server.request_id_counter.fetch_add(1, Ordering::SeqCst);
    let req_obj = serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });

    let (tx, rx) = oneshot::channel();
    {
        let mut pending = server.pending_requests.lock().await;
        pending.insert(id, tx);
    }

    let body_str = serde_json::to_string(&req_obj).map_err(|e| e.to_string())?;
    let header = format!("Content-Length: {}\r\n\r\n", body_str.len());

    {
        let mut stdin = server.stdin.lock().await;
        stdin.write_all(header.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.write_all(body_str.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
    }

    match tokio::time::timeout(std::time::Duration::from_secs(10), rx).await {
        Ok(Ok(res)) => Ok(res),
        Ok(Err(_)) => Err("Response channel closed".to_string()),
        Err(_) => {
            let mut pending = server.pending_requests.lock().await;
            pending.remove(&id);
            Err("LSP request timed out".to_string())
        }
    }
}

#[tauri::command]
pub async fn lsp_send_notification(
    server_id: String,
    method: String,
    params: Value,
    state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let server = {
        let guard = state.servers.lock().await;
        guard.get(&server_id).cloned().ok_or_else(|| format!("LSP server '{}' not found", server_id))?
    };

    let notif_obj = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });

    let body_str = serde_json::to_string(&notif_obj).map_err(|e| e.to_string())?;
    let header = format!("Content-Length: {}\r\n\r\n", body_str.len());

    let mut stdin = server.stdin.lock().await;
    stdin.write_all(header.as_bytes()).await.map_err(|e| e.to_string())?;
    stdin.write_all(body_str.as_bytes()).await.map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn lsp_stop_server(
    server_id: String,
    state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let mut guard = state.servers.lock().await;
    if let Some(server) = guard.remove(&server_id) {
        let _ = lsp_send_request(server_id.clone(), "shutdown".into(), serde_json::json!({}), state.clone()).await;
        let _ = lsp_send_notification(server_id, "exit".into(), serde_json::json!({}), state.clone()).await;
        let mut child = server._child.lock().await;
        let _ = child.kill().await;
    }
    Ok(())
}
