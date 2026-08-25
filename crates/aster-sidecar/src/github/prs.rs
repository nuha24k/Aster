use super::client::{api_get, api_post, api_put, graphql, require_token};
use super::types::{CheckRun, CheckSummary, Pr, PrDetail, PrFile, ReviewThread, ThreadComment, TimelineItem};
use crate::state::ServerState;
use serde::Serialize;
use serde_json::json;

fn parse_pr(v: &serde_json::Value) -> Pr {
    Pr {
        number: v["number"].as_u64().unwrap_or(0),
        title: v["title"].as_str().unwrap_or_default().to_string(),
        state: v["state"].as_str().unwrap_or_default().to_string(),
        draft: v["draft"].as_bool().unwrap_or(false),
        head_ref: v["head"]["ref"].as_str().unwrap_or_default().to_string(),
        base_ref: v["base"]["ref"].as_str().unwrap_or_default().to_string(),
        head_sha: v["head"]["sha"].as_str().unwrap_or_default().to_string(),
        html_url: v["html_url"].as_str().unwrap_or_default().to_string(),
        author: v["user"]["login"].as_str().unwrap_or_default().to_string(),
        created_at: v["created_at"].as_str().unwrap_or_default().to_string(),
    }
}

pub async fn gh_pr_for_branch(
    state: &ServerState,
    owner: String,
    name: String,
    branch: String,
) -> Result<Option<Pr>, String> {
    let token = require_token(state)?;
    let body = api_get(
        &token,
        &format!("/repos/{owner}/{name}/pulls?head={owner}:{branch}&state=open"),
    )
    .await?;
    Ok(body.as_array().and_then(|prs| prs.first()).map(parse_pr))
}

#[derive(Serialize, Clone, Default, Debug)]
pub struct ReviewSummary {
    pub approved: u64,
    pub changes_requested: u64,
    pub commented: u64,
}

pub async fn gh_pr_reviews(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
) -> Result<ReviewSummary, String> {
    let token = require_token(state)?;
    let body = api_get(
        &token,
        &format!("/repos/{owner}/{name}/pulls/{number}/reviews?per_page=100"),
    )
    .await?;

    let mut decisive: std::collections::HashMap<String, &str> = std::collections::HashMap::new();
    let mut commenters: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Some(reviews) = body.as_array() {
        for review in reviews {
            let user = review["user"]["login"].as_str().unwrap_or_default().to_string();
            match review["state"].as_str() {
                Some("APPROVED") => {
                    decisive.insert(user, "approved");
                }
                Some("CHANGES_REQUESTED") => {
                    decisive.insert(user, "changes");
                }
                Some("COMMENTED") => {
                    commenters.insert(user);
                }
                _ => {}
            }
        }
    }
    Ok(ReviewSummary {
        approved: decisive.values().filter(|s| **s == "approved").count() as u64,
        changes_requested: decisive.values().filter(|s| **s == "changes").count() as u64,
        commented: commenters.iter().filter(|u| !decisive.contains_key(*u)).count() as u64,
    })
}

pub async fn gh_list_prs(
    state: &ServerState,
    owner: String,
    name: String,
) -> Result<Vec<Pr>, String> {
    let token = require_token(state)?;
    let body = api_get(&token, &format!("/repos/{owner}/{name}/pulls?state=open&per_page=30")).await?;
    Ok(body.as_array().map(|prs| prs.iter().map(parse_pr).collect()).unwrap_or_default())
}

pub async fn gh_create_pr(
    state: &ServerState,
    owner: String,
    name: String,
    head: String,
    base: String,
    title: String,
    body: Option<String>,
) -> Result<Pr, String> {
    let token = require_token(state)?;
    let pr = api_post(
        &token,
        &format!("/repos/{owner}/{name}/pulls"),
        json!({ "head": head, "base": base, "title": title, "body": body.unwrap_or_default() }),
    )
    .await?;
    Ok(parse_pr(&pr))
}

const THREADS_QUERY: &str = r#"
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50) {
        nodes {
          id isResolved isOutdated path line
          comments(first: 50) {
            nodes {
              databaseId body createdAt diffHunk authorAssociation
              author { login avatarUrl }
            }
          }
        }
      }
    }
  }
}"#;

