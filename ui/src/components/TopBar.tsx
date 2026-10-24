import React, { useState } from 'react';
import {
  useAetherStore,
  toggleCommandPalette,
  toggleThemeModal,
  toggleBackgroundDrawer,
  equalizeLayout,
  splitActivePane,
  openDiffGatekeeper,
  toggleTimeTravel,
  toggleOrchestrator,
  toggleObsidianSidebar,
  toggleAiAssistant,
  toggleAiSettings,
  spawnAgentPane,
  setDefaultShell,
  toggleCustomToolModal,
  isRunningInTauri,
  AGENT_PALETTES,
} from '../stores/aetherStore';
import { ChromeHeaderTabs } from './ChromeHeaderTabs';
import {
  SlidersHorizontal,
  Plus,
  ChevronDown,
  Columns,
  Rows,
  GitBranch,
  History,
  Sparkles,
  Brain,
  Bot,
  Minus,
  Square,
  X,
  Palette,
  Layers,
  Search,
} from 'lucide-react';

export interface TopBarProps {
  onToggleAi?: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleAi,
  onOpenSettings,
  className = '',
}) => {
  const store = useAetherStore();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [spawnMenuOpen, setSpawnMenuOpen] = useState(false);

  const handleMinimize = async () => {
    if (isRunningInTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      } catch (e) {
        console.warn('Tauri minimize failed:', e);
      }
    } else {
      console.log('[WebPreview] Window minimize');
    }
  };

  const handleMaximize = async () => {
    if (isRunningInTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
      } catch (e) {
        console.warn('Tauri toggleMaximize failed:', e);
      }
    } else {
      console.log('[WebPreview] Window toggleMaximize');
    }
  };

  const handleClose = async () => {
    if (isRunningInTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch (e) {
        console.warn('Tauri close failed:', e);
      }
    } else {
      console.log('[WebPreview] Window close');
    }
  };

  const activeProvider = store.selectedAiProvider || 'openai';
  const customProvider = store.customProviders.find((p) => p.id === activeProvider);
  const activeProviderLabel = customProvider?.displayName || activeProvider;
  const isAiConnected = Boolean(activeProvider);

  const handleAiPillClick = (e: React.MouseEvent) => {
    if (onToggleAi) {
      onToggleAi();
    } else if (e.altKey) {
      toggleAiSettings(true);
    } else {
      toggleAiAssistant();
    }
  };

  return (
    <header
      className={`h-10 bg-cortex-bg border-b border-cortex-border px-3 flex items-center justify-between z-20 shrink-0 select-none ${className}`}
      data-testid="top-bar"
    >
      {/* Left: Terminal Tab Buttons directly matching reference design */}
      <div className="flex items-center min-w-0 flex-1 mr-4" data-testid="topbar-tabs-container">
        <ChromeHeaderTabs />
      </div>

      {/* Right: Clean Status, Tools, and Window Controls */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* "AI Connected" Status Pill matching reference mockup */}
        <button
          onClick={handleAiPillClick}
          className="flex items-center gap-2 px-3 py-1 rounded text-xs font-mono text-cortex-text transition-all hover:bg-cortex-surface2 cursor-pointer"
          title={`AI Provider: ${activeProviderLabel} - Click to toggle AI Assistant (Alt+Click for Settings)`}
          data-testid="ai-status-pill"
        >
          <span
            className="w-2 h-2 rounded-full bg-[#00F0FF] shadow-[0_0_8px_#00F0FF] animate-pulse"
            data-testid="ai-status-dot"
          />
          <span className="font-medium text-xs tracking-tight">AI Connected</span>
          <span className="hidden" data-testid="ai-provider-label">
            ({activeProviderLabel})
          </span>
        </button>

        {/* AI Settings Trigger Button */}
        <button
          onClick={() => {
            if (onOpenSettings) onOpenSettings();
            else toggleAiSettings(true);
          }}
          className="p-1 rounded text-cortex-textMuted hover:text-cortex-accent hover:bg-cortex-surface2 transition-colors"
          title="AI Provider Settings"
          data-testid="btn-ai-settings"
        >
          <Bot className="w-3.5 h-3.5 text-cortex-accent" />
        </button>

        {/* Compact Quick Tools Dropdown */}
        <div className="relative">
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            className="p-1 rounded text-cortex-textMuted hover:text-cortex-accent hover:bg-cortex-surface2 transition-colors"
            title="Terminal Tools & Split Options"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {toolsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
              <div className="absolute right-0 mt-1.5 w-52 bg-cortex-bgAlt border border-cortex-border rounded-lg shadow-2xl py-1 z-50 text-xs font-sans divide-y divide-cortex-border">
                {/* Split Controls */}
                <div className="p-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-cortex-textMuted font-mono uppercase tracking-wider pl-1">
                    Split Pane
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        splitActivePane('vertical');
                        setToolsOpen(false);
                      }}
                      className="p-1 rounded hover:bg-cortex-surface2 text-cortex-text"
                      title="Split Vertical (Cmd+D)"
                    >
                      <Columns className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        splitActivePane('horizontal');
                        setToolsOpen(false);
                      }}
                      className="p-1 rounded hover:bg-cortex-surface2 text-cortex-text"
                      title="Split Horizontal (Cmd+Shift+D)"
                    >
                      <Rows className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        equalizeLayout();
                        setToolsOpen(false);
                      }}
                      className="p-1 rounded hover:bg-cortex-surface2 text-cortex-accent"
                      title="Equalize Layout (Alt+E)"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      toggleCommandPalette();
                      setToolsOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cortex-surface2 text-left transition-colors text-cortex-text"
                  >
                    <Search className="w-3.5 h-3.5 text-cortex-accent" />
                    <span>Command Palette (Ctrl+P)</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleThemeModal();
                      setToolsOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cortex-surface2 text-left transition-colors text-cortex-text"
                  >
                    <Palette className="w-3.5 h-3.5 text-purple-400" />
                    <span>Theme & Appearance</span>
                  </button>
                  <button
                    onClick={() => {
                      openDiffGatekeeper();
                      setToolsOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cortex-surface2 text-left transition-colors text-cortex-text"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-cortex-accent" />
                    <span>Diff Gatekeeper (Alt+M)</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleTimeTravel();
                      setToolsOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cortex-surface2 text-left transition-colors text-cortex-text"
                  >
                    <History className="w-3.5 h-3.5 text-amber-400" />
                    <span>Time Travel Snapshots</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleOrchestrator();
                      setToolsOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cortex-surface2 text-left transition-colors text-cortex-text"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Broadcast Prompt (Ctrl+Space)</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleObsidianSidebar();
                      setToolsOpen(false);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-cortex-surface2 text-left transition-colors text-cortex-text"
                  >
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span>Brain Notes (Ctrl+B)</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Standard Window Controls matching reference mockup */}
        <div
          className="flex items-center gap-2 pl-3 border-l border-cortex-border shrink-0 text-cortex-textMuted"
          data-testid="window-controls"
        >
          <button
            onClick={handleMinimize}
            className="p-1 hover:text-cortex-text transition-colors"
            title="Minimize"
            data-testid="window-minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1 hover:text-cortex-text transition-colors"
            title="Maximize"
            data-testid="window-maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="p-1 hover:text-cortex-error transition-colors"
            title="Close"
            data-testid="window-close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
