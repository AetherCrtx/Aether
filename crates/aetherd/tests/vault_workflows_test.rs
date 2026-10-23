//! Reads the seeded Aether Drive workflows from the real runtime vault.
//!
//! Verifies the markdown files shipped in `~/.local/share/aether/vault/Workflows`
//! parse into executable workflows through the same code path `aetherd` uses.

use aetherd::brain_db::BrainDb;
use aetherd::obsidian_sync::ObsidianSyncEngine;

fn runtime_vault() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let vault = std::path::PathBuf::from(home).join(".local/share/aether/vault");
    vault.is_dir().then_some(vault)
}

#[test]
fn seeded_vault_workflows_parse() {
    let Some(vault) = runtime_vault() else {
        eprintln!("skipping: no runtime vault at ~/.local/share/aether/vault");
        return;
    };

    let db = BrainDb::open_in_memory().expect("in-memory db");
    let engine = ObsidianSyncEngine::new(db, "default", &vault);
    let workflows = engine.load_workflows().expect("load workflows");

    assert!(
        !workflows.is_empty(),
        "expected seeded workflows in {}",
        vault.join("Workflows").display()
    );

    for wf in &workflows {
        assert!(!wf.id.is_empty(), "workflow id must not be empty");
        assert!(!wf.command_template.is_empty(), "{} has no command", wf.id);
        assert!(
            wf.relative_path.starts_with("Workflows/"),
            "{} has unexpected path {}",
            wf.id,
            wf.relative_path
        );
        // Templates may contain {{params}}; plain commands must not.
        assert!(
            !wf.command_template.contains("---"),
            "{} leaked frontmatter into the command",
            wf.id
        );
    }

    let ids: Vec<&str> = workflows.iter().map(|w| w.id.as_str()).collect();
    for expected in [
        "wf_worktree_cleanup",
        "wf_cargo_check",
        "wf_port_kill",
        "wf_broadcast_review",
        "wf_docker_logs",
    ] {
        assert!(ids.contains(&expected), "missing workflow {expected} in {ids:?}");
    }

    let cargo = workflows.iter().find(|w| w.id == "wf_cargo_check").unwrap();
    assert!(cargo.command_template.contains("{{crate_name}}"));
    assert_eq!(cargo.tags, vec!["rust", "build"]);
}
