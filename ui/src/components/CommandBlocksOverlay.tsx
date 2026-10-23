import React, { useState } from 'react';
import {
  CommandBlock,
  dispatchToPeerAgent,
  toggleBlockBookmark,
  toggleBlockCollapsed,
  AGENT_PALETTES,
} from '../stores/aetherStore';
import {
  Copy,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Send,
  Check,
  Clock,
  Terminal as TerminalIcon,
} from 'lucide-react';

interface Props {
  paneId: string;
  blocks: CommandBlock[];
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard can be unavailable inside the webview sandbox
  }
};

const formatDuration = (block: CommandBlock): string => {
  const end = block.finishedAt ?? Date.now();
  const ms = Math.max(0, end - block.startedAt);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export const CommandBlocksOverlay: React.FC<Props> = ({ paneId, blocks }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendMenuFor, setSendMenuFor] = useState<string | null>(null);

  const flashCopied = (id: string) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1200);
  };

  if (blocks.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-950 text-slate-500 select-none">
        <TerminalIcon className="w-6 h-6 opacity-50" />
        <div className="text-[11px] font-mono">No command blocks yet for this pane</div>
        <div className="text-[10px] text-slate-600">
          Run a command from the input bar to start the block timeline
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950 p-2 flex flex-col gap-2">
      {blocks.map((block) => {
        const failed = block.exitCode !== null && block.exitCode !== undefined && block.exitCode !== 0;
        const running = block.finishedAt === undefined;
        return (
          <div
            key={block.id}
            className={`rounded-md border transition-colors ${
              failed
                ? 'border-red-800/70 bg-red-950/20'
                : 'border-slate-800 bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800/70">
              <button
                onClick={() => toggleBlockCollapsed(block.id)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-100 transition-colors"
                title={block.isCollapsed ? 'Expand block' : 'Collapse block'}
              >
                {block.isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <span className="text-cyan-400 font-mono text-[11px] shrink-0">$</span>
              <span className="flex-1 truncate font-mono text-[11px] text-slate-100" title={block.command}>
                {block.command}
              </span>

              <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono shrink-0">
                <Clock className="w-2.5 h-2.5" />
                {formatDuration(block)}
              </span>

              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  running
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : failed
                      ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {running ? 'RUNNING' : failed ? `EXIT ${block.exitCode}` : 'EXIT 0'}
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => {
                    copyText(block.command);
                    flashCopied(block.id);
                  }}
                  className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                  title="Copy command"
                >
                  {copiedId === block.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <button
                  onClick={() => copyText(block.outputText)}
                  className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                  title="Copy output"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={() => toggleBlockBookmark(block.id)}
                  className={`p-1 rounded transition-colors ${
                    block.isBookmarked
                      ? 'text-amber-400 hover:bg-amber-500/10'
                      : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
                  }`}
                  title="Bookmark block"
                >
                  <Bookmark className="w-3 h-3" fill={block.isBookmarked ? 'currentColor' : 'none'} />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setSendMenuFor(sendMenuFor === block.id ? null : block.id)}
                    className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                    title="Send block to agent"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                  {sendMenuFor === block.id && (
                    <div className="absolute right-0 mt-1 w-44 bg-slate-900 border border-slate-700 rounded-md shadow-xl py-1 z-30">
                      {Object.entries(AGENT_PALETTES)
                        .filter(([, info]) => info.category === 'agent')
                        .map(([key, info]) => (
                          <button
                            key={key}
                            onClick={() => {
                              dispatchToPeerAgent(block.command, block.outputText, key);
                              setSendMenuFor(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-[11px] font-mono text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: info.color }}
                            />
                            @{key}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!block.isCollapsed && (() => {
              // Render only the tail window: a 200 KB string becomes ~3k DOM text nodes
              // otherwise, which is what made long builds freeze the UI.
              const MAX_RENDER_LINES = 500;
              const text = block.outputText.trim().length > 0 ? block.outputText : '(no output captured)';
              const lines = text.split('\n');
              const truncated = lines.length > MAX_RENDER_LINES;
              const shown = truncated ? lines.slice(-MAX_RENDER_LINES).join('\n') : text;
              return (
                <pre className="px-2 py-1.5 text-[11px] leading-relaxed font-mono text-slate-300 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                  {truncated && (
                    <span className="block text-slate-500 italic">
                      … {lines.length - MAX_RENDER_LINES} earlier lines hidden …
                    </span>
                  )}
                  {shown}
                </pre>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};
