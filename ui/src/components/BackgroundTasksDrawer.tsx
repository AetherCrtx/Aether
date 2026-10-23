import React, { useState } from 'react';
import {
  useAetherStore,
  toggleBackgroundDrawer,
  spawnBackgroundCommand,
  bringBackgroundToForeground,
  terminateBackgroundTask,
  BackgroundTask,
} from '../stores/aetherStore';
import {
  X,
  Play,
  Layers,
  Radio,
  ExternalLink,
  PlusSquare,
  Trash2,
  Terminal,
  Activity,
  Clock,
} from 'lucide-react';

export const BackgroundTasksDrawer: React.FC = () => {
  const store = useAetherStore();
  const [commandInput, setCommandInput] = useState('');
  const [cliType, setCliType] = useState('shell');

  if (!store.backgroundDrawerOpen) return null;

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    await spawnBackgroundCommand(commandInput.trim(), cliType);
    setCommandInput('');
  };

  const formatElapsed = (startedAt: number) => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Click outside to close */}
      <div
        className="flex-1"
        onClick={() => toggleBackgroundDrawer(false)}
      />

      <div
        className="w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col font-mono text-slate-100 z-50 animate-slideLeft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-xs tracking-wider uppercase text-slate-200">
              Background Terminals
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              {store.backgroundTasks.length} active
            </span>
          </div>
          <button
            onClick={() => toggleBackgroundDrawer(false)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Close Drawer (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Launch Input */}
        <form onSubmit={handleLaunch} className="p-4 bg-slate-950/60 border-b border-slate-800/80">
          <div className="text-[11px] font-semibold text-cyan-400 mb-2 uppercase tracking-wide flex items-center justify-between">
            <span>Spawn Background Process</span>
            <span className="text-slate-500 text-[10px] normal-case">Runs asynchronously</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="e.g. npm run dev, cargo watch, docker compose up..."
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                className="w-full bg-slate-900 text-slate-100 text-xs px-3 py-2 rounded-lg border border-slate-700/80 focus:border-cyan-400 focus:outline-none placeholder-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={!commandInput.trim()}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-semibold flex items-center space-x-1 transition-all shadow-sm shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run</span>
            </button>
          </div>
        </form>

        {/* Tasks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {store.backgroundTasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Activity className="w-10 h-10 stroke-[1.5] mb-3 text-slate-600" />
              <p className="text-xs text-slate-400 font-medium mb-1">No Background Terminals</p>
              <p className="text-[11px] max-w-xs text-slate-500 leading-relaxed">
                Send active panes to the background with <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+B</kbd> or launch new background tasks above.
              </p>
            </div>
          ) : (
            store.backgroundTasks.map((task: BackgroundTask) => (
              <div
                key={task.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col space-y-2.5 shadow-sm group"
              >
                {/* Top Row: Title, Status, Time */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="font-bold text-xs text-slate-200 truncate max-w-[220px]">
                      {task.command}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      @{task.cliType}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{formatElapsed(task.startedAt)}</span>
                  </div>
                </div>

                {/* Info row: PID and Port Radar */}
                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                  {task.pid && (
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-400 text-[10px]">
                      PID: <strong className="text-slate-200">{task.pid}</strong>
                    </span>
                  )}
                  {task.openPorts && task.openPorts.length > 0 && (
                    <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40 text-[10px]">
                      <Radio className="w-2.5 h-2.5 animate-pulse" />
                      <span>:{task.openPorts.join(', :')}</span>
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-1 flex items-center justify-between border-t border-slate-800/60">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        bringBackgroundToForeground(task.id, false);
                        toggleBackgroundDrawer(false);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-medium transition-colors"
                      title="Attach pane into current grid split"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Attach to Split</span>
                    </button>
                    <button
                      onClick={() => {
                        bringBackgroundToForeground(task.id, true);
                        toggleBackgroundDrawer(false);
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] transition-colors"
                      title="Open in a new dedicated tab"
                    >
                      <PlusSquare className="w-3 h-3" />
                      <span>Open in New Tab</span>
                    </button>
                  </div>

                  <button
                    onClick={() => terminateBackgroundTask(task.id)}
                    className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Terminate background task (SIGTERM)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Toggle drawer: <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+Shift+B</kbd></span>
          <span>Detach active pane: <kbd className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">Alt+B</kbd></span>
        </div>
      </div>
    </div>
  );
};
