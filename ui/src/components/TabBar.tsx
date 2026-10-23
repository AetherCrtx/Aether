import React, { useState, useRef, useEffect } from 'react';
import {
  useAetherStore,
  createTab,
  switchTab,
  closeTab,
  renameTab,
  equalizeLayout,
  splitActivePane,
  closePane,
  TerminalTab,
} from '../stores/aetherStore';
import {
  Plus,
  X,
  Terminal,
  Columns,
  Rows,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';

export const TabBar: React.FC = () => {
  const store = useAetherStore();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const startEditing = (tab: TerminalTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingTitle(tab.title);
  };

  const handleFinishEditing = (tabId: string) => {
    if (editingTitle.trim()) {
      renameTab(tabId, editingTitle.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (tabId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEditing(tabId);
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  const activePane = store.panes.find((p) => p.id === store.activePaneId);

  return (
    <div className="h-8 bg-slate-900 border-b border-slate-800/90 px-2 flex items-center justify-between z-20 shrink-0 select-none overflow-x-auto no-scrollbar">
      {/* ================= LEFT: TAB LIST ================= */}
      <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar flex-1 mr-2">
        {store.tabs.map((tab, idx) => {
          const isActive = store.activeTabId === tab.id;
          const tabActivePane = store.panes.find((p) => p.id === tab.activePaneId);
          const tabColor = tabActivePane?.color || '#7aa2f7';

          return (
            <div
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              onDoubleClick={(e) => startEditing(tab, e)}
              title={`${tab.title} (Double click to rename · Alt+${idx + 1})`}
              className={`group relative flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition-all cursor-pointer border ${
                isActive
                  ? 'bg-slate-800/90 text-white border-slate-700/80 shadow-sm font-medium'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent'
              }`}
            >
              {/* Agent Color Pill Indicator */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: tabColor }}
              />

              {/* Tab Title or Inline Rename Input */}
              {editingTabId === tab.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleFinishEditing(tab.id)}
                  onKeyDown={(e) => handleKeyDown(tab.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-slate-950 text-white text-xs px-1 py-0.5 rounded border border-cyan-500 outline-none w-24 font-mono"
                />
              ) : (
                <span className="font-mono text-[11px] truncate max-w-[130px]">
                  {tab.title}
                </span>
              )}

              {/* Number of split panes in this tab if > 1 */}
              {tab.paneIds && tab.paneIds.length > 1 && (
                <span className="px-1 py-0.2 rounded text-[9px] bg-slate-700/80 text-slate-300 font-mono">
                  {tab.paneIds.length}
                </span>
              )}

              {/* Close Tab Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className={`p-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ${
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Close Tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Create New Tab Button */}
        <button
          onClick={() => createTab()}
          className="flex items-center space-x-1 px-2 py-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors text-xs"
          title="New Tab (Ctrl+T)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[11px] font-mono hidden sm:inline">New Tab</span>
        </button>
      </div>

      {/* ================= RIGHT: QUICK LAYOUT CONTROLS ================= */}
      <div className="flex items-center space-x-1 shrink-0 border-l border-slate-800/80 pl-2">
        {/* Equalize / Balance Panes */}
        <button
          onClick={() => equalizeLayout()}
          className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition-colors text-[11px]"
          title="Equalize & Balance Window Sizes (Alt+E)"
        >
          <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
          <span className="hidden xl:inline text-[10px]">Balance</span>
        </button>

        {/* Split Vertical */}
        <button
          onClick={() => splitActivePane('vertical')}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          title="Split Vertical (Alt+V)"
        >
          <Columns className="w-3 h-3" />
        </button>

        {/* Split Horizontal */}
        <button
          onClick={() => splitActivePane('horizontal')}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          title="Split Horizontal (Alt+S)"
        >
          <Rows className="w-3 h-3" />
        </button>

        {/* Close Active Pane */}
        {activePane && (
          <button
            onClick={() => closePane(activePane.id)}
            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Close Active Pane (Alt+W)"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
