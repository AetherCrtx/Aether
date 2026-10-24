import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './index.css';

import {
  useAetherStore,
  setupGlobalShortcuts,
  subscribeAetherEvents,
  refreshSharedContext,
  restoreActivePanes,
  spawnAgentPane,
  splitActivePane,
  equalizeLayout,
  toggleOrchestrator,
  openDiffGatekeeper,
  toggleTimeTravel,
  toggleObsidianSidebar,
  toggleBackgroundDrawer,
  toggleCommandPalette,
  toggleThemeModal,
  AGENT_PALETTES,
  setDefaultShell,
  toggleCustomToolModal,
  advancePipelineStage,
  clearPipeline,
} from './stores/aetherStore';

import { TerminalGrid } from './components/TerminalGrid';
import { ChromeHeaderTabs } from './components/ChromeHeaderTabs';
import { OrchestratorBar } from './components/OrchestratorBar';
import { DiffGatekeeperModal } from './components/DiffGatekeeperModal';
import { TimeTravelSlider } from './components/TimeTravelSlider';
import { ObsidianSidebar } from './components/ObsidianSidebar';
import { CustomToolModal } from './components/CustomToolModal';
import { ConfirmCloseModal } from './components/ConfirmCloseModal';
import { BackgroundTasksDrawer } from './components/BackgroundTasksDrawer';
import { WorkflowsModal } from './components/WorkflowsModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ThemeModal } from './components/ThemeModal';

import {
  Terminal,
  Plus,
  GitBranch,
  History,
  Brain,
  Sparkles,
  Columns,
  Rows,
  Radio,
  Layers,
  ChevronDown,
  SlidersHorizontal,
  X,
  Search,
  Palette,
} from 'lucide-react';

