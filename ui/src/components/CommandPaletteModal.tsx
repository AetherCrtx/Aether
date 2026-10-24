import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAetherStore,
  toggleCommandPalette,
  toggleOrchestrator,
  toggleWorkflowsModal,
  toggleObsidianSidebar,
  openDiffGatekeeper,
  toggleTimeTravel,
  toggleCustomToolModal,
  toggleBackgroundDrawer,
  createTab,
  closeTab,
  nextTab,
  previousTab,
  splitActivePane,
  equalizeLayout,
  requestClosePane,
  sendPaneToBackground,
  spawnAgentPane,
  sendPtyInput,
  createSnapshot,
  toggleThemeModal,
} from '../stores/aetherStore';
import {
  Search,
  Terminal,
  Bot,
  Columns,
  Rows,
  Layers,
  GitPullRequest,
  History,
  BookOpen,
  Workflow as WorkflowIcon,
  Sliders,
  Sparkles,
  Plus,
  X,
  Zap,
  Trash2,
  RefreshCw,
  FolderPlus,
  Play,
  RotateCcw,
  Palette,
} from 'lucide-react';

interface PaletteCommand {
  id: string;
  title: string;
  description: string;
  category: 'Agents & AI' | 'Panes & Splits' | 'Tabs' | 'Git & Vault' | 'Terminal';
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void | Promise<void>;
}

