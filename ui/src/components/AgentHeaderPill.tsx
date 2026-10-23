import React from 'react';
import {
  AgentPane,
  requestClosePane,
  sendPaneToBackground,
  openDiffGatekeeper,
  splitActivePane,
} from '../stores/aetherStore';
import { GitBranch, Radio, SplitSquareVertical, SplitSquareHorizontal, X, ShieldCheck, ArrowDownToLine } from 'lucide-react';

interface Props {
  pane: AgentPane;
  isActive: boolean;
}

export const AgentHeaderPill: React.FC<Props> = ({ pane, isActive }) => {
  const getStatusBadge = () => {
    switch (pane.status) {
      case 'THINKING':
        return (
          <span className="flex items-center gap-1.5 text-xs text-tokyo-blue bg-tokyo-blue/10 px-2 py-0.5 rounded-full border border-tokyo-blue/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-tokyo-blue"></span>
            THINKING
          </span>
        );
      case 'EXECUTING':
        return (
          <span className="flex items-center gap-1.5 text-xs text-tokyo-orange bg-tokyo-orange/10 px-2 py-0.5 rounded-full border border-tokyo-orange/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-tokyo-orange"></span>
            EXECUTING
          </span>
        );
      case 'ERROR':
        return (
          <span className="flex items-center gap-1.5 text-xs text-tokyo-red bg-tokyo-red/10 px-2 py-0.5 rounded-full border border-tokyo-red/30">
            <span className="w-1.5 h-1.5 rounded-full bg-tokyo-red"></span>
            ERROR
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs text-tokyo-green bg-tokyo-green/10 px-2 py-0.5 rounded-full border border-tokyo-green/20">
            <span className="w-1.5 h-1.5 rounded-full bg-tokyo-green"></span>
            IDLE
          </span>
        );
    }
  };

  return (
    <div
      className={`h-9 px-3 flex items-center justify-between border-b transition-colors ${
        isActive
          ? 'bg-tokyo-panel border-tokyo-blue/40 shadow-sm'
          : 'bg-tokyo-bgDark border-tokyo-border opacity-85 hover:opacity-100'
      }`}
    >
      {/* Left: Agent Pill & Status */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: pane.color }}
          title={pane.cliType}
        />
        <span className="font-semibold text-xs text-tokyo-fg tracking-wide">
          @{pane.cliType}
        </span>
        {pane.pid && (
          <span className="text-[10px] text-tokyo-comment font-mono">
            PID:{pane.pid}
          </span>
        )}

        {getStatusBadge()}

        {/* Git Worktree Branch badge */}
        {pane.gitBranch && (
          <div className="flex items-center gap-1 text-[11px] text-tokyo-cyan bg-tokyo-cyan/10 px-2 py-0.5 rounded border border-tokyo-cyan/20">
            <GitBranch className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{pane.gitBranch}</span>
          </div>
        )}

        {/* Landlock Sandbox badge */}
        <div className="flex items-center gap-1 text-[10px] text-tokyo-comment/80 bg-tokyo-border/40 px-1.5 py-0.5 rounded">
          <ShieldCheck className="w-3 h-3 text-tokyo-green/70" />
          <span>workspace-only</span>
        </div>

        {/* Port Radar: Live detected TCP listening ports */}
        {pane.openPorts && pane.openPorts.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-tokyo-yellow bg-tokyo-yellow/10 px-2 py-0.5 rounded border border-tokyo-yellow/20">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>:{pane.openPorts.join(', :')}</span>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => sendPaneToBackground(pane.id)}
          title="Send to Background (Alt+B)"
          className="p-1 rounded text-tokyo-comment hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => openDiffGatekeeper(pane.id)}
          title="Review 3-Way Diff (Alt+M)"
          className="p-1 rounded text-tokyo-comment hover:text-tokyo-cyan hover:bg-tokyo-border/50 transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => splitActivePane('vertical')}
          title="Split Vertically (Alt+V)"
          className="p-1 rounded text-tokyo-comment hover:text-tokyo-blue hover:bg-tokyo-border/50 transition-colors"
        >
          <SplitSquareVertical className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => splitActivePane('horizontal')}
          title="Split Horizontally (Alt+S)"
          className="p-1 rounded text-tokyo-comment hover:text-tokyo-blue hover:bg-tokyo-border/50 transition-colors"
        >
          <SplitSquareHorizontal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => requestClosePane(pane.id)}
          title="Close Pane (Ctrl+W / Alt+W)"
          className="p-1 rounded text-tokyo-comment hover:text-tokyo-red hover:bg-tokyo-red/20 transition-colors ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