async fn fetch_threads(token: &str, owner: &str, name: &str, number: u64) -> Vec<ReviewThread> {
    let Ok(data) = graphql(
        token,
        THREADS_QUERY,
        json!({ "owner": owner, "name": name, "number": number }),
    )
    .await
    else {
        return Vec::new();
    };
    let mut threads = Vec::new();
    let nodes = data["repository"]["pullRequest"]["reviewThreads"]["nodes"].clone();
    if let Some(list) = nodes.as_array() {
        for t in list {
            let mut comments = Vec::new();
            if let Some(cs) = t["comments"]["nodes"].as_array() {
                for c in cs {
                    comments.push(ThreadComment {
                        id: c["databaseId"].as_u64().unwrap_or(0),
                        author: c["author"]["login"].as_str().unwrap_or_default().to_string(),
                        avatar_url: c["author"]["avatarUrl"].as_str().map(String::from),
                        association: c["authorAssociation"].as_str().map(String::from),
                        body: c["body"].as_str().unwrap_or_default().to_string(),
                        created_at: c["createdAt"].as_str().unwrap_or_default().to_string(),
                        diff_hunk: c["diffHunk"].as_str().map(String::from),
                    });
                }
            }
            threads.push(ReviewThread {
                id: t["id"].as_str().unwrap_or_default().to_string(),
                resolved: t["isResolved"].as_bool().unwrap_or(false),
                outdated: t["isOutdated"].as_bool().unwrap_or(false),
                path: t["path"].as_str().unwrap_or_default().to_string(),
                line: t["line"].as_u64(),
                comments,
            });
        }
    }
    threads
}

