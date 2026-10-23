pub mod brain_db;
pub mod config;
pub mod obsidian_sync;
pub mod pty_manager;
pub mod snapshot_engine;
pub mod worktree_engine;

use aether_protocol::ipc::IpcEvent;
use brain_db::BrainDb;
use pty_manager::PtyManager;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct DaemonContext {
    pub db: BrainDb,
    pub pty_manager: Arc<PtyManager>,
    pub event_tx: broadcast::Sender<IpcEvent>,
    pub obsidian_sync: Arc<crate::obsidian_sync::ObsidianSyncEngine>,
}
