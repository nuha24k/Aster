use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct GhUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GhStatus {
    pub user: Option<GhUser>,
    pub accounts: Vec<String>,
    pub active: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct PollResult {
    pub status: String,
    pub user: Option<GhUser>,
}

#[derive(Serialize, Clone, Debug)]
pub struct RemoteInfo {
    pub owner: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Pr {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub draft: bool,
    pub head_ref: String,
    pub base_ref: String,
    pub head_sha: String,
    pub html_url: String,
    pub author: String,
    pub created_at: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CheckSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub pending: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct TimelineItem {
    pub kind: String,
    pub author: String,
    pub avatar_url: Option<String>,
    pub association: Option<String>,
    pub body: String,
    pub created_at: String,
    pub sha: Option<String>,
    pub review_state: Option<String>,
    pub event: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ThreadComment {
    pub id: u64,
    pub author: String,
    pub avatar_url: Option<String>,
    pub association: Option<String>,
    pub body: String,
    pub created_at: String,
    pub diff_hunk: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ReviewThread {
    pub id: String,
    pub resolved: bool,
    pub outdated: bool,
    pub path: String,
    pub line: Option<u64>,
    pub comments: Vec<ThreadComment>,
}

#[derive(Serialize, Clone, Debug)]
pub struct CheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PrFile {
    pub filename: String,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub patch: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PrDetail {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub merged: bool,
    pub mergeable: Option<bool>,
    pub draft: bool,
    pub head_ref: String,
    pub base_ref: String,
    pub head_sha: String,
    pub author: String,
    pub author_avatar: Option<String>,
    pub html_url: String,
    pub additions: u64,
    pub deletions: u64,
    pub commits: u64,
    pub changed_files: u64,
    pub timeline: Vec<TimelineItem>,
    pub threads: Vec<ReviewThread>,
    pub checks: Vec<CheckRun>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GhIssue {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub body: String,
    pub author: String,
    pub created_at: String,
    pub html_url: String,
    pub labels: Vec<String>,
    pub comments: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct WorkflowRun {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub created_at: String,
    pub html_url: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct WorkflowJob {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}
