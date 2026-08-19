use git2::{Repository, StatusOptions};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("Repository not found at path")]
    NotFound,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitFileStatus {
    pub path: PathBuf,
    pub status: String,
    pub is_staged: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitStatus {
    pub branch: String,
    pub staged: Vec<GitFileStatus>,
    pub unstaged: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
}

pub struct GitService;

impl GitService {
    pub fn get_status<P: AsRef<Path>>(repo_path: P) -> Result<GitStatus, GitError> {
        let repo = Repository::discover(repo_path)?;
        let head = repo.head();
        let branch = match head {
            Ok(ref reference) => reference.shorthand().unwrap_or("HEAD").to_string(),
            Err(_) => "HEAD (no commits)".to_string(),
        };

        let mut opts = StatusOptions::new();
        opts.include_untracked(true).recurse_untracked_dirs(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();

        for entry in statuses.iter() {
            let path = PathBuf::from(entry.path().unwrap_or(""));
            let status = entry.status();

            if status.is_index_new() || status.is_index_modified() || status.is_index_deleted() {
                staged.push(GitFileStatus {
                    path: path.clone(),
                    status: format!("{:?}", status),
                    is_staged: true,
                });
            }
            if status.is_wt_modified() || status.is_wt_deleted() {
                unstaged.push(GitFileStatus {
                    path: path.clone(),
                    status: format!("{:?}", status),
                    is_staged: false,
                });
            }
            if status.is_wt_new() {
                untracked.push(GitFileStatus {
                    path: path.clone(),
                    status: "UNTRACKED".to_string(),
                    is_staged: false,
                });
            }
        }

        Ok(GitStatus {
            branch,
            staged,
            unstaged,
            untracked,
        })
    }

    pub fn stage_file<P: AsRef<Path>>(repo_path: P, file_path: &Path) -> Result<(), GitError> {
        let repo = Repository::discover(repo_path)?;
        let mut index = repo.index()?;
        index.add_path(file_path)?;
        index.write()?;
        Ok(())
    }

    pub fn unstage_file<P: AsRef<Path>>(repo_path: P, file_path: &Path) -> Result<(), GitError> {
        let repo = Repository::discover(repo_path)?;
        let head = repo.head()?.peel_to_commit()?;
        repo.reset_default(Some(head.as_object()), [file_path])?;
        Ok(())
    }

    pub fn commit<P: AsRef<Path>>(repo_path: P, message: &str) -> Result<(), GitError> {
        let repo = Repository::discover(repo_path)?;
        let mut index = repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        let signature = repo.signature()?;
        let parent_commit = repo.head().and_then(|h| h.peel_to_commit()).ok();
        let parents = match parent_commit {
            Some(ref c) => vec![c],
            None => vec![],
        };

        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )?;
        Ok(())
    }

    pub fn get_diff<P: AsRef<Path>>(
        repo_path: P,
        file_path: &Path,
    ) -> Result<String, GitError> {
        let repo = Repository::discover(repo_path)?;
        let index = repo.index()?;
        let diff = repo.diff_index_to_workdir(Some(&index), None)?;

        let mut diff_text = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                diff_text.push(line.origin());
                diff_text.push_str(content);
            }
            true
        })?;

        let _ = file_path;
        Ok(diff_text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_service_non_repo() {
        let status = GitService::get_status("/non_existent_folder_xyz");
        assert!(status.is_err());
    }
}
