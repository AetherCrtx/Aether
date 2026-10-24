use aetherd::pty_manager::{inject_ssh_keepalive_args, is_ssh_command, PtyManager};
use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;

// ============================================================================
// 1. SSH Keepalive and Command Line Tests
// ============================================================================

#[test]
fn test_ssh_command_recognition() {
    assert!(is_ssh_command("ssh"));
    assert!(is_ssh_command("SSH"));
    assert!(is_ssh_command("/usr/bin/ssh"));
    assert!(is_ssh_command("/usr/local/bin/ssh"));
    assert!(is_ssh_command("/home/user/.local/bin/ssh"));

    assert!(!is_ssh_command("bash"));
    assert!(!is_ssh_command("/usr/bin/autossh"));
    assert!(!is_ssh_command("ssh-keygen"));
    assert!(!is_ssh_command("sshpass"));
}

#[test]
fn test_ssh_keepalive_standard_args() {
    let mut args = vec!["-p".to_string(), "2222".to_string(), "user@host".to_string()];
    inject_ssh_keepalive_args(&mut args);
    assert_eq!(
        args,
        vec![
            "-o",
            "ServerAliveInterval=15",
            "-o",
            "ServerAliveCountMax=3",
            "-o",
            "TCPKeepAlive=yes",
            "-p",
            "2222",
            "user@host"
        ]
    );
}

#[test]
fn test_ssh_keepalive_preserves_custom_flags() {
    let mut args = vec![
        "-i".to_string(),
        "key.pem".to_string(),
        "-o".to_string(),
        "ServerAliveInterval=60".to_string(),
        "host".to_string(),
    ];
    inject_ssh_keepalive_args(&mut args);

    // ServerAliveInterval=60 must be preserved, and ServerAliveInterval=15 must NOT be injected
    assert!(args.contains(&"ServerAliveInterval=60".to_string()));
    assert!(!args.contains(&"ServerAliveInterval=15".to_string()));

    // Other missing flags must be injected
    assert!(args.contains(&"ServerAliveCountMax=3".to_string()));
    assert!(args.contains(&"TCPKeepAlive=yes".to_string()));
}

#[test]
fn test_ssh_keepalive_preserves_tcp_keepalive_no() {
    // If the user explicitly disables TCP keepalive
    let mut args = vec![
        "-o".to_string(),
        "TCPKeepAlive=no".to_string(),
        "user@host".to_string(),
    ];
    inject_ssh_keepalive_args(&mut args);
    assert!(args.contains(&"TCPKeepAlive=no".to_string()));
    assert!(!args.contains(&"TCPKeepAlive=yes".to_string()));
}

#[test]
fn test_ssh_keepalive_lowercase_option_behavior() {
    // OpenSSH options are case-insensitive, but Rust string contains() is case-sensitive
    let mut args = vec![
        "-o".to_string(),
        "serveraliveinterval=60".to_string(),
        "user@host".to_string(),
    ];
    inject_ssh_keepalive_args(&mut args);

    // Document whether lowercase is recognized or causes duplicate injection
    let interval_15_injected = args.contains(&"ServerAliveInterval=15".to_string());
    println!("Case sensitivity check: serveraliveinterval=60 -> ServerAliveInterval=15 injected: {}", interval_15_injected);
}

#[test]
fn test_ssh_keepalive_remote_command_substring() {
    // What if remote command mentions ServerAliveInterval as text?
    let mut args = vec![
        "user@host".to_string(),
        "grep".to_string(),
        "ServerAliveInterval".to_string(),
        "/etc/ssh/sshd_config".to_string(),
    ];
    inject_ssh_keepalive_args(&mut args);

    // Because args[2] contains "ServerAliveInterval", ServerAliveInterval=15 is skipped
    let skipped = !args.contains(&"ServerAliveInterval=15".to_string());
    println!("Remote command substring edge case: ServerAliveInterval=15 skipped: {}", skipped);
}

// ============================================================================
// 2. PTY Session Lifecycle and Rapid Execution Stress Tests
// ============================================================================