const App: React.FC = () => {
  const store = useAetherStore();
  const [spawnMenuOpen, setSpawnMenuOpen] = useState(false);

  // Map of paneId -> termWriter function
  const termWritersRef = useRef<Map<string, (data: Uint8Array | string, offset?: number) => void>>(new Map());
  // Pending PTY chunks arriving before the terminal component mounts and registers its writer
  const pendingPtyBuffersRef = useRef<Map<string, { bytes: Uint8Array; offset: number }[]>>(new Map());

  const registerTermWriter = useCallback(
    (paneId: string, writer: (data: Uint8Array | string, offset?: number) => void) => {
      termWritersRef.current.set(paneId, writer);
      // Flush any pending bytes that arrived while component was mounting
      const pending = pendingPtyBuffersRef.current.get(paneId);
      if (pending && pending.length > 0) {
        for (const chunk of pending) {
          writer(chunk.bytes, chunk.offset);
        }
        pendingPtyBuffersRef.current.delete(paneId);
      }
      return () => {
        termWritersRef.current.delete(paneId);
        pendingPtyBuffersRef.current.delete(paneId);
      };
    },
    []
  );

  useEffect(() => {
    // 1. Setup keyboard shortcuts: Ctrl+Space, Alt+M, Alt+Z, Ctrl+B, Alt+V, Alt+S, Alt+W
    const cleanupShortcuts = setupGlobalShortcuts();

    // 2. Subscribe to background events from aetherd (PTY outputs, status, ports, blackboard)
    const cleanupEvents = subscribeAetherEvents((paneId, bytes, offset = 0) => {
      const writer = termWritersRef.current.get(paneId);
      if (writer) {
        writer(bytes, offset);
      } else {
        // Buffer bytes until the pane mounts and registers its writer!
        let buf = pendingPtyBuffersRef.current.get(paneId);
        if (!buf) {
          buf = [];
          pendingPtyBuffersRef.current.set(paneId, buf);
        }
        buf.push({ bytes, offset });
      }
    });

    // 3. Restore any existing active panes from daemon on launch
    restoreActivePanes();

    // 4. Initial load of blackboard entries and file claims
    refreshSharedContext();

    return () => {
      cleanupShortcuts();
      cleanupEvents();
    };
  }, []);

  const activePane = store.panes.find((p) => p.id === store.activePaneId);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-mono overflow-hidden">
      {/* ================= TOP APPLICATION HEADER ================= */}
      <header className="h-10 bg-slate-900/90 backdrop-blur border-b border-slate-800/80 px-3 flex items-center justify-between z-30 shrink-0 select-none">
        {/* Brand & Logo */}
        <div className="flex items-center space-x-2 shrink-0 pr-2 border-r border-slate-800">
          <img src="/Aether.svg" className="w-4 h-4 rounded-sm object-contain" alt="Aether" />
          <span className="font-bold text-xs tracking-wider text-slate-100 hidden sm:inline">
            AETHER<span className="text-cyan-400 font-light">//TERM</span>
          </span>
        </div>

        {/* Chrome-Style Tabs & '+' Button directly in Header */}
        <ChromeHeaderTabs />

        {/* Pending Pipeline Stage Banner */}
        {store.pipelineActive && store.pipelineQueue.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/50 text-[10px] font-mono text-amber-200 shrink-0">
            <span className="hidden lg:inline">
              Next stage: @{store.pipelineQueue[0].targetCli}
            </span>
            <span className="px-1 rounded-full bg-amber-600 text-white text-[9px] font-bold">
              {store.pipelineQueue.length}
            </span>
            <button
              onClick={() => advancePipelineStage()}
              className="px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
              title="Advance Pipeline Stage (Alt+Shift+P)"
            >
              Advance
            </button>
            <button
              onClick={() => clearPipeline()}
              className="p-0.5 rounded text-amber-300 hover:text-white transition-colors"
              title="Cancel remaining stages"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Global Action Toolbar */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {/* Command Palette Button */}
          <button
            onClick={() => toggleCommandPalette()}
            className="flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors"
            title="Command Palette (Ctrl+P / Cmd+P)"
          >
            <Search className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Palette</span>
            <kbd className="hidden lg:inline text-[9px] bg-slate-900 text-slate-400 px-1 py-0.2 rounded border border-slate-800">
              Ctrl+P
            </kbd>
          </button>

          {/* Theme & Appearance Button */}
          <button
            onClick={() => toggleThemeModal()}
            className="flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors"
            title="Theme & Appearance (Cmd+, / Ctrl+,)"
          >
            <Palette className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden md:inline">Theme</span>
            <kbd className="hidden lg:inline text-[9px] bg-slate-900 text-slate-400 px-1 py-0.2 rounded border border-slate-800">
              Cmd+,
            </kbd>
          </button>

          {/* Background Tasks Drawer Button */}
          <button
            onClick={() => toggleBackgroundDrawer()}
            className={`flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] border transition-colors ${
              store.backgroundTasks.length > 0
                ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
            }`}
            title="Background Terminals & Tasks (Alt+Shift+B)"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xl:inline">Background</span>
            {store.backgroundTasks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-600 text-white font-mono font-bold">
                {store.backgroundTasks.length}
              </span>
            )}
          </button>

          {/* Equalize / Balance Panes Button */}
          <button
            onClick={() => equalizeLayout()}
            className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Equalize & Balance Split Panes (Alt+E)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          {/* Spawn Agent Button & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setSpawnMenuOpen(!spawnMenuOpen)}
              className="flex items-center space-x-1 px-2 py-1 rounded bg-indigo-600/90 hover:bg-indigo-600 text-white text-[11px] font-medium shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Spawn</span>
              <ChevronDown className="w-3 h-3 text-indigo-200" />
            </button>

            {spawnMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setSpawnMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-60 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 z-50 text-xs divide-y divide-slate-800/80">
                  {/* Interactive Shells Section */}
                  <div className="py-1">
                    <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-cyan-400">
                      Interactive Shells
                    </div>
                    {store.detectedTools.filter((t) => t.category === 'shell').length > 0
                      ? store.detectedTools
                          .filter((t) => t.category === 'shell')
                          .map((tool) => {
                            const isDefault = store.defaultShell === tool.id || store.defaultShell === tool.binary;
                            return (
                              <div
                                key={tool.id}
                                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-800 transition-colors group cursor-pointer"
                                onClick={() => {
                                  spawnAgentPane(tool.id, false);
                                  setSpawnMenuOpen(false);
                                }}
                              >
                                <div className="flex items-center space-x-2">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: tool.color }}
                                  />
                                  <span className="text-slate-200 group-hover:text-white font-mono text-[11px]">
                                    {tool.name}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDefaultShell(tool.id);
                                  }}
                                  className={`text-[9px] px-1 py-0.5 rounded font-mono transition-colors ${
                                    isDefault
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                      : 'text-slate-500 hover:text-slate-300'
                                  }`}
                                  title={isDefault ? 'Current default startup shell' : 'Set as default startup shell'}
                                >
                                  {isDefault ? 'default' : 'set'}
                                </button>
                              </div>
                            );
                          })
                      : Object.entries(AGENT_PALETTES)
                          .filter(([_, info]) => info.category === 'shell')
                          .map(([key, info]) => {
                            const isDefault = store.defaultShell === key;
                            return (
                              <div
                                key={key}
                                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-800 transition-colors group cursor-pointer"
                                onClick={() => {
                                  spawnAgentPane(key, false);
                                  setSpawnMenuOpen(false);
                                }}
                              >
                                <div className="flex items-center space-x-2">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: info.color }}
                                  />
                                  <span className="text-slate-200 group-hover:text-white font-mono text-[11px]">
                                    {info.name}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                  </div>

                  {/* AI Agent Environments Section */}
                  <div className="py-1">
                    <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-indigo-400 flex items-center justify-between">
                      <span>Detected Agents</span>
                      <span className="text-[9px] text-emerald-400 font-normal">
                        {store.detectedTools.filter((t) => t.category === 'agent').length} found
                      </span>
                    </div>
                    {store.detectedTools.filter((t) => t.category === 'agent').length > 0 ? (
                      store.detectedTools
                        .filter((t) => t.category === 'agent')
                        .map((tool) => (
                          <button
                            key={tool.id}
                            onClick={() => {
                              spawnAgentPane(tool.id, true);
                              setSpawnMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 flex items-center space-x-2 hover:bg-slate-800 transition-colors"
                            title={tool.description}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tool.color }}
                            />
                            <span className="text-slate-200 hover:text-white text-[11px] font-mono truncate">
                              {tool.name}
                            </span>
                          </button>
                        ))
                    ) : (
                      <div className="px-3 py-1.5 text-[10px] text-slate-500 italic">
                        No agent CLIs detected
                      </div>
                    )}
                  </div>

                  {/* Custom Tool Option */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setSpawnMenuOpen(false);
                        toggleCustomToolModal(true);
                      }}
                      className="w-full text-left px-3 py-1.5 flex items-center space-x-2 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="font-mono text-[11px] font-medium">Custom CLI Tool...</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Quick Split Buttons */}
          <div className="hidden md:flex items-center space-x-1 border-l border-slate-800 pl-1">
            <button
              onClick={() => splitActivePane('vertical')}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Split Vertical (Alt+V)"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => splitActivePane('horizontal')}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Split Horizontal (Alt+S)"
            >
              <Rows className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Diff Gatekeeper Button */}
          <button
            onClick={() => openDiffGatekeeper()}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60 transition-colors"
            title="Worktree Diff Gatekeeper (Alt+M)"
          >
            <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">Diff</span>
          </button>

          {/* Time Travel Slider Button */}
          <button
            onClick={() => toggleTimeTravel()}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60 transition-colors"
            title="Time Travel Zero-Commit Snapshots (Alt+Z)"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Snapshots</span>
          </button>

          {/* Orchestrator Prompt Button */}
          <button
            onClick={() => toggleOrchestrator()}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-indigo-950/70 border border-indigo-700/50 hover:bg-indigo-900/80 text-indigo-200 text-[11px] transition-colors"
            title="Multi-CLI Prompt Orchestrator (Ctrl+Space)"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Broadcast</span>
          </button>

          {/* Collective Memory / Obsidian Sidebar Button */}
          <button
            onClick={() => toggleObsidianSidebar()}
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] border transition-colors ${
              store.obsidianSidebarOpen
                ? 'bg-purple-900/60 border-purple-500 text-purple-200 shadow-sm shadow-purple-500/20'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
            }`}
            title="Collective Memory Blackboard & Obsidian Vault (Ctrl+B)"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Brain</span>
            {store.blackboard.length > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[9px] bg-purple-700 text-white font-mono">
                {store.blackboard.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ================= MAIN TERMINAL AREA ================= */}
      <main className="flex-1 w-full relative overflow-hidden bg-slate-950">
        <TerminalGrid registerTermWriter={registerTermWriter} />
      </main>

      {/* ================= BOTTOM STATUS FOOTER ================= */}
      <footer className="h-6 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[10px] text-slate-500 shrink-0 z-20">
        {/* Left: Active Pane & Port Status */}
        <div className="flex items-center space-x-3 truncate">
          {activePane ? (
            <>
              <span className="text-slate-400">
                ACTIVE: <span className="text-slate-200">{activePane.id}</span> ({activePane.status})
              </span>
              {activePane.worktreePath && (
                <span className="hidden md:inline text-slate-500 truncate" title={activePane.worktreePath}>
                  DIR: {activePane.worktreePath}
                </span>
              )}
              {activePane.openPorts && activePane.openPorts.length > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  <span>PORTS: {activePane.openPorts.join(', ')}</span>
                </span>
              )}
            </>
          ) : (
            <span>No active terminal pane</span>
          )}
        </div>

        {/* Right: Keybinding cheat-sheet */}
        <div className="hidden sm:flex items-center space-x-2 text-slate-400">
          <span>
            <kbd className="text-cyan-300 bg-slate-800 px-1 py-0.5 rounded border border-slate-700">Ctrl+P</kbd> Palette
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Ctrl+T</kbd> Tab
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Ctrl+W</kbd> Close
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Cmd+D</kbd> Split
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+H/J/K/L</kbd> Nav
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+E</kbd> Balance
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+B</kbd> Detach
          </span>
          <span>
            <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+Shift+B</kbd> Bg
          </span>
        </div>
      </footer>

      {/* ================= MODALS & DRAWERS ================= */}
      <CommandPaletteModal />
      <ThemeModal />
      <OrchestratorBar />
      <DiffGatekeeperModal />
      <TimeTravelSlider />
      <ObsidianSidebar />
      <CustomToolModal />
      <ConfirmCloseModal />
      <BackgroundTasksDrawer />
      <WorkflowsModal />
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
