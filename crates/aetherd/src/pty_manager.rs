use aether_protocol::agent::AgentStatus;
use aether_protocol::ipc::IpcEvent;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info, warn};

#[derive(Error, Debug)]
pub enum PtyError {
    #[error("Failed to initialize PTY system: {0}")]
    PtySystem(String),
    #[error("Failed to open PTY pair: {0}")]
    OpenPty(String),
    #[error("Failed to spawn process in PTY: {0}")]
    Spawn(String),
    #[error("Pane with id '{0}' was not found")]
    NotFound(String),
    #[error("Failed to resize PTY: {0}")]
    Resize(String),
    #[error("Failed to write to PTY: {0}")]
    Write(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Lock poisoned")]
    LockPoisoned,
}

const DEFAULT_RING_BUFFER_CAPACITY: usize = 512 * 1024; // 512 KB per pane

/// Active session representing a single pseudo-terminal child process
pub struct PaneSession {
    pub pane_id: String,
    pub pid: Option<u32>,
    master: Arc<std::sync::Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<std::sync::Mutex<Box<dyn Write + Send>>>,
    ring_buffer: Arc<std::sync::Mutex<VecDeque<u8>>>,
    line_buffer: Arc<std::sync::Mutex<String>>,
    active: Arc<AtomicBool>,
}

impl PaneSession {
    /// Send raw input bytes (keystrokes / paste) to PTY stdin
    pub fn write_input(&self, data: &[u8]) -> Result<Option<String>, PtyError> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| PtyError::LockPoisoned)?;
        writer.write_all(data).map_err(|e| PtyError::Write(e.to_string()))?;
        writer.flush().map_err(|e| PtyError::Write(e.to_string()))?;