#[tokio::test]
async fn test_pty_rapid_spawn_and_lifecycle() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, _rx) = broadcast::channel(1000);
    let manager = Arc::new(PtyManager::new(tx));

    let count = 20;
    let mut handles = Vec::new();

    for i in 0..count {
        let mgr = manager.clone();
        let pane_id = format!("rapid_pane_{i}");
        let handle = tokio::spawn(async move {
            let pid = mgr
                .spawn_pane(
                    pane_id.clone(),
                    Some("/bin/sh".to_string()),
                    vec!["-c".to_string(), format!("echo 'ping {i}'; sleep 0.4")],
                    PathBuf::from("/tmp"),
                    80,
                    24,
                    HashMap::new(),
                )
                .await?;
            assert!(pid > 0);

            // Verify active status
            let is_act = mgr.is_pane_active(&pane_id).await;
            assert!(is_act, "Pane should be active immediately after spawn");

            // Write some input
            let _ = mgr.write_input(&pane_id, b"echo test\n").await;

            // Wait a moment for output to be processed into ring buffer
            tokio::time::sleep(Duration::from_millis(100)).await;

            // Retrieve scrollback while active
            let (scrollback, offset) = mgr.get_scrollback(&pane_id).await?;
            assert!(offset > 0, "Offset should be greater than 0");
            let text = String::from_utf8_lossy(&scrollback);
            assert!(text.contains(&format!("ping {i}")), "Output should contain ping message");

            // Wait for exit
            tokio::time::sleep(Duration::from_millis(400)).await;

            // Now pane should no longer be active
            let is_act_after = mgr.is_pane_active(&pane_id).await;
            assert!(!is_act_after, "Pane should be inactive after process exit");

            Ok::<(), aetherd::pty_manager::PtyError>(())
        });
        handles.push(handle);
    }

    for h in handles {
        h.await??;
    }

    Ok(())
}

#[tokio::test]
async fn test_pty_process_tree_kill_cleanup() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, _rx) = broadcast::channel(100);
    let manager = Arc::new(PtyManager::new(tx));
    let pane_id = "kill_tree_pane".to_string();

    // Spawn a shell that spawns a deep child process
    let pid = manager
        .spawn_pane(
            pane_id.clone(),
            Some("/bin/sh".to_string()),
            vec!["-c".to_string(), "sleep 100 & sleep 100 & wait".to_string()],
            PathBuf::from("/tmp"),
            80,
            24,
            HashMap::new(),
        )
        .await?;

    tokio::time::sleep(Duration::from_millis(100)).await;

    // Check that children exist in /proc
    let children_path = format!("/proc/{pid}/task/{pid}/children");
    let mut child_pids = Vec::new();
    if let Ok(content) = std::fs::read_to_string(&children_path) {
        for part in content.split_whitespace() {
            if let Ok(cpid) = part.parse::<u32>() {
                child_pids.push(cpid);
            }
        }
    }

    println!("Spawned root PID: {}, child PIDs: {:?}", pid, child_pids);

    // Now kill the pane
    manager.kill_pane(&pane_id, Some(9)).await?;

    // Give kernel a moment to deliver SIGKILL and reap
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Verify root is dead
    let root_alive = std::path::Path::new(&format!("/proc/{pid}")).exists();
    assert!(!root_alive, "Root process {} should be dead after kill_pane", pid);

    // Verify children are dead
    for cpid in child_pids {
        let child_alive = std::path::Path::new(&format!("/proc/{cpid}")).exists();
        assert!(!child_alive, "Child process {} should be dead after kill_pane", cpid);
    }

    Ok(())
}

// ============================================================================
// 3. Ring Buffer Overflow & High-Throughput Stress Test
// ============================================================================

