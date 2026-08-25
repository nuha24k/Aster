use super::client::{api_get, entry_for, http, parse_user, register_account, token_for};
use super::types::{DeviceCode, GhStatus, GhUser, PollResult};
use crate::state::ServerState;
use crate::store;
use serde_json::json;

pub async fn gh_status(state: &ServerState) -> Result<GhStatus, String> {
    let (accounts, active) = {
        let persisted = state.store.lock().map_err(|e| e.to_string())?;
        (persisted.gh_accounts.clone(), persisted.gh_active.clone())
    };
    let user = match active.as_deref().and_then(token_for) {
        Some(token) => api_get(&token, "/user").await.ok().map(|v| parse_user(&v)),
        None => None,
    };
    Ok(GhStatus { user, accounts, active })
}

pub async fn gh_set_pat(state: &ServerState, token: String) -> Result<GhUser, String> {
    let user = api_get(&token, "/user").await?;
    let parsed = parse_user(&user);
    register_account(state, &parsed.login, &token)?;
    Ok(parsed)
}

pub fn gh_switch(state: &ServerState, login: String) -> Result<(), String> {
    let mut persisted = state.store.lock().map_err(|e| e.to_string())?;
    if !persisted.gh_accounts.iter().any(|a| a == &login) {
        return Err(format!("unknown account: {login}"));
    }
    persisted.gh_active = Some(login);
    store::save(&persisted)
}

pub fn gh_logout(state: &ServerState, login: Option<String>) -> Result<(), String> {
    let mut persisted = state.store.lock().map_err(|e| e.to_string())?;
    let Some(target) = login.or_else(|| persisted.gh_active.clone()) else {
        return Ok(());
    };
    if let Ok(entry) = entry_for(&target) {
        let _ = entry.delete_credential();
    }
    persisted.gh_accounts.retain(|a| a != &target);
    if persisted.gh_active.as_deref() == Some(&target) {
        persisted.gh_active = persisted.gh_accounts.first().cloned();
    }
    store::save(&persisted)
}

pub async fn gh_device_start(client_id: String) -> Result<DeviceCode, String> {
    #[derive(serde::Deserialize)]
    struct Resp {
        device_code: String,
        user_code: String,
        verification_uri: String,
        interval: u64,
        expires_in: u64,
    }
    let resp: Resp = http()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .json(&json!({ "client_id": client_id, "scope": "repo" }))
        .send()
        .await
        .map_err(|e| format!("github: {e}"))?
        .json()
        .await
        .map_err(|e| format!("github device flow: {e}"))?;
    Ok(DeviceCode {
        device_code: resp.device_code,
        user_code: resp.user_code,
        verification_uri: resp.verification_uri,
        interval: resp.interval,
        expires_in: resp.expires_in,
    })
}

pub async fn gh_device_poll(
    state: &ServerState,
    client_id: String,
    device_code: String,
) -> Result<PollResult, String> {
    let body: serde_json::Value = http()
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&json!({
            "client_id": client_id,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
        }))
        .send()
        .await
        .map_err(|e| format!("github: {e}"))?
        .json()
        .await
        .map_err(|e| format!("github: {e}"))?;

    if let Some(token) = body["access_token"].as_str() {
        let user = api_get(token, "/user").await?;
        let parsed = parse_user(&user);
        register_account(state, &parsed.login, token)?;
        return Ok(PollResult { status: "ok".into(), user: Some(parsed) });
    }
    let status = match body["error"].as_str() {
        Some("authorization_pending") => "pending",
        Some("slow_down") => "slow_down",
        Some("expired_token") => "expired",
        Some("access_denied") => "denied",
        other => {
            return Err(format!(
                "github device flow: {}",
                other.unwrap_or("unknown error")
            ));
        }
    };
    Ok(PollResult { status: status.into(), user: None })
}
