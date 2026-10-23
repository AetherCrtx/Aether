import React, { useState } from 'react';
import {
  toggleTimeTravel,
  useAetherStore,
  createSnapshot,
  rollbackSnapshot,
} from '../stores/aetherStore';
import { History, RotateCcw, Plus, X, BookmarkCheck, Clock } from 'lucide-react';

export const TimeTravelSlider: React.FC = () => {
  const store = useAetherStore();
  const [newSummary, setNewSummary] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!store.timeTravelOpen) return null;

  const snapshots = store.snapshots.length > 0 ? store.snapshots : [];
  const currentSnapshot = snapshots[selectedIdx] || snapshots[snapshots.length - 1];

  const handleRollback = async () => {
    if (!currentSnapshot) return;
    setIsSubmitting(true);
    const success = await rollbackSnapshot(currentSnapshot.id);
    setIsSubmitting(false);
    if (success) {
      setFeedback(`Rolled back worktree to snapshot: ${currentSnapshot.summary}`);
      setTimeout(() => {
        toggleTimeTravel(false);
        setFeedback(null);
      }, 1200);
    } else {
      setFeedback('Rollback failed. Check daemon logs.');
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSummary.trim()) return;
    setIsSubmitting(true);
    const id = await createSnapshot(newSummary.trim());
    setIsSubmitting(false);
    if (id) {
      setNewSummary('');
      setFeedback(`Checkpoint created (${id})`);
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-3xl bg-tokyo-panel border border-tokyo-border rounded-xl shadow-2xl p-6 flex flex-col gap-5 animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-tokyo-border/70 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-tokyo-purple/10 border border-tokyo-purple/30 text-tokyo-purple">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Time-Travel Git Snapshot Slider
                <span className="text-[10px] text-tokyo-comment font-mono bg-tokyo-border/40 px-2 py-0.5 rounded">
                  Alt+Z
                </span>
              </h2>
              <p className="text-[11px] text-tokyo-comment">
                Instantaneous zero-commit tree checkpoints for active worktree pane.
              </p>
            </div>
          </div>

          <button
            onClick={() => toggleTimeTravel(false)}
            className="p-1.5 text-tokyo-comment hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {feedback && (
          <div className="px-3 py-2 rounded bg-tokyo-purple/20 border border-tokyo-purple/40 text-xs text-tokyo-purple flex items-center justify-between">
            <span>{feedback}</span>
          </div>
        )}

        {/* Selected Checkpoint Card or Empty State */}
        {currentSnapshot ? (
          <div className="p-4 rounded-lg bg-tokyo-bgDark border border-tokyo-border/80 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookmarkCheck className="w-4 h-4 text-tokyo-purple" />
                <span className="text-xs font-bold text-white">
                  {currentSnapshot.summary}
                </span>
                <span className="text-[10px] text-tokyo-cyan font-mono bg-tokyo-cyan/10 px-1.5 py-0.5 rounded">
                  OID: {currentSnapshot.git_tree_oid.slice(0, 8)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-tokyo-comment">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {currentSnapshot.created_at}
                </span>
                <span>•</span>
                <span>{currentSnapshot.files_changed_count} files modified</span>
              </div>
            </div>

            <button
              onClick={handleRollback}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-3.5 py-2 rounded bg-tokyo-purple text-white text-xs font-bold hover:bg-tokyo-purple/80 transition-colors shadow-md shadow-tokyo-purple/20 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Rolling back...' : 'Rollback Worktree Here'}</span>
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-tokyo-bgDark border border-tokyo-border/80 text-center text-xs text-tokyo-comment">
            No snapshots captured for this active pane yet. Create your first instant tree checkpoint below!
          </div>
        )}

        {/* Scrub Slider */}
        {snapshots.length > 1 && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[11px] text-tokyo-comment font-mono">
              <span>Oldest Snapshot</span>
              <span>Latest State</span>
            </div>
            <input
              type="range"
              min={0}
              max={snapshots.length - 1}
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(parseInt(e.target.value, 10))}
              className="w-full accent-tokyo-purple cursor-pointer h-2 bg-tokyo-border rounded-lg"
            />
          </div>
        )}

        {/* Create New Snapshot Form */}
        <form onSubmit={handleCreateSnapshot} className="flex items-center gap-2 pt-2 border-t border-tokyo-border/60">
          <input
            type="text"
            value={newSummary}
            onChange={(e) => setNewSummary(e.target.value)}
            placeholder="Checkpoint summary (e.g. 'Before refactoring DB migration')..."
            className="flex-1 bg-tokyo-bgDark border border-tokyo-border/80 rounded px-3 py-1.5 text-xs text-white placeholder-tokyo-comment focus:outline-none focus:border-tokyo-purple"
          />
          <button
            type="submit"
            disabled={!newSummary.trim() || isSubmitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-tokyo-purple/20 border border-tokyo-purple/40 text-tokyo-purple hover:bg-tokyo-purple/30 text-xs font-medium disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Capture Checkpoint</span>
          </button>
        </form>
      </div>
    </div>
  );
};
