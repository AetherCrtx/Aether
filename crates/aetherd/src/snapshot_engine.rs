use git2::build::CheckoutBuilder;
use git2::{DiffOptions, IndexAddOption, Oid, Repository};
use std::path::Path;
use thiserror::Error;
use tracing::{debug, info};

#[derive(Error, Debug)]
pub enum SnapshotError {
    #[error("Git2 error: {0}")]
    Git(#[from] git2::Error),
    #[error("Invalid git tree object ID: {0}")]
    InvalidOid(String),
    #[error("Tree object not found in repository: {0}")]
    TreeNotFound(String),
}

pub struct SnapshotEngine;

impl SnapshotEngine {
    /// Capture an instantaneous Git tree-object snapshot of the worktree
    /// without creating a commit or dirtying the git history.
    pub fn capture_snapshot(
        worktree_path: &Path,
        _summary: &str,
    ) -> Result<(String, u32), SnapshotError> {
        let repo = Repository::open(worktree_path)?;

        let mut index = repo.index()?;
        // Stage current files into the index
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write()?;

        // Write tree object directly to git database
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;

        // Count changed files against current HEAD tree
        let files_changed_count = match repo.head() {
            Ok(head_ref) => {
                if let Ok(head_commit) = head_ref.peel_to_commit() {
                    if let Ok(head_tree) = head_commit.tree() {
                        let mut diff_opts = DiffOptions::new();
                        if let Ok(diff) = repo.diff_tree_to_tree(
                            Some(&head_tree),
                            Some(&tree),
                            Some(&mut diff_opts),
                        ) {
                            diff.deltas().count() as u32
                        } else {
                            0
                        }
                    } else {
                        0
                    }
                } else {
                    0
                }
            }
            Err(_) => 0,
        };

        debug!(
            "Captured git tree snapshot {} for worktree {} ({} files changed)",
            tree_oid,
            worktree_path.display(),
            files_changed_count
        );

        Ok((tree_oid.to_string(), files_changed_count))
    }

    /// Roll back the worktree working directory and index to a saved tree-object snapshot
    pub fn rollback_snapshot(worktree_path: &Path, tree_oid_str: &str) -> Result<(), SnapshotError> {
        let repo = Repository::open(worktree_path)?;

        let oid = Oid::from_str(tree_oid_str)
            .map_err(|e| SnapshotError::InvalidOid(format!("{}: {}", tree_oid_str, e)))?;

        let tree = repo
            .find_tree(oid)
            .map_err(|e| SnapshotError::TreeNotFound(format!("{}: {}", tree_oid_str, e)))?;

        // 1. Force checkout working directory to match the tree object
        let mut checkout_opts = CheckoutBuilder::new();
        checkout_opts.force();
        repo.checkout_tree(tree.as_object(), Some(&mut checkout_opts))?;

        // 2. Reset the git index to match the tree
        let mut index = repo.index()?;
        index.read_tree(&tree)?;
        index.write()?;

        info!(
            "Successfully rolled back worktree {} to snapshot {}",
            worktree_path.display(),
            tree_oid_str
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;
    use std::fs;

    #[test]
    fn test_snapshot_capture_and_rollback() -> Result<(), Box<dyn std::error::Error>> {
        let temp_dir = std::env::temp_dir().join(format!("aether_snap_test_{}", uuid::Uuid::new_v4().simple()));
        fs::create_dir_all(&temp_dir)?;

        let repo = Repository::init(&temp_dir)?;
        let sig = Signature::now("Test", "test@test.local")?;

        let file_path = temp_dir.join("main.rs");
        fs::write(&file_path, "fn main() { println!(\"Version 1\"); }\n")?;

        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;
        repo.commit(Some("HEAD"), &sig, &sig, "Init", &tree, &[])?;

        // 1. Capture snapshot 1
        let (snap1_oid, _) = SnapshotEngine::capture_snapshot(&temp_dir, "Checkpoint 1")?;

        // 2. Modify file for Version 2
        fs::write(&file_path, "fn main() { println!(\"Version 2 - Broken\"); }\n")?;
        assert!(fs::read_to_string(&file_path)?.contains("Version 2"));

        // 3. Rollback to Snapshot 1
        SnapshotEngine::rollback_snapshot(&temp_dir, &snap1_oid)?;

        // Verify file is restored to Version 1
        let restored_content = fs::read_to_string(&file_path)?;
        assert!(restored_content.contains("Version 1"));
        assert!(!restored_content.contains("Version 2"));

        let _ = fs::remove_dir_all(&temp_dir);
        Ok(())
    }
}
