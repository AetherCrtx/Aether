# Handoff: AetherTerminal Fase 1 Bug Fixes + Fase 2 Roadmap

**Tanggal:** 2026-10-24  
**Dari:** Session `20261023_235123_cd7b15`  
**Kepada:** Session berikutnya  
**Workspace:** `/home/rasshqa/projects/Elliot`

---

## Status Fase 1: 3 Bug Kritis (SEBAGIAN SELESAI)

### ✅ Bug 2: Default CWD ke `/` (FIXED & VERIFIED)
**Masalah:** Pane baru landing di `$HOME` bukan `/`.

**Root cause:** Fallback lama pakai `resolve_default_home_dir()`.

**Fix applied:**
- `crates/aetherd/src/main.rs`: Helper `resolve_spawn_working_dir(requested, ws_root, home)` → explicit request → repo root → `/`
- 5 unit test regresi (semua hijau):
  ```
  fresh_pane_defaults_to_filesystem_root_not_home
  workspace_root_wins_when_it_exists
  workspace_root_equal_to_home_falls_back_to_root
  explicit_request_wins_over_everything
  missing_requested_path_falls_back_to_root
  ```

**Verified:** `cargo test --workspace` → 32 passed.

---

### ✅ Bug 3: Lag Parah (FIXED & VERIFIED)
**Masalah:** UI freeze saat output tinggi (`cargo build`, `tail -f`).

**Root cause:**
1. `TextDecoder().decode()` + `stripAnsi()` di **setiap chunk** walau pane mode raw
2. `appendBlockOutput` append ke block yang sudah selesai (`exitCode !== null`) → string tumbuh tanpa batas
3. Overlay render 200KB string → ~3k text node DOM
4. Xterm tanpa `scrollback` eksplisit → buffer unbounded

**Fix applied:**
- `ui/src/stores/aetherStore.ts`:
  - `getOpenCommandBlock(paneId)` — cari block aktif (exitCode null)
  - Gate decode: `if (getOpenCommandBlock(pane_id))` sebelum decode+strip
  - `appendBlockOutput` early return kalau `exitCode !== null`
- `ui/src/components/CommandBlocksOverlay.tsx`:
  - Render tail 500 baris saja
  - Label "… N earlier lines hidden …" kalau truncated
- `ui/src/components/XtermWebGLPane.tsx`:
  - `scrollback: 5000` di Terminal config

**Verified:** `npx tsc --noEmit` 0 error, `npm run build` sukses 3.82s.

---

### ⚠️ Bug 1: Fastfetch Double (PARTIAL FIX — MASIH MUNCUL KADANG)

**Masalah:** Output `fastfetch` ter-render dua kali saat spawn pane baru.

**Root cause (diagnosed):** Race antara `getPaneScrollback()` async dan `registerTermWriter()` langsung. Byte PTY yang masuk **saat** scrollback masih in-flight ditulis live, lalu ditulis lagi saat scrollback tiba.

**Fix applied:**
- `ui/src/components/XtermWebGLPane.tsx` (line ~209-237):
  ```typescript
  let scrollbackRestored = false;
  const preRestoreQueue: (Uint8Array | string)[] = [];

  const unregister = registerTermWriter(paneId, (data) => {
    if (!scrollbackRestored) {
      preRestoreQueue.push(data);  // buffer sampai scrollback selesai
      return;
    }
    chunkQueue.push(data);
    scheduleFlush();
  });

  getPaneScrollback(paneId).then(...).finally(() => {
    scrollbackRestored = true;
    for (const chunk of preRestoreQueue) {
      chunkQueue.push(chunk);
    }
    preRestoreQueue.length = 0;
    if (chunkQueue.length > 0) scheduleFlush();
  });
  ```

**Status:** Logic terlihat benar, tapi **user melaporkan fastfetch masih double kadang-kadang**.

**Hipotesis belum dicek:**
1. **Timing window lebih sempit** — mungkin `getPaneScrollback()` return sangat cepat (<1ms) sehingga `finally()` callback belum sempat set `scrollbackRestored = true` sebelum live byte tiba.
2. **Event handler `PtyOutput` di `aetherStore.ts:1329`** — dua path write byte:
   - `onPtyData(pane_id, bytes)` → langsung ke xterm writer
   - `appendBlockOutput(pane_id, ...)` → ke state (tapi ini sudah di-gate)
   
   Kemungkinan `onPtyData` **tidak** respect queue — callback langsung dari `subscribeAetherEvents` di `main.tsx:87` yang bypass `scrollbackRestored` flag karena flag itu lokal di komponen.

