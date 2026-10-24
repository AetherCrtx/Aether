import React, { useState, useRef, useEffect } from 'react';
import {
  useAetherStore,
  createTab,
  switchTab,
  closeTab,
  renameTab,
  setTabColor,
  closeOtherTabs,
  duplicateTab,
  TerminalTab,
} from '../stores/aetherStore';
import { Plus, X, Edit3, Copy, XCircle, Palette } from 'lucide-react';

const PRESET_TAB_COLORS = [
  { name: 'Default', value: null, hex: '#7aa2f7' },
  { name: 'Cyan', value: '#06b6d4', hex: '#06b6d4' },
  { name: 'Blue', value: '#3b82f6', hex: '#3b82f6' },
  { name: 'Purple', value: '#a855f7', hex: '#a855f7' },
  { name: 'Pink', value: '#ec4899', hex: '#ec4899' },
  { name: 'Emerald', value: '#10b981', hex: '#10b981' },
  { name: 'Amber', value: '#f59e0b', hex: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e', hex: '#f43f5e' },
];

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export const ChromeHeaderTabs: React.FC = () => {
  const store = useAetherStore();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  // Click outside listener for context menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const startEditing = (tab: TerminalTab, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setContextMenu(null);
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

  const handleContextMenu = (tab: TerminalTab, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 210);
    const y = Math.min(e.clientY, window.innerHeight - 250);
    setContextMenu({ tabId: tab.id, x, y });
  };

  return (
    <div className="flex items-end h-full overflow-x-auto no-scrollbar flex-1 max-w-[calc(100vw-540px)] min-w-[150px] space-x-1 pl-2 select-none relative">
      {store.tabs.map((tab, idx) => {
        const isActive = store.activeTabId === tab.id;
        const tabActivePane = store.panes.find((p) => p.id === tab.activePaneId);
        const tabColor = tab.color || tabActivePane?.color || '#7aa2f7';

        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => startEditing(tab, e)}
            onContextMenu={(e) => handleContextMenu(tab, e)}
            title={`${tab.title} (Right-click for options · Double-click to rename · Alt+${idx + 1})`}
            className={`group relative flex items-center space-x-2 px-3 py-1.5 rounded-t-lg transition-all cursor-pointer border-t border-x shrink-0 ${
              isActive
                ? 'bg-slate-800 text-white border-slate-700/90 shadow-sm font-medium z-10'
                : 'bg-slate-900/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent hover:border-slate-800/60'
            }`}
            style={{
              minWidth: '110px',
              maxWidth: '200px',
              borderTopColor: tab.color ? tab.color : undefined,
              borderTopWidth: tab.color ? '2px' : undefined,
            }}
          >
            {/* Active Color Pip Indicator */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 transition-transform ${
                isActive ? 'shadow-sm scale-110' : 'opacity-70 group-hover:opacity-100'
              }`}
              style={{
                backgroundColor: tabColor,
                boxShadow: isActive ? `0 0 8px ${tabColor}88` : undefined,
              }}
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

      {/* Tab Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-slate-200 text-xs font-sans backdrop-blur-md animate-scaleUp"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color Selector */}
          <div className="px-3 py-1.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">
              <Palette className="w-3 h-3 text-cyan-400" />
              <span>Tab Color</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_TAB_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => {
                    setTabColor(contextMenu.tabId, color.value);
                    setContextMenu(null);
                  }}
                  title={color.name}
                  className="w-4 h-4 rounded-full border border-slate-700 hover:scale-125 transition-transform shrink-0"
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>

          {/* Action Items */}
          <button
            onClick={() => {
              const tab = store.tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) startEditing(tab);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Rename Tab</span>
          </button>

          <button
            onClick={() => {
              duplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>Duplicate Tab</span>
          </button>

          <div className="my-1 border-t border-slate-800" />

          <button
            onClick={() => {
              closeOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
            disabled={store.tabs.length <= 1}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <XCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Close Other Tabs</span>
          </button>

          <button
            onClick={() => {
              closeTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-950/40 text-red-400 hover:text-red-300 text-left transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close Tab</span>
          </button>
        </div>
      )}
    </div>
  );
};