export const CommandPaletteModal: React.FC = () => {
  const store = useAetherStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activePane = store.panes.find((p) => p.id === store.activePaneId);

  // Define commands catalog
  const commands: PaletteCommand[] = useMemo(() => {
    const list: PaletteCommand[] = [
      // 1. Agents & AI
      {
        id: 'ai-orchestrator',
        title: 'Open AI Prompt Orchestrator',
        description: 'Multi-agent pipeline prompt orchestrator (@claude -> @codex)',
        category: 'Agents & AI',
        shortcut: 'Ctrl+Space',
        icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
        action: () => toggleOrchestrator(true),
      },
      {
        id: 'aether-workflows',
        title: 'Open Aether Drive Workflows',
        description: 'Run parameterized bash workflows and runbooks from vault',
        category: 'Agents & AI',
        shortcut: 'Alt+R',
        icon: <WorkflowIcon className="w-4 h-4 text-emerald-400" />,
        action: () => toggleWorkflowsModal(true),
      },
      {
        id: 'spawn-claude',
        title: 'Spawn Agent: Claude Code',
        description: 'Launch Anthropic Claude Code agent pane with Aether MCP',
        category: 'Agents & AI',
        shortcut: '@claude',
        icon: <Bot className="w-4 h-4 text-[#D97757]" />,
        action: () => { spawnAgentPane('claude-code', true); },
      },
      {
        id: 'spawn-codex',
        title: 'Spawn Agent: OpenAI Codex',
        description: 'Launch OpenAI Codex agent pane with isolated worktree',
        category: 'Agents & AI',
        shortcut: '@codex',
        icon: <Bot className="w-4 h-4 text-[#10B981]" />,
        action: () => { spawnAgentPane('codex', true); },
      },
      {
        id: 'spawn-opencode',
        title: 'Spawn Agent: OpenCode',
        description: 'Launch OpenCode open-source terminal agent',
        category: 'Agents & AI',
        shortcut: '@opencode',
        icon: <Bot className="w-4 h-4 text-[#3B82F6]" />,
        action: () => { spawnAgentPane('opencode', true); },
      },
      {
        id: 'spawn-antigravity',
        title: 'Spawn Agent: Antigravity CLI',
        description: 'Launch Google Deepmind Antigravity coding assistant',
        category: 'Agents & AI',
        shortcut: '@antigravity',
        icon: <Bot className="w-4 h-4 text-[#A855F7]" />,
        action: () => { spawnAgentPane('antigravity', true); },
      },
      {
        id: 'spawn-hermes',
        title: 'Spawn Agent: Hermes Agent',
        description: 'Launch Hermes autonomous multi-step reasoning agent',
        category: 'Agents & AI',
        shortcut: '@hermes',
        icon: <Bot className="w-4 h-4 text-[#EC4899]" />,
        action: () => { spawnAgentPane('hermes', true); },
      },
      {
        id: 'custom-tool-modal',
        title: 'Register Custom Agent Tool',
        description: 'Configure and validate custom CLI executable in PATH',
        category: 'Agents & AI',
        icon: <FolderPlus className="w-4 h-4 text-purple-400" />,
        action: () => toggleCustomToolModal(true),
      },

      // 2. Panes & Splits
      {
        id: 'split-vertical',
        title: 'Split Pane Vertically (Side by Side)',
        description: 'Split the current pane horizontally into left and right columns',
        category: 'Panes & Splits',
        shortcut: 'Ctrl+D / Alt+V',
        icon: <Columns className="w-4 h-4 text-sky-400" />,
        action: () => { splitActivePane('vertical'); },
      },
      {
        id: 'split-horizontal',
        title: 'Split Pane Horizontally (Stacked)',
        description: 'Split the current pane vertically into top and bottom rows',
        category: 'Panes & Splits',
        shortcut: 'Ctrl+Shift+D / Alt+S',
        icon: <Rows className="w-4 h-4 text-sky-400" />,
        action: () => { splitActivePane('horizontal'); },
      },
      {
        id: 'balance-panes',
        title: 'Equalize & Balance Panes',
        description: 'Proportionally equalize widths and heights of all split panes',
        category: 'Panes & Splits',
        shortcut: 'Alt+E',
        icon: <Sliders className="w-4 h-4 text-indigo-400" />,
        action: () => equalizeLayout(),
      },
      {
        id: 'close-active-pane',
        title: 'Close Active Pane',
        description: 'Safely close pane with foreground process protection check',
        category: 'Panes & Splits',
        shortcut: 'Ctrl+W',
        icon: <X className="w-4 h-4 text-rose-400" />,
        action: () => {
          if (store.activePaneId) {
            requestClosePane(store.activePaneId);
          }
        },
      },
      {
        id: 'send-pane-background',
        title: 'Send Active Pane to Background',
        description: 'Detach running pane from view while preserving execution in aetherd',
        category: 'Panes & Splits',
        shortcut: 'Alt+B',
        icon: <Play className="w-4 h-4 text-amber-400" />,
        action: () => {
          if (store.activePaneId) {
            sendPaneToBackground(store.activePaneId);
          }
        },
      },
      {
        id: 'toggle-background-drawer',
        title: 'Toggle Background Tasks Drawer',
        description: 'Inspect detached tasks, build watchers, and dev servers',
        category: 'Panes & Splits',
        shortcut: 'Alt+Shift+B',
        icon: <Layers className="w-4 h-4 text-amber-300" />,
        action: () => toggleBackgroundDrawer(),
      },

      // 3. Tabs
      {
        id: 'new-tab',
        title: 'New Terminal Tab',
        description: 'Create a clean new terminal tab in header strip',
        category: 'Tabs',
        shortcut: 'Ctrl+T',
        icon: <Plus className="w-4 h-4 text-cyan-400" />,
        action: () => createTab(),
      },
      {
        id: 'next-tab',
        title: 'Next Tab',
        description: 'Cycle forward to the next tab',
        category: 'Tabs',
        shortcut: 'Ctrl+Tab',
        icon: <Layers className="w-4 h-4 text-slate-400" />,
        action: () => nextTab(),
      },
      {
        id: 'prev-tab',
        title: 'Previous Tab',
        description: 'Cycle backward to the previous tab',
        category: 'Tabs',
        shortcut: 'Ctrl+Shift+Tab',
        icon: <Layers className="w-4 h-4 text-slate-400" />,
        action: () => previousTab(),
      },
      {
        id: 'close-current-tab',
        title: 'Close Current Tab',
        description: 'Close active tab and terminate all its split panes',
        category: 'Tabs',
        shortcut: 'Ctrl+Shift+W',
        icon: <X className="w-4 h-4 text-rose-400" />,
        action: () => {
          if (store.activeTabId) {
            closeTab(store.activeTabId);
          }
        },
      },

      // 4. Git & Vault
      {
        id: 'diff-gatekeeper',
        title: 'Open Diff Gatekeeper & Squash Merge',
        description: 'Review git tree modifications across agent worktrees before merge',
        category: 'Git & Vault',
        shortcut: 'Alt+M',
        icon: <GitPullRequest className="w-4 h-4 text-emerald-400" />,
        action: () => openDiffGatekeeper(),
      },
      {
        id: 'time-travel-slider',
        title: 'Time Travel Rollback Slider',
        description: 'Instant zero-commit microsecond rollback to previous git tree objects',
        category: 'Git & Vault',
        shortcut: 'Alt+Z',
        icon: <History className="w-4 h-4 text-violet-400" />,
        action: () => toggleTimeTravel(),
      },
      {
        id: 'create-snapshot-now',
        title: 'Create Instant State Snapshot',
        description: 'Capture a zero-commit plumbing snapshot of current workspace state',
        category: 'Git & Vault',
        icon: <RotateCcw className="w-4 h-4 text-violet-300" />,
        action: async () => {
          await createSnapshot('Manual snapshot from Command Palette');
        },
      },
      {
        id: 'obsidian-sidebar',
        title: 'Obsidian Sprint Runner & Blackboard',
        description: 'Markdown sprint checklists and inter-agent collective memory',
        category: 'Git & Vault',
        shortcut: 'Ctrl+B',
        icon: <BookOpen className="w-4 h-4 text-purple-400" />,
        action: () => toggleObsidianSidebar(),
      },

      // 5. Terminal & System
      {
        id: 'spawn-default-shell',
        title: `Spawn Shell (${store.defaultShell || '$SHELL'})`,
        description: 'Open a standard interactive Linux shell pane',
        category: 'Terminal',
        icon: <Terminal className="w-4 h-4 text-green-400" />,
        action: () => { spawnAgentPane(store.defaultShell || 'shell', false); },
      },
      {
        id: 'clear-screen',
        title: 'Clear Terminal Screen',
        description: 'Send clear signal (Ctrl+L) to active pane PTY',
        category: 'Terminal',
        shortcut: 'Ctrl+L',
        icon: <Trash2 className="w-4 h-4 text-amber-400" />,
        action: () => {
          if (store.activePaneId) {
            sendPtyInput(store.activePaneId, '\x0c');
          }
        },
      },
      {
        id: 'theming-appearance',
        title: 'Theme & Appearance Settings',
        description: 'Choose terminal theme preset and configure window opacity',
        category: 'Terminal',
        shortcut: 'Cmd+,',
        icon: <Palette className="w-4 h-4 text-purple-400" />,
        action: () => toggleThemeModal(true),
      },
    ];

    // Dynamically add detected tools from system
    for (const tool of store.detectedTools) {
      if (
        !list.some(
          (c) =>
            c.id === `spawn-${tool.id}` ||
            c.title.toLowerCase().includes(tool.name.toLowerCase())
        )
      ) {
        list.push({
          id: `spawn-tool-${tool.id}`,
          title: `Spawn: ${tool.name}`,
          description: `${tool.description || 'System executable'} (${tool.path})`,
          category: tool.category === 'agent' ? 'Agents & AI' : 'Terminal',
          icon: tool.category === 'agent' ? (
            <Bot className="w-4 h-4" style={{ color: tool.color }} />
          ) : (
            <Terminal className="w-4 h-4" style={{ color: tool.color }} />
          ),
          action: () => {
            spawnAgentPane(tool.id, tool.category === 'agent');
          },
        });
      }
    }

    return list;
  }, [store.activePaneId, store.activeTabId, store.defaultShell, store.detectedTools]);

  // Filter commands with search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.shortcut && c.shortcut.toLowerCase().includes(q))
    );
  }, [commands, query]);

  // Reset selection index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus input on open
  useEffect(() => {
    if (store.commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [store.commandPaletteOpen]);

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        executeCommand(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleCommandPalette(false);
    }
  };

  const executeCommand = (cmd: PaletteCommand) => {
    toggleCommandPalette(false);
    try {
      cmd.action();
    } catch (err) {
      console.error('Command execution failed:', err);
    }
  };

  if (!store.commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => toggleCommandPalette(false)}
    >
      <div
        className="w-full max-w-2xl bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col font-mono"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top search bar */}
        <div className="h-12 px-3.5 flex items-center gap-2.5 border-b border-slate-800 bg-slate-950/80">
          <Search className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-mono"
            placeholder="Type a command or search action (e.g. split, claude, diff, tab)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[420px] overflow-y-auto py-1 divide-y divide-slate-800/40 select-none scrollbar-thin scrollbar-thumb-slate-800"
        >
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No matching commands found for "{query}"
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-950/70 border-l-2 border-cyan-400 text-cyan-100'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeCommand(cmd)}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div
                      className={`p-1.5 rounded-md ${
                        isSelected ? 'bg-cyan-900/60 text-cyan-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {cmd.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate flex items-center gap-2">
                        <span>{cmd.title}</span>
                        <span className="text-[10px] font-normal text-slate-500 bg-slate-800/70 px-1.5 py-0.2 rounded border border-slate-700/50">
                          {cmd.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {cmd.description}
                      </div>
                    </div>
                  </div>

                  {cmd.shortcut && (
                    <div className="shrink-0 flex items-center">
                      <kbd className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded shadow-sm">
                        {cmd.shortcut}
                      </kbd>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="h-8 px-3.5 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="bg-slate-800 text-slate-400 px-1 py-0.5 rounded">↑</kbd>{' '}
              <kbd className="bg-slate-800 text-slate-400 px-1 py-0.5 rounded">↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-slate-800 text-slate-400 px-1 py-0.5 rounded">↵</kbd> select
            </span>
            <span>
              <kbd className="bg-slate-800 text-slate-400 px-1 py-0.5 rounded">esc</kbd> close
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Aether Command Palette</span>
            <kbd className="bg-slate-800 text-cyan-300 px-1 py-0.5 rounded border border-slate-700">
              Ctrl+P
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