#[tokio::test]
async fn test_pty_ring_buffer_overflow_stress() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, _rx) = broadcast::channel(2000);
    let manager = Arc::new(PtyManager::new(tx));
    let pane_id = "ring_buffer_stress_pane".to_string();

    // Stream 1.5 megabytes of data through the PTY (DEFAULT_RING_BUFFER_CAPACITY is 512 KB)
    // 1500 lines of 1000 'A' characters = 1.5MB
    let pid = manager
        .spawn_pane(
            pane_id.clone(),
            Some("/bin/sh".to_string()),
            vec![
                "-c".to_string(),
                "head -c 1500000 /dev/zero | tr '\\000' 'A'; echo 'FINISHED_STREAM'; sleep 2".to_string(),
            ],
            PathBuf::from("/tmp"),
            80,
            24,
            HashMap::new(),
        )
        .await?;

    assert!(pid > 0);

    // Wait for the stream to finish
    let mut finished = false;
    for i in 0..50 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        match manager.get_scrollback(&pane_id).await {
            Ok((scrollback, total_bytes)) => {
                println!("Iter {}: total_bytes={}, scrollback_len={}", i, total_bytes, scrollback.len());
                if total_bytes >= 1500000 {
                    assert!(
                        scrollback.len() <= 512 * 1024,
                        "Scrollback length ({}) must not exceed capacity 512KB ({})",
                        scrollback.len(),
                        512 * 1024
                    );
                    let text = String::from_utf8_lossy(&scrollback);
                    if text.contains("FINISHED_STREAM") {
                        finished = true;
                        break;
                    }
                }
            }
            Err(e) => {
                println!("Iter {}: get_scrollback error: {:?}", i, e);
                break;
            }
        }
    }

    assert!(finished, "PTY stream should complete and contain trailing data in ring buffer");
    Ok(())
}

// ============================================================================
// 4. Boundary and Concurrency Stress Tests
// ============================================================================

#[tokio::test]
async fn test_pty_resize_boundary_conditions() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, _rx) = broadcast::channel(100);
    let manager = Arc::new(PtyManager::new(tx));
    let pane_id = "resize_boundary_pane".to_string();

    manager
        .spawn_pane(
            pane_id.clone(),
            Some("/bin/sh".to_string()),
            vec!["-c".to_string(), "sleep 1".to_string()],
            PathBuf::from("/tmp"),
            80,
            24,
            HashMap::new(),
        )
        .await?;

    // cols=0, rows=0 should be clamped to at least 1 without error
    let res = manager.resize_pane(&pane_id, 0, 0).await;
    assert!(res.is_ok(), "Resize with 0 cols/rows should succeed (clamped to 1)");

    // Large dimensions
    let res_large = manager.resize_pane(&pane_id, 1000, 1000).await;
    assert!(res_large.is_ok(), "Resize with 1000x1000 should succeed");

    let _ = manager.kill_pane(&pane_id, Some(9)).await;
    Ok(())
}

// ============================================================================
// 5. End-to-End PTY Spawn with Mock SSH Executable
// ============================================================================

fn setup_mock_ssh_binary(dir: &std::path::Path) -> PathBuf {
    let _ = fs::create_dir_all(dir);
    let bin_path = dir.join("ssh");

    // Script writes each argument on its own line in $MOCK_SSH_LOG
    let script = r#"#!/bin/bash
LOG_FILE="${MOCK_SSH_LOG}"
> "$LOG_FILE"
for arg in "$@"; do
    echo "$arg" >> "$LOG_FILE"
done
echo "MOCK_SSH_DONE"
sleep 1
"#;

    fs::write(&bin_path, script).expect("Failed to write mock ssh script");
    let mut perms = fs::metadata(&bin_path).expect("Failed to get perms").permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&bin_path, perms).expect("Failed to set perms");

    bin_path
}

fn read_mock_ssh_args(log_path: &PathBuf) -> Vec<String> {
    if let Ok(content) = fs::read_to_string(log_path) {
        content.lines().map(|s| s.to_string()).collect()
    } else {
        Vec::new()
    }
}

#[tokio::test]
async fn test_spawn_pane_with_mock_ssh_command_string() -> Result<(), Box<dyn std::error::Error>> {
    let uid = uuid::Uuid::new_v4().simple().to_string();
    let temp_dir = std::env::temp_dir().join(format!("aether_mock_ssh_cmd_{uid}"));
    let mock_ssh = setup_mock_ssh_binary(&temp_dir);
    let log_path = temp_dir.join("args_cmd.log");
    let (tx, _rx) = broadcast::channel(100);
    let manager = Arc::new(PtyManager::new(tx));
    let pane_id = format!("mock_ssh_cmd_pane_{uid}");

    let mut env_vars = HashMap::new();
    env_vars.insert("MOCK_SSH_LOG".to_string(), log_path.to_string_lossy().to_string());

    let cmd_str = format!("{} -p 2222 user@host", mock_ssh.to_string_lossy());
    let pid = manager
        .spawn_pane(
            pane_id.clone(),
            Some(cmd_str),
            Vec::new(),
            PathBuf::from("/tmp"),
            80,
            24,
            env_vars,
        )
        .await?;

    assert!(pid > 0);

    tokio::time::sleep(Duration::from_millis(200)).await;

    let args = read_mock_ssh_args(&log_path);
    assert_eq!(
        args,
        vec![
            "-o",
            "ServerAliveInterval=15",
            "-o",
            "ServerAliveCountMax=3",
            "-o",
            "TCPKeepAlive=yes",
            "-p",
            "2222",
            "user@host"
        ],
        "Mock SSH should have received keepalive options injected at index 0"
    );

    let _ = manager.kill_pane(&pane_id, Some(9)).await;
    let _ = fs::remove_dir_all(&temp_dir);
    Ok(())
}

