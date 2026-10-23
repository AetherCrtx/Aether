import React from 'react';
import {
  AgentPane,
  LayoutNode,
  setActivePane,
  spawnAgentPane,
  useAetherStore,
  AGENT_PALETTES,
  setDefaultShell,
  toggleCustomToolModal,
  updateSplitRatio,
  togglePaneInputBar,
} from '../stores/aetherStore';
import { AgentHeaderPill } from './AgentHeaderPill';
import { XtermWebGLPane } from './XtermWebGLPane';
import { CommandBlocksOverlay } from './CommandBlocksOverlay';
import { ModernInputBar } from './ModernInputBar';
import { ErrorRecoveryBanner } from './ErrorRecoveryBanner';
import { getPaneBlocks } from '../stores/aetherStore';
import { Terminal, Plus, Sparkles, Command } from 'lucide-react';

interface Props {
  registerTermWriter: (paneId: string, writer: (data: Uint8Array | string) => void) => () => void;
}

interface SplitDividerProps {
  splitId: string;
  direction: 'horizontal' | 'vertical';
  splitRatio: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

const SplitDivider: React.FC<SplitDividerProps> = ({
  splitId,
  direction,
  splitRatio,
  containerRef,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const isVertical = direction === 'vertical';

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let ratio: number;
      if (isVertical) {
        ratio = (moveEvent.clientX - rect.left) / rect.width;
      } else {
        ratio = (moveEvent.clientY - rect.top) / rect.height;
      }
      updateSplitRatio(splitId, ratio);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateSplitRatio(splitId, 0.5);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title="Drag to resize · Double click to center (50/50)"
      className={`group relative z-20 flex-shrink-0 select-none transition-colors ${
        isVertical
          ? 'w-2 -mx-0.5 cursor-col-resize flex justify-center items-center'
          : 'h-2 -my-0.5 cursor-row-resize flex justify-center items-center'
      }`}
    >
      {/* Visual Line */}
      <div
        className={`transition-all rounded-full ${
          isVertical ? 'w-[2px] h-full' : 'h-[2px] w-full'
        } ${
          isDragging
            ? 'bg-cyan-400 shadow-md shadow-cyan-500/50 scale-125'
            : 'bg-tokyo-border/80 group-hover:bg-cyan-400 group-hover:scale-125'
        }`}
      />
      {/* Central Grip Indicator */}
      <div
        className={`absolute rounded-sm transition-opacity pointer-events-none ${
          isVertical ? 'w-1 h-6' : 'h-1 w-6'
        } ${
          isDragging ? 'opacity-100 bg-cyan-400' : 'opacity-0 group-hover:opacity-100 bg-cyan-400/90'
        }`}
      />
    </div>
  );
};

const SplitNodeView: React.FC<{
  node: Extract<LayoutNode, { type: 'split' }>;
  renderLayout: (n: LayoutNode | null) => React.ReactNode;
}> = ({ node, renderLayout }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isVertical = node.direction === 'vertical';

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex ${
        isVertical ? 'flex-row' : 'flex-col'
      } overflow-hidden`}
    >
      <div
        style={{ flex: node.splitRatio }}
        className="w-full h-full overflow-hidden min-w-[50px] min-h-[50px]"
      >
        {renderLayout(node.children[0])}
      </div>
      <SplitDivider
        splitId={node.id}
        direction={node.direction}
        splitRatio={node.splitRatio}
        containerRef={containerRef}
      />
      <div
        style={{ flex: 1 - node.splitRatio }}
        className="w-full h-full overflow-hidden min-w-[50px] min-h-[50px]"
      >
        {renderLayout(node.children[1])}
      </div>
    </div>
  );
};

export const TerminalGrid: React.FC<Props> = ({ registerTermWriter }) => {
  const store = useAetherStore();

  const renderLayout = (node: LayoutNode | null): React.ReactNode => {
    if (!node) return null;

    if (node.type === 'pane') {
      const pane = store.panes.find((p) => p.id === node.paneId);
      if (!pane) return null;

      const isActive = store.activePaneId === pane.id;

      return (
        <div
          key={pane.id}
          data-pane-id={pane.id}
          className="w-full h-full flex flex-col bg-tokyo-bgDark border border-tokyo-border/70 overflow-hidden shadow-inner"
        >
          <AgentHeaderPill pane={pane} isActive={isActive} />
          <div className="flex-1 w-full relative flex flex-col min-h-0">
            <div className="flex-1 w-full relative min-h-0">
              {pane.viewMode === 'blocks' ? (
                <CommandBlocksOverlay paneId={pane.id} blocks={getPaneBlocks(pane.id)} />
              ) : (
                <XtermWebGLPane
                  paneId={pane.id}
                  isActive={isActive}
                  onFocus={() => setActivePane(pane.id)}
                  registerTermWriter={registerTermWriter}
                />
              )}
            </div>
            <ErrorRecoveryBanner pane={pane} />
            {pane.inputBarOpen && (
              <ModernInputBar
                paneId={pane.id}
                cliType={pane.cliType}
                isAgentPane={
                  (AGENT_PALETTES[pane.cliType]?.category ?? 'agent') === 'agent'
                }
                onClose={() => togglePaneInputBar(pane.id, false)}
              />
            )}
          </div>
        </div>
      );
    }

    if (node.type === 'split') {
      return (
        <SplitNodeView
          key={node.id}
          node={node}
          renderLayout={renderLayout}
        />
      );
    }

    return null;
  };

  // Empty state welcome screen
  if (!store.layout || store.panes.length === 0) {
    const detectedShells = store.detectedTools.filter((t) => t.category === 'shell');
    const shells = detectedShells.length > 0
      ? detectedShells
      : Object.entries(AGENT_PALETTES)
          .filter(([_, info]) => info.category === 'shell')
          .map(([key, info]) => ({
            id: key,
            name: info.name,
            binary: info.binary,
            path: info.binary,
            category: 'shell',
            color: info.color,
            description: '',
          }));

    const detectedAgents = store.detectedTools.filter((t) => t.category === 'agent');

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-tokyo-bgDark text-tokyo-fg select-none p-6 overflow-y-auto">
        <div className="w-16 h-16 rounded-2xl bg-tokyo-blue/10 border border-tokyo-blue/30 flex items-center justify-center mb-4 shadow-lg shadow-tokyo-blue/5 overflow-hidden p-2">
          <img src="/Aether.svg" className="w-full h-full object-contain" alt="AetherTerminal" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          AetherTerminal
        </h1>
        <p className="text-tokyo-comment text-xs max-w-md text-center mb-6">
          Multi-CLI Agentic Coding Orchestration with a Shared Brain & Obsidian Vault sync.
        </p>

        <div className="w-full max-w-xl mb-6 flex flex-col gap-5">
          {/* Shells */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2 flex items-center justify-between">
              <span>Interactive Shells</span>
              <span className="text-[10px] text-tokyo-comment lowercase font-normal">
                default: <span className="text-cyan-300 font-mono">{store.defaultShell}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {shells.map((tool) => {
                const isDefault = store.defaultShell === tool.id || store.defaultShell === tool.binary;
                return (
                  <div
                    key={tool.id}
                    onClick={() => spawnAgentPane(tool.id, false)}
                    className="flex items-center justify-between p-3 rounded-lg bg-tokyo-panel border border-tokyo-border hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: tool.color }}
                      />
                      <div>
                        <div className="text-xs font-semibold text-white group-hover:text-cyan-400">
                          {tool.name}
                        </div>
                        <div className="text-[10px] text-tokyo-comment font-mono">
                          {tool.binary}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDefaultShell(tool.id);
                      }}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                        isDefault
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                      }`}
                      title={isDefault ? 'Default startup shell' : 'Set as default'}
                    >
                      {isDefault ? 'default' : 'set'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Installed AI Coding Agents */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-2 flex items-center justify-between">
              <span>Detected Agent Orchestrators</span>
              <span className="text-[10px] text-emerald-400 font-normal">
                {detectedAgents.length} installed on device
              </span>
            </div>

            {detectedAgents.length === 0 ? (
              <div className="p-4 rounded-lg bg-tokyo-panel/60 border border-dashed border-tokyo-border text-center text-xs text-tokyo-comment">
                No AI coding CLI tools detected automatically in standard PATH.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {detectedAgents.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => spawnAgentPane(tool.id, true)}
                    className="flex items-center gap-2.5 p-3 rounded-lg bg-tokyo-panel border border-tokyo-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left group"
                    title={tool.description}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tool.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white group-hover:text-indigo-400 truncate">
                        {tool.name}
                      </div>
                      <div className="text-[10px] text-tokyo-comment font-mono truncate">
                        {tool.binary}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Custom Tool Trigger */}
            <button
              onClick={() => toggleCustomToolModal(true)}
              className="mt-2 w-full p-2.5 rounded-lg border border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-900/40 hover:bg-cyan-500/5 transition-all flex items-center justify-center gap-2 text-xs text-slate-300 group"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span>Run Custom CLI Agent or Command...</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-tokyo-comment border-t border-tokyo-border/60 pt-4">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-tokyo-panel border border-tokyo-border rounded text-[11px] font-mono text-tokyo-fg">
              Ctrl+Space
            </kbd>{' '}
            Orchestrator
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-tokyo-panel border border-tokyo-border rounded text-[11px] font-mono text-tokyo-fg">
              Alt+M
            </kbd>{' '}
            Diff Gatekeeper
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-tokyo-panel border border-tokyo-border rounded text-[11px] font-mono text-tokyo-fg">
              Ctrl+B
            </kbd>{' '}
            Obsidian Sidebar
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-1 bg-tokyo-bgDark">
      {renderLayout(store.layout)}
    </div>
  );
};
