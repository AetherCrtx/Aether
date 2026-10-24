pub mod client;
pub mod provider;
pub mod supervisor;

pub use client::{AiPilotClient, ChatMessage, ChatResponse, FunctionCall, FunctionDefinition, ToolCall, ToolDefinition};
pub use provider::{delete_provider_setting, load_provider_config, resolve_providers_path, save_provider_config, update_provider_setting};
pub use supervisor::{get_ai_pilot_tools, inspect_pane_screen, run_ai_pilot_cycle, send_keystroke, strip_ansi_escapes, type_into_pane, watch_pane_until_idle};
