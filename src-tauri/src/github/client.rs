use std::sync::OnceLock;
use serde_json::json;
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::store;
use super::types::GhUser;

pub const KEYRING_SERVICE: &str = "dev.aster.app";
pub const API: &str = "https://api.github.com";

pub fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("aster")
            .build()
            .expect("reqwest client")
    })
}

pub fn entry_for(login: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("github-token:{login}"))
        .map_err(|e| AppError::Pty(format!("keychain: {e}")))
}

pub fn token_for(login: &str) -> Option<String> {
    entry_for(login).ok()?.get_password().ok()
}

pub fn active_login(state: &AppState) -> Option<String> {
    state.store.lock().unwrap().gh_active.clone()
}

pub fn load_token(state: &AppState) -> Option<String> {
    token_for(&active_login(state)?)
}

pub fn require_token(state: &AppState) -> AppResult<String> {
    load_token(state).ok_or_else(|| AppError::Pty("not connected to GitHub".into()))
}

pub fn register_account(state: &AppState, login: &str, token: &str) -> AppResult<()> {
    entry_for(login)?
        .set_password(token)
        .map_err(|e| AppError::Pty(format!("keychain: {e}")))?;
    let mut persisted = state.store.lock().unwrap();
    if !persisted.gh_accounts.iter().any(|a| a == login) {
        persisted.gh_accounts.push(login.to_string());
    }
    persisted.gh_active = Some(login.to_string());
    store::save(&persisted)
}

pub fn parse_user(v: &serde_json::Value) -> GhUser {
    GhUser {
        login: v["login"].as_str().unwrap_or_default().to_string(),
        name: v["name"].as_str().map(String::from),
        avatar_url: v["avatar_url"].as_str().map(String::from),
    }
}

pub async fn api_get(token: &str, path: &str) -> AppResult<serde_json::Value> {
    let resp = http()
        .get(format!("{API}{path}"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("request failed");
        return Err(AppError::Pty(format!("github ({status}): {msg}")));
    }
    Ok(body)
}

pub async fn api_post(token: &str, path: &str, payload: serde_json::Value) -> AppResult<serde_json::Value> {
    let resp = http()
        .post(format!("{API}{path}"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    if !status.is_success() {
        let mut msg = body["message"].as_str().unwrap_or("request failed").to_string();
        if let Some(errors) = body["errors"].as_array() {
            for err in errors {
                if let Some(detail) = err["message"].as_str() {
                    msg.push_str(&format!(": {detail}"));
                }
            }
        }
        return Err(AppError::Pty(format!("github ({status}): {msg}")));
    }
    Ok(body)
}

pub async fn api_put(token: &str, path: &str, payload: serde_json::Value) -> AppResult<serde_json::Value> {
    let resp = http()
        .put(format!("{API}{path}"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("request failed");
        return Err(AppError::Pty(format!("github ({status}): {msg}")));
    }
    Ok(body)
}

pub async fn api_patch(token: &str, path: &str, payload: serde_json::Value) -> AppResult<serde_json::Value> {
    let resp = http()
        .patch(format!("{API}{path}"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Pty(format!("github: {e}")))?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("request failed");
        return Err(AppError::Pty(format!("github ({status}): {msg}")));
    }
    Ok(body)
}

pub async fn graphql(token: &str, query: &str, variables: serde_json::Value) -> AppResult<serde_json::Value> {
    let payload = json!({ "query": query, "variables": variables });
    let resp = http()
        .post(format!("{API}/graphql"))
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Pty(format!("github graphql: {e}")))?;
    let status = resp.status();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Pty(format!("github graphql: {e}")))?;
    if !status.is_success() {
        let msg = body["message"].as_str().unwrap_or("request failed");
        return Err(AppError::Pty(format!("github graphql ({status}): {msg}")));
    }
    if let Some(errs) = body["errors"].as_array() {
        if !errs.is_empty() {
            let msg = errs[0]["message"].as_str().unwrap_or("graphql error");
            return Err(AppError::Pty(format!("github graphql: {msg}")));
        }
    }
    Ok(body["data"].clone())
}
