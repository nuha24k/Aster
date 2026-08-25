use super::client::{api_get, http, require_token};
use super::types::{GhIssue, WorkflowJob, WorkflowRun};
use crate::state::ServerState;

pub async fn gh_issues_list(
    state: &ServerState,
    owner: String,
    name: String,
) -> Result<Vec<GhIssue>, String> {
    let token = require_token(state)?;
    let body = api_get(
        &token,
        &format!("/repos/{owner}/{name}/issues?state=open&per_page=30&pulls=false"),
    )
    .await?;
    Ok(body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|i| i["pull_request"].is_null())
                .map(|i| GhIssue {
                    number: i["number"].as_u64().unwrap_or(0),
                    title: i["title"].as_str().unwrap_or_default().to_string(),
                    state: i["state"].as_str().unwrap_or_default().to_string(),
                    body: i["body"].as_str().unwrap_or_default().to_string(),
                    author: i["user"]["login"].as_str().unwrap_or_default().to_string(),
                    created_at: i["created_at"].as_str().unwrap_or_default().to_string(),
                    html_url: i["html_url"].as_str().unwrap_or_default().to_string(),
                    labels: i["labels"]
                        .as_array()
                        .map(|ls| {
                            ls.iter()
                                .filter_map(|l| l["name"].as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default(),
                    comments: i["comments"].as_u64().unwrap_or(0),
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn gh_workflow_runs(
    state: &ServerState,
    owner: String,
    name: String,
    branch: Option<String>,
) -> Result<Vec<WorkflowRun>, String> {
    let token = require_token(state)?;
    let branch_q = branch
        .as_deref()
        .map(|b| format!("&branch={b}"))
        .unwrap_or_default();
    let body = api_get(
        &token,
        &format!("/repos/{owner}/{name}/actions/runs?per_page=10{branch_q}"),
    )
    .await?;
    Ok(body["workflow_runs"]
        .as_array()
        .map(|runs| {
            runs.iter()
                .map(|r| WorkflowRun {
                    id: r["id"].as_u64().unwrap_or(0),
                    name: r["name"].as_str().unwrap_or_default().to_string(),
                    status: r["status"].as_str().unwrap_or_default().to_string(),
                    conclusion: r["conclusion"].as_str().map(String::from),
                    created_at: r["created_at"].as_str().unwrap_or_default().to_string(),
                    html_url: r["html_url"].as_str().unwrap_or_default().to_string(),
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn gh_workflow_jobs(
    state: &ServerState,
    owner: String,
    name: String,
    run_id: u64,
) -> Result<Vec<WorkflowJob>, String> {
    let token = require_token(state)?;
    let body = api_get(
        &token,
        &format!("/repos/{owner}/{name}/actions/runs/{run_id}/jobs?per_page=30"),
    )
    .await?;
    Ok(body["jobs"]
        .as_array()
        .map(|jobs| {
            jobs.iter()
                .map(|j| WorkflowJob {
                    id: j["id"].as_u64().unwrap_or(0),
                    name: j["name"].as_str().unwrap_or_default().to_string(),
                    status: j["status"].as_str().unwrap_or_default().to_string(),
                    conclusion: j["conclusion"].as_str().map(String::from),
                    started_at: j["started_at"].as_str().map(String::from),
                    completed_at: j["completed_at"].as_str().map(String::from),
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn gh_job_log(
    state: &ServerState,
    owner: String,
    name: String,
    job_id: u64,
) -> Result<String, String> {
    let token = require_token(state)?;
    let text = http()
        .get(format!("{}/repos/{owner}/{name}/actions/jobs/{job_id}/logs", super::client::API))
        .bearer_auth(&token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("github: {e}"))?
        .text()
        .await
        .map_err(|e| format!("github log: {e}"))?;
    let clean = strip_ansi(&text);
    let lines: Vec<&str> = clean.lines().collect();
    let start = lines.len().saturating_sub(200);
    Ok(lines[start..].join("\n"))
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}
