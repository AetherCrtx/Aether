use aether_protocol::ipc::WorktreeDiffSummary;
use git2::{
    build::CheckoutBuilder, BranchType, DiffFormat, DiffOptions, MergeOptions,
    Oid, Repository, Signature, WorktreeAddOptions,
};
use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use thiserror::Error;
use tracing::{debug, info, warn};

#[derive(Error, Debug)]
pub enum WorktreeError {
    #[error("Git2 error: {0}")]
    Git(#[from] git2::Error),
    #[error("Filesystem I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Repository not found at: {0}")]
    RepoNotFound(String),
    #[error("Worktree not found for agent: {0}")]
    NotFound(String),
    #[error("Merge conflicts detected in files: {0:?}")]
    MergeConflict(Vec<String>),
    #[error("Invalid branch or reference: {0}")]
    InvalidRef(String),
}

/// Metadata for a mounted agent worktree
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub agent_id: String,
    pub branch_name: String,
    pub worktree_path: PathBuf,
}

pub struct WorktreeEngine;

impl WorktreeEngine {
    /// Create or retrieve an isolated git worktree for an agent
    pub fn create_worktree(
        root_repo_path: &Path,
        agent_id: &str,
        base_branch: Option<&str>,
    ) -> Result<WorktreeInfo, WorktreeError> {
        let repo = Repository::discover(root_repo_path).map_err(|e| {
            WorktreeError::RepoNotFound(format!("{}: {}", root_repo_path.display(), e))
        })?;

        let branch_name = format!("aether/{}", agent_id);
        let worktree_dir = root_repo_path.join(".aether/worktrees").join(agent_id);

        // Ensure parent directory exists
        if let Some(parent) = worktree_dir.parent() {
            fs::create_dir_all(parent)?;
        }

        // 1. Resolve starting commit (HEAD or specified base branch)
        let base_commit = match base_branch {
            Some(branch) => {
                let branch_ref = repo.find_branch(branch, BranchType::Local)?;
                branch_ref.get().peel_to_commit()?
            }
            None => repo.head()?.peel_to_commit()?,
        };

        // 2. Create or find target branch
        let branch = match repo.find_branch(&branch_name, BranchType::Local) {
            Ok(b) => b,
            Err(_) => {
                debug!("Creating new branch '{}' at commit {}", branch_name, base_commit.id());
                repo.branch(&branch_name, &base_commit, false)?
            }
        };

        // 3. Create worktree if it does not already exist
        if !worktree_dir.exists() {
            info!("Adding git worktree at: {}", worktree_dir.display());
            let mut opts = WorktreeAddOptions::new();
            opts.reference(Some(branch.get()));
            repo.worktree(agent_id, &worktree_dir, Some(&opts))?;
        }

        // 4. Create smart symlinks for heavy dependency directories
        Self::create_smart_symlinks(root_repo_path, &worktree_dir)?;

        // 5. Generate dynamic context bridge and instruction files
        Self::generate_context_bridge(&worktree_dir, agent_id)?;

        Ok(WorktreeInfo {
            agent_id: agent_id.to_string(),
            branch_name,
            worktree_path: worktree_dir,
        })
    }

    /// Smart Symlinks: share heavy folders (node_modules, .venv) from root repo
    /// Note: `target/` is deliberately excluded to prevent cargo build race conditions.
    fn create_smart_symlinks(root_repo: &Path, worktree_dir: &Path) -> Result<(), WorktreeError> {
        let heavy_folders = [
            "node_modules",
            ".venv",
            "venv",
            "vendor",
            ".cargo",
        ];

        for folder in &heavy_folders {
            let source_path = root_repo.join(folder);
            let dest_path = worktree_dir.join(folder);

            if source_path.exists() && !dest_path.exists() {
                debug!("Creating smart symlink: {} -> {}", dest_path.display(), source_path.display());
                if let Err(e) = symlink(&source_path, &dest_path) {
                    warn!("Failed to create smart symlink for {}: {}", folder, e);
                }
            }
        }

        Ok(())
    }