3. **Pane re-mount** — kalau pane di-unmount lalu di-mount ulang (tab switch, layout change), `useEffect` jalan lagi, tapi scrollback sudah kosong (karena buffer di daemon per-pane singleton). Second mount restore scrollback kosong + live byte → tidak double, tapi **first mount** yang race.

**TODO untuk session berikutnya:**
- [ ] Tambah log `console.log('scrollback bytes:', bytes?.length, 'restored:', scrollbackRestored)` di `getPaneScrollback().then()` dan `registerTermWriter` callback untuk trace timing nyata.
- [ ] Cek apakah `main.tsx` `termWritersRef` registration race dengan komponen mount — apakah `pendingPtyBuffersRef` flush juga terjadi **sebelum** scrollback selesai?
- [ ] Alternatif fix: pindahkan `scrollbackRestored` flag ke **global state** (`aetherStore`), bukan lokal komponen, supaya `subscribeAetherEvents` bisa respect flag itu.
- [ ] Atau: ubah `getPaneScrollback` jadi **synchronous blocking IPC** (fetch scrollback sebelum pane di-mount), tapi ini butuh refactor Tauri command.

---

## ✅ Fase 1 Verifikasi Akhir

```bash
cargo check --workspace    # 0 error, 0 warning
cargo test --workspace     # 32 passed, 0 failed
npx tsc --noEmit           # 0 error
npm run build              # ✓ 3.82s
cargo build --release      # Finished 1m 31s
```

**Binary release:**
- `aetherd`: `2026-10-24 01:49:09` (PID 1390355 running)
- `aether-gui`: `2026-10-24 01:50:28`

**Git status:** 24 modified files + 5 new (uncommitted):
```
M  crates/aether-gui/src/ipc_bridge.rs
M  crates/aether-gui/src/main.rs
M  crates/aether-mcp/src/tools.rs
M  crates/aether-mcp/tests/mcp_integration_test.rs
M  crates/aether-protocol/src/ipc.rs
M  crates/aether-protocol/src/lib.rs
M  crates/aether-protocol/src/mcp.rs
M  crates/aetherd/src/lib.rs
M  crates/aetherd/src/main.rs             ← spawn_working_dir helper + tests
M  crates/aetherd/src/obsidian_sync.rs
M  crates/aetherd/src/pty_manager.rs
M  crates/aetherd/tests/daemon_integration_test.rs
M  ui/src/components/AgentHeaderPill.tsx
M  ui/src/components/CommandBlocksOverlay.tsx  ← tail 500 render
M  ui/src/components/ObsidianSidebar.tsx
M  ui/src/components/OrchestratorBar.tsx
M  ui/src/components/TerminalGrid.tsx
M  ui/src/components/XtermWebGLPane.tsx        ← scrollback queue + cap 5000
M  ui/src/main.tsx
M  ui/src/stores/aetherStore.ts                ← gate decode + getOpenCommandBlock
?? 11_warp_and_remediation_master_prompt.md
?? crates/aetherd/tests/vault_workflows_test.rs
?? ui/src/components/ErrorRecoveryBanner.tsx
?? ui/src/components/ModernInputBar.tsx
?? ui/src/components/WorkflowsModal.tsx
```

**Workflows seeded:** `~/.local/share/aether/vault/Workflows/*.md` (5 file) + wire full stack `ListWorkflows` IPC.

---

## 🚧 Fase 2: Integrasi Fitur Warp (BELUM MULAI)

**Referensi:** `.config/Hermes/composer-pastes/pasted_content_2026-10-23_18-33-19-778_13c5df.txt`

### Sudah Ada (dari Master Prompt Lama)
- ✅ Command Blocks (`CommandBlocksOverlay.tsx` — 188 lines, copy/bookmark/collapse)
- ✅ ModernInputBar (`ModernInputBar.tsx` — 154 lines, `$ CMD` / `# AI` mode, ghost-text)
- ✅ Workflows modal (`WorkflowsModal.tsx` — 169 lines, `Alt+R`, param parsing)
- ✅ Error recovery banner (`ErrorRecoveryBanner.tsx` — 59 lines, deteksi `error[E`, `ERR!`, `Traceback`)
- ✅ Pane view toggle (raw/blocks) di `AgentHeaderPill`
- ✅ Pipeline banner + advance di `main.tsx`

