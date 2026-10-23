import React, { useState, useRef, useEffect } from 'react';
import {
  useAetherStore,
  createTab,
  switchTab,
  closeTab,
  renameTab,
  TerminalTab,
} from '../stores/aetherStore';
import { Plus, X } from 'lucide-react';

export const ChromeHeaderTabs: React.FC = () => {
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

  return (
    <div className="flex items-end h-full overflow-x-auto no-scrollbar flex-1 max-w-[calc(100vw-540px)] min-w-[150px] space-x-1 pl-2 select-none">
      {store.tabs.map((tab, idx) => {
        const isActive = store.activeTabId === tab.id;
        const tabActivePane = store.panes.find((p) => p.id === tab.activePaneId);
        const tabColor = tabActivePane?.color || '#7aa2f7';

        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => startEditing(tab, e)}
            title={`${tab.title} (Double-click to rename · Alt+${idx + 1})`}
            className={`group relative flex items-center space-x-2 px-3 py-1.5 rounded-t-lg transition-all cursor-pointer border-t border-x shrink-0 ${
              isActive
                ? 'bg-slate-800 text-white border-slate-700/90 shadow-sm font-medium z-10'
                : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent hover:border-slate-800/60'
            }`}
            style={{ minWidth: '110px', maxWidth: '200px' }}
          >
            {/* Active Color Pip Indicator */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isActive ? 'shadow-sm shadow-cyan-400/50' : 'opacity-70'
              }`}
              style={{ backgroundColor: tabColor }}
            />

            {/* Tab Title or Inline Editing Input */}
            {editingTabId === tab.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => handleFinishEditing(tab.id)}
                onKeyDown={(e) => handleKeyDown(tab.id, e)}
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-950 text-white text-[11px] px-1 py-0.5 rounded border border-cyan-400 outline-none w-24 font-mono"
              />
            ) : (
              <span className="font-mono text-xs truncate flex-1">
                {tab.title}
              </span>
            )}

            {/* Split panes count if > 1 */}
            {tab.paneIds && tab.paneIds.length > 1 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-700/80 text-cyan-300 font-mono shrink-0">
                {tab.paneIds.length}
              </span>
            )}

            {/* Chrome-style Tab Close Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className={`p-0.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors shrink-0 ${
                isActive ? 'opacity-90' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Close Tab (Ctrl+Shift+W)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Chrome '+' Add Tab Button */}
      <button
        onClick={() => createTab()}
        className="p-1.5 mb-0.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
        title="New Tab (Ctrl+T)"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
