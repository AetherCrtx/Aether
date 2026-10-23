import React, { useState } from 'react';
import {
  closeDiffGatekeeper,
  mergeWorktreeSquash,
  useAetherStore,
} from '../stores/aetherStore';
import { GitPullRequest, GitMerge, Check, X, FileCode, Plus, Minus, ShieldAlert } from 'lucide-react';

export const DiffGatekeeperModal: React.FC = () => {
  const store = useAetherStore();
  const [commitMessage, setCommitMessage] = useState('feat: agent implementation squashed');

  if (!store.diffGatekeeperOpen || !store.activeDiff) return null;

  const diff = store.activeDiff;

  const handleMerge = () => {
    mergeWorktreeSquash(diff.pane_id, commitMessage);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-5xl h-[85vh] bg-tokyo-panel border border-tokyo-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-tokyo-border bg-tokyo-bgDark">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-tokyo-blue/10 border border-tokyo-blue/30 text-tokyo-blue">
              <GitPullRequest className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Unified 3-Way Diff Gatekeeper</span>
                <span className="text-xs text-tokyo-cyan font-mono bg-tokyo-cyan/10 px-2 py-0.5 rounded border border-tokyo-cyan/20">
                  aether/{diff.pane_id} → master
                </span>
              </div>
              <div className="text-[11px] text-tokyo-comment flex items-center gap-3 mt-0.5">
                <span>{diff.files_changed.length} files changed</span>
                <span className="text-tokyo-green flex items-center gap-0.5">
                  <Plus className="w-3 h-3" />
                  {diff.insertions} insertions
                </span>
                <span className="text-tokyo-red flex items-center gap-0.5">
                  <Minus className="w-3 h-3" />
                  {diff.deletions} deletions
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={closeDiffGatekeeper}
            className="p-1.5 text-tokyo-comment hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Files Changed Sidebar */}
          <div className="w-64 border-r border-tokyo-border bg-tokyo-bgDark/40 flex flex-col p-3 overflow-y-auto">
            <div className="text-xs font-semibold text-tokyo-comment uppercase tracking-wider mb-2">
              Modified Files
            </div>
            <div className="flex flex-col gap-1">
              {diff.files_changed.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-1.5 rounded bg-tokyo-panel/40 border border-tokyo-border/50 text-xs text-tokyo-fg font-mono truncate"
                  title={file}
                >
                  <FileCode className="w-3.5 h-3.5 text-tokyo-blue flex-shrink-0" />
                  <span className="truncate">{file}</span>
                </div>
              ))}
              {diff.files_changed.length === 0 && (
                <div className="text-xs text-tokyo-comment italic p-2">
                  No files modified yet.
                </div>
              )}
            </div>
          </div>

          {/* Right: Unified Diff Viewer */}
          <div className="flex-1 bg-tokyo-bgDark p-4 overflow-auto font-mono text-xs">
            <pre className="text-tokyo-fg leading-relaxed">
              {diff.diff_unified.split('\n').map((line, idx) => {
                let lineClass = 'text-tokyo-comment';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  lineClass = 'text-tokyo-green bg-tokyo-green/10 px-1 rounded-sm block';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  lineClass = 'text-tokyo-red bg-tokyo-red/10 px-1 rounded-sm block';
                } else if (line.startsWith('@@')) {
                  lineClass = 'text-tokyo-cyan bg-tokyo-cyan/5 px-1 rounded-sm block my-1 font-bold';
                }

                return (
                  <span key={idx} className={lineClass}>
                    {line}
                    {'\n'}
                  </span>
                );
              })}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-16 px-6 border-t border-tokyo-border bg-tokyo-bgDark flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Squash commit message..."
              className="w-full h-9 px-3 bg-tokyo-panel border border-tokyo-border rounded text-xs text-white placeholder-tokyo-comment focus:outline-none focus:border-tokyo-blue font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={closeDiffGatekeeper}
              className="px-4 py-2 rounded text-xs font-semibold text-tokyo-comment hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleMerge}
              className="flex items-center gap-2 px-4 py-2 rounded bg-tokyo-green text-tokyo-bgDark font-bold text-xs hover:bg-tokyo-green/90 transition-all shadow-md shadow-tokyo-green/20"
            >
              <GitMerge className="w-4 h-4" />
              <span>Squash & Merge to Master</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