        let mut completed_line = None;
        if let Ok(mut lb) = self.line_buffer.lock() {
            if let Ok(text) = std::str::from_utf8(data) {
                for ch in text.chars() {
                    match ch {
                        '\r' | '\n' => {
                            if !lb.is_empty() {
                                completed_line = Some(lb.clone());
                                lb.clear();
                            }
                        }
                        '\x7f' | '\x08' => {
                            lb.pop();
                        }
                        c if !c.is_control() => {
                            lb.push(c);
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(completed_line)
    }

    /// Resize pseudo-terminal dimensions
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        let master = self
            .master
            .lock()
            .map_err(|_| PtyError::LockPoisoned)?;
        let effective_cols = cols.max(1);
        let effective_rows = rows.max(1);
        master
            .resize(PtySize {
                rows: effective_rows,
                cols: effective_cols,
                pixel_width: effective_cols * 9,
                pixel_height: effective_rows * 18,
            })
            .map_err(|e| PtyError::Resize(e.to_string()))?;
        Ok(())
    }

    /// Get current scrollback buffer from memory
    pub fn get_scrollback(&self) -> Result<Vec<u8>, PtyError> {
        let buf = self
            .ring_buffer
            .lock()
            .map_err(|_| PtyError::LockPoisoned)?;
        let (first, second) = buf.as_slices();
        let mut res = Vec::with_capacity(first.len() + second.len());
        res.extend_from_slice(first);
        res.extend_from_slice(second);
        Ok(res)
    }

    /// Is the process currently running
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }
}

/// Central PTY Manager maintaining active terminal panes
pub struct PtyManager {
    sessions: Arc<RwLock<HashMap<String, Arc<PaneSession>>>>,
    event_tx: broadcast::Sender<IpcEvent>,
}

impl PtyManager {
    pub fn new(event_tx: broadcast::Sender<IpcEvent>) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// Spawn a new shell or CLI process inside a pseudo-terminal
    pub async fn spawn_pane(
        &self,
        pane_id: String,
        command: Option<String>,
        args: Vec<String>,
        working_dir: PathBuf,
        cols: u16,
        rows: u16,
        env_vars: HashMap<String, String>,
    ) -> Result<u32, PtyError> {
        let pty_system = native_pty_system();
        let effective_cols = cols.max(1);
        let effective_rows = rows.max(1);
        let pair = pty_system
            .openpty(PtySize {
                rows: effective_rows,
                cols: effective_cols,
                pixel_width: effective_cols * 9,
                pixel_height: effective_rows * 18,
            })
            .map_err(|e| PtyError::OpenPty(e.to_string()))?;

fn resolve_shell_command(cmd_opt: Option<&str>) -> String {
    match cmd_opt {
        Some("shell") | None => {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
        Some(cmd) => {
            if cmd.contains('/') {
                return cmd.to_string();
            }
            if let Ok(path_var) = std::env::var("PATH") {
                for dir in path_var.split(':') {
                    let candidate = PathBuf::from(dir).join(cmd);
                    if candidate.is_file() {
                        return candidate.to_string_lossy().to_string();
                    }
                }
            }
            cmd.to_string()
        }
    }
}

        // Determine executable command
        let exec_cmd = resolve_shell_command(command.as_deref());

        let mut final_args = args;
        // If spawning an interactive shell with no arguments, pass login/interactive flags
        // so user profile, fastfetch, and completions load properly
        if final_args.is_empty() {
            let cmd_lower = exec_cmd.to_lowercase();
            if cmd_lower.ends_with("/fish") || cmd_lower == "fish" {
                final_args.push("-l".to_string());
                final_args.push("-i".to_string());
            } else if cmd_lower.ends_with("/bash") || cmd_lower == "bash" {
                final_args.push("-l".to_string());
                final_args.push("-i".to_string());
            } else if cmd_lower.ends_with("/zsh") || cmd_lower == "zsh" {
                final_args.push("-l".to_string());
                final_args.push("-i".to_string());
            } else if cmd_lower.ends_with("/sh") || cmd_lower == "sh" {
                final_args.push("-l".to_string());
                final_args.push("-i".to_string());
            }
        }

        let mut cmd_builder = CommandBuilder::new(&exec_cmd);
        cmd_builder.args(final_args);
        cmd_builder.cwd(&working_dir);

        // Inherit standard environment
        for (k, v) in std::env::vars() {
            cmd_builder.env(k, v);
        }

        // Avoid leaking outer terminal identifiers so tools know this is an xterm terminal
        cmd_builder.env_remove("KITTY_WINDOW_ID");
        cmd_builder.env_remove("KITTY_PID");

        // Set proper terminal identification
        cmd_builder.env("TERM", "xterm-256color");
        cmd_builder.env("COLORTERM", "truecolor");

        // Ensure ~/.local/bin and ~/.local/lib are discoverable
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home/rasshqa".to_string());
        let local_bin = format!("{home}/.local/bin");
        let local_lib = format!("{home}/.local/lib");

        let current_path = std::env::var("PATH").unwrap_or_default();
        if !current_path.contains(&local_bin) {
            cmd_builder.env("PATH", format!("{local_bin}:{current_path}"));
        }

        let current_ld = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
        if !current_ld.contains(&local_lib) {
            let new_ld = if current_ld.is_empty() {
                local_lib
            } else {
                format!("{local_lib}:{current_ld}")
            };
            cmd_builder.env("LD_LIBRARY_PATH", new_ld);
        }

        for (k, v) in env_vars {
            cmd_builder.env(k, v);
        }

        // Spawn child in slave PTY
        let mut child = pair
            .slave
            .spawn_command(cmd_builder)
            .map_err(|e| PtyError::Spawn(e.to_string()))?;

        let pid = child.process_id().unwrap_or(0);

        // Drop the slave end so that EOF will be detected when the child process exits
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        let ring_buffer = Arc::new(std::sync::Mutex::new(VecDeque::with_capacity(
            DEFAULT_RING_BUFFER_CAPACITY,
        )));
        let line_buffer = Arc::new(std::sync::Mutex::new(String::new()));
        let active = Arc::new(AtomicBool::new(true));

        let session = Arc::new(PaneSession {
            pane_id: pane_id.clone(),
            pid: Some(pid),
            master: Arc::new(std::sync::Mutex::new(pair.master)),
            writer: Arc::new(std::sync::Mutex::new(writer)),
            ring_buffer: ring_buffer.clone(),
            line_buffer: line_buffer.clone(),
            active: active.clone(),
        });

        // Register session
        {
            let mut lock = self.sessions.write().await;
            lock.insert(pane_id.clone(), session);
        }

        // Background reader thread: reads master stdout and pushes into ring buffer & broadcast
        let reader_pane_id = pane_id.clone();
        let reader_event_tx = self.event_tx.clone();
        let reader_active = active.clone();

        std::thread::Builder::new()
            .name(format!("pty-read-{reader_pane_id}"))
            .spawn(move || {
                let mut buf = [0u8; 8192];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => {
                            debug!("PTY reader EOF for pane: {}", reader_pane_id);
                            break;
                        }
                        Ok(n) => {
                            let bytes = &buf[..n];

                            // 1. Update ring buffer
                            if let Ok(mut rb) = ring_buffer.lock() {
                                let incoming_len = bytes.len();
                                if rb.len() + incoming_len > DEFAULT_RING_BUFFER_CAPACITY {
                                    let overflow = (rb.len() + incoming_len)
                                        .saturating_sub(DEFAULT_RING_BUFFER_CAPACITY);
                                    let to_drain = overflow.min(rb.len());
                                    rb.drain(0..to_drain);
                                }
                                rb.extend(bytes.iter().copied());
                            }

                            // 2. Broadcast raw bytes to all connected clients
                            let event = IpcEvent::PtyOutput {
                                pane_id: reader_pane_id.clone(),
                                data: bytes.to_vec(),
                            };
                            let _ = reader_event_tx.send(event);
                        }
                        Err(e) => {
                            debug!("PTY reader exited with: {} for pane: {}", e, reader_pane_id);
                            break;
                        }
                    }
                }
                reader_active.store(false, Ordering::SeqCst);
            })
            .map_err(|e| PtyError::Io(e))?;

        // Background child wait thread
        let watcher_pane_id = pane_id.clone();
        let watcher_event_tx = self.event_tx.clone();
        let watcher_active = active.clone();
        let watcher_sessions = self.sessions.clone();

        std::thread::Builder::new()
            .name(format!("pty-wait-{watcher_pane_id}"))
            .spawn(move || {
                let status = child.wait();
                watcher_active.store(false, Ordering::SeqCst);
                if let Ok(mut lock) = watcher_sessions.try_write() {
                    lock.remove(&watcher_pane_id);
                }

                let exit_code = match status {
                    Ok(st) => {
                        debug!("Child process exited with status: {:?} for pane: {}", st, watcher_pane_id);
                        if st.success() {
                            Some(0)
                        } else {
                            Some(st.exit_code() as i32)
                        }
                    }
                    Err(e) => {
                        warn!("Error waiting on child process for pane {}: {}", watcher_pane_id, e);
                        None
                    }
                };

                let event = IpcEvent::PaneExited {
                    pane_id: watcher_pane_id.clone(),
                    exit_code,
                };
                let _ = watcher_event_tx.send(event);

                // Update pane status event
                let _ = watcher_event_tx.send(IpcEvent::PaneStatusChanged {
                    pane_id: watcher_pane_id.clone(),
                    status: AgentStatus::Idle,
                });
            })
            .map_err(|e| PtyError::Io(e))?;

        info!("Spawned PTY pane '{}' with PID {}", pane_id, pid);
        Ok(pid)
    }

    /// Check if a pane is currently running and active
    pub async fn is_pane_active(&self, pane_id: &str) -> bool {
        let lock = self.sessions.read().await;
        if let Some(s) = lock.get(pane_id) {
            s.active.load(Ordering::SeqCst)
        } else {
            false
        }
    }

    /// Write data to pane
    pub async fn write_input(&self, pane_id: &str, data: &[u8]) -> Result<Option<String>, PtyError> {
        let session = {
            let lock = self.sessions.read().await;
            lock.get(pane_id)
                .cloned()
                .ok_or_else(|| PtyError::NotFound(pane_id.to_string()))?
        };

        session.write_input(data)
    }

    /// Resize pane
    pub async fn resize_pane(&self, pane_id: &str, cols: u16, rows: u16) -> Result<(), PtyError> {
        let session = {
            let lock = self.sessions.read().await;
            lock.get(pane_id)
                .cloned()
                .ok_or_else(|| PtyError::NotFound(pane_id.to_string()))?
        };

        session.resize(cols, rows)
    }

    /// Terminate a pane process
    pub async fn kill_pane(&self, pane_id: &str, signal: Option<i32>) -> Result<(), PtyError> {
        let session = {
            let mut lock = self.sessions.write().await;
            lock.remove(pane_id)
                .ok_or_else(|| PtyError::NotFound(pane_id.to_string()))?
        };

        session.active.store(false, Ordering::SeqCst);
        if let Some(pid) = session.pid {
            let sig = signal.unwrap_or(15); // SIGTERM by default
            unsafe {
                libc::kill(pid as i32, sig);
            }
            debug!("Sent signal {} to pane {} (pid {})", sig, pane_id, pid);
        }

        Ok(())
    }

    /// Retrieve scrollback buffer for pane
    pub async fn get_scrollback(&self, pane_id: &str) -> Result<Vec<u8>, PtyError> {
        let session = {
            let lock = self.sessions.read().await;
            lock.get(pane_id)
                .cloned()
                .ok_or_else(|| PtyError::NotFound(pane_id.to_string()))?
        };

        session.get_scrollback()
    }

    /// Scan open TCP listening ports for child processes (Port Radar)
    pub async fn scan_open_ports(&self, pane_id: &str) -> Vec<u16> {
        let pid = {
            let lock = self.sessions.read().await;
            match lock.get(pane_id) {
                Some(s) => s.pid,
                None => None,
            }
        };

        match pid {
            Some(p) => scan_ports_for_pid(p).unwrap_or_default(),
            None => Vec::new(),
        }
    }
}

/// Recursively collect all descendant PIDs of a process using /proc/<pid>/task/<pid>/children
fn get_process_tree_pids(root_pid: u32) -> std::collections::HashSet<u32> {
    let mut pids = std::collections::HashSet::new();
    let mut queue = vec![root_pid];
    pids.insert(root_pid);

    while let Some(current_pid) = queue.pop() {
        let children_path = format!("/proc/{current_pid}/task/{current_pid}/children");
        if let Ok(content) = std::fs::read_to_string(children_path) {
            for part in content.split_whitespace() {
                if let Ok(child_pid) = part.parse::<u32>() {
                    if pids.insert(child_pid) {
                        queue.push(child_pid);
                    }
                }
            }
        }
    }
    pids
}

/// Linux Port Radar: detects dual-stack TCP listening sockets opened by a PID or its child processes
fn scan_ports_for_pid(pid: u32) -> Result<Vec<u16>, std::io::Error> {
    let mut inodes = std::collections::HashSet::new();
    let all_pids = get_process_tree_pids(pid);

    for p in all_pids {
        let fd_dir = PathBuf::from(format!("/proc/{p}/fd"));
        if let Ok(entries) = std::fs::read_dir(fd_dir) {
            for entry in entries.flatten() {
                if let Ok(target) = std::fs::read_link(entry.path()) {
                    let target_str = target.to_string_lossy();
                    if target_str.starts_with("socket:[") && target_str.ends_with(']') {
                        let inode_str = &target_str[8..target_str.len() - 1];
                        if let Ok(inode) = inode_str.parse::<u64>() {
                            inodes.insert(inode);
                        }
                    }
                }
            }
        }
    }

    if inodes.is_empty() {
        return Ok(Vec::new());
    }

    let mut ports_set = std::collections::HashSet::new();

    // Check process-specific network namespace paths first, then global /proc/net/
    let candidate_files = [
        format!("/proc/{pid}/net/tcp"),
        format!("/proc/{pid}/net/tcp6"),
        "/proc/net/tcp".to_string(),
        "/proc/net/tcp6".to_string(),
    ];

    for file_path in &candidate_files {
        parse_tcp_listen_file(file_path, &inodes, &mut ports_set);
    }

    let mut ports: Vec<u16> = ports_set.into_iter().collect();
    ports.sort_unstable();
    Ok(ports)
}

/// Parse /proc/net/tcp and /proc/net/tcp6 listening entries matching target socket inodes
fn parse_tcp_listen_file(
    file_path: &str,
    inodes: &std::collections::HashSet<u64>,
    ports_out: &mut std::collections::HashSet<u16>,
) {
    if let Ok(file) = File::open(file_path) {
        let reader = BufReader::new(file);
        parse_tcp_listen_reader(reader, inodes, ports_out);
    }
}

/// Generic reader parser for /proc/net/tcp and /proc/net/tcp6 lines
fn parse_tcp_listen_reader<R: BufRead>(
    reader: R,
    inodes: &std::collections::HashSet<u64>,
    ports_out: &mut std::collections::HashSet<u16>,
) {
    for (idx, line_res) in reader.lines().enumerate() {
        if idx == 0 {
            continue; // Skip header row
        }
        if let Ok(line) = line_res {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() > 9 {
                let state = fields[3];
                let inode_str = fields[9];

                // State 0A is TCP_LISTEN in both IPv4 and IPv6
                if state == "0A" {
                    if let Ok(inode) = inode_str.parse::<u64>() {
                        if inodes.contains(&inode) {
                            let local_addr = fields[1];
                            // Format is <hex_ip>:<hex_port>
                            // IPv4: 8 hex chars : 4 hex chars (e.g. 0100007F:0BB8 -> 3000)
                            // IPv6: 32 hex chars : 4 hex chars (e.g. 00000000000000000000000000000000:1F90 -> 8080)
                            if let Some((_, port_hex)) = local_addr.rsplit_once(':') {
                                if let Ok(port) = u16::from_str_radix(port_hex, 16) {
                                    ports_out.insert(port);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_pty_spawn_and_write() -> Result<(), Box<dyn std::error::Error>> {
        let (tx, mut rx) = broadcast::channel(100);
        let manager = PtyManager::new(tx);

        let pane_id = "test_pane_1".to_string();
        let pid = manager
            .spawn_pane(
                pane_id.clone(),
                Some("/bin/sh".to_string()),
                vec!["-c".to_string(), "echo 'Hello from Aether'; sleep 0.1".to_string()],
                PathBuf::from("/tmp"),
                80,
                24,
                HashMap::new(),
            )
            .await?;

        assert!(pid > 0);

        // Read output from broadcast channel
        let mut collected = Vec::new();
        let timeout = tokio::time::sleep(Duration::from_millis(500));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                Ok(event) = rx.recv() => {
                    match event {
                        IpcEvent::PtyOutput { pane_id: id, data } if id == pane_id => {
                            collected.extend_from_slice(&data);
                            let text = String::from_utf8_lossy(&collected);
                            if text.contains("Hello from Aether") {
                                break;
                            }
                        }
                        IpcEvent::PaneExited { pane_id: id, .. } if id == pane_id => {
                            break;
                        }
                        _ => {}
                    }
                }
                _ = &mut timeout => {
                    break;
                }
            }
        }

        let output_str = String::from_utf8_lossy(&collected);
        assert!(
            output_str.contains("Hello from Aether"),
            "Expected output to contain 'Hello from Aether', got: {}",
            output_str
        );

        Ok(())
    }

    #[test]
    fn test_parse_tcp_listen_reader_dual_stack() {
        use std::io::Cursor;

        // Mock /proc/net/tcp (IPv4)
        let mock_tcp = r#"  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 111111 1 0000000000000000 100 0 0 10 0
   1: 00000000:13AD 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 222222 1 0000000000000000 100 0 0 10 0
   2: 0100007F:1F90 0100007F:FFFF 01 00000000:00000000 00:00000000 00000000  1000        0 333333 1 0000000000000000 100 0 0 10 0
"#;

        // Mock /proc/net/tcp6 (IPv6)
        let mock_tcp6 = r#"  sl  local_address                         rem_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000000000000:1F90 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 444444 1 0000000000000000 100 0 0 10 0
   1: 0000000000000000000000000100007F:0BB8 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 555555 1 0000000000000000 100 0 0 10 0
"#;

        let mut target_inodes = std::collections::HashSet::new();
        target_inodes.insert(111111); // Port 3000 (0BB8) IPv4
        target_inodes.insert(333333); // State 01 (ESTABLISHED) -> should be ignored!
        target_inodes.insert(444444); // Port 8080 (1F90) IPv6
        // 222222 & 555555 not in target_inodes -> should be ignored

        let mut detected_ports = std::collections::HashSet::new();

        parse_tcp_listen_reader(Cursor::new(mock_tcp), &target_inodes, &mut detected_ports);
        parse_tcp_listen_reader(Cursor::new(mock_tcp6), &target_inodes, &mut detected_ports);

        let mut ports_vec: Vec<u16> = detected_ports.into_iter().collect();
        ports_vec.sort_unstable();

        assert_eq!(ports_vec, vec![3000, 8080]);
    }
}
