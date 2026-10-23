use aether_protocol::agent::{
    AgentInstanceInfo, AgentStatus, BlackboardEntry, BlackboardEntryType, FileLockInfo,
    GitSnapshotInfo, WorkspaceInfo,
};
use aether_protocol::ipc::{
    ObsidianNoteSummary, ObsidianSearchResult, SharedContextSummary,
};
use directories::ProjectDirs;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BrainDbError {
    #[error("SQLite database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Database mutex lock poisoned")]
    LockPoisoned,
    #[error("Entity not found: {0}")]
    NotFound(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Filesystem I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid data: {0}")]
    InvalidData(String),
}

/// Shared Brain Database instance backed by SQLite WAL + FTS5
#[derive(Clone)]
pub struct BrainDb {
    conn: Arc<Mutex<Connection>>,
    db_path: PathBuf,
}

impl BrainDb {
    /// Open or create the database at a specific path
    pub fn open(path: impl AsRef<Path>) -> Result<Self, BrainDbError> {
        let db_path = path.as_ref().to_path_buf();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)?;
        Self::configure_and_init(conn, db_path)
    }

    /// Open an in-memory database (ideal for tests and isolated sessions)
    pub fn open_in_memory() -> Result<Self, BrainDbError> {
        let conn = Connection::open_in_memory()?;
        Self::configure_and_init(conn, PathBuf::from(":memory:"))
    }

    /// Open the standard database at `~/.local/share/aether/brain.db`
    pub fn open_default() -> Result<Self, BrainDbError> {
        let default_path = if let Some(proj_dirs) = ProjectDirs::from("com", "aether", "aether") {
            proj_dirs.data_local_dir().join("brain.db")
        } else {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            PathBuf::from(home).join(".local/share/aether/brain.db")
        };

        Self::open(default_path)
    }

    fn configure_and_init(conn: Connection, db_path: PathBuf) -> Result<Self, BrainDbError> {
        // High-performance Pragmas
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path,
        };

        db.init_schema()?;
        Ok(db)
    }

    pub fn path(&self) -> &Path {
        &self.db_path
    }

    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, BrainDbError> {
        self.conn.lock().map_err(|_| BrainDbError::LockPoisoned)
    }

    /// Initialize all database tables and indexes
    fn init_schema(&self) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;

        conn.execute_batch(
            r#"
            -- 1. Workspaces
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_repo_path TEXT NOT NULL,
                obsidian_vault_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 2. Active Agent Instances
            CREATE TABLE IF NOT EXISTS agent_instances (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                cli_type TEXT NOT NULL,
                pty_pid INTEGER,
                worktree_path TEXT,
                git_branch TEXT,
                status TEXT DEFAULT 'IDLE',
                estimated_tokens INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 3. Shared Blackboard / Event Bus
            CREATE TABLE IF NOT EXISTS shared_blackboard (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                author_agent_id TEXT NOT NULL,
                entry_type TEXT NOT NULL,
                title TEXT NOT NULL,
                content_markdown TEXT NOT NULL,
                target_agent_id TEXT,
                is_resolved BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 4. Advisory File Locks
            CREATE TABLE IF NOT EXISTS file_locks (
                workspace_id TEXT NOT NULL,
                relative_file_path TEXT NOT NULL,
                locked_by_agent_id TEXT NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
                intent TEXT,
                locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (workspace_id, relative_file_path)
            );

            -- 5. Obsidian Notes & FTS5 Mirror
            CREATE TABLE IF NOT EXISTS obsidian_notes (
                note_id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                relative_path TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                frontmatter_json TEXT,
                raw_content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS obsidian_fts USING fts5(
                relative_path,
                title,
                raw_content,
                content='obsidian_notes',
                content_rowid='rowid'
            );

            -- Triggers to keep FTS in sync with obsidian_notes
            CREATE TRIGGER IF NOT EXISTS obsidian_notes_ai AFTER INSERT ON obsidian_notes BEGIN
                INSERT INTO obsidian_fts(rowid, relative_path, title, raw_content)
                VALUES (new.rowid, new.relative_path, new.title, new.raw_content);
            END;

            CREATE TRIGGER IF NOT EXISTS obsidian_notes_ad AFTER DELETE ON obsidian_notes BEGIN
                INSERT INTO obsidian_fts(obsidian_fts, rowid, relative_path, title, raw_content)
                VALUES('delete', old.rowid, old.relative_path, old.title, old.raw_content);
            END;

            CREATE TRIGGER IF NOT EXISTS obsidian_notes_au AFTER UPDATE ON obsidian_notes BEGIN
                INSERT INTO obsidian_fts(obsidian_fts, rowid, relative_path, title, raw_content)
                VALUES('delete', old.rowid, old.relative_path, old.title, old.raw_content);
                INSERT INTO obsidian_fts(rowid, relative_path, title, raw_content)
                VALUES (new.rowid, new.relative_path, new.title, new.raw_content);
            END;

            -- 6. Git Snapshots
            CREATE TABLE IF NOT EXISTS git_snapshots (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
                git_tree_oid TEXT NOT NULL,
                summary TEXT NOT NULL,
                files_changed_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )?;

        Ok(())
    }

    // ------------------------------------------------------------------------
    // Workspaces
    // ------------------------------------------------------------------------

    pub fn upsert_workspace(
        &self,
        id: &str,
        name: &str,
        root_repo_path: &str,
        obsidian_vault_path: Option<&str>,
    ) -> Result<WorkspaceInfo, BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO workspaces (id, name, root_repo_path, obsidian_vault_path, updated_at)
            VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                root_repo_path = excluded.root_repo_path,
                obsidian_vault_path = excluded.obsidian_vault_path,
                updated_at = CURRENT_TIMESTAMP
            "#,
            params![id, name, root_repo_path, obsidian_vault_path],
        )?;

        let created_at: String = conn.query_row(
            "SELECT created_at FROM workspaces WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(WorkspaceInfo {
            id: id.to_string(),
            name: name.to_string(),
            root_repo_path: root_repo_path.to_string(),
            obsidian_vault_path: obsidian_vault_path.map(String::from),
            created_at,
        })
    }

    pub fn get_workspace(&self, id: &str) -> Result<Option<WorkspaceInfo>, BrainDbError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, root_repo_path, obsidian_vault_path, created_at FROM workspaces WHERE id = ?1",
        )?;

        let ws = stmt
            .query_row(params![id], |row| {
                Ok(WorkspaceInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    root_repo_path: row.get(2)?,
                    obsidian_vault_path: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .optional()?;

        Ok(ws)
    }

    // ------------------------------------------------------------------------
    // Agent Instances
    // ------------------------------------------------------------------------

    pub fn register_agent_instance(
        &self,
        id: &str,
        workspace_id: &str,
        cli_type: &str,
        pty_pid: Option<u32>,
        worktree_path: Option<&str>,
        git_branch: Option<&str>,
        status: AgentStatus,
    ) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO agent_instances (id, workspace_id, cli_type, pty_pid, worktree_path, git_branch, status)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                pty_pid = excluded.pty_pid,
                worktree_path = excluded.worktree_path,
                git_branch = excluded.git_branch,
                status = excluded.status
            "#,
            params![
                id,
                workspace_id,
                cli_type,
                pty_pid.map(|p| p as i64),
                worktree_path,
                git_branch,
                status.as_str()
            ],
        )?;

        Ok(())
    }

    pub fn update_agent_status(&self, id: &str, status: AgentStatus) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE agent_instances SET status = ?1 WHERE id = ?2",
            params![status.as_str(), id],
        )?;
        Ok(())
    }

    pub fn get_agent_instance(&self, id: &str) -> Result<Option<AgentInstanceInfo>, BrainDbError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT id, workspace_id, cli_type, pty_pid, worktree_path, git_branch, status, estimated_tokens, created_at
               FROM agent_instances WHERE id = ?1"#,
        )?;

        let instance = stmt
            .query_row(params![id], |row| {
                let status_str: String = row.get(6)?;
                let status = status_str.parse().unwrap_or(AgentStatus::Idle);
                let pid_i64: Option<i64> = row.get(3)?;
                let pty_pid = pid_i64.map(|p| p as u32);
                let tokens_i64: i64 = row.get(7)?;

                Ok(AgentInstanceInfo {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    cli_type: row.get(2)?,
                    pty_pid,
                    worktree_path: row.get(4)?,
                    git_branch: row.get(5)?,
                    status,
                    estimated_tokens: tokens_i64.max(0) as u64,
                    created_at: row.get(8)?,
                })
            })
            .optional()?;

        Ok(instance)
    }

    pub fn list_agent_instances(
        &self,
        workspace_id: Option<&str>,
    ) -> Result<Vec<AgentInstanceInfo>, BrainDbError> {
        let conn = self.lock_conn()?;
        let sql = match workspace_id {
            Some(_) => {
                r#"SELECT id, workspace_id, cli_type, pty_pid, worktree_path, git_branch, status, estimated_tokens, created_at
                   FROM agent_instances WHERE workspace_id = ?1 ORDER BY created_at ASC"#
            }
            None => {
                r#"SELECT id, workspace_id, cli_type, pty_pid, worktree_path, git_branch, status, estimated_tokens, created_at
                   FROM agent_instances ORDER BY created_at ASC"#
            }
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = if let Some(ws_id) = workspace_id {
            stmt.query_map(params![ws_id], Self::map_agent_row)?
        } else {
            stmt.query_map([], Self::map_agent_row)?
        };

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn delete_agent_instance(&self, id: &str) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM agent_instances WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn clear_all_agent_instances(&self) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM agent_instances", [])?;
        Ok(())
    }

    fn map_agent_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentInstanceInfo> {
        let status_str: String = row.get(6)?;
        let status = status_str.parse().unwrap_or(AgentStatus::Idle);
        let pid_i64: Option<i64> = row.get(3)?;
        let tokens_i64: i64 = row.get(7)?;

        Ok(AgentInstanceInfo {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            cli_type: row.get(2)?,
            pty_pid: pid_i64.map(|p| p as u32),
            worktree_path: row.get(4)?,
            git_branch: row.get(5)?,
            status,
            estimated_tokens: tokens_i64.max(0) as u64,
            created_at: row.get(8)?,
        })
    }

    // ------------------------------------------------------------------------
    // Shared Blackboard
    // ------------------------------------------------------------------------

    pub fn publish_blackboard(
        &self,
        workspace_id: &str,
        author_agent_id: &str,
        entry_type: BlackboardEntryType,
        title: &str,
        content_markdown: &str,
        target_agent_id: Option<&str>,
    ) -> Result<BlackboardEntry, BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO shared_blackboard (workspace_id, author_agent_id, entry_type, title, content_markdown, target_agent_id)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                workspace_id,
                author_agent_id,
                entry_type.as_str(),
                title,
                content_markdown,
                target_agent_id
            ],
        )?;

        let id = conn.last_insert_rowid();
        let created_at: String = conn.query_row(
            "SELECT created_at FROM shared_blackboard WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(BlackboardEntry {
            id,
            workspace_id: workspace_id.to_string(),
            author_agent_id: author_agent_id.to_string(),
            entry_type,
            title: title.to_string(),
            content_markdown: content_markdown.to_string(),
            target_agent_id: target_agent_id.map(String::from),
            is_resolved: false,
            created_at,
        })
    }

    pub fn get_blackboard_entries(
        &self,
        workspace_id: &str,
        include_resolved: bool,
    ) -> Result<Vec<BlackboardEntry>, BrainDbError> {
        let conn = self.lock_conn()?;
        let sql = if include_resolved {
            r#"SELECT id, workspace_id, author_agent_id, entry_type, title, content_markdown, target_agent_id, is_resolved, created_at
               FROM shared_blackboard WHERE workspace_id = ?1 ORDER BY id DESC LIMIT 100"#
        } else {
            r#"SELECT id, workspace_id, author_agent_id, entry_type, title, content_markdown, target_agent_id, is_resolved, created_at
               FROM shared_blackboard WHERE workspace_id = ?1 AND is_resolved = 0 ORDER BY id DESC LIMIT 100"#
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![workspace_id], |row| {
            let type_str: String = row.get(3)?;
            let entry_type = type_str.parse().unwrap_or(BlackboardEntryType::Decision);

            Ok(BlackboardEntry {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                author_agent_id: row.get(2)?,
                entry_type,
                title: row.get(4)?,
                content_markdown: row.get(5)?,
                target_agent_id: row.get(6)?,
                is_resolved: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;

        let mut entries = Vec::new();
        for r in rows {
            entries.push(r?);
        }
        Ok(entries)
    }

    // ------------------------------------------------------------------------
    // Advisory File Locks
    // ------------------------------------------------------------------------

    pub fn claim_file_locks(
        &self,
        workspace_id: &str,
        agent_id: &str,
        files: &[String],
        intent: Option<&str>,
    ) -> Result<(bool, Vec<String>), BrainDbError> {
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;

        let mut conflicts = Vec::new();

        // 1. Check for conflicts
        for file in files {
            let mut stmt = tx.prepare(
                "SELECT locked_by_agent_id FROM file_locks WHERE workspace_id = ?1 AND relative_file_path = ?2",
            )?;
            let existing: Option<String> = stmt
                .query_row(params![workspace_id, file], |row| row.get(0))
                .optional()?;

            if let Some(holder) = existing {
                if holder != agent_id {
                    conflicts.push(format!("{file} (held by {holder})"));
                }
            }
        }

        if !conflicts.is_empty() {
            // Cannot grant lock
            return Ok((false, conflicts));
        }

        // 2. Grant locks
        for file in files {
            tx.execute(
                r#"
                INSERT INTO file_locks (workspace_id, relative_file_path, locked_by_agent_id, intent, locked_at)
                VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
                ON CONFLICT(workspace_id, relative_file_path) DO UPDATE SET
                    locked_by_agent_id = excluded.locked_by_agent_id,
                    intent = excluded.intent,
                    locked_at = CURRENT_TIMESTAMP
                "#,
                params![workspace_id, file, agent_id, intent],
            )?;
        }

        tx.commit()?;
        Ok((true, Vec::new()))
    }

    pub fn release_file_locks(
        &self,
        workspace_id: &str,
        agent_id: &str,
        files: &[String],
    ) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;
        for file in files {
            conn.execute(
                "DELETE FROM file_locks WHERE workspace_id = ?1 AND relative_file_path = ?2 AND locked_by_agent_id = ?3",
                params![workspace_id, file, agent_id],
            )?;
        }
        Ok(())
    }

    pub fn get_file_locks(&self, workspace_id: &str) -> Result<Vec<FileLockInfo>, BrainDbError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT workspace_id, relative_file_path, locked_by_agent_id, intent, locked_at
               FROM file_locks WHERE workspace_id = ?1 ORDER BY locked_at DESC"#,
        )?;

        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(FileLockInfo {
                workspace_id: row.get(0)?,
                relative_file_path: row.get(1)?,
                locked_by_agent_id: row.get(2)?,
                intent: row.get(3)?,
                locked_at: row.get(4)?,
            })
        })?;

        let mut locks = Vec::new();
        for r in rows {
            locks.push(r?);
        }
        Ok(locks)
    }

    // ------------------------------------------------------------------------
    // Obsidian Vault Mirror & Full-Text Search
    // ------------------------------------------------------------------------

    pub fn upsert_obsidian_note(
        &self,
        note_id: &str,
        workspace_id: &str,
        relative_path: &str,
        title: &str,
        frontmatter_json: Option<&str>,
        raw_content: &str,
        content_hash: &str,
    ) -> Result<(), BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO obsidian_notes (note_id, workspace_id, relative_path, title, frontmatter_json, raw_content, content_hash, last_synced_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
            ON CONFLICT(relative_path) DO UPDATE SET
                note_id = excluded.note_id,
                workspace_id = excluded.workspace_id,
                title = excluded.title,
                frontmatter_json = excluded.frontmatter_json,
                raw_content = excluded.raw_content,
                content_hash = excluded.content_hash,
                last_synced_at = CURRENT_TIMESTAMP
            "#,
            params![
                note_id,
                workspace_id,
                relative_path,
                title,
                frontmatter_json,
                raw_content,
                content_hash
            ],
        )?;

        Ok(())
    }

    pub fn get_obsidian_note_by_path(
        &self,
        workspace_id: &str,
        relative_path: &str,
    ) -> Result<Option<ObsidianNoteSummary>, BrainDbError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT note_id, relative_path, title, frontmatter_json, raw_content
               FROM obsidian_notes WHERE workspace_id = ?1 AND relative_path = ?2"#,
        )?;

        let note = stmt
            .query_row(params![workspace_id, relative_path], |row| {
                Ok(ObsidianNoteSummary {
                    note_id: row.get(0)?,
                    relative_path: row.get(1)?,
                    title: row.get(2)?,
                    frontmatter_json: row.get(3)?,
                    raw_content: row.get(4)?,
                })
            })
            .optional()?;

        Ok(note)
    }

    pub fn get_obsidian_note_hash(
        &self,
        workspace_id: &str,
        relative_path: &str,
    ) -> Result<Option<String>, BrainDbError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT content_hash FROM obsidian_notes WHERE workspace_id = ?1 AND relative_path = ?2"#,
        )?;
        let hash = stmt
            .query_row(params![workspace_id, relative_path], |row| row.get(0))
            .optional()?;
        Ok(hash)
    }

    pub fn search_obsidian_fts(
        &self,
        workspace_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<ObsidianSearchResult>, BrainDbError> {
        let conn = self.lock_conn()?;

        // Clean query for FTS5 (escape quotes)
        let sanitized = query.replace('"', "\"\"");
        let match_expr = format!("\"{sanitized}\"*");

        let mut stmt = conn.prepare(
            r#"
            SELECT n.note_id, n.relative_path, n.title, snippet(obsidian_fts, 2, '<b>', '</b>', '...', 15)
            FROM obsidian_fts f
            JOIN obsidian_notes n ON f.rowid = n.rowid
            WHERE n.workspace_id = ?1 AND obsidian_fts MATCH ?2
            ORDER BY rank
            LIMIT ?3
            "#,
        )?;

        let rows = stmt.query_map(params![workspace_id, match_expr, limit as i64], |row| {
            Ok(ObsidianSearchResult {
                note_id: row.get(0)?,
                relative_path: row.get(1)?,
                title: row.get(2)?,
                snippet: row.get(3)?,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    // ------------------------------------------------------------------------
    // Git Snapshots
    // ------------------------------------------------------------------------

    pub fn create_git_snapshot(
        &self,
        id: &str,
        agent_id: &str,
        git_tree_oid: &str,
        summary: &str,
        files_changed_count: u32,
    ) -> Result<GitSnapshotInfo, BrainDbError> {
        let conn = self.lock_conn()?;
        conn.execute(
            r#"
            INSERT INTO git_snapshots (id, agent_id, git_tree_oid, summary, files_changed_count)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![id, agent_id, git_tree_oid, summary, files_changed_count],
        )?;

        let created_at: String = conn.query_row(
            "SELECT created_at FROM git_snapshots WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(GitSnapshotInfo {
            id: id.to_string(),
            agent_id: agent_id.to_string(),
            git_tree_oid: git_tree_oid.to_string(),
            summary: summary.to_string(),
            files_changed_count,
            created_at,
        })
    }

    pub fn list_git_snapshots(&self, agent_id: &str) -> Result<Vec<GitSnapshotInfo>, BrainDbError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT id, agent_id, git_tree_oid, summary, files_changed_count, created_at
               FROM git_snapshots WHERE agent_id = ?1 ORDER BY created_at DESC LIMIT 50"#,
        )?;

        let rows = stmt.query_map(params![agent_id], |row| {
            Ok(GitSnapshotInfo {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                git_tree_oid: row.get(2)?,
                summary: row.get(3)?,
                files_changed_count: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // ------------------------------------------------------------------------
    // Shared Context Aggregator
    // ------------------------------------------------------------------------

    pub fn get_shared_context(
        &self,
        workspace_id: &str,
        query: Option<&str>,
    ) -> Result<SharedContextSummary, BrainDbError> {
        let blackboard_entries = self.get_blackboard_entries(workspace_id, false)?;
        let active_file_locks = self.get_file_locks(workspace_id)?;

        let mut relevant_notes = Vec::new();
        if let Some(q) = query {
            if !q.trim().is_empty() {
                let search_results = self.search_obsidian_fts(workspace_id, q, 5)?;
                for res in search_results {
                    if let Some(note) = self.get_obsidian_note_by_path(workspace_id, &res.relative_path)? {
                        relevant_notes.push(note);
                    }
                }
            }
        }

        Ok(SharedContextSummary {
            blackboard_entries,
            active_file_locks,
            relevant_notes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_brain_db_lifecycle() -> Result<(), Box<dyn std::error::Error>> {
        let db = BrainDb::open_in_memory()?;

        // 1. Workspace
        let ws = db.upsert_workspace("ws_1", "Test Project", "/tmp/repo", Some("/tmp/vault"))?;
        assert_eq!(ws.name, "Test Project");

        // 2. Register Agent
        db.register_agent_instance(
            "agent_1",
            "ws_1",
            "claude-code",
            Some(1234),
            Some("/tmp/repo/.aether/worktrees/agent_1"),
            Some("aether/agent_1"),
            AgentStatus::Idle,
        )?;

        let agent = db.get_agent_instance("agent_1")?.expect("Agent should exist");
        assert_eq!(agent.cli_type, "claude-code");
        assert_eq!(agent.status, AgentStatus::Idle);

        // 3. Blackboard
        let bb = db.publish_blackboard(
            "ws_1",
            "agent_1",
            BlackboardEntryType::ApiContract,
            "Auth API Contract",
            "POST /api/v1/auth/login",
            None,
        )?;
        assert_eq!(bb.id, 1);

        let entries = db.get_blackboard_entries("ws_1", false)?;
        assert_eq!(entries.len(), 1);

        // 4. File Locks
        let (granted, conflicts) = db.claim_file_locks(
            "ws_1",
            "agent_1",
            &["src/auth.rs".to_string()],
            Some("Refactoring JWT"),
        )?;
        assert!(granted);
        assert!(conflicts.is_empty());

        // Agent 2 tries to claim same file
        db.register_agent_instance(
            "agent_2",
            "ws_1",
            "opencode",
            Some(5678),
            None,
            None,
            AgentStatus::Idle,
        )?;
        let (granted2, conflicts2) = db.claim_file_locks(
            "ws_1",
            "agent_2",
            &["src/auth.rs".to_string()],
            Some("Adding OAuth"),
        )?;
        assert!(!granted2);
        assert_eq!(conflicts2.len(), 1);

        // Release lock
        db.release_file_locks("ws_1", "agent_1", &["src/auth.rs".to_string()])?;
        let (granted3, _) = db.claim_file_locks(
            "ws_1",
            "agent_2",
            &["src/auth.rs".to_string()],
            Some("Adding OAuth"),
        )?;
        assert!(granted3);

        // 5. Obsidian Notes & FTS
        db.upsert_obsidian_note(
            "note_1",
            "ws_1",
            "Architecture/Auth.md",
            "Authentication Specs",
            Some("{\"tags\":[\"auth\"]}"),
            "The system uses Argon2id for password hashing and Ed25519 for JWT signing.",
            "hash123",
        )?;

        let fts_results = db.search_obsidian_fts("ws_1", "Argon2id", 5)?;
        assert_eq!(fts_results.len(), 1);
        assert_eq!(fts_results[0].title, "Authentication Specs");

        // 6. Shared Context Aggregator
        let ctx = db.get_shared_context("ws_1", Some("Argon2id"))?;
        assert_eq!(ctx.blackboard_entries.len(), 1);
        assert_eq!(ctx.active_file_locks.len(), 1);
        assert_eq!(ctx.relevant_notes.len(), 1);

        Ok(())
    }
}