#[tokio::test]
async fn test_spawn_pane_with_mock_ssh_preserves_custom_server_alive_interval() -> Result<(), Box<dyn std::error::Error>> {
    let uid = uuid::Uuid::new_v4().simple().to_string();
    let temp_dir = std::env::temp_dir().join(format!("aether_mock_ssh_custom_{uid}"));
    let mock_ssh = setup_mock_ssh_binary(&temp_dir);
    let log_path = temp_dir.join("args_custom.log");
    let (tx, _rx) = broadcast::channel(100);
    let manager = Arc::new(PtyManager::new(tx));
    let pane_id = format!("mock_ssh_custom_pane_{uid}");

    let mut env_vars = HashMap::new();
    env_vars.insert("MOCK_SSH_LOG".to_string(), log_path.to_string_lossy().to_string());

    let cmd_str = format!("{} -i key.pem -o ServerAliveInterval=60 host", mock_ssh.to_string_lossy());
    let pid = manager
        .spawn_pane(
            pane_id.clone(),
            Some(cmd_str),
            Vec::new(),
            PathBuf::from("/tmp"),
            80,
            24,
            env_vars,
        )
        .await?;

    assert!(pid > 0);

    tokio::time::sleep(Duration::from_millis(200)).await;

    let args = read_mock_ssh_args(&log_path);
    assert!(args.contains(&"ServerAliveInterval=60".to_string()), "Custom 60s interval must be preserved");
    assert!(!args.contains(&"ServerAliveInterval=15".to_string()), "Default 15s interval must NOT be injected");
    assert!(args.contains(&"ServerAliveCountMax=3".to_string()), "Missing ServerAliveCountMax must be injected");
    assert!(args.contains(&"TCPKeepAlive=yes".to_string()), "Missing TCPKeepAlive must be injected");

    let _ = manager.kill_pane(&pane_id, Some(9)).await;
    let _ = fs::remove_dir_all(&temp_dir);
    Ok(())
}

#[tokio::test]
async fn test_spawn_pane_with_mock_ssh_quoted_command() -> Result<(), Box<dyn std::error::Error>> {
    let uid = uuid::Uuid::new_v4().simple().to_string();
    let temp_dir = std::env::temp_dir().join(format!("aether_mock_ssh_quoted_{uid}"));
    let mock_ssh = setup_mock_ssh_binary(&temp_dir);
    let log_path = temp_dir.join("args_quoted.log");
    let (tx, _rx) = broadcast::channel(100);
    let manager = Arc::new(PtyManager::new(tx));
    let pane_id = format!("mock_ssh_quoted_pane_{uid}");

    let mut env_vars = HashMap::new();
    env_vars.insert("MOCK_SSH_LOG".to_string(), log_path.to_string_lossy().to_string());

    let cmd_str = format!("{} -p 2222 user@host 'echo hello world'", mock_ssh.to_string_lossy());
    let pid = manager
        .spawn_pane(
            pane_id.clone(),
            Some(cmd_str),
            Vec::new(),
            PathBuf::from("/tmp"),
            80,
            24,
            env_vars,
        )
        .await?;

    assert!(pid > 0);

    tokio::time::sleep(Duration::from_millis(200)).await;

    let args = read_mock_ssh_args(&log_path);
    // Quoted string 'echo hello world' should remain a single argument: "echo hello world"
    assert!(args.contains(&"echo hello world".to_string()), "Quoted argument must be preserved as a single token");
    assert!(args.contains(&"ServerAliveInterval=15".to_string()), "Keepalive interval must be injected");

    let _ = manager.kill_pane(&pane_id, Some(9)).await;
    let _ = fs::remove_dir_all(&temp_dir);
    Ok(())
}