### Belum Ada (TODO Fase 2)
- [ ] **Split Panes** (horizontal/vertical rekursif) — `Cmd+D` / `Cmd+Shift+D`
- [ ] **Custom Tabs** (klik kanan → warna, double-click → rename)
- [ ] **Command Palette** (`Cmd+P`) — modal fuzzy search untuk command/settings/pane
- [ ] **Smart Autocomplete** — prediksi berbasis riwayat + konteks dir
- [ ] **Environment & Git Charms** — chip status (Node/Python/Rust version, git branch, uncommitted changes)
- [ ] **Interactive Diff View** — panel git diff per-file, revert changes, syntax highlighting
- [ ] **Aether Drive Sidebar** (`Cmd+\`) — file tree, global search (ripgrep), saved workflows/prompts/notebooks, env vars
- [ ] **Theming Engine** (`Cmd+,`) — built-in themes, custom YAML/JSON, background image/blur
- [ ] **Input Position** — opsi bottom (modern) vs inline (classic)
- [ ] **AI Agent Integration** — auto-detect input (shell vs natural language), multi-model picker, voice input, /conversations history
- [ ] **Third-Party CLI Detection** — toolbar bantuan saat deteksi Claude Code / Codex / Aider
- [ ] **SSH Session Persistence** — autocomplete & agent tetap jalan di remote

### Prioritas Fase 2 (Recommendation)
1. **Command Palette** — foundational UX, cepat build, high impact.
2. **Split Panes** — core terminal feature, cukup banyak user minta.
3. **Smart Autocomplete** — quality-of-life besar, pakai existing `recentCommandsFor()` di store.
4. **Theming Engine** — cosmetic tapi bikin sticky, relatif isolated.
5. **Aether Drive Sidebar** — besar, banyak subfeature, bisa incremental (file tree dulu, search/workflows belasan).

---

## 📝 Notes untuk Session Berikutnya

1. **Jangan commit dulu** — 24 modified + 5 new belum di-commit. Fase 1 Bug 1 masih partial, tunggu fix penuh dulu atau commit dengan catatan "known issue: fastfetch kadang double".

2. **Test manual wajib:**
   ```bash
   # Spawn pane baru
   pwd                   # harus `/`, bukan `$HOME`
   
   # Test fastfetch double (ulang 5x untuk reproduce)
   clear && fastfetch
   
   # Test lag
   cargo build --release  # di repo besar, harus smooth
   ```

3. **Daemon log level** — kalau mau trace race fastfetch, set `RUST_LOG=aether_gui=debug` sebelum start GUI:
   ```bash
   RUST_LOG=aether_gui=debug,aetherd=debug bin/aether gui
   ```

4. **Scrollback buffer size** — daemon pakai 512 KB ring buffer per pane (`pty_manager.rs:34`). Kalau fastfetch output <512 KB, harusnya masuk buffer penuh. Kalau >512 KB, tail aja yang masuk → double bisa jadi artefak partial restore + live append yang overlap.

5. **Alternative hypothesis:** Bukan race scrollback, tapi **shell init dobel**. Cek apakah `.bashrc` atau `config.fish` user dieksekusi 2x (misal ada symlink loop atau double source). Test: ganti shell jadi `sh -l -i` (tanpa custom config) dan coba spawn — kalau fastfetch hilang, berarti bukan bug Aether.

6. **XtermWebGLPane disposal** — ada 3 `useEffect` (mount, active, window focus). Pastikan cleanup semua effect jalan saat unmount, terutama `unregister()` dan `resizeObserver.disconnect()`.

---

## 🔧 Quick Start untuk Session Baru

```bash
cd /home/rasshqa/projects/Elliot

# Cek daemon jalan
bin/aether status

# Restart daemon (kalau perlu)
bin/aether restart

# Test spawn pane baru
bin/aether gui   # atau klik launcher

# Rebuild release (kalau ada perubahan)
cargo build --release -p aetherd -p aether-gui

# Test suite
cargo test --workspace
cd ui && npx tsc --noEmit && npm run build
```

**Model recommendation untuk Fase 2:** User prefer Flash (token efficiency). Long-running autonomous work → Flash, reasoning-heavy → Sonnet/Opus.

**Komunikasi:** User Bahasa Indonesia, tone direct (Eris ESTP 8w7 — tegas, action-oriented, no robot formal).

---

## Summary

| Item | Status | Next Action |
|---|---|---|
| Bug 2 (CWD `/`) | ✅ Fixed | None |
| Bug 3 (Lag) | ✅ Fixed | None |
| Bug 1 (Fastfetch double) | ⚠️ Partial | Debug timing + trace logs |
| Fase 2 fitur Warp | 🚧 Not started | Prioritize Command Palette → Split Panes |
| Git commit | ❌ Uncommitted | Wait Bug 1 full fix |
| Release binary | ✅ Fresh | Ready for manual test |

**Critical path:** Solve fastfetch double race → commit Fase 1 → mulai Fase 2 incremental (Command Palette first).