    /// Isolate node_modules in a worktree to prevent mutation of root node_modules
    pub fn isolate_node_modules(worktree_dir: &Path) -> Result<bool, WorktreeError> {
        let node_modules_path = worktree_dir.join("node_modules");
        if let Ok(meta) = fs::symlink_metadata(&node_modules_path) {
            if meta.file_type().is_symlink() {
                let target = fs::read_link(&node_modules_path)?;
                info!(
                    "Isolating node_modules in worktree '{}' (removing symlink -> {})",
                    worktree_dir.display(),
                    target.display()
                );
                fs::remove_file(&node_modules_path)?;
                fs::create_dir_all(&node_modules_path)?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Generate .aether/context_bridge.md and link CLAUDE.md / AGENTS.md
    fn generate_context_bridge(worktree_dir: &Path, agent_id: &str) -> Result<(), WorktreeError> {
        let aether_meta_dir = worktree_dir.join(".aether");
        fs::create_dir_all(&aether_meta_dir)?;

        let bridge_path = aether_meta_dir.join("context_bridge.md");
        let bridge_content = format!(
            r#"# AetherTerminal Multi-Agent Context Bridge
**Agent Identifier:** `{agent_id}`
**Worktree:** `{}`

## Rules of Collaboration:
1. **The Shared Brain:** You are running in a multi-agent orchestrated environment with other CLI agents.
2. **Context First:** Before editing or analyzing code, call the MCP tool `aether_get_shared_context` to see live architectural decisions and which files are currently being refactored by other agents.
3. **Advisory File Locks:** When you begin modifying code, call `aether_claim_module(files=[...], intent="...")` to prevent race conditions with parallel agents.
4. **Publish Contracts:** When you finalize an API endpoint, data structure, or architectural decision, broadcast it immediately using `aether_publish_blackboard`.
"#,
            worktree_dir.display()
        );

        fs::write(&bridge_path, bridge_content)?;

        // Also create / update CLAUDE.md and AGENTS.md inside worktree
        let claude_md = worktree_dir.join("CLAUDE.md");
        let agents_md = worktree_dir.join("AGENTS.md");

        let agent_instructions = format!(
            "\n<!-- AETHER CONTEXT BRIDGE START -->\n\
             > [!IMPORTANT]\n\
             > Running in AetherTerminal isolated pane for `@agent_{agent_id}`.\n\
             > Use `aether_get_shared_context` and `aether_publish_blackboard` to coordinate with parallel agents.\n\
             <!-- AETHER CONTEXT BRIDGE END -->\n"
        );

        if !claude_md.exists() {
            let _ = fs::write(&claude_md, &agent_instructions);
        }
        if !agents_md.exists() {
            let _ = fs::write(&agents_md, &agent_instructions);
        }

        Ok(())
    }

    /// Prune and remove an agent's worktree
    pub fn remove_worktree(root_repo_path: &Path, agent_id: &str) -> Result<(), WorktreeError> {
        let repo = Repository::discover(root_repo_path).map_err(|e| {
            WorktreeError::RepoNotFound(format!("{}: {}", root_repo_path.display(), e))
        })?;

        let worktree_dir = root_repo_path.join(".aether/worktrees").join(agent_id);

        if let Ok(wt) = repo.find_worktree(agent_id) {
            let mut opts = git2::WorktreePruneOptions::new();
            opts.valid(true);
            let _ = wt.prune(Some(&mut opts));
        }

        if worktree_dir.exists() {
            let _ = fs::remove_dir_all(&worktree_dir);
        }

        Ok(())
    }

    /// Stage modified and untracked files (ignoring .aether, bridge files, node_modules) and return tree OID
    pub fn stage_and_write_worktree_tree(wt_repo: &Repository) -> Result<Oid, WorktreeError> {
        let mut index = wt_repo.index()?;
        let mut status_opts = git2::StatusOptions::new();
        status_opts.include_untracked(true).recurse_untracked_dirs(true);
        let statuses = wt_repo.statuses(Some(&mut status_opts))?;

        for entry in statuses.iter() {
            if let Some(path) = entry.path() {
                // Ignore internal bridge and dependency files
                if path.starts_with(".aether")
                    || path == "CLAUDE.md"
                    || path == "AGENTS.md"
                    || path.starts_with("node_modules")
                {
                    continue;
                }

                let s = entry.status();
                if s.contains(git2::Status::WT_DELETED) || s.contains(git2::Status::INDEX_DELETED) {
                    let _ = index.remove_path(Path::new(path));
                } else if s.contains(git2::Status::WT_MODIFIED)
                    || s.contains(git2::Status::WT_NEW)
                    || s.contains(git2::Status::INDEX_MODIFIED)
                    || s.contains(git2::Status::INDEX_NEW)
                {
                    let _ = index.add_path(Path::new(path));
                }
            }
        }
        index.write()?;
        let tree_oid = index.write_tree()?;
        Ok(tree_oid)
    }

    /// Compute unified diff between an agent's worktree and the target base branch
    pub fn compute_worktree_diff(
        root_repo_path: &Path,
        agent_id: &str,
        target_branch: Option<&str>,
    ) -> Result<WorktreeDiffSummary, WorktreeError> {
        let repo = Repository::discover(root_repo_path).map_err(|e| {
            WorktreeError::RepoNotFound(format!("{}: {}", root_repo_path.display(), e))
        })?;

        let branch_name = format!("aether/{}", agent_id);
        let agent_branch = repo.find_branch(&branch_name, BranchType::Local).map_err(|_| {
            WorktreeError::NotFound(format!("Branch '{}' not found", branch_name))
        })?;

        let agent_commit = agent_branch.get().peel_to_commit()?;
        let mut agent_tree = agent_commit.tree()?;

        // Live check: if worktree directory exists, stage uncommitted files so diff includes live uncommitted work
        let worktree_dir = root_repo_path.join(".aether/worktrees").join(agent_id);
        if worktree_dir.exists() {
            if let Ok(wt_repo) = Repository::open(&worktree_dir) {
                if let Ok(tree_oid) = Self::stage_and_write_worktree_tree(&wt_repo) {
                    if let Ok(tree) = repo.find_tree(tree_oid) {
                        agent_tree = tree;
                    }
                }
            }
        }

        let target: String = match target_branch {
            Some(b) if b != "master" && b != "main" && b != "HEAD" => b.to_string(),
            _ => {
                if let Ok(head) = repo.head() {
                    head.shorthand().unwrap_or("HEAD").to_string()
                } else {
                    "HEAD".to_string()
                }
            }
        };

        let target_commit = match repo.find_branch(&target, BranchType::Local) {
            Ok(b) => b.get().peel_to_commit()?,
            Err(_) => {
                let target_obj = repo.revparse_single(&target)?;
                target_obj.peel_to_commit()?
            }
        };
        let target_tree = target_commit.tree()?;

        let mut diff_opts = DiffOptions::new();
        let diff = repo.diff_tree_to_tree(Some(&target_tree), Some(&agent_tree), Some(&mut diff_opts))?;

        let mut unified_diff = String::new();
        let mut insertions = 0;
        let mut deletions = 0;
        let mut files_changed = Vec::new();

        diff.print(DiffFormat::Patch, |delta, _hunk, line| {
            match line.origin() {
                '+' => insertions += 1,
                '-' => deletions += 1,
                _ => {}
            }

            if let Some(path) = delta.new_file().path() {
                let path_str = path.to_string_lossy().to_string();
                if !files_changed.contains(&path_str) {
                    files_changed.push(path_str);
                }
            }

            if let Ok(line_str) = std::str::from_utf8(line.content()) {
                unified_diff.push(line.origin());
                unified_diff.push_str(line_str);
            }
            true
        })?;

        Ok(WorktreeDiffSummary {
            pane_id: agent_id.to_string(),
            diff_unified: unified_diff,
            files_changed,
            insertions,
            deletions,
        })
    }

    /// Merge agent's worktree branch into target branch (supports Squash Merge)
    pub fn merge_worktree(
        root_repo_path: &Path,
        agent_id: &str,
        target_branch_name: &str,
        squash: bool,
        commit_message: Option<&str>,
    ) -> Result<String, WorktreeError> {
        let repo = Repository::discover(root_repo_path).map_err(|e| {
            WorktreeError::RepoNotFound(format!("{}: {}", root_repo_path.display(), e))
        })?;

        // 1. Auto-commit uncommitted worktree changes before merge if worktree directory exists
        let worktree_dir = root_repo_path.join(".aether/worktrees").join(agent_id);
        if worktree_dir.exists() {
            if let Ok(wt_repo) = Repository::open(&worktree_dir) {
                if let Ok(tree_oid) = Self::stage_and_write_worktree_tree(&wt_repo) {
                    let head_tree_oid = wt_repo
                        .head()
                        .ok()
                        .and_then(|h| h.peel_to_commit().ok())
                        .and_then(|c| c.tree().ok())
                        .map(|t| t.id());

                    if head_tree_oid != Some(tree_oid) {
                        let sig = Signature::now("AetherTerminal Gatekeeper", "aether@local")?;
                        let tree = wt_repo.find_tree(tree_oid)?;
                        let head_commit = wt_repo.head().ok().and_then(|h| h.peel_to_commit().ok());
                        let parents: Vec<&git2::Commit> = head_commit.as_ref().into_iter().collect();
                        let _ = wt_repo.commit(
                            Some("HEAD"),
                            &sig,
                            &sig,
                            "chore(aether): auto-commit worktree changes before merge",
                            &tree,
                            &parents,
                        );
                    }
                }
            }
        }

        let source_branch_name = format!("aether/{}", agent_id);
        let source_branch = repo.find_branch(&source_branch_name, BranchType::Local)?;
        let source_commit = source_branch.get().peel_to_commit()?;
        let source_tree = source_commit.tree()?;

        // Dynamic target branch resolution
        let resolved_target = if repo.find_branch(target_branch_name, BranchType::Local).is_err() {
            if let Ok(head) = repo.head() {
                head.shorthand().unwrap_or("main").to_string()
            } else {
                target_branch_name.to_string()
            }
        } else {
            target_branch_name.to_string()
        };

        let target_branch = repo.find_branch(&resolved_target, BranchType::Local)?;
        let target_commit = target_branch.get().peel_to_commit()?;
        let target_tree = target_commit.tree()?;

        // Find merge base (ancestor)
        let base_oid = repo.merge_base(target_commit.id(), source_commit.id())?;
        let base_commit = repo.find_commit(base_oid)?;
        let base_tree = base_commit.tree()?;

        // Perform in-memory tree merge
        let mut merge_opts = MergeOptions::new();
        let mut index = repo.merge_trees(&base_tree, &target_tree, &source_tree, Some(&mut merge_opts))?;

        if index.has_conflicts() {
            let mut conflict_files = Vec::new();
            if let Ok(conflicts) = index.conflicts() {
                for c in conflicts.flatten() {
                    if let Some(our) = c.our {
                        let path = String::from_utf8_lossy(&our.path).to_string();
                        conflict_files.push(path);
                    }
                }
            }
            return Err(WorktreeError::MergeConflict(conflict_files));
        }

        // Write resulting tree
        let tree_oid = index.write_tree_to(&repo)?;
        let result_tree = repo.find_tree(tree_oid)?;

        let sig = Signature::now("AetherTerminal Gatekeeper", "aether@local")?;
        let default_msg = format!("Merge {} from agent '{}'", source_branch_name, agent_id);
        let msg = commit_message.unwrap_or(&default_msg);

        let new_commit_oid = if squash {
            // Squash commit: only parent is target_commit
            repo.commit(
                Some(&format!("refs/heads/{}", resolved_target)),
                &sig,
                &sig,
                msg,
                &result_tree,
                &[&target_commit],
            )?
        } else {
            // Standard merge commit: parents are target_commit and source_commit
            repo.commit(
                Some(&format!("refs/heads/{}", resolved_target)),
                &sig,
                &sig,
                msg,
                &result_tree,
                &[&target_commit, &source_commit],
            )?
        };

        // If root repo's HEAD is on the target branch, update working directory & index
        if let Ok(head) = repo.head() {
            if head.shorthand() == Some(&resolved_target) {
                let mut checkout_opts = CheckoutBuilder::new();
                checkout_opts.force();
                let _ = repo.checkout_tree(result_tree.as_object(), Some(&mut checkout_opts));
            }
        }

        info!(
            "Successfully merged {} into {} (OID: {})",
            source_branch_name, resolved_target, new_commit_oid
        );
        Ok(new_commit_oid.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::IndexAddOption;

    fn init_test_git_repo(path: &Path) -> Result<Repository, git2::Error> {
        let repo = Repository::init(path)?;
        let sig = Signature::now("Test User", "test@example.com")?;

        let readme = path.join("README.md");
        fs::write(&readme, "# Initial Test Repo\n").unwrap();

        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write()?;

        let tree_id = index.write_tree()?;
        {
            let tree = repo.find_tree(tree_id)?;
            repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])?;
        }
        Ok(repo)
    }

    #[test]
    fn test_worktree_creation_and_diff() -> Result<(), Box<dyn std::error::Error>> {
        let temp_dir = std::env::temp_dir().join(format!("aether_wt_test_{}", uuid::Uuid::new_v4().simple()));
        fs::create_dir_all(&temp_dir)?;

        let _repo = init_test_git_repo(&temp_dir)?;

        // Setup root target and node_modules to test smart symlink policies
        fs::create_dir_all(temp_dir.join("target"))?;
        fs::create_dir_all(temp_dir.join("node_modules"))?;

        // 1. Create worktree
        let wt_info = WorktreeEngine::create_worktree(&temp_dir, "agent_test_1", None)?;
        assert!(wt_info.worktree_path.exists());
        assert_eq!(wt_info.branch_name, "aether/agent_test_1");

        // Verify target/ is NOT symlinked (preventing cargo race conditions)
        assert!(!wt_info.worktree_path.join("target").exists(), "target should not be symlinked");

        // Verify node_modules is symlinked initially
        let nm_path = wt_info.worktree_path.join("node_modules");
        assert!(nm_path.exists());
        let meta = fs::symlink_metadata(&nm_path)?;
        assert!(meta.file_type().is_symlink(), "node_modules should initially be a symlink");

        // Test node_modules isolation mechanism
        let isolated = WorktreeEngine::isolate_node_modules(&wt_info.worktree_path)?;
        assert!(isolated, "node_modules should be isolated successfully");
        let meta_after = fs::symlink_metadata(&nm_path)?;
        assert!(meta_after.is_dir() && !meta_after.file_type().is_symlink(), "node_modules should now be a real directory");

        // 2. Modify file in worktree
        let test_file = wt_info.worktree_path.join("feature.rs");
        fs::write(&test_file, "pub fn new_feature() -> bool { true }\n")?;

        // Commit file inside worktree
        let wt_repo = Repository::open(&wt_info.worktree_path)?;
        let sig = Signature::now("Agent 1", "agent1@aether.local")?;
        let mut index = wt_repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write()?;
        let tree_id = index.write_tree()?;
        let tree = wt_repo.find_tree(tree_id)?;
        let parent = wt_repo.head()?.peel_to_commit()?;
        wt_repo.commit(Some("HEAD"), &sig, &sig, "Add feature.rs", &tree, &[&parent])?;

        // 3. Compute diff from main repo
        let diff = WorktreeEngine::compute_worktree_diff(&temp_dir, "agent_test_1", Some("HEAD"))?;
        assert!(diff.files_changed.iter().any(|f| f.contains("feature.rs")));
        assert!(diff.insertions > 0);

        // 4. Merge worktree
        let current_branch = _repo.head()?.shorthand().unwrap_or("master").to_string();
        let commit_oid = WorktreeEngine::merge_worktree(&temp_dir, "agent_test_1", &current_branch, true, Some("Squash merge feature"))?;
        assert!(!commit_oid.is_empty());

        // 5. Cleanup
        let _ = WorktreeEngine::remove_worktree(&temp_dir, "agent_test_1");
        let _ = fs::remove_dir_all(&temp_dir);

        Ok(())
    }
}