#[tokio::test]
async fn test_pty_session_retention_after_child_exit() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, _rx) = broadcast::channel(100);
    let manager = Arc::new(PtyManager::new(tx));
    let uid = uuid::Uuid::new_v4().simple().to_string();
    let pane_id = format!("retention_pane_{uid}");

    let pid = manager
        .spawn_pane(
            pane_id.clone(),
            Some("/bin/sh".to_string()),
            vec!["-c".to_string(), "echo 'RETAIN_THIS_OUTPUT'".to_string()],
            PathBuf::from("/tmp"),
            80,
            24,
            HashMap::new(),
        )
        .await?;

    assert!(pid > 0);

    // Wait until the child process actually exits
    let mut exited = false;
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        if !manager.is_pane_active(&pane_id).await {
            exited = true;
            break;
        }
    }
    assert!(exited, "Process should have exited");

    // The session and ring buffer must still be retained so get_scrollback succeeds
    let (scrollback, offset) = manager.get_scrollback(&pane_id).await?;
    assert!(offset > 0, "Offset should be greater than 0");
    let text = String::from_utf8_lossy(&scrollback);
    assert!(
        text.contains("RETAIN_THIS_OUTPUT"),
        "Scrollback must retain output across child exit"
    );

    // Explicit kill_pane cleans up the retained session
    manager.kill_pane(&pane_id, None).await?;
    let err = manager.get_scrollback(&pane_id).await;
    assert!(err.is_err(), "Session must be removed after explicit kill_pane");

    Ok(())
}

#[tokio::test]
async fn test_pty_session_retention_concurrent_rapid_exits() -> Result<(), Box<dyn std::error::Error>> {
    let (tx, _rx) = broadcast::channel(1000);
    let manager = Arc::new(PtyManager::new(tx));
    let num_panes = 20;
    let mut pane_ids = Vec::new();

    // 1. Concurrently spawn 20 panes that write distinct payloads and exit with various codes
    for i in 0..num_panes {
        let uid = uuid::Uuid::new_v4().simple().to_string();
        let pane_id = format!("concurrent_retention_{uid}_{i}");
        let exit_code = i % 5;
        let script = format!("echo 'CONCURRENT_PAYLOAD_{i}_{uid}'; exit {exit_code}");

        let pid = manager
            .spawn_pane(
                pane_id.clone(),
                Some("/bin/sh".to_string()),
                vec!["-c".to_string(), script],
                PathBuf::from("/tmp"),
                80,
                24,
                HashMap::new(),
            )
            .await?;
        assert!(pid > 0);
        pane_ids.push((pane_id, i, uid));
    }

    // 2. Wait for all 20 processes to exit
    for (pane_id, _, _) in &pane_ids {
        let mut exited = false;
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(50)).await;
            if !manager.is_pane_active(pane_id).await {
                exited = true;
                break;
            }
        }
        assert!(exited, "Pane {} should have exited", pane_id);
    }

    // 3. Verify scrollback retention and idempotency for all 20 panes
    for (pane_id, idx, uid) in &pane_ids {
        let expected_token = format!("CONCURRENT_PAYLOAD_{idx}_{uid}");

        // Call 1
        let (buf1, off1) = manager.get_scrollback(pane_id).await?;
        assert!(off1 > 0);
        let text1 = String::from_utf8_lossy(&buf1);
        assert!(
            text1.contains(&expected_token),
            "Pane {} scrollback must contain expected payload",
            pane_id
        );

        // Call 2 (idempotency check)
        let (buf2, off2) = manager.get_scrollback(pane_id).await?;
        assert_eq!(off1, off2, "Offset must be identical on subsequent calls");
        assert_eq!(buf1, buf2, "Buffer must be identical on subsequent calls");

        // Edge case: resize on exited pane
        let _ = manager.resize_pane(pane_id, 100, 30).await;

        // Edge case: write_input on exited pane (must not panic)
        let _ = manager.write_input(pane_id, b"echo after exit\n").await;

        // Clean up via kill_pane
        manager.kill_pane(pane_id, None).await?;

        // Session must now be gone
        let after_kill = manager.get_scrollback(pane_id).await;
        assert!(
            after_kill.is_err(),
            "Pane {} must return NotFound after kill_pane",
            pane_id
        );
    }

    Ok(())
}

