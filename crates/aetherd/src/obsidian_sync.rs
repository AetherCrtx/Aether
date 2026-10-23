use crate::brain_db::{BrainDb, BrainDbError};
use aether_protocol::ipc::WorkflowDefinition;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, RwLock};
use std::time::Duration;
use thiserror::Error;
use tracing::{debug, info, warn};

#[derive(Error, Debug)]
pub enum ObsidianSyncError {
    #[error("File watcher error: {0}")]
    Notify(#[from] notify::Error),
    #[error("Filesystem I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Db(#[from] BrainDbError),
    #[error("Note not found: {0}")]
    NotFound(String),
}

static RECENT_SELF_WRITTEN_HASHES: LazyLock<RwLock<std::collections::HashSet<String>>> =
    LazyLock::new(|| RwLock::new(std::collections::HashSet::new()));

pub fn record_self_write_hash(hash: &str) {
    if let Ok(mut lock) = RECENT_SELF_WRITTEN_HASHES.write() {
        lock.insert(hash.to_string());
    }
}

pub fn check_and_clear_self_write_hash(hash: &str) -> bool {
    if let Ok(mut lock) = RECENT_SELF_WRITTEN_HASHES.write() {
        lock.remove(hash)
    } else {
        false
    }
}

pub struct ObsidianSyncEngine {
    db: BrainDb,
    workspace_id: String,
    vault_path: PathBuf,
    event_tx: Option<tokio::sync::broadcast::Sender<aether_protocol::ipc::IpcEvent>>,
}

impl ObsidianSyncEngine {
    pub fn new(db: BrainDb, workspace_id: impl Into<String>, vault_path: impl Into<PathBuf>) -> Self {
        Self {
            db,
            workspace_id: workspace_id.into(),
            vault_path: vault_path.into(),
            event_tx: None,
        }
    }

    /// Attach the daemon event bus so externally edited notes can notify the GUI sidebar.
    pub fn with_event_tx(
        mut self,
        event_tx: tokio::sync::broadcast::Sender<aether_protocol::ipc::IpcEvent>,
    ) -> Self {
        self.event_tx = Some(event_tx);
        self
    }

