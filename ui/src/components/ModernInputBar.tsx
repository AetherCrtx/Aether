import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAetherStore,
  executeCommandInPane,
  recentCommandsFor,
  sendPtyInput,
  dispatchToPeerAgent,
} from '../stores/aetherStore';
import {
  CornerDownLeft,
  Hash,
  Terminal,
  Sparkles,
  Folder,
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Code2,
} from 'lucide-react';

interface Props {
  paneId: string;
  cliType: string;
  isAgentPane: boolean;
  onClose: () => void;
}

type InputMode = 'cmd' | 'ai';

const COMMON_COMMAND_PRESETS = [
  'git status',
  'git diff',
  'git log --oneline -n 10',
  'git add .',
  'git commit -m ""',
  'cargo check',
  'cargo test',
  'cargo build --release',
  'npm run dev',
  'npm run build',
  'npm test',
  'pnpm dev',
  'pnpm build',
  'ls -la',
  'pwd',
  'clear',
  'fastfetch',
  'htop',
  'docker ps',
];

export const ModernInputBar: React.FC<Props> = ({ paneId, cliType, isAgentPane, onClose }) => {
  const store = useAetherStore();
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pane = store.panes.find((p) => p.id === paneId);
  const history = useMemo(() => recentCommandsFor(paneId, 30), [paneId, value]);

  const mode: InputMode = value.startsWith('#') ? 'ai' : 'cmd';

  useEffect(() => {
    textareaRef.current?.focus();
  }, [paneId]);

  // Smart Autocomplete: Match history first, then fallback to common CLI commands
  const suggestion = useMemo(() => {
    if (!value.trim() || historyIndex !== -1) return '';
    if (value.startsWith('#')) return ''; // AI mode does not autosuggest shell commands

    // 1. Check history
    const historyMatch = history.find((h) => h.toLowerCase().startsWith(value.toLowerCase()) && h !== value);
    if (historyMatch) {
      return historyMatch.slice(value.length);
    }

    // 2. Fallback to common commands
    const commonMatch = COMMON_COMMAND_PRESETS.find(
      (c) => c.toLowerCase().startsWith(value.toLowerCase()) && c !== value
    );
    if (commonMatch) {
      return commonMatch.slice(value.length);
    }

    return '';
  }, [value, history, historyIndex]);

  const toggleMode = () => {
    if (mode === 'cmd') {
      setValue('# ' + value.trim());
    } else {
      setValue(value.replace(/^#\s*/, ''));
    }
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('#')) {
      // AI mode: natural language goes to the agent CLI (or a peer agent pane for shells)
      const instruction = trimmed.slice(1).trim();
      if (!instruction) return;
      if (isAgentPane) {
        await sendPtyInput(paneId, `${instruction}\n`);
      } else {
        await dispatchToPeerAgent(`# ${instruction}`, '', undefined);
      }
    } else {
      await executeCommandInPane(paneId, trimmed);
    }

    setValue('');
    setHistoryIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Accept suggestion with Tab
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setValue(value + suggestion);
      return;
    }
    // Accept suggestion with ArrowRight if cursor is at the end
    if (e.key === 'ArrowRight' && suggestion && textareaRef.current) {
      if (textareaRef.current.selectionStart === value.length) {
        e.preventDefault();
        setValue(value + suggestion);
        return;
      }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setValue(history[next]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setValue('');
        return;
      }
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setValue(history[next]);
    }
  };

  // Determine working directory charm name
  const worktreeShort = pane?.worktreePath
    ? pane.worktreePath.split('/').pop() || pane.worktreePath
    : 'workspace';

  return (
    <div className="border-t border-slate-800 bg-slate-900/95 px-2.5 py-1.5 flex flex-col gap-1.5 shadow-lg select-none">
      {/* Environment & Git Charms Row */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* CWD Charm */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
            title={`Working directory: ${pane?.worktreePath || 'Root workspace'}`}
          >
            <Folder className="w-3 h-3 text-cyan-400" />
            <span className="truncate max-w-[140px]">{worktreeShort}</span>
          </div>

          {/* Git Charm */}
          {pane?.gitBranch && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-800/50"
              title={`Git branch: ${pane.gitBranch}`}
            >
              <GitBranch className="w-3 h-3 text-cyan-400" />
              <span className="truncate max-w-[120px]">{pane.gitBranch}</span>
            </div>
          )}

          {/* Runtimes detected charms */}
          <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-300 border border-slate-700/40">
            <span title="Rust workspace">🦀 Rust</span>
            <span className="text-slate-600">·</span>
            <span title="Node environment">⬢ Node</span>
          </div>

          {/* Last Exit Code Charm */}
          {pane?.lastExitCode !== undefined && pane.lastExitCode !== null && (
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] ${
                pane.lastExitCode === 0
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                  : 'bg-rose-950/40 text-rose-400 border-rose-800/40'
              }`}
              title={`Last exit status: ${pane.lastExitCode}`}
            >
              {pane.lastExitCode === 0 ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              <span>exit {pane.lastExitCode}</span>
            </div>
          )}
        </div>

        {/* Suggestion tip */}
        {suggestion && (
          <div className="hidden md:flex items-center gap-1 text-cyan-400/80 text-[10px]">
            <span>Press</span>
            <kbd className="bg-slate-800 px-1 py-0.2 rounded border border-slate-700 text-slate-200">
              Tab
            </kbd>
            <span>or</span>
            <kbd className="bg-slate-800 px-1 py-0.2 rounded border border-slate-700 text-slate-200">
              →
            </kbd>
            <span>to accept</span>
          </div>
        )}
      </div>

      {/* Main Input Row */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggleMode}
          className={`mt-1 shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
            mode === 'ai'
              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-500/30 shadow-sm'
              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 hover:bg-cyan-500/30'
          }`}
          title={
            mode === 'ai'
              ? 'AI Mode active (click to switch to CMD mode)'
              : 'Shell Mode active (click or type # to switch to AI mode)'
          }
        >
          {mode === 'ai' ? <Hash className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
          <span>{mode === 'ai' ? '# AI' : '$ CMD'}</span>
        </button>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHistoryIndex(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder={
              mode === 'ai'
                ? 'Ask agent AI or instruct next action... (Shift+Enter for newline)'
                : `Run command in @${cliType}... (Tab / Right Arrow for autocomplete)`
            }
            className="w-full resize-none bg-slate-950/90 border border-slate-700/80 rounded px-2.5 py-1 text-[11px] font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 max-h-24 shadow-inner"
            spellCheck={false}
          />
          {suggestion && (
            <span className="pointer-events-none absolute left-2.5 top-1 text-[11px] font-mono text-slate-500 select-none">
              <span className="invisible">{value}</span>
              {suggestion}
            </span>
          )}
        </div>

        <button
          onClick={submit}
          className="mt-0.5 shrink-0 flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium transition-colors shadow-sm"
          title="Execute (Enter)"
        >
          {mode === 'ai' ? <Sparkles className="w-3.5 h-3.5" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
          <span>Run</span>
        </button>
      </div>

      {/* Footer shortcut helper */}
      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono px-0.5">
        <div className="flex items-center gap-2">
          <span>↑/↓ history</span>
          <span>·</span>
          <span>Tab/→ autocomplete</span>
          <span>·</span>
          <span># for AI</span>
          <span>·</span>
          <span>Esc close</span>
        </div>
        <span>{history.length} in history</span>
      </div>
    </div>
  );
};
