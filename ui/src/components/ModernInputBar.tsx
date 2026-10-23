import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  executeCommandInPane,
  recentCommandsFor,
  sendPtyInput,
  dispatchToPeerAgent,
} from '../stores/aetherStore';
import { CornerDownLeft, Hash, Terminal, Sparkles } from 'lucide-react';

interface Props {
  paneId: string;
  cliType: string;
  isAgentPane: boolean;
  onClose: () => void;
}

type InputMode = 'cmd' | 'ai';

export const ModernInputBar: React.FC<Props> = ({ paneId, cliType, isAgentPane, onClose }) => {
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const history = useMemo(() => recentCommandsFor(paneId, 30), [paneId, value]);

  const mode: InputMode = value.startsWith('#') ? 'ai' : 'cmd';

  useEffect(() => {
    textareaRef.current?.focus();
  }, [paneId]);

  const suggestion = useMemo(() => {
    if (!value.trim() || historyIndex !== -1) return '';
    const match = history.find((h) => h.startsWith(value) && h !== value);
    return match ? match.slice(value.length) : '';
  }, [value, history, historyIndex]);

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
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setValue(value + suggestion);
      return;
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

  return (
    <div className="border-t border-slate-800 bg-slate-900/95 px-2 py-1.5 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <div
          className={`mt-1 shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
            mode === 'ai'
              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40'
              : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
          }`}
          title={mode === 'ai' ? 'AI mode: natural language to the active agent' : 'Shell command mode'}
        >
          {mode === 'ai' ? <Hash className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
          {mode === 'ai' ? 'AI' : 'CMD'}
        </div>

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
                ? 'Describe what you want the agent to do...'
                : `Run a command in @${cliType} (Shift+Enter for newline)`
            }
            className="w-full resize-none bg-slate-950/80 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-600/60 max-h-24"
            spellCheck={false}
          />
          {suggestion && (
            <span className="pointer-events-none absolute left-2 top-1 text-[11px] font-mono text-slate-600">
              <span className="invisible">{value}</span>
              {suggestion}
            </span>
          )}
        </div>

        <button
          onClick={submit}
          className="mt-0.5 shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-cyan-600/90 hover:bg-cyan-600 text-white text-[10px] font-semibold transition-colors"
          title="Execute (Enter)"
        >
          {mode === 'ai' ? <Sparkles className="w-3 h-3" /> : <CornerDownLeft className="w-3 h-3" />}
          Run
        </button>
      </div>

      <div className="flex items-center justify-between text-[9px] text-slate-600 font-mono px-0.5">
        <span>Up/Down history · Tab autocomplete · Esc close</span>
        <span>{history.length} recent</span>
      </div>
    </div>
  );
};
