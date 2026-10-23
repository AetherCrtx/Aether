import React from 'react';
import { AgentPane, dispatchToPeerAgent, getPaneBlocks, toggleTimeTravel } from '../stores/aetherStore';
import { AlertTriangle, History, Wrench } from 'lucide-react';

interface Props {
  pane: AgentPane;
}

export const ERROR_MARKERS = ['error[E', 'ERR!', 'Traceback', 'panic', 'error TS', 'Error:'];

export function detectErrorOutput(outputText: string): boolean {
  if (!outputText) return false;
  return ERROR_MARKERS.some((marker) => outputText.includes(marker));
}

export const ErrorRecoveryBanner: React.FC<Props> = ({ pane }) => {
  const blocks = getPaneBlocks(pane.id);
  const last = blocks[blocks.length - 1];
  const hasError =
    !!last &&
    last.finishedAt !== undefined &&
    ((last.exitCode !== null && last.exitCode !== undefined && last.exitCode !== 0) ||
      detectErrorOutput(last.outputText));

  if (!hasError || !last) return null;

  const tail = last.outputText.split('\n').slice(-50).join('\n');

  return (
    <div className="border-t border-red-900/50 bg-red-950/30 px-2 py-1 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
        <span className="text-[10px] font-mono text-red-300 truncate">
          Error detected in last command
          {last.exitCode !== null && last.exitCode !== undefined ? ` (exit ${last.exitCode})` : ''}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => dispatchToPeerAgent(last.command, tail)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-200 text-[10px] font-mono transition-colors"
          title="Send the failing output to a coding agent"
        >
          <Wrench className="w-2.5 h-2.5" />
          Fix with Peer Agent
        </button>
        <button
          onClick={() => toggleTimeTravel(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
          title="Roll back to a previous snapshot"
        >
          <History className="w-2.5 h-2.5" />
          Snapshot Rollback
        </button>
      </div>
    </div>
  );
};
