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
        assert_eq!(tools.len(), 7);
        let names: Vec<_> = tools.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"aether_get_shared_context"));
        assert!(names.contains(&"aether_claim_module"));
        assert!(names.contains(&"aether_publish_blackboard"));
        assert!(names.contains(&"aether_delegate_task"));
        assert!(names.contains(&"obsidian_read_note"));
        assert!(names.contains(&"obsidian_update_task"));
        assert!(names.contains(&"obsidian_append_memory"));
    }
}