fn parse_timeline(items: &serde_json::Value) -> Vec<TimelineItem> {
    let mut timeline = Vec::new();
    let Some(list) = items.as_array() else { return timeline };
    for item in list {
        let event = item["event"].as_str().unwrap_or_default();
        match event {
            "commented" => timeline.push(TimelineItem {
                kind: "comment".into(),
                author: item["user"]["login"].as_str().unwrap_or_default().to_string(),
                avatar_url: item["user"]["avatar_url"].as_str().map(String::from),
                association: item["author_association"].as_str().map(String::from),
                body: item["body"].as_str().unwrap_or_default().to_string(),
                created_at: item["created_at"].as_str().unwrap_or_default().to_string(),
                sha: None,
                review_state: None,
                event: None,
            }),
            "reviewed" => {
                let review_state = item["state"].as_str().unwrap_or_default().to_string();
                let body = item["body"].as_str().unwrap_or_default().to_string();
                if body.is_empty() && review_state == "commented" {
                    continue;
                }
                timeline.push(TimelineItem {
                    kind: "review".into(),
                    author: item["user"]["login"].as_str().unwrap_or_default().to_string(),
                    avatar_url: item["user"]["avatar_url"].as_str().map(String::from),
                    association: item["author_association"].as_str().map(String::from),
                    body,
                    created_at: item["submitted_at"].as_str().unwrap_or_default().to_string(),
                    sha: None,
                    review_state: Some(review_state),
                    event: None,
                });
            }
            "committed" => timeline.push(TimelineItem {
                kind: "commit".into(),
                author: item["author"]["name"].as_str().unwrap_or_default().to_string(),
                avatar_url: None,
                association: None,
                body: item["message"]
                    .as_str()
                    .unwrap_or_default()
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_string(),
                created_at: item["author"]["date"].as_str().unwrap_or_default().to_string(),
                sha: item["sha"].as_str().map(|s| s.get(..7).unwrap_or(s).to_string()),
                review_state: None,
                event: None,
            }),
            "merged" | "closed" | "reopened" | "review_requested" | "head_ref_force_pushed" => {
                timeline.push(TimelineItem {
                    kind: "event".into(),
                    author: item["actor"]["login"].as_str().unwrap_or_default().to_string(),
                    avatar_url: item["actor"]["avatar_url"].as_str().map(String::from),
                    association: None,
                    body: item["requested_reviewer"]["login"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string(),
                    created_at: item["created_at"].as_str().unwrap_or_default().to_string(),
                    sha: None,
                    review_state: None,
                    event: Some(event.to_string()),
                });
            }
            _ => {}
        }
    }
    timeline.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    timeline
}

pub async fn gh_pr_detail(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
) -> Result<PrDetail, String> {
    let token = require_token(state)?;
    let base = format!("/repos/{owner}/{name}");

    let pr = api_get(&token, &format!("{base}/pulls/{number}")).await?;
    let timeline_raw = api_get(
        &token,
        &format!("{base}/issues/{number}/timeline?per_page=100"),
    )
    .await
    .unwrap_or_default();
    let threads = fetch_threads(&token, &owner, &name, number).await;
    let sha = pr["head"]["sha"].as_str().unwrap_or_default().to_string();
    let check_runs = api_get(&token, &format!("{base}/commits/{sha}/check-runs?per_page=100"))
        .await
        .unwrap_or_default();

    let mut checks: Vec<CheckRun> = Vec::new();
    if let Some(runs) = check_runs["check_runs"].as_array() {
        for run in runs {
            checks.push(CheckRun {
                name: run["name"].as_str().unwrap_or_default().to_string(),
                status: run["status"].as_str().unwrap_or_default().to_string(),
                conclusion: run["conclusion"].as_str().map(String::from),
                url: run["html_url"].as_str().map(String::from),
            });
        }
    }

    Ok(PrDetail {
        number,
        title: pr["title"].as_str().unwrap_or_default().to_string(),
        body: pr["body"].as_str().unwrap_or_default().to_string(),
        state: pr["state"].as_str().unwrap_or_default().to_string(),
        merged: pr["merged"].as_bool().unwrap_or(false),
        mergeable: pr["mergeable"].as_bool(),
        draft: pr["draft"].as_bool().unwrap_or(false),
        head_ref: pr["head"]["ref"].as_str().unwrap_or_default().to_string(),
        base_ref: pr["base"]["ref"].as_str().unwrap_or_default().to_string(),
        head_sha: sha,
        author: pr["user"]["login"].as_str().unwrap_or_default().to_string(),
        author_avatar: pr["user"]["avatar_url"].as_str().map(String::from),
        html_url: pr["html_url"].as_str().unwrap_or_default().to_string(),
        additions: pr["additions"].as_u64().unwrap_or(0),
        deletions: pr["deletions"].as_u64().unwrap_or(0),
        commits: pr["commits"].as_u64().unwrap_or(0),
        changed_files: pr["changed_files"].as_u64().unwrap_or(0),
        timeline: parse_timeline(&timeline_raw),
        threads,
        checks,
    })
}

pub async fn gh_pr_files(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
) -> Result<Vec<PrFile>, String> {
    let token = require_token(state)?;
    let body = api_get(
        &token,
        &format!("/repos/{owner}/{name}/pulls/{number}/files?per_page=100"),
    )
    .await?;
    Ok(body
        .as_array()
        .map(|files| {
            files
                .iter()
                .map(|f| PrFile {
                    filename: f["filename"].as_str().unwrap_or_default().to_string(),
                    status: f["status"].as_str().unwrap_or_default().to_string(),
                    additions: f["additions"].as_u64().unwrap_or(0),
                    deletions: f["deletions"].as_u64().unwrap_or(0),
                    patch: f["patch"].as_str().map(String::from),
                })
                .collect()
        })
        .unwrap_or_default())
}

pub async fn gh_pr_reply_thread(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
    comment_id: u64,
    body: String,
) -> Result<(), String> {
    let token = require_token(state)?;
    api_post(
        &token,
        &format!("/repos/{owner}/{name}/pulls/{number}/comments"),
        json!({ "body": body, "in_reply_to": comment_id }),
    )
    .await
    .map(|_| ())
}

pub async fn gh_pr_resolve_thread(
    state: &ServerState,
    thread_id: String,
    resolved: bool,
) -> Result<(), String> {
    let token = require_token(state)?;
    let mutation = if resolved {
        "mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { isResolved } } }"
    } else {
        "mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { isResolved } } }"
    };
    graphql(&token, mutation, json!({ "id": thread_id })).await.map(|_| ())
}

pub async fn gh_pr_comment(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
    body: String,
) -> Result<(), String> {
    let token = require_token(state)?;
    api_post(
        &token,
        &format!("/repos/{owner}/{name}/issues/{number}/comments"),
        json!({ "body": body }),
    )
    .await
    .map(|_| ())
}

pub async fn gh_pr_merge(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
    method: String,
) -> Result<(), String> {
    let token = require_token(state)?;
    api_put(
        &token,
        &format!("/repos/{owner}/{name}/pulls/{number}/merge"),
        json!({ "merge_method": method }),
    )
    .await
    .map(|_| ())
}

pub async fn gh_pr_mark_ready(
    state: &ServerState,
    owner: String,
    name: String,
    number: u64,
) -> Result<(), String> {
    let token = require_token(state)?;
    let pr = api_get(&token, &format!("/repos/{owner}/{name}/pulls/{number}")).await?;
    let node_id = pr["node_id"].as_str().unwrap_or_default();
    let mutation = r#"
mutation($id: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $id }) {
    pullRequest { isDraft }
  }
}"#;
    graphql(&token, mutation, json!({ "id": node_id }))
        .await
        .map(|_| ())
}

pub async fn gh_pr_checks(
    state: &ServerState,
    owner: String,
    name: String,
    sha: String,
) -> Result<CheckSummary, String> {
    let token = require_token(state)?;
    let body = api_get(&token, &format!("/repos/{owner}/{name}/commits/{sha}/check-runs?per_page=100")).await?;
    let mut summary = CheckSummary { total: 0, passed: 0, failed: 0, pending: 0 };
    if let Some(runs) = body["check_runs"].as_array() {
        for run in runs {
            summary.total += 1;
            match run["conclusion"].as_str() {
                Some("success") | Some("neutral") | Some("skipped") => summary.passed += 1,
                Some("failure") | Some("timed_out") | Some("cancelled") | Some("action_required") => {
                    summary.failed += 1;
                }
                _ => summary.pending += 1,
            }
        }
    }
    Ok(summary)
}
