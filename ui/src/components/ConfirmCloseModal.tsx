import React, { useEffect } from 'react';
import {
  useAetherStore,
  confirmCloseModal,
  cancelCloseModal,
  sendPaneToBackground,
} from '../stores/aetherStore';
import { AlertTriangle, X, Terminal, ArrowDownToLine, Trash2 } from 'lucide-react';

export const ConfirmCloseModal: React.FC = () => {
  const store = useAetherStore();
  const { isOpen, paneId, processName, pid } = store.confirmCloseModal;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelCloseModal();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirmCloseModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !paneId) return null;

  const handleSendToBg = () => {
    cancelCloseModal();
    sendPaneToBackground(paneId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-xl shadow-2xl overflow-hidden flex flex-col font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-2 text-amber-400">
            <AlertTriangle className="w-5 h-5 shrink-0 animate-bounce" />
            <span className="font-semibold text-xs tracking-wider uppercase">
              Active Program Running
            </span>
          </div>
          <button
            onClick={() => cancelCloseModal()}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col space-y-4">
          <p className="text-slate-300 text-xs leading-relaxed">
            A foreground process is actively running inside pane{' '}
            <span className="text-cyan-400 font-bold">{paneId}</span>.
          </p>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400">Process:</span>
              <span className="text-emerald-300 font-bold">{processName}</span>
            </div>
            {pid > 0 && (
              <span className="text-slate-500 text-[11px]">
                PID: <span className="text-slate-300 font-bold">{pid}</span>
              </span>
            )}
          </div>

          <p className="text-slate-400 text-[11px] leading-relaxed">
            Closing this terminal now will send <span className="text-rose-400 font-semibold">SIGTERM</span> to terminate the task. If you want this command to keep executing uninterrupted, send it to the background instead.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={handleSendToBg}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-medium transition-all"
            title="Detach and keep running in background (Alt+B)"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Send to Background</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => cancelCloseModal()}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition-colors"
            >
              Cancel (Esc)
            </button>
            <button
              onClick={() => confirmCloseModal()}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-medium shadow transition-all"
              title="Terminate process and close pane"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Terminate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
