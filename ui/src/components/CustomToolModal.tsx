import React, { useState, useEffect, useRef } from 'react';
import {
  useAetherStore,
  toggleCustomToolModal,
  validateCustomTool,
  spawnAgentPane,
} from '../stores/aetherStore';
import { Terminal, X, Play, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export const CustomToolModal: React.FC = () => {
  const store = useAetherStore();
  const [command, setCommand] = useState('');
  const [isolatedWorktree, setIsolatedWorktree] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    path?: string;
    msg?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (store.customToolModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
      setCommand('');
      setValidationResult(null);
    }
  }, [store.customToolModalOpen]);

  if (!store.customToolModalOpen) return null;

  const handleCommandChange = async (val: string) => {
    setCommand(val);
    const binary = val.trim().split(/\s+/)[0];
    if (!binary) {
      setValidationResult(null);
      return;
    }

    setValidating(true);
    try {
      const tool = await validateCustomTool(binary);
      if (tool) {
        setValidationResult({
          valid: true,
          path: tool.path,
          msg: `Found binary at ${tool.path}`,
        });
      } else {
        setValidationResult({
          valid: false,
          msg: `Binary '${binary}' not found in PATH or standard tool dirs`,
        });
      }
    } catch {
      setValidationResult({
        valid: false,
        msg: `Unable to verify binary '${binary}'`,
      });
    } finally {
      setValidating(false);
    }
  };

  const handleLaunch = async () => {
    const trimmed = command.trim();
    if (!trimmed) return;

    const binary = trimmed.split(/\s+/)[0];
    await spawnAgentPane(binary, isolatedWorktree, 'vertical', trimmed);
    toggleCustomToolModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-tokyo-panel border border-tokyo-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-tokyo-border/70 flex items-center justify-between bg-tokyo-bgDark">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Launch Custom CLI Agent / Shell
              </h2>
              <p className="text-[11px] text-tokyo-comment">
                Execute any AI coding CLI tool or custom executable in your terminal grid.
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleCustomToolModal(false)}
            className="p-1 text-tokyo-comment hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Command Line
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => handleCommandChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLaunch();
                  if (e.key === 'Escape') toggleCustomToolModal(false);
                }}
                placeholder="e.g. aider --model deepseek, goose, python ./agent.py"
                className="w-full px-3 py-2 bg-tokyo-bgDark border border-tokyo-border rounded-lg text-xs text-white placeholder-tokyo-comment focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            {validationResult && (
              <div
                className={`mt-2 flex items-center gap-1.5 text-[11px] font-mono ${
                  validationResult.valid ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {validationResult.valid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">{validationResult.msg}</span>
              </div>
            )}
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="isolateWorktree"
              checked={isolatedWorktree}
              onChange={(e) => setIsolatedWorktree(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-800 cursor-pointer"
            />
            <label htmlFor="isolateWorktree" className="text-xs text-slate-300 cursor-pointer">
              <span className="font-semibold text-slate-200">
                Isolate in dedicated Git Worktree
              </span>
              <p className="text-[11px] text-tokyo-comment mt-0.5">
                Automatically creates an isolated branch and worktree directory to prevent conflicting with your main working tree.
              </p>
            </label>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-tokyo-comment">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Runs with strict local user socket authorization (<span className="font-mono text-cyan-300">SO_PEERCRED</span>).
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-tokyo-border/70 bg-tokyo-bgDark/80 flex items-center justify-end gap-2">
          <button
            onClick={() => toggleCustomToolModal(false)}
            className="px-3 py-1.5 rounded-lg border border-tokyo-border text-xs text-tokyo-comment hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={!command.trim()}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>Launch Pane</span>
          </button>
        </div>
      </div>
    </div>
  );
};
