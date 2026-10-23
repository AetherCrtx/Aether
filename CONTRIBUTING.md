# Contributing to AetherTerminal

Thank you for your interest in contributing to **AetherTerminal**! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

---

## 🏗️ Architecture Overview

AetherTerminal is organized as a Cargo workspace with a TypeScript frontend:

- **`crates/aetherd`**: The background Rust core daemon. Manages PTY sessions (`portable-pty`), embedded SQLite memory (`rusqlite` WAL + FTS5), Git worktree isolation (`git2`), and file system monitoring (`notify`).
- **`crates/aether-gui`**: Tauri v2 application linking WebKitGTK with native Linux capabilities and the frontend UI.
- **`crates/aether-protocol`**: Type definitions, IPC frame serialization, and wire protocol shared across all crates.
- **`crates/aether-mcp`**: Standalone Model Context Protocol (MCP) server communicating via stdio JSON-RPC 2.0 with AI coding agents.
- **`ui/`**: React 18 + TypeScript + Vite + Tailwind CSS frontend with `@xterm/xterm` and hardware-accelerated WebGL (`@xterm/addon-webgl`).
- **`bin/aether`**: Main launcher script managing daemon lifecycles, environment configuration, and desktop integration.

---

## 🛠️ Prerequisites

To build and run AetherTerminal locally on Linux, ensure you have:

1. **Rust toolchain** (1.75+):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. **Node.js & Bun** (or npm/pnpm):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
3. **System Dependencies** (Debian/Ubuntu/Arch):
   - **Debian / Ubuntu**:
     ```bash
     sudo apt update && sudo apt install -y \
       libwebkit2gtk-4.1-dev \
       build-essential \
       curl \
       wget \
       file \
       libssl-dev \
       libgtk-3-dev \
       libayatana-appindicator3-dev \
       librsvg2-dev
     ```
   - **Arch Linux / Ryoku / Hyprland**:
     ```bash
     sudo pacman -S --needed base-devel webkit2gtk-4.1 gtk3 openssl
     ```

---

## 🚀 Development Workflow

### 1. Clone & Setup

```bash
git clone https://github.com/Rasshqa/Aether.git
cd Aether
```

### 2. Frontend Development

```bash
cd ui
bun install
bun run dev
```

### 3. Build & Test Full Application

```bash
# Compile UI assets
cd ui && bun run build && cd ..

# Compile release binaries
cargo build --release --workspace

# Start AetherTerminal
./bin/aether
```

---

## 📜 Pull Request Guidelines

1. **Branch Naming**: Use descriptive branch names:
   - `feature/chrome-tab-drag`
   - `fix/pty-latency-pipe`
   - `docs/keybindings-update`
2. **Commit Conventions**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(gui): ...`
   - `fix(daemon): ...`
   - `perf(pty): ...`
   - `docs: ...`
3. **Tests & Lints**:
   - Run `cargo check --workspace`
   - Run `cd ui && bun run build` to verify TypeScript types and Vite bundling.
4. Keep pull requests focused on a single change or fix.
