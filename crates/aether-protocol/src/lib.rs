pub mod agent;
pub mod ipc;
pub mod mcp;

pub use agent::*;
pub use ipc::*;
pub use mcp::*;

pub const DEFAULT_SOCKET_NAME: &str = "aether.sock";
pub const AETHER_SOCK_ENV: &str = "AETHER_SOCKET";
pub const DEFAULT_DB_FILENAME: &str = "brain.db";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipc_message_bincode_roundtrip() {
        let msg = IpcMessage::Request(IpcRequest::new(
            "req-1",
            IpcRequestPayload::PtyInput(PtyInputRequest {
                pane_id: "pane_123".to_string(),
                data: b"ls -la\n".to_vec(),
            }),
        ));

        let encoded = msg.encode_bincode().expect("Encoding bincode failed");
        // skip 4 bytes length
        let decoded = IpcMessage::decode_payload(&encoded[4..]).expect("Decoding bincode failed");
        assert_eq!(msg, decoded);
    }

    #[test]
    fn test_ipc_message_json_roundtrip() {
        let msg = IpcMessage::Event(IpcEvent::PaneStatusChanged {
            pane_id: "pane_456".to_string(),
            status: AgentStatus::Thinking,
        });

        let encoded = msg.encode_json().expect("Encoding json failed");
        let decoded = IpcMessage::decode_payload(&encoded[4..]).expect("Decoding json failed");
        assert_eq!(msg, decoded);
    }

    #[test]
    fn test_mcp_tools_catalog() {
        let tools = all_aether_mcp_tools();
        assert_eq!(tools.len(), 9);
        let names: Vec<_> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"aether_get_shared_context"));
        assert!(names.contains(&"aether_claim_module"));
        assert!(names.contains(&"aether_publish_blackboard"));
        assert!(names.contains(&"aether_delegate_task"));
        assert!(names.contains(&"obsidian_read_note"));
        assert!(names.contains(&"obsidian_update_task"));
        assert!(names.contains(&"obsidian_append_memory"));
        assert!(names.contains(&"aether_release_module"));
        assert!(names.contains(&"aether_create_snapshot"));
    }

    #[test]
    fn test_release_and_snapshot_args_deserialize() {
        let rel: ReleaseModuleArgs =
            serde_json::from_str(r#"{"files":["src/a.rs","src/b.rs"]}"#).unwrap();
        assert_eq!(rel.files.len(), 2);

        let snap: CreateSnapshotArgs =
            serde_json::from_str(r#"{"summary":"Before refactor"}"#).unwrap();
        assert_eq!(snap.summary, "Before refactor");
    }
}