    /// Recursively scan and index every markdown note in the Obsidian Vault
    pub fn index_entire_vault(&self) -> Result<usize, ObsidianSyncError> {
        if !self.vault_path.exists() {
            debug!("Obsidian vault path does not exist: {}", self.vault_path.display());
            return Ok(0);
        }

        let mut indexed_count = 0;
        let mut stack = vec![self.vault_path.clone()];

        while let Some(current_dir) = stack.pop() {
            if let Ok(entries) = fs::read_dir(&current_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        // Skip hidden directories like .obsidian, .git, etc.
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if !name.starts_with('.') {
                                stack.push(path);
                            }
                        }
                    } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                        if let Err(e) = self.index_single_note(&path) {
                            warn!("Failed to index note {}: {}", path.display(), e);
                        } else {
                            indexed_count += 1;
                        }
                    }
                }
            }
        }

        info!(
            "Indexed {} Obsidian notes for workspace '{}'",
            indexed_count, self.workspace_id
        );
        Ok(indexed_count)
    }

    /// Index or update a single markdown file in SQLite FTS5
    pub fn index_single_note(&self, full_path: &Path) -> Result<(), ObsidianSyncError> {
        let rel_path = match full_path.strip_prefix(&self.vault_path) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => full_path.to_string_lossy().to_string(),
        };

        let raw_content = fs::read_to_string(full_path)?;

        // Compute content hash to avoid unnecessary DB writes
        let mut hasher = Sha256::new();
        hasher.update(raw_content.as_bytes());
        let content_hash = format!("{:x}", hasher.finalize());

        let (title, frontmatter_json) = Self::parse_markdown_metadata(&raw_content, &rel_path);
        let note_id = format!("note_{:x}", md5_hash(&rel_path));

        self.db.upsert_obsidian_note(
            &note_id,
            &self.workspace_id,
            &rel_path,
            &title,
            frontmatter_json.as_deref(),
            &raw_content,
            &content_hash,
        )?;

        debug!("Indexed note '{}' -> ID: {}", rel_path, note_id);
        Ok(())
    }

    /// Process a debounced note change, validating SHA-256 hash to suppress self-writes and echo loops
    pub fn process_debounced_note(&self, full_path: &Path) -> Result<bool, ObsidianSyncError> {
        if !full_path.exists() {
            return Ok(false);
        }

        let rel_path = match full_path.strip_prefix(&self.vault_path) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => full_path.to_string_lossy().to_string(),
        };

        let raw_content = fs::read_to_string(full_path)?;

        let mut hasher = Sha256::new();
        hasher.update(raw_content.as_bytes());
        let content_hash = format!("{:x}", hasher.finalize());

        // 1. Check if hash matches a recent self-write (MCP mutation)
        if check_and_clear_self_write_hash(&content_hash) {
            debug!("Self-write suppressed for note: {}", rel_path);
            return Ok(false);
        }

        // 2. Check if the database already recorded this identical content hash
        if let Ok(Some(existing_hash)) = self.db.get_obsidian_note_hash(&self.workspace_id, &rel_path) {
            if existing_hash == content_hash {
                debug!("Identical hash detected; skipping redundant sync for: {}", rel_path);
                return Ok(false);
            }
        }

        // 3. New external edit: re-index into SQLite FTS5 and notify the GUI sidebar
        self.index_single_note(full_path)?;

        if let Some(tx) = &self.event_tx {
            let _ = tx.send(aether_protocol::ipc::IpcEvent::ObsidianNoteUpdated {
                workspace_id: self.workspace_id.clone(),
                relative_path: rel_path,
            });
        }

        Ok(true)
    }

    /// Start a non-blocking background file watcher on the Obsidian Vault with 75ms debounce
    pub fn start_watcher(self: Arc<Self>) -> Result<RecommendedWatcher, ObsidianSyncError> {
        let (tx, rx) = std::sync::mpsc::channel();
        let (debounce_tx, mut debounce_rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();

        let mut watcher = RecommendedWatcher::new(
            tx,
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )?;

        watcher.watch(&self.vault_path, RecursiveMode::Recursive)?;

        // Dedicated thread receiving raw notify events
        std::thread::Builder::new()
            .name("obsidian-sync-watcher".to_string())
            .spawn(move || {
                for res in rx {
                    match res {
                        Ok(event) => {
                            match event.kind {
                                EventKind::Create(_) | EventKind::Modify(_) => {
                                    for path in event.paths {
                                        if path.extension().and_then(|e| e.to_str()) == Some("md") {
                                            let _ = debounce_tx.send(path);
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                        Err(e) => {
                            warn!("Obsidian watcher error: {}", e);
                        }
                    }
                }
            })?;

        // Tokio async debounce worker (75ms debounce window)
        let engine = self.clone();
        tokio::spawn(async move {
            let mut pending: std::collections::HashMap<PathBuf, tokio::time::Instant> =
                std::collections::HashMap::new();
            let debounce_delay = Duration::from_millis(75);

            loop {
                let sleep_duration = if let Some(earliest) = pending.values().min() {
                    let elapsed = earliest.elapsed();
                    if elapsed >= debounce_delay {
                        Duration::ZERO
                    } else {
                        debounce_delay - elapsed
                    }
                } else {
                    Duration::from_secs(3600)
                };

                tokio::select! {
                    Some(path) = debounce_rx.recv() => {
                        pending.insert(path, tokio::time::Instant::now());
                    }
                    _ = tokio::time::sleep(sleep_duration), if !pending.is_empty() => {
                        let now = tokio::time::Instant::now();
                        let ready: Vec<PathBuf> = pending
                            .iter()
                            .filter(|(_, &time)| now.duration_since(time) >= debounce_delay)
                            .map(|(p, _)| p.clone())
                            .collect();

                        for path in ready {
                            pending.remove(&path);
                            if let Err(e) = engine.process_debounced_note(&path) {
                                debug!("Debounce sync error for {}: {}", path.display(), e);
                            }
                        }
                    }
                }
            }
        });

        info!("Obsidian vault watcher active with 75ms debounce on: {}", self.vault_path.display());
        Ok(watcher)
    }

    /// Load parameterized workflows from `<vault>/Workflows/*.md`.
    ///
    /// Frontmatter supplies `id`, `name`, `description`, `tags` (comma separated);
    /// the first non-empty body line is the command template.
    pub fn load_workflows(&self) -> Result<Vec<WorkflowDefinition>, ObsidianSyncError> {
        let dir = self.vault_path.join("Workflows");
        if !dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut workflows = Vec::new();
        let mut entries: Vec<PathBuf> = match fs::read_dir(&dir) {
            Ok(rd) => rd.flatten().map(|e| e.path()).collect(),
            Err(e) => return Err(ObsidianSyncError::Io(e)),
        };
        entries.sort();

        for path in entries {
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let rel_path = path
                .strip_prefix(&self.vault_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.to_string_lossy().to_string());

            let (title, frontmatter) = Self::parse_markdown_metadata(&content, &rel_path);
            let meta: serde_json::Value = frontmatter
                .and_then(|f| serde_json::from_str(&f).ok())
                .unwrap_or(serde_json::Value::Null);

            let command_template = Self::workflow_body(&content);
            if command_template.is_empty() {
                continue;
            }

            let str_field = |key: &str| {
                meta.get(key)
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            };

            workflows.push(WorkflowDefinition {
                id: str_field("id").unwrap_or_else(|| {
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("workflow")
                        .to_string()
                }),
                name: str_field("name").unwrap_or(title),
                description: str_field("description").unwrap_or_default(),
                command_template,
                tags: str_field("tags")
                    .map(|t| {
                        t.split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect()
                    })
                    .unwrap_or_default(),
                relative_path: rel_path,
            });
        }

        Ok(workflows)
    }

    /// Command template = first non-empty line after the frontmatter block.
    /// Files without frontmatter fall back to the first non-empty, non-heading line.
    fn workflow_body(content: &str) -> String {
        let mut lines = content.lines();
        let has_frontmatter = lines.next().map(|l| l.trim() == "---").unwrap_or(false);

        if has_frontmatter {
            let mut closed = false;
            for line in content.lines().skip(1) {
                let t = line.trim();
                if !closed {
                    if t == "---" {
                        closed = true;
                    }
                    continue;
                }
                if t.is_empty() || t == "---" {
                    continue;
                }
                return t.to_string();
            }
            return String::new();
        }

        content
            .lines()
            .map(str::trim)
            .find(|t| !t.is_empty() && !t.starts_with('#'))
            .unwrap_or_default()
            .to_string()
    }

    /// Parse YAML frontmatter between `---` fences and determine document title
    pub fn parse_markdown_metadata(content: &str, rel_path: &str) -> (String, Option<String>) {
        let lines: Vec<&str> = content.lines().collect();
        let mut frontmatter_lines = Vec::new();
        let mut in_frontmatter = false;
        let mut frontmatter_end_idx = 0;
        let mut extracted_title = None;

        if !lines.is_empty() && lines[0].trim() == "---" {
            in_frontmatter = true;
            for (idx, line) in lines.iter().enumerate().skip(1) {
                if line.trim() == "---" {
                    in_frontmatter = false;
                    frontmatter_end_idx = idx;
                    break;
                }
                frontmatter_lines.push(*line);
            }
        }

        let frontmatter_json = if !frontmatter_lines.is_empty() && !in_frontmatter {
            let mut map = serde_json::Map::new();
            for line in frontmatter_lines {
                let trimmed = line.trim();
                if let Some((k, v)) = trimmed.split_once(':') {
                    let key = k.trim().to_string();
                    let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                    if key.eq_ignore_ascii_case("title") {
                        extracted_title = Some(val.clone());
                    }
                    map.insert(key, serde_json::Value::String(val));
                }
            }
            serde_json::to_string(&map).ok()
        } else {
            None
        };

        // Determine title: frontmatter > first `# Heading` > filename
        let title = if let Some(t) = extracted_title {
            t
        } else {
            let mut found_h1 = None;
            for line in lines.iter().skip(frontmatter_end_idx) {
                let trimmed = line.trim();
                if trimmed.starts_with("# ") {
                    found_h1 = Some(trimmed[2..].trim().to_string());
                    break;
                }
            }

            found_h1.unwrap_or_else(|| {
                Path::new(rel_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled")
                    .to_string()
            })
        };

        (title, frontmatter_json)
    }

    /// Mutate markdown task checkbox (`- [ ]` <-> `- [x]`) or add task if not found
    pub fn update_task_checkbox(
        vault_path: &Path,
        note_rel_path: &str,
        task_text: &str,
        completed: bool,
    ) -> Result<bool, ObsidianSyncError> {
        let note_path = vault_path.join(note_rel_path);
        let target_box = if completed { "- [x]" } else { "- [ ]" };
        let clean_task_text = task_text.trim();

        if !note_path.exists() {
            if let Some(parent) = note_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let written_content = format!("# Sprint Tasks\n\n{} {}\n", target_box, clean_task_text);
            let mut hasher = Sha256::new();
            hasher.update(written_content.as_bytes());
            let hash = format!("{:x}", hasher.finalize());
            record_self_write_hash(&hash);
            fs::write(&note_path, &written_content)?;
            return Ok(true);
        }

        let content = fs::read_to_string(&note_path)?;
        let mut modified = false;
        let mut new_lines = Vec::new();

        for line in content.lines() {
            let trimmed = line.trim_start();
            let indent = &line[..line.len() - trimmed.len()];

            if (trimmed.starts_with("- [ ]") || trimmed.starts_with("- [x]"))
                && trimmed.contains(clean_task_text)
            {
                // Found matching checkbox
                let rest_of_line = &trimmed[5..];
                new_lines.push(format!("{}{}{}", indent, target_box, rest_of_line));
                modified = true;
            } else {
                new_lines.push(line.to_string());
            }
        }

        if !modified {
            // Task not found in existing note, append it
            new_lines.push(format!("{} {}", target_box, clean_task_text));
            modified = true;
        }

        if modified {
            let written_content = new_lines.join("\n") + "\n";
            let mut hasher = Sha256::new();
            hasher.update(written_content.as_bytes());
            let hash = format!("{:x}", hasher.finalize());
            record_self_write_hash(&hash);
            fs::write(&note_path, written_content)?;
        }

        Ok(modified)
    }

    /// Append memory or architectural notes directly to the Obsidian Vault
    pub fn append_memory(
        vault_path: &Path,
        folder: &str,
        title: &str,
        markdown: &str,
    ) -> Result<PathBuf, ObsidianSyncError> {
        let target_dir = vault_path.join(folder);
        fs::create_dir_all(&target_dir)?;

        let filename = format!("{}.md", title.replace(['/', '\\', ' '], "-"));
        let target_file = target_dir.join(filename);

        let content_to_hash = if target_file.exists() {
            // Append to existing note
            let mut content = fs::read_to_string(&target_file)?;
            content.push_str("\n\n---\n\n");
            content.push_str(markdown);
            fs::write(&target_file, &content)?;
            content
        } else {
            // Create fresh note with YAML frontmatter
            let full_note = format!(
                "---\ntitle: \"{}\"\nsource: \"AetherTerminal Memory\"\n---\n\n# {}\n\n{}\n",
                title, title, markdown
            );
            fs::write(&target_file, &full_note)?;
            full_note
        };

        let mut hasher = Sha256::new();
        hasher.update(content_to_hash.as_bytes());
        record_self_write_hash(&format!("{:x}", hasher.finalize()));

        Ok(target_file)
    }
}

fn md5_hash(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_workflows_reads_vault_markdown() -> Result<(), Box<dyn std::error::Error>> {
        let temp_dir = std::env::temp_dir()
            .join(format!("aether_wf_test_{}", uuid::Uuid::new_v4().simple()));
        let wf_dir = temp_dir.join("Workflows");
        fs::create_dir_all(&wf_dir)?;

        fs::write(
            wf_dir.join("cargo-check.md"),
            "---\nid: wf_cargo_check\nname: Cargo Workspace Check\ndescription: Type-check a crate.\ntags: rust, build\n---\n\ncargo check --package {{crate_name}} --all-targets\n",
        )?;
        // No frontmatter: id falls back to the filename stem, name to the H1.
        fs::write(
            wf_dir.join("plain.md"),
            "# Plain Workflow\n\necho plain\n",
        )?;
        // Not markdown: must be ignored.
        fs::write(wf_dir.join("notes.txt"), "ignored")?;

        let db = BrainDb::open_in_memory()?;
        let engine = ObsidianSyncEngine::new(db, "default", &temp_dir);
        let workflows = engine.load_workflows()?;

        assert_eq!(workflows.len(), 2, "only the two markdown files count");
        let cargo = workflows
            .iter()
            .find(|w| w.id == "wf_cargo_check")
            .expect("cargo workflow present");
        assert_eq!(cargo.command_template, "cargo check --package {{crate_name}} --all-targets");
        assert_eq!(cargo.tags, vec!["rust", "build"]);
        assert_eq!(cargo.relative_path, "Workflows/cargo-check.md");

        let plain = workflows
            .iter()
            .find(|w| w.id == "plain")
            .expect("filename stem used as id");
        assert_eq!(plain.name, "Plain Workflow");
        assert_eq!(plain.command_template, "echo plain");
        assert!(plain.tags.is_empty());

        fs::remove_dir_all(&temp_dir)?;
        Ok(())
    }

    #[test]
    fn test_load_workflows_missing_dir_is_empty() -> Result<(), Box<dyn std::error::Error>> {
        let db = BrainDb::open_in_memory()?;
        let engine = ObsidianSyncEngine::new(
            db,
            "default",
            std::env::temp_dir().join("aether_no_such_vault_xyz"),
        );
        assert!(engine.load_workflows()?.is_empty());
        Ok(())
    }

    #[test]
    fn test_obsidian_frontmatter_and_checkbox_mutation() -> Result<(), Box<dyn std::error::Error>> {
        let temp_dir = std::env::temp_dir().join(format!("aether_obsidian_test_{}", uuid::Uuid::new_v4().simple()));
        fs::create_dir_all(&temp_dir)?;

        let note_content = r#"---
title: "Sprint 01 Architecture"
tags: "backend, auth"
---

# Sprint 01 Architecture

## Tasks
- [ ] Implement JWT token authentication
- [ ] Setup PostgreSQL WAL replication
"#;

        let note_file = temp_dir.join("Sprint-01.md");
        fs::write(&note_file, note_content)?;

        // 1. Test frontmatter parsing
        let (title, frontmatter_json) =
            ObsidianSyncEngine::parse_markdown_metadata(note_content, "Sprint-01.md");
        assert_eq!(title, "Sprint 01 Architecture");
        assert!(frontmatter_json.is_some());
        assert!(frontmatter_json.unwrap().contains("backend, auth"));

        // 2. Test checkbox mutation: toggle JWT task to completed
        let mutated = ObsidianSyncEngine::update_task_checkbox(
            &temp_dir,
            "Sprint-01.md",
            "Implement JWT token authentication",
            true,
        )?;
        assert!(mutated);

        let updated_content = fs::read_to_string(&note_file)?;
        assert!(updated_content.contains("- [x] Implement JWT token authentication"));
        assert!(updated_content.contains("- [ ] Setup PostgreSQL WAL replication"));

        // 2b. Test self-write suppression & debounce hash verification
        let db = BrainDb::open_in_memory()?;
        db.upsert_workspace("ws_test", "Test Workspace", temp_dir.to_str().unwrap(), None)?;
        let engine = ObsidianSyncEngine::new(db, "ws_test", &temp_dir);

        // A watcher event for the checkbox mutation must be suppressed (returns false)
        let processed_self_write = engine.process_debounced_note(&note_file)?;
        assert!(!processed_self_write, "Self-written checkbox mutation must be suppressed");

        // External update to note
        let external_content = format!("{}\n- [ ] External task added\n", updated_content);
        fs::write(&note_file, &external_content)?;
        let processed_external = engine.process_debounced_note(&note_file)?;
        assert!(processed_external, "Genuine external modification must be indexed");

        // Repeating on identical content must be suppressed
        let processed_duplicate = engine.process_debounced_note(&note_file)?;
        assert!(!processed_duplicate, "Identical content hash must be suppressed");

        // 3. Test memory append
        let memory_file = ObsidianSyncEngine::append_memory(
            &temp_dir,
            "Architecture/Decisions",
            "ADR-001-Storage",
            "We decided to use SQLite WAL + FTS5 for local multi-agent storage.",
        )?;
        assert!(memory_file.exists());
        let memory_content = fs::read_to_string(&memory_file)?;
        assert!(memory_content.contains("SQLite WAL + FTS5"));

        let _ = fs::remove_dir_all(&temp_dir);
        Ok(())
    }
}
