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
  { name: 'Default', value: null, hex: '#00F0FF' },
  { name: 'Cyan', value: '#00F0FF', hex: '#00F0FF' },
  { name: 'Blue', value: '#3b82f6', hex: '#3b82f6' },
  { name: 'Purple', value: '#a855f7', hex: '#a855f7' },
  { name: 'Pink', value: '#ec4899', hex: '#ec4899' },
  { name: 'Emerald', value: '#00E599', hex: '#00E599' },
  { name: 'Amber', value: '#FFB800', hex: '#FFB800' },
  { name: 'Rose', value: '#FF3B5C', hex: '#FF3B5C' },
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
    <div className="flex items-end h-full overflow-x-auto no-scrollbar flex-1 max-w-[calc(100vw-440px)] min-w-[150px] space-x-1 pl-1 select-none relative">
      {store.tabs.map((tab, idx) => {
        const isActive = store.activeTabId === tab.id;
        const tabActivePane = store.panes.find((p) => p.id === tab.activePaneId);
        const tabColor = tab.color || tabActivePane?.color || '#00F0FF';

        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            onDoubleClick={(e) => startEditing(tab, e)}
            onContextMenu={(e) => handleContextMenu(tab, e)}
            title={`${tab.title} (Right-click for options · Double-click to rename · Alt+${idx + 1})`}
            data-testid={`tab-${tab.id}`}
            data-active={isActive ? 'true' : 'false'}
            className={`group relative flex items-center space-x-2 px-3 py-1.5 rounded-t-md transition-all cursor-pointer border-t border-x shrink-0 ${
              isActive
                ? 'bg-cortex-bg text-cortex-text border-cortex-border font-medium z-10 shadow-sm'
                : 'bg-cortex-bgAlt/60 text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2 border-transparent hover:border-cortex-border'
            }`}
            style={{
              minWidth: '120px',
              maxWidth: '220px',
              borderTopColor: tab.color ? tab.color : isActive ? '#00F0FF' : undefined,
              borderTopWidth: tab.color || isActive ? '2px' : undefined,
            }}
          >
            {/* Terminal prompt icon >_ matching reference mockup */}
            <span className="font-mono text-[11px] font-bold text-cortex-accent shrink-0 select-none">
              &gt;_
            </span>

            {/* Active Color Pip Indicator */}
            {tab.color && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: tabColor,
                  boxShadow: isActive ? `0 0 6px ${tabColor}` : undefined,
                }}
              />
            )}

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
                className="bg-cortex-surface2 text-cortex-text text-[11px] px-1 py-0.5 rounded border border-cortex-accent outline-none w-24 font-mono"
              />
            ) : (
              <span className="font-mono text-xs truncate flex-1 tracking-tight">
                {tab.title}
              </span>
            )}

            {/* Split panes count if > 1 */}
            {tab.paneIds && tab.paneIds.length > 1 && (
              <span className="px-1 py-0.2 rounded text-[9px] bg-cortex-surface2 text-cortex-accent font-mono shrink-0 border border-cortex-border">
                {tab.paneIds.length}
              </span>
            )}

            {/* Tab Close Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              data-testid={`tab-close-${tab.id}`}
              className={`p-0.5 rounded text-cortex-textMuted hover:text-cortex-text hover:bg-cortex-surface2 transition-colors shrink-0 ${
                isActive ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Close Tab (Ctrl+Shift+W)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* '+' Add Tab Button */}
      <button
        onClick={() => createTab()}
        data-testid="btn-new-tab"
        className="p-1.5 mb-0.5 rounded text-cortex-textMuted hover:text-cortex-accent hover:bg-cortex-surface2 transition-colors shrink-0"
        title="New Tab (Ctrl+T)"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* Tab Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 bg-cortex-bgAlt border border-cortex-border rounded-lg shadow-2xl py-1 text-cortex-text text-xs font-sans backdrop-blur-md animate-scaleUp"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color Selector */}
          <div className="px-3 py-1.5 border-b border-cortex-border">
            <div className="flex items-center gap-1.5 text-[10px] text-cortex-textMuted font-semibold uppercase tracking-wider mb-1.5">
              <Palette className="w-3 h-3 text-cortex-accent" />
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
                  className="w-4 h-4 rounded-full border border-cortex-border hover:scale-125 transition-transform shrink-0"
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
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-cortex-surface2 text-left transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-cortex-accent" />
            <span>Rename Tab</span>
          </button>

          <button
            onClick={() => {
              duplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-cortex-surface2 text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-cortex-accent" />
            <span>Duplicate Tab</span>
          </button>

          <div className="my-1 border-t border-cortex-border" />

          <button
            onClick={() => {
              closeOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
            disabled={store.tabs.length <= 1}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-cortex-surface2 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <XCircle className="w-3.5 h-3.5 text-cortex-warning" />
            <span>Close Other Tabs</span>
          </button>

          <button
            onClick={() => {
              closeTab(contextMenu.tabId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-950/40 text-cortex-error text-left transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close Tab</span>
          </button>
        </div>
      )}
    </div>
  );
};
