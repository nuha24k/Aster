use super::types::RemoteInfo;
use std::process::Command;

fn parse_github_remote(url: &str) -> Option<RemoteInfo> {
    let rest = url
        .trim()
        .strip_prefix("git@github.com:")
        .or_else(|| url.trim().strip_prefix("https://github.com/"))
        .or_else(|| url.trim().strip_prefix("ssh://git@github.com/"))?;
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.splitn(2, '/');
    Some(RemoteInfo {
        owner: parts.next()?.to_string(),
        name: parts.next()?.trim_end_matches('/').to_string(),
    })
}

fn run_git(repo: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn gh_remote_info(repo: String) -> Option<RemoteInfo> {
    let url = run_git(&repo, &["remote", "get-url", "origin"]).ok()?;
    parse_github_remote(&url)
}

pub async fn gh_push(repo: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        run_git(&repo, &["push", "-u", "origin", "HEAD"]).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn gh_pull(repo: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || run_git(&repo, &["pull"]).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}
