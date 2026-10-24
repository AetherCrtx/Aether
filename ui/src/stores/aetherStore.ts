import { useState, useEffect } from 'react';
import { invoke as tauriInvoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

export const isRunningInTauri = (): boolean => {
  try {
    return tauriIsTauri();
  } catch {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
};

const invoke = async (cmd: string, args?: any): Promise<any> => {
  if (isRunningInTauri()) {
    try {
      return await tauriInvoke(cmd, args);
    } catch (err) {
      console.error(`Tauri command '${cmd}' failed:`, err);
      throw err;
    }
  }
  return null;
};

const listen = (event: string, handler: (event: any) => void) => {
  if (isRunningInTauri()) {
    return tauriListen(event, handler);
  }
  return Promise.resolve(() => {});
};

export interface AgentPane {
  id: string;
  cliType: string;
  pid?: number;
  status: 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING_APPROVAL' | 'ERROR';
  worktreePath?: string;
  gitBranch?: string;
  openPorts: number[];
  color: string;
  lastExitCode?: number | null;
  viewMode?: 'raw' | 'blocks';
  inputBarOpen?: boolean;
  lastCommandFailed?: boolean;
}

export interface CommandBlock {
  id: string;
  paneId: string;
  command: string;
  cwd: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  outputText: string;
  isBookmarked?: boolean;
  isCollapsed?: boolean;
}

export interface AetherWorkflow {
  id: string;
  name: string;
  description: string;
  commandTemplate: string;
  tags: string[];
  /** Vault-relative markdown path when the workflow came from the vault. */
  relativePath?: string;
}

export interface PipelineStage {
  targetCli: string;
  prompt: string;
}

export type LayoutNode =
  | { type: 'pane'; paneId: string }
  | {
      type: 'split';
      id: string;
      direction: 'horizontal' | 'vertical';
      splitRatio: number; // 0.05 to 0.95, default 0.5
      children: [LayoutNode, LayoutNode];
    };

export interface TerminalTab {
  id: string;
  title: string;
  paneIds: string[];
  layout: LayoutNode | null;
  activePaneId: string | null;
}

export interface BackgroundTask {
  id: string; // pane_id
  cliType: string;
  command: string;
  pid?: number;
  status: 'RUNNING' | 'EXITED' | 'ERROR';
  startedAt: number;
  openPorts: number[];
  recentOutput: string[];
}

export interface BlackboardEntry {
  id: number;
  workspace_id: string;
  author_agent_id: string;
  entry_type: 'API_CONTRACT' | 'TASK_CLAIM' | 'BUG_REPORT' | 'DECISION' | 'HANDOFF';
  title: string;
  content_markdown: string;
  target_agent_id?: string;
  is_resolved: boolean;
  created_at: string;
}

export interface FileLock {
  workspace_id: string;
  relative_file_path: string;
  locked_by_agent_id: string;
  intent?: string;
  locked_at: string;
}

export interface WorktreeDiff {
  pane_id: string;
  diff_unified: string;
  files_changed: string[];
  insertions: number;
  deletions: number;
}

export interface GitSnapshot {
  id: string;
  agent_id: string;
  git_tree_oid: string;
  summary: string;
  files_changed_count: number;
  created_at: string;
}

export interface AgentInfo {
  name: string;
  color: string;
  binary: string;
  category: 'agent' | 'shell';
}

export interface DetectedTool {
  id: string;
  name: string;
  binary: string;
  path: string;
  category: 'agent' | 'shell';
  color: string;
  description: string;
  is_system_default?: boolean;
}

export const AGENT_PALETTES: Record<string, AgentInfo> = {
  // Agentic AI CLI Orchestrators
  'claude-code': { name: 'Claude Code', color: '#D97757', binary: 'claude', category: 'agent' },
  'opencode': { name: 'OpenCode', color: '#3B82F6', binary: 'opencode', category: 'agent' },
  'codex': { name: 'OpenAI Codex', color: '#10B981', binary: 'codex', category: 'agent' },
  'antigravity': { name: 'Antigravity CLI', color: '#A855F7', binary: 'antigravity', category: 'agent' },
  'hermes': { name: 'Hermes Agent', color: '#EC4899', binary: 'hermes', category: 'agent' },
  'aider': { name: 'Aider AI', color: '#F59E0B', binary: 'aider', category: 'agent' },
  'goose': { name: 'Goose CLI', color: '#06B6D4', binary: 'goose', category: 'agent' },

  // Interactive Linux Shells
  'shell': { name: 'Default Shell ($SHELL)', color: '#818CF8', binary: 'shell', category: 'shell' },
  'fish': { name: 'Fish', color: '#FB923C', binary: 'fish', category: 'shell' },
  'bash': { name: 'Bash', color: '#4ADE80', binary: 'bash', category: 'shell' },
  'zsh': { name: 'Zsh', color: '#38BDF8', binary: 'zsh', category: 'shell' },
};

// Global Store State
let globalState = {
  workspaceId: 'default',
  defaultShell: (typeof localStorage !== 'undefined' && localStorage.getItem('aether_default_shell')) || 'shell',
  detectedTools: [] as DetectedTool[],
  panes: [] as AgentPane[],
  activePaneId: null as string | null,
  layout: null as LayoutNode | null,
  tabs: [] as TerminalTab[],
  activeTabId: null as string | null,
  backgroundTasks: [] as BackgroundTask[],
  backgroundDrawerOpen: false,
  confirmCloseModal: {
    isOpen: false,
    paneId: null as string | null,
    processName: '',
    pid: 0,
  },
  blackboard: [] as BlackboardEntry[],
  fileLocks: [] as FileLock[],
  orchestratorOpen: false,
  diffGatekeeperOpen: false,
  timeTravelOpen: false,
  obsidianSidebarOpen: false,
  customToolModalOpen: false,
  activeDiff: null as WorktreeDiff | null,
  snapshots: [] as GitSnapshot[],
  commandBlocks: [] as CommandBlock[],
  pipelineQueue: [] as PipelineStage[],
  pipelineActive: false,
  workflows: [] as AetherWorkflow[],
  workflowsModalOpen: false,
  commandPaletteOpen: false,
  obsidianRefreshTick: 0,
};

export async function detectAvailableTools(): Promise<DetectedTool[]> {
  if (invoke) {
    try {
      const list: DetectedTool[] = await invoke('cmd_detect_available_tools');
      if (Array.isArray(list) && list.length > 0) {
        globalState.detectedTools = list;
        const savedPref = typeof localStorage !== 'undefined' ? localStorage.getItem('aether_default_shell') : null;
        const sysDefault = list.find((t) => t.category === 'shell' && t.is_system_default);

        // If no user preference saved, or saved preference was generic 'shell', follow system default shell!
        if (!savedPref || savedPref === 'shell') {
          if (sysDefault) {
            globalState.defaultShell = sysDefault.id;
          }
        } else {
          const exists = list.some((t) => t.id === savedPref || t.binary === savedPref);
          if (exists) {
            globalState.defaultShell = savedPref;
          } else if (sysDefault) {
            globalState.defaultShell = sysDefault.id;
          }
        }
        notify();
        return list;
      }
    } catch (e) {
      console.warn('Tool detection failed, falling back to local list:', e);
    }
  }
  return [];
}

export async function validateCustomTool(binary: string): Promise<DetectedTool | null> {
  if (invoke) {
    try {
      const tool: DetectedTool = await invoke('cmd_validate_tool', { binary, category: 'agent' });
      if (tool) {
        if (!globalState.detectedTools.some((t) => t.id === tool.id || t.binary === tool.binary)) {
          globalState.detectedTools.push(tool);
          notify();
        }
        return tool;
      }
    } catch (e) {
      console.warn('Validate tool failed:', e);
    }
  }
  return null;
}

export function setDefaultShell(shell: string) {
  globalState.defaultShell = shell;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('aether_default_shell', shell);
  }
  notify();
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

export function useAetherStore() {
  const [state, setState] = useState(globalState);

  useEffect(() => {
    const onChange = () => setState({ ...globalState });
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return state;
}

// ----------------------------------------------------------------------------
// Action Handlers & Layout Balancing
// ----------------------------------------------------------------------------

let splitCounter = 0;
export function createSplitId(): string {
  splitCounter += 1;
  return `split_${Date.now()}_${splitCounter}`;
}

export function countLeafPanes(node: LayoutNode | null): number {
  if (!node) return 0;
  if (node.type === 'pane') return 1;
  return countLeafPanes(node.children[0]) + countLeafPanes(node.children[1]);
}

export function extractPaneIds(node: LayoutNode | null): string[] {
  if (!node) return [];
  if (node.type === 'pane') return [node.paneId];
  return [...extractPaneIds(node.children[0]), ...extractPaneIds(node.children[1])];
}

export function balanceLayout(node: LayoutNode | null): LayoutNode | null {
  if (!node || node.type === 'pane') return node;
  const leftCount = countLeafPanes(node.children[0]);
  const rightCount = countLeafPanes(node.children[1]);
  const total = leftCount + rightCount;
  const splitRatio = total > 0 ? Number((leftCount / total).toFixed(4)) : 0.5;

  return {
    ...node,
    splitRatio,
    children: [
      balanceLayout(node.children[0])!,
      balanceLayout(node.children[1])!,
    ],
  };
}

export function updateSplitRatio(splitId: string, ratio: number) {
  const clamped = Math.max(0.05, Math.min(0.95, Number(ratio.toFixed(4))));
  function updateInTree(node: LayoutNode | null): LayoutNode | null {
    if (!node || node.type === 'pane') return node;
    if (node.id === splitId) {
      return {
        ...node,
        splitRatio: clamped,
      };
    }
    return {
      ...node,
      children: [
        updateInTree(node.children[0])!,
        updateInTree(node.children[1])!,
      ],
    };
  }

  globalState.layout = updateInTree(globalState.layout);
  syncActiveTab();
  notify();
}

export function equalizeLayout() {
  if (globalState.layout) {
    globalState.layout = balanceLayout(globalState.layout);
    syncActiveTab();
    notify();
  }
}

export function syncActiveTab() {
  if (!globalState.activeTabId) return;
  const tab = globalState.tabs.find((t) => t.id === globalState.activeTabId);
  if (tab) {
    tab.layout = globalState.layout;
    tab.activePaneId = globalState.activePaneId;
    tab.paneIds = extractPaneIds(globalState.layout);
  }
}

function splitNodeInTree(
  node: LayoutNode | null,
  targetPaneId: string,
  newPaneId: string,
  dir: 'horizontal' | 'vertical'
): LayoutNode {
  if (!node) return { type: 'pane', paneId: newPaneId };
  if (node.type === 'pane') {
    if (node.paneId === targetPaneId) {
      return {
        type: 'split',
        id: createSplitId(),
        direction: dir,
        splitRatio: 0.5,
        children: [node, { type: 'pane', paneId: newPaneId }],
      };
    }
    return node;
  }
  return {
    ...node,
    children: [
      splitNodeInTree(node.children[0], targetPaneId, newPaneId, dir),
      splitNodeInTree(node.children[1], targetPaneId, newPaneId, dir),
    ],
  };
}

export async function createTab(title?: string, initialCliType?: string): Promise<TerminalTab | null> {
  const targetCli = initialCliType || globalState.defaultShell || 'shell';
  const tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  syncActiveTab();

  const detected = globalState.detectedTools.find((t) => t.id === targetCli || t.binary === targetCli);
  const palette = detected
    ? { name: detected.name, color: detected.color, binary: detected.binary, category: detected.category }
    : AGENT_PALETTES[targetCli] || { name: targetCli, color: '#7aa2f7', binary: targetCli, category: 'agent' };

  const isShell = palette.category === 'shell' || targetCli === 'shell' || targetCli === 'bash' || targetCli === 'fish' || targetCli === 'zsh' || targetCli === 'sh';
  const shouldIsolate = !isShell;

  let newPane: AgentPane;
  if (invoke) {
    try {
      const info = await invoke('cmd_spawn_pane', {
        workspaceId: globalState.workspaceId,
        cliType: targetCli,
        command: palette.binary,
        args: [],
        workingDir: null,
        isolatedWorktree: shouldIsolate,
        cols: 80,
        rows: 24,
      });

      newPane = {
        id: info.pane_id,
        cliType: targetCli,
        pid: info.pid,
        status: 'IDLE',
        worktreePath: info.worktree_path,
        gitBranch: info.git_branch,
        openPorts: [],
        color: palette.color,
      };
    } catch (e) {
      console.error('Failed to spawn pane for new tab:', e);
      return null;
    }
  } else {
    const mockId = `mock_pane_${Date.now()}`;
    newPane = {
      id: mockId,
      cliType: targetCli,
      pid: 12345,
      status: 'IDLE',
      worktreePath: `.aether/worktrees/${mockId}`,
      gitBranch: `aether/${mockId}`,
      openPorts: [3000],
      color: palette.color,
    };
  }

  globalState.panes.push(newPane);

  const tabIndex = globalState.tabs.length + 1;
  const newTab: TerminalTab = {
    id: tabId,
    title: title || `Tab ${tabIndex}`,
    paneIds: [newPane.id],
    layout: { type: 'pane', paneId: newPane.id },
    activePaneId: newPane.id,
  };

  globalState.tabs.push(newTab);
  globalState.activeTabId = newTab.id;
  globalState.layout = newTab.layout;
  globalState.activePaneId = newPane.id;

  notify();
  return newTab;
}

export function switchTab(tabId: string) {
  if (globalState.activeTabId === tabId) return;

  syncActiveTab();

  const targetTab = globalState.tabs.find((t) => t.id === tabId);
  if (!targetTab) return;

  globalState.activeTabId = targetTab.id;
  globalState.layout = targetTab.layout;
  globalState.activePaneId = targetTab.activePaneId || targetTab.paneIds[0] || null;

  notify();
}

export async function closeTab(tabId: string) {
  const tabIndex = globalState.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) return;

  const tabToClose = globalState.tabs[tabIndex];

  for (const paneId of tabToClose.paneIds) {
    if (invoke) {
      try {
        await invoke('cmd_kill_pane', { paneId, signal: 15 });
      } catch (e) {
        console.warn('Kill pane error:', e);
      }
    }
    globalState.panes = globalState.panes.filter((p) => p.id !== paneId);
  }

  globalState.tabs.splice(tabIndex, 1);

  if (globalState.activeTabId === tabId) {
    if (globalState.tabs.length > 0) {
      const nextIndex = Math.min(tabIndex, globalState.tabs.length - 1);
      const nextTab = globalState.tabs[nextIndex];
      globalState.activeTabId = nextTab.id;
      globalState.layout = nextTab.layout;
      globalState.activePaneId = nextTab.activePaneId;
    } else {
      globalState.layout = null;
      globalState.activePaneId = null;
      globalState.activeTabId = null;
      await createTab('Tab 1', globalState.defaultShell || 'shell');
      return;
    }
  }

  notify();
}

export function renameTab(tabId: string, newTitle: string) {
  const tab = globalState.tabs.find((t) => t.id === tabId);
  if (tab && newTitle.trim()) {
    tab.title = newTitle.trim();
    notify();
  }
}

export function nextTab() {
  if (globalState.tabs.length <= 1) return;
  const currentIndex = globalState.tabs.findIndex((t) => t.id === globalState.activeTabId);
  const nextIndex = (currentIndex + 1) % globalState.tabs.length;
  switchTab(globalState.tabs[nextIndex].id);
}

export function previousTab() {
  if (globalState.tabs.length <= 1) return;
  const currentIndex = globalState.tabs.findIndex((t) => t.id === globalState.activeTabId);
  const prevIndex = (currentIndex - 1 + globalState.tabs.length) % globalState.tabs.length;
  switchTab(globalState.tabs[prevIndex].id);
}

export async function spawnAgentPane(
  cliType: string = 'shell',
  isolatedWorktree?: boolean,
  splitDirection: 'horizontal' | 'vertical' = 'vertical',
  customCommand?: string
): Promise<AgentPane | null> {
  const detected = globalState.detectedTools.find((t) => t.id === cliType || t.binary === cliType);
  const palette = detected
    ? { name: detected.name, color: detected.color, binary: detected.binary, category: detected.category }
    : AGENT_PALETTES[cliType] || { name: cliType, color: '#7aa2f7', binary: customCommand || cliType, category: 'agent' };

  const isShell = palette.category === 'shell' || cliType === 'shell' || cliType === 'bash' || cliType === 'fish' || cliType === 'zsh' || cliType === 'sh';
  const shouldIsolate = isolatedWorktree !== undefined ? isolatedWorktree : !isShell;

  if (invoke) {
    try {
      const info = await invoke('cmd_spawn_pane', {
        workspaceId: globalState.workspaceId,
        cliType,
        command: customCommand || palette.binary,
        args: [],
        workingDir: null,
        isolatedWorktree: shouldIsolate,
        cols: 80,
        rows: 24,
      });

      const newPane: AgentPane = {
        id: info.pane_id,
        cliType,
        pid: info.pid,
        status: 'IDLE',
        worktreePath: info.worktree_path,
        gitBranch: info.git_branch,
        openPorts: [],
        color: palette.color,
      };

      const previousActiveId = globalState.activePaneId;
      globalState.panes.push(newPane);
      globalState.activePaneId = newPane.id;

      if (!globalState.layout) {
        globalState.layout = { type: 'pane', paneId: newPane.id };
      } else if (previousActiveId) {
        globalState.layout = balanceLayout(
          splitNodeInTree(globalState.layout, previousActiveId, newPane.id, splitDirection)
        );
      } else {
        globalState.layout = balanceLayout({
          type: 'split',
          id: createSplitId(),
          direction: splitDirection,
          splitRatio: 0.5,
          children: [globalState.layout, { type: 'pane', paneId: newPane.id }],
        });
      }

      if (!globalState.activeTabId) {
        const initialTab: TerminalTab = {
          id: `tab_${Date.now()}`,
          title: `@${newPane.cliType}`,
          paneIds: [newPane.id],
          layout: globalState.layout,
          activePaneId: newPane.id,
        };
        globalState.tabs = [initialTab];
        globalState.activeTabId = initialTab.id;
      } else {
        syncActiveTab();
      }

      notify();
      return newPane;
    } catch (e) {
      console.error('Failed to spawn pane:', e);
      return null;
    }
  } else {
    // Mock browser fallback
    const mockId = `mock_pane_${Date.now()}`;
    const newPane: AgentPane = {
      id: mockId,
      cliType,
      pid: 12345,
      status: 'IDLE',
      worktreePath: `.aether/worktrees/${mockId}`,
      gitBranch: `aether/${mockId}`,
      openPorts: [3000],
      color: palette.color,
    };
    const previousActiveId = globalState.activePaneId;
    globalState.panes.push(newPane);
    globalState.activePaneId = mockId;
    if (!globalState.layout) {
      globalState.layout = { type: 'pane', paneId: mockId };
    } else if (previousActiveId) {
      globalState.layout = balanceLayout(
        splitNodeInTree(globalState.layout, previousActiveId, mockId, splitDirection)
      );
    } else {
      globalState.layout = balanceLayout({
        type: 'split',
        id: createSplitId(),
        direction: splitDirection,
        splitRatio: 0.5,
        children: [globalState.layout, { type: 'pane', paneId: mockId }],
      });
    }

    if (!globalState.activeTabId) {
      const initialTab: TerminalTab = {
        id: `tab_${Date.now()}`,
        title: `@${newPane.cliType}`,
        paneIds: [newPane.id],
        layout: globalState.layout,
        activePaneId: newPane.id,
      };
      globalState.tabs = [initialTab];
      globalState.activeTabId = initialTab.id;
    } else {
      syncActiveTab();
    }

    notify();
    return newPane;
  }
}

export function setActivePane(id: string) {
  globalState.activePaneId = id;
  syncActiveTab();
  notify();
}

export function splitActivePane(direction: 'horizontal' | 'vertical', cliType?: string) {
  const active = globalState.panes.find((p) => p.id === globalState.activePaneId);
  const targetCli = cliType || active?.cliType || globalState.defaultShell || 'shell';
  const detected = globalState.detectedTools.find((t) => t.id === targetCli || t.binary === targetCli);
  const isAgent = detected ? detected.category === 'agent' : (targetCli !== 'shell' && targetCli !== 'bash' && targetCli !== 'zsh' && targetCli !== 'fish' && targetCli !== 'sh');
  return spawnAgentPane(targetCli, isAgent, direction);
}

export async function closePane(paneId: string) {
  if (invoke) {
    try {
      await invoke('cmd_kill_pane', { paneId, signal: 15 });
    } catch (e) {
      console.warn('Kill pane error:', e);
    }
  }

  globalState.panes = globalState.panes.filter((p) => p.id !== paneId);

  // Remove from layout tree
  function removeFromTree(node: LayoutNode | null): LayoutNode | null {
    if (!node) return null;
    if (node.type === 'pane') {
      return node.paneId === paneId ? null : node;
    }
    const left = removeFromTree(node.children[0]);
    const right = removeFromTree(node.children[1]);
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;
    return { ...node, children: [left, right] };
  }

  globalState.layout = removeFromTree(globalState.layout);
  if (globalState.layout) {
    globalState.layout = balanceLayout(globalState.layout);
  }

  if (globalState.activePaneId === paneId) {
    const remainingPaneIds = extractPaneIds(globalState.layout);
    globalState.activePaneId = remainingPaneIds[0] || null;
  }

  syncActiveTab();

  // If the active tab has 0 panes left and there are other tabs, close this tab!
  if (globalState.activeTabId && (!globalState.layout || extractPaneIds(globalState.layout).length === 0)) {
    if (globalState.tabs.length > 1) {
      await closeTab(globalState.activeTabId);
      return;
    }
  }

  notify();
}

export async function checkPaneRunningProcess(paneId: string): Promise<string | null> {
  const pane = globalState.panes.find((p) => p.id === paneId);
  if (!pane) return null;

  if (invoke && pane.pid) {
    try {
      const running: string | null = await invoke('cmd_check_pane_process', {
        pid: pane.pid,
        cliType: pane.cliType,
      });
      if (running) return running;
    } catch (e) {
      console.warn('Check process error:', e);
    }
  }

  const isGenericShell = ['shell', 'bash', 'fish', 'zsh', 'sh'].includes(pane.cliType.toLowerCase());
  if (!isGenericShell) {
    return pane.cliType;
  }
  return null;
}

export async function requestClosePane(paneId: string) {
  const pane = globalState.panes.find((p) => p.id === paneId);
  if (!pane) return;

  const running = await checkPaneRunningProcess(paneId);
  if (running) {
    globalState.confirmCloseModal = {
      isOpen: true,
      paneId: pane.id,
      processName: running,
      pid: pane.pid || 0,
    };
    notify();
    return;
  }

  await closePane(paneId);
}

export function cancelCloseModal() {
  globalState.confirmCloseModal = {
    isOpen: false,
    paneId: null,
    processName: '',
    pid: 0,
  };
  notify();
}

export async function confirmCloseModal() {
  const targetId = globalState.confirmCloseModal.paneId;
  cancelCloseModal();
  if (targetId) {
    await closePane(targetId);
  }
}

export function toggleBackgroundDrawer(open?: boolean) {
  globalState.backgroundDrawerOpen = open !== undefined ? open : !globalState.backgroundDrawerOpen;
  notify();
}

export async function spawnBackgroundCommand(command: string, cliType: string = 'shell'): Promise<BackgroundTask | null> {
  if (!command.trim()) return null;

  try {
    const info: any = await invoke('cmd_spawn_pane', {
      workspaceId: globalState.workspaceId,
      cliType,
      command: command.trim(),
      args: [],
      workingDir: null,
      isolatedWorktree: false,
      cols: 80,
      rows: 24,
    });

    const taskId = info.pane_id;
    const task: BackgroundTask = {
      id: taskId,
      cliType,
      command: command.trim(),
      pid: info.pid,
      status: 'RUNNING',
      startedAt: Date.now(),
      openPorts: [],
      recentOutput: [],
    };

    globalState.panes.push({
      id: taskId,
      cliType,
      pid: info.pid,
      status: 'EXECUTING',
      worktreePath: info.worktree_path,
      gitBranch: info.git_branch,
      openPorts: [],
      color: '#10b981',
    });

    globalState.backgroundTasks.push(task);
    notify();
    return task;
  } catch (e) {
    console.error('Failed to spawn background command:', e);
    return null;
  }
}

export function sendPaneToBackground(paneId: string) {
  const pane = globalState.panes.find((p) => p.id === paneId);
  if (!pane) return;

  function removeFromTree(node: LayoutNode | null): LayoutNode | null {
    if (!node) return null;
    if (node.type === 'pane') {
      return node.paneId === paneId ? null : node;
    }
    const left = removeFromTree(node.children[0]);
    const right = removeFromTree(node.children[1]);
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;
    return { ...node, children: [left, right] };
  }

  globalState.layout = removeFromTree(globalState.layout);
  if (globalState.layout) {
    globalState.layout = balanceLayout(globalState.layout);
  }

  const existingIndex = globalState.backgroundTasks.findIndex((t) => t.id === paneId);
  if (existingIndex === -1) {
    globalState.backgroundTasks.push({
      id: pane.id,
      cliType: pane.cliType,
      command: pane.cliType,
      pid: pane.pid,
      status: 'RUNNING',
      startedAt: Date.now(),
      openPorts: pane.openPorts || [],
      recentOutput: [],
    });
  }

  syncActiveTab();

  if (globalState.activePaneId === paneId) {
    const remainingPaneIds = extractPaneIds(globalState.layout);
    globalState.activePaneId = remainingPaneIds[0] || null;
  }

  notify();
}

export async function bringBackgroundToForeground(taskId: string, asNewTab: boolean = false) {
  const taskIndex = globalState.backgroundTasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return;

  const task = globalState.backgroundTasks[taskIndex];
  globalState.backgroundTasks.splice(taskIndex, 1);

  if (asNewTab) {
    const newTab: TerminalTab = {
      id: `tab_${Date.now()}`,
      title: task.command || `@${task.cliType}`,
      paneIds: [task.id],
      layout: { type: 'pane', paneId: task.id },
      activePaneId: task.id,
    };
    globalState.tabs.push(newTab);
    globalState.activeTabId = newTab.id;
    globalState.layout = newTab.layout;
    globalState.activePaneId = task.id;
  } else {
    if (!globalState.layout) {
      globalState.layout = { type: 'pane', paneId: task.id };
    } else {
      globalState.layout = balanceLayout({
        type: 'split',
        id: createSplitId(),
        direction: 'vertical',
        splitRatio: 0.5,
        children: [globalState.layout, { type: 'pane', paneId: task.id }],
      });
    }
    globalState.activePaneId = task.id;
    syncActiveTab();
  }

  notify();
}

export async function terminateBackgroundTask(taskId: string) {
  if (invoke) {
    try {
      await invoke('cmd_kill_pane', { paneId: taskId, signal: 15 });
    } catch (e) {
      console.warn('Kill background task error:', e);
    }
  }

  globalState.backgroundTasks = globalState.backgroundTasks.filter((t) => t.id !== taskId);
  globalState.panes = globalState.panes.filter((p) => p.id !== taskId);
  notify();
}

export function navigatePane(direction: 'left' | 'right' | 'up' | 'down') {
  if (!globalState.activePaneId || !globalState.layout) return;
  const paneIds = extractPaneIds(globalState.layout);
  if (paneIds.length <= 1) return;

  const currentEl = document.querySelector(`[data-pane-id="${globalState.activePaneId}"]`);
  if (!currentEl) {
    const idx = paneIds.indexOf(globalState.activePaneId);
    const nextIdx = direction === 'right' || direction === 'down'
      ? (idx + 1) % paneIds.length
      : (idx - 1 + paneIds.length) % paneIds.length;
    setActivePane(paneIds[nextIdx]);
    return;
  }

  const currentRect = currentEl.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;

  let bestPaneId: string | null = null;
  let minDistance = Infinity;

  for (const pid of paneIds) {
    if (pid === globalState.activePaneId) continue;
    const el = document.querySelector(`[data-pane-id="${pid}"]`);
    if (!el) continue;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = centerX - currentCenterX;
    const dy = centerY - currentCenterY;

    let isValid = false;
    if (direction === 'left' && dx < -20) isValid = true;
    if (direction === 'right' && dx > 20) isValid = true;
    if (direction === 'up' && dy < -20) isValid = true;
    if (direction === 'down' && dy > 20) isValid = true;

    if (isValid) {
      const dist = Math.hypot(dx, dy);
      if (dist < minDistance) {
        minDistance = dist;
        bestPaneId = pid;
      }
    }
  }

  if (bestPaneId) {
    setActivePane(bestPaneId);
  } else {
    const idx = paneIds.indexOf(globalState.activePaneId);
    const nextIdx = direction === 'right' || direction === 'down'
      ? (idx + 1) % paneIds.length
      : (idx - 1 + paneIds.length) % paneIds.length;
    setActivePane(paneIds[nextIdx]);
  }
}

export function keyboardResizeSplit(delta: number) {
  if (!globalState.layout || !globalState.activePaneId) return;

  function findAndAdjust(node: LayoutNode | null): boolean {
    if (!node || node.type === 'pane') return false;
    const leftHas = extractPaneIds(node.children[0]).includes(globalState.activePaneId!);
    const rightHas = extractPaneIds(node.children[1]).includes(globalState.activePaneId!);

    if (leftHas || rightHas) {
      if (leftHas && findAndAdjust(node.children[0])) return true;
      if (rightHas && findAndAdjust(node.children[1])) return true;

      const adjustment = leftHas ? delta : -delta;
      node.splitRatio = Math.max(0.05, Math.min(0.95, Number((node.splitRatio + adjustment).toFixed(4))));
      return true;
    }
    return false;
  }

  findAndAdjust(globalState.layout);
  syncActiveTab();
  notify();
}

export function toggleOrchestrator(open?: boolean) {
  globalState.orchestratorOpen = open !== undefined ? open : !globalState.orchestratorOpen;
  notify();
}

export function toggleCommandPalette(open?: boolean) {
  globalState.commandPaletteOpen = open !== undefined ? open : !globalState.commandPaletteOpen;
  notify();
}

export function toggleCustomToolModal(open?: boolean) {
  globalState.customToolModalOpen = open !== undefined ? open : !globalState.customToolModalOpen;
  notify();
}

export async function openDiffGatekeeper(paneId?: string, targetBranch?: string) {
  const targetId = paneId || globalState.activePaneId;
  if (!targetId) return;

  try {
    const diff: WorktreeDiff = await invoke('cmd_get_worktree_diff', {
      paneId: targetId,
      targetBranch: targetBranch || null,
    });
    if (diff) {
      globalState.activeDiff = diff;
    }
  } catch (e) {
    console.error('Failed to load diff:', e);
    globalState.activeDiff = {
      pane_id: targetId,
      diff_unified: 'No unmerged changes detected in worktree branch.',
      files_changed: [],
      insertions: 0,
      deletions: 0,
    };
  }
  globalState.diffGatekeeperOpen = true;
  notify();
}

export function closeDiffGatekeeper() {
  globalState.diffGatekeeperOpen = false;
  notify();
}

export async function mergeWorktreeSquash(paneId: string, message: string, targetBranch?: string) {
  try {
    await invoke('cmd_merge_worktree', {
      paneId,
      targetBranch: targetBranch || null,
      squash: true,
      commitMessage: message,
    });
    closeDiffGatekeeper();
  } catch (e) {
    console.error('Merge failed:', e);
  }
}

export function toggleTimeTravel(open?: boolean) {
  globalState.timeTravelOpen = open !== undefined ? open : !globalState.timeTravelOpen;
  if (globalState.timeTravelOpen && globalState.activePaneId) {
    listSnapshots(globalState.activePaneId);
  }
  notify();
}

export async function listSnapshots(paneId?: string): Promise<GitSnapshot[]> {
  const targetId = paneId || globalState.activePaneId;
  if (!targetId) return [];

  try {
    const list = await invoke('cmd_list_snapshots', { paneId: targetId });
    if (Array.isArray(list)) {
      globalState.snapshots = list;
      notify();
      return list;
    }
  } catch (e) {
    console.warn('Failed to list snapshots:', e);
  }
  return [];
}

export async function createSnapshot(summary: string): Promise<string | null> {
  const targetId = globalState.activePaneId;
  if (!targetId) return null;

  try {
    const id = await invoke('cmd_create_snapshot', {
      paneId: targetId,
      summary,
    });
    await listSnapshots(targetId);
    return id;
  } catch (e) {
    console.error('Failed to create snapshot:', e);
    return null;
  }
}

export async function rollbackSnapshot(snapshotId: string): Promise<boolean> {
  const targetId = globalState.activePaneId;
  if (!targetId) return false;

  try {
    await invoke('cmd_rollback_snapshot', {
      paneId: targetId,
      snapshotId,
    });
    return true;
  } catch (e) {
    console.error('Failed to rollback snapshot:', e);
    return false;
  }
}

export function toggleObsidianSidebar(open?: boolean) {
  globalState.obsidianSidebarOpen = open !== undefined ? open : !globalState.obsidianSidebarOpen;
  notify();
}

export async function sendPtyInput(paneId: string, data: string | Uint8Array) {
  if (invoke) {
    try {
      const bytes = typeof data === 'string' ? Array.from(new TextEncoder().encode(data)) : Array.from(data);
      await invoke('cmd_send_pty_input', { paneId, data: bytes });
    } catch (e) {
      console.error('sendPtyInput error:', e);
    }
  }
}

export async function resizePanePty(paneId: string, cols: number, rows: number) {
  if (invoke && cols > 0 && rows > 0) {
    try {
      await invoke('cmd_resize_pane', { paneId, cols: Math.max(1, cols), rows: Math.max(1, rows) });
    } catch (e) {
      console.warn('resizePanePty error:', e);
    }
  }
}

// ----------------------------------------------------------------------------
// Real-time Event Subscriptions & Global Shortcuts Setup
// ----------------------------------------------------------------------------

export function setupGlobalShortcuts() {
  const onKeyDown = (e: KeyboardEvent) => {
    // Ctrl+P or Cmd+P -> Command Palette
    if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P') && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggleCommandPalette();
    }
    // Cmd+D or Ctrl+D -> Split Vertical; Cmd+Shift+D or Ctrl+Shift+D -> Split Horizontal
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && !e.altKey) {
      e.preventDefault();
      splitActivePane(e.shiftKey ? 'horizontal' : 'vertical');
    }
    // Escape -> Close open modals
    if (e.key === 'Escape') {
      if (globalState.commandPaletteOpen) {
        e.preventDefault();
        toggleCommandPalette(false);
      }
    }
    // Ctrl+Space -> Orchestrator Bar
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      toggleOrchestrator();
    }
    // Ctrl+T or Ctrl+Shift+T -> New Tab
    if (e.ctrlKey && (e.key === 't' || e.key === 'T') && !e.altKey) {
      e.preventDefault();
      createTab();
    }
    // Ctrl+Tab or Ctrl+PageDown -> Next Tab
    if (e.ctrlKey && (e.code === 'Tab' || e.code === 'PageDown') && !e.shiftKey) {
      e.preventDefault();
      nextTab();
    }
    // Ctrl+Shift+Tab or Ctrl+PageUp -> Previous Tab
    if (e.ctrlKey && (e.code === 'Tab' || e.code === 'PageUp') && e.shiftKey) {
      e.preventDefault();
      previousTab();
    }
    // Alt+E -> Equalize / Balance Panes
    if (e.altKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      equalizeLayout();
    }
    // Alt+1 .. Alt+9 -> Switch to Tab
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (globalState.tabs[idx]) {
        e.preventDefault();
        switchTab(globalState.tabs[idx].id);
      }
    }
    // Alt+M -> Diff Gatekeeper
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      openDiffGatekeeper();
    }
    // Alt+Z -> Time Travel Snapshot Slider
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      toggleTimeTravel();
    }
    // Ctrl+B -> Obsidian Sidebar
    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleObsidianSidebar();
    }
    // Alt+V -> Split Vertical
    if (e.altKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      splitActivePane('vertical');
    }
    // Alt+S -> Split Horizontal
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      splitActivePane('horizontal');
    }
    // Ctrl+W or Alt+W -> Close Active Pane (with safety check on running foreground processes)
    if ((e.ctrlKey || e.altKey) && (e.key === 'w' || e.key === 'W') && !e.shiftKey) {
      e.preventDefault();
      if (globalState.activePaneId) {
        requestClosePane(globalState.activePaneId);
      }
    }

    // Ctrl+Shift+W -> Close Current Tab
    if (e.ctrlKey && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      if (globalState.activeTabId) {
        closeTab(globalState.activeTabId);
      }
    }

    // Alt+B -> Send active pane to background
    if (e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      if (globalState.activePaneId) {
        sendPaneToBackground(globalState.activePaneId);
      }
    }

    // Alt+Shift+B -> Toggle Background Tasks Drawer
    if (e.altKey && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleBackgroundDrawer();
    }

    // Alt+R -> Aether Drive Workflow Palette
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      toggleWorkflowsModal();
    }
    // Alt+I -> Toggle Modern Input Bar on active pane
    if (e.altKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      if (globalState.activePaneId) {
        togglePaneInputBar(globalState.activePaneId);
      }
    }
    // Alt+Shift+P -> Advance pending pipeline stage
    if (e.altKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      advancePipelineStage();
    }
    // Directional Pane Navigation (Vim keys & Arrows)
    if (e.altKey && !e.shiftKey) {
      if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowLeft') {
        e.preventDefault();
        navigatePane('left');
      } else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowRight') {
        e.preventDefault();
        navigatePane('right');
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigatePane('up');
      } else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigatePane('down');
      }
    }

    // Keyboard Split Resizing (Alt+Shift+H/J/K/L & Alt+Shift+Arrows)
    if (e.altKey && e.shiftKey) {
      if (e.key === 'h' || e.key === 'H' || e.key === 'ArrowLeft') {
        e.preventDefault();
        keyboardResizeSplit(-0.05);
      } else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowRight') {
        e.preventDefault();
        keyboardResizeSplit(0.05);
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        keyboardResizeSplit(-0.05);
      } else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        keyboardResizeSplit(0.05);
      }
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

export function subscribeAetherEvents(onPtyData?: (paneId: string, bytes: Uint8Array, offset?: number) => void) {
  if (!listen) return () => {};

  let unlistenPromise = listen('aether:event', (event: any) => {
    const payload = event.payload;
    if (!payload) return;

    if (payload.PtyOutput) {
      const { pane_id, data, offset = 0 } = payload.PtyOutput;
      const bytes = new Uint8Array(data);
      if (onPtyData) {
        onPtyData(pane_id, bytes, offset);
      }
      // Attribute output to the pane's active command block (Warp Block View).
      // Decode only when a block is actually open: decoding + ANSI-stripping every
      // chunk is the dominant cost on high-throughput output (cargo build, tail -f).
      if (getOpenCommandBlock(pane_id)) {
        try {
          const decoded = new TextDecoder().decode(new Uint8Array(data));
          appendBlockOutput(pane_id, stripAnsi(decoded));
        } catch {}
      }
    } else if (payload.PaneExited) {
      const { pane_id, exit_code } = payload.PaneExited;
      finishCommandBlock(pane_id, exit_code);

      const bg = globalState.backgroundTasks.find((t) => t.id === pane_id);
      if (bg) {
        bg.status = exit_code === 0 ? 'EXITED' : 'ERROR';
      }
      const p = globalState.panes.find((pane) => pane.id === pane_id);
      if (p) {
        p.status = exit_code === 0 ? 'IDLE' : 'ERROR';
        p.lastExitCode = exit_code;
      }
      notify();
    } else if (payload.DelegationPaneRequested) {
      const { target_cli, prompt } = payload.DelegationPaneRequested;
      spawnAgentPane(target_cli, true).then((pane) => {
        if (pane) {
          setTimeout(() => {
            sendPtyInput(pane.id, `${prompt}\n`);
          }, 600);
        }
      });
    } else if (payload.ObsidianNoteUpdated) {
      globalState.obsidianRefreshTick += 1;
      notify();
    } else if (payload.PaneStatusChanged) {
      const { pane_id, status } = payload.PaneStatusChanged;
      const p = globalState.panes.find((pane) => pane.id === pane_id);
      if (p) {
        p.status = status;
        notify();
      }
    } else if (payload.PortRadarDetected) {
      const { pane_id, ports } = payload.PortRadarDetected;
      const p = globalState.panes.find((pane) => pane.id === pane_id);
      if (p) {
        p.openPorts = ports;
        notify();
      }
    } else if (payload.BlackboardEntryCreated) {
      globalState.blackboard.unshift(payload.BlackboardEntryCreated);
      notify();
    } else if (payload.ModuleClaimed || payload.ModuleReleased || payload.FileLockChanged) {
      // Refresh locks
      refreshSharedContext();
    } else if (payload.GitSnapshotCreated) {
      if (globalState.activePaneId && payload.GitSnapshotCreated.pane_id === globalState.activePaneId) {
        listSnapshots(globalState.activePaneId);
      }
    }
  });

  return () => {
    unlistenPromise.then((unlisten: any) => unlisten && unlisten());
  };
}

export async function restoreActivePanes(): Promise<void> {
  if (!invoke) return;
  try {
    await detectAvailableTools();
    const list: any = await invoke('cmd_list_panes', {
      workspaceId: globalState.workspaceId,
    });
    if (Array.isArray(list) && list.length > 0) {
      const restoredPanes: AgentPane[] = list.map((item: any) => {
        const detected = globalState.detectedTools.find(
          (t) => t.id === item.cli_type || t.binary === item.cli_type
        );
        const palette = detected
          ? { name: detected.name, color: detected.color, binary: detected.binary }
          : AGENT_PALETTES[item.cli_type] || {
              name: item.cli_type,
              color: '#7aa2f7',
              binary: item.cli_type,
            };
        return {
          id: item.pane_id,
          cliType: item.cli_type,
          pid: item.pid || 0,
          status: item.status || 'IDLE',
          worktreePath: item.worktree_path || null,
          gitBranch: item.git_branch || null,
          openPorts: item.open_ports || [],
          color: palette.color,
        };
      });

      globalState.panes = restoredPanes;
      if (!globalState.activePaneId || !restoredPanes.some((p) => p.id === globalState.activePaneId)) {
        globalState.activePaneId = restoredPanes[0].id;
      }

      // Reconstruct layout tree & balanced ratios
      let layout: LayoutNode | null = null;
      for (const p of restoredPanes) {
        if (!layout) {
          layout = { type: 'pane', paneId: p.id };
        } else {
          layout = {
            type: 'split',
            id: createSplitId(),
            direction: 'vertical',
            splitRatio: 0.5,
            children: [layout, { type: 'pane', paneId: p.id }],
          };
        }
      }
      globalState.layout = balanceLayout(layout);

      const defaultTab: TerminalTab = {
        id: 'tab_default',
        title: restoredPanes.length > 1 ? `Workspace (${restoredPanes.length})` : `@${restoredPanes[0].cliType}`,
        paneIds: restoredPanes.map((p) => p.id),
        layout: globalState.layout,
        activePaneId: globalState.activePaneId,
      };
      globalState.tabs = [defaultTab];
      globalState.activeTabId = defaultTab.id;

      notify();
    } else {
      // If no active panes exist, create initial tab with default shell!
      await createTab('Main', globalState.defaultShell || 'shell');
    }
  } catch (e) {
    console.warn('Failed to restore active panes from daemon:', e);
  }
}

export async function refreshSharedContext(query?: string) {
  try {
    const summary = await invoke('cmd_get_shared_context', {
      workspaceId: globalState.workspaceId,
      query: query || null,
    });
    if (summary) {
      globalState.blackboard = summary.blackboard_entries || summary.recent_blackboard_entries || [];
      globalState.fileLocks = summary.active_file_locks || [];
      notify();
    }
  } catch (e) {
    console.warn('Failed to refresh shared context:', e);
  }
}

export async function publishBlackboardEntry(
  authorAgentId: string,
  entryType: string,
  title: string,
  contentMarkdown: string,
  targetAgentId?: string
) {
  if (invoke) {
    try {
      const id = await invoke('cmd_publish_blackboard', {
        workspaceId: globalState.workspaceId,
        authorAgentId,
        entryType,
        title,
        contentMarkdown,
        targetAgentId: targetAgentId || null,
      });
      await refreshSharedContext();
      return id;
    } catch (e) {
      console.error('Failed to publish blackboard entry:', e);
      throw e;
    }
  } else {
    // Fallback mock
    const entry: BlackboardEntry = {
      id: Date.now(),
      workspace_id: globalState.workspaceId,
      author_agent_id: authorAgentId,
      entry_type: entryType as any,
      title,
      content_markdown: contentMarkdown,
      target_agent_id: targetAgentId,
      is_resolved: false,
      created_at: new Date().toISOString(),
    };
    globalState.blackboard.unshift(entry);
    notify();
    return entry.id;
  }
}

export async function readObsidianNote(queryOrPath: string): Promise<string> {
  if (invoke) {
    try {
      return await invoke('cmd_read_obsidian_note', {
        workspaceId: globalState.workspaceId,
        queryOrPath,
      });
    } catch (e) {
      console.warn('Note read error:', e);
      return '';
    }
  } else {
    return `# Sprint & Architecture Notes\n\n- [ ] Scaffold AetherTerminal GUI with Tauri v2 and Xterm.js WebGL\n- [x] Implement aetherd SQLite WAL One Brain\n- [ ] Wire Obsidian vault bidirectional task synchronization\n- [x] Configure Linux Port Radar on /proc/net/tcp\n- [ ] Implement Multi-agent squash merge gatekeeper\n`;
  }
}

export async function updateObsidianTask(
  notePath: string,
  taskText: string,
  completed: boolean
): Promise<void> {
  if (invoke) {
    try {
      await invoke('cmd_update_obsidian_task', {
        workspaceId: globalState.workspaceId,
        notePath,
        taskText,
        completed,
      });
    } catch (e) {
      console.error('Failed to update obsidian task:', e);
      throw e;
    }
  }
}

export async function claimModule(
  agentId: string,
  files: string[],
  intent?: string
): Promise<{ granted: boolean; conflicts: string[] }> {
  if (invoke) {
    try {
      const [granted, conflicts] = await invoke('cmd_claim_module', {
        workspaceId: globalState.workspaceId,
        agentId,
        files,
        intent: intent || null,
      });
      await refreshSharedContext();
      return { granted, conflicts };
    } catch (e) {
      console.error('Failed to claim module:', e);
      return { granted: false, conflicts: [String(e)] };
    }
  } else {
    return { granted: true, conflicts: [] };
  }
}

export async function releaseModule(agentId: string, files: string[]): Promise<void> {
  if (invoke) {
    try {
      await invoke('cmd_release_module', {
        workspaceId: globalState.workspaceId,
        agentId,
        files,
      });
      await refreshSharedContext();
    } catch (e) {
      console.error('Failed to release module:', e);
    }
  }
}

// ----------------------------------------------------------------------------
// Warp-Style Command Blocks, Scrollback Restoration & Pipeline Orchestration
// ----------------------------------------------------------------------------

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][A-Z0-9]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export interface ScrollbackDataResult {
  data: Uint8Array;
  endOffset: number;
}

export async function getPaneScrollback(paneId: string): Promise<ScrollbackDataResult | null> {
  if (!isRunningInTauri()) return null;
  try {
    const res = (await invoke('cmd_get_scrollback', { paneId })) as { data: number[] | Uint8Array; end_offset?: number } | null;
    if (!res || !res.data) return null;
    const data = Array.isArray(res.data) ? new Uint8Array(res.data) : (res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data));
    const endOffset = typeof res.end_offset === 'number' ? res.end_offset : data.length;
    return { data, endOffset };
  } catch (e) {
    console.warn('getPaneScrollback failed:', e);
    return null;
  }
}

export function getPaneBlocks(paneId: string): CommandBlock[] {
  return globalState.commandBlocks.filter((b) => b.paneId === paneId);
}

export function startCommandBlock(paneId: string, command: string, cwd?: string): CommandBlock {
  const pane = globalState.panes.find((p) => p.id === paneId);
  const block: CommandBlock = {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    paneId,
    command,
    cwd: cwd || pane?.worktreePath || '',
    startedAt: Date.now(),
    exitCode: null,
    outputText: '',
    isBookmarked: false,
    isCollapsed: false,
  };
  globalState.commandBlocks.push(block);
  if (pane) pane.status = 'EXECUTING';
  notify();
  return block;
}

let lastBlockNotify = 0;

export function getOpenCommandBlock(paneId: string): CommandBlock | undefined {
  const blocks = globalState.commandBlocks;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].paneId === paneId) {
      return blocks[i].exitCode === null ? blocks[i] : undefined;
    }
  }
  return undefined;
}

export function appendBlockOutput(paneId: string, text: string) {
  const blocks = globalState.commandBlocks;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].paneId === paneId) {
      // Only a block that is still running owns new output. Appending to a finished
      // block made the string grow without bound on every chunk.
      if (blocks[i].exitCode !== null) return;
      blocks[i].outputText += text;
      if (blocks[i].outputText.length > 200_000) {
        blocks[i].outputText = blocks[i].outputText.slice(-200_000);
      }
      // Throttle re-renders: output streams at high frequency
      const now = Date.now();
      if (now - lastBlockNotify > 250) {
        lastBlockNotify = now;
        notify();
      }
      return;
    }
  }
}

export function finishCommandBlock(paneId: string, exitCode: number | null) {
  const blocks = globalState.commandBlocks;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].paneId === paneId && blocks[i].finishedAt === undefined) {
      blocks[i].finishedAt = Date.now();
      blocks[i].exitCode = exitCode;
      const failed = exitCode !== null && exitCode !== 0;
      const pane = globalState.panes.find((p) => p.id === paneId);
      if (pane) pane.lastCommandFailed = failed;
      notify();
      return;
    }
  }
}

export function toggleBlockBookmark(blockId: string) {
  const block = globalState.commandBlocks.find((b) => b.id === blockId);
  if (block) {
    block.isBookmarked = !block.isBookmarked;
    notify();
  }
}

export function toggleBlockCollapsed(blockId: string) {
  const block = globalState.commandBlocks.find((b) => b.id === blockId);
  if (block) {
    block.isCollapsed = !block.isCollapsed;
    notify();
  }
}

export function setPaneViewMode(paneId: string, mode: 'raw' | 'blocks') {
  const pane = globalState.panes.find((p) => p.id === paneId);
  if (pane) {
    pane.viewMode = mode;
    notify();
  }
}

export function togglePaneInputBar(paneId: string, open?: boolean) {
  const pane = globalState.panes.find((p) => p.id === paneId);
  if (pane) {
    pane.inputBarOpen = open !== undefined ? open : !pane.inputBarOpen;
    notify();
  }
}

export function recentCommandsFor(paneId: string, limit = 20): string[] {
  return getPaneBlocks(paneId)
    .map((b) => b.command)
    .filter((c) => c.trim().length > 0)
    .slice(-limit)
    .reverse();
}

/**
 * Execute a command through a pane: registers a Command Block, echoes it into the PTY
 * and records the block as active so output streaming can be attributed to it.
 */
export async function executeCommandInPane(paneId: string, command: string) {
  if (!command.trim()) return;
  startCommandBlock(paneId, command.trim());
  await sendPtyInput(paneId, `${command}\n`);
}

export function dispatchToPeerAgent(command: string, output: string, targetCli?: string) {
  const target = targetCli || globalState.detectedTools.find((t) => t.category === 'agent')?.id || 'claude-code';
  const excerpt = output.split('\n').slice(-50).join('\n');
  const prompt = `Analyze and fix the issue in this command output:\n$ ${command}\n${excerpt}\n`;
  const existing = globalState.panes.find((p) => p.cliType === target);
  if (existing) {
    sendPtyInput(existing.id, prompt);
    return Promise.resolve(existing);
  }
  return spawnAgentPane(target, true).then((pane) => {
    if (pane) {
      setTimeout(() => sendPtyInput(pane.id, prompt), 600);
    }
    return pane;
  });
}

// ------------------------------ Pipeline Queue ------------------------------

export function enqueuePipelineStage(stage: PipelineStage) {
  globalState.pipelineQueue.push(stage);
  globalState.pipelineActive = true;
  notify();
}

export function clearPipeline() {
  globalState.pipelineQueue = [];
  globalState.pipelineActive = false;
  notify();
}

export async function advancePipelineStage() {
  const next = globalState.pipelineQueue.shift();
  if (!next) {
    globalState.pipelineActive = false;
    notify();
    return;
  }
  notify();

  const existing = globalState.panes.find((p) => p.cliType === next.targetCli);
  if (existing) {
    await sendPtyInput(existing.id, `${next.prompt}\n`);
    return;
  }
  const created = await spawnAgentPane(next.targetCli, true);
  if (created) {
    setTimeout(() => {
      sendPtyInput(created.id, `${next.prompt}\n`);
    }, 600);
  }
}

// ------------------------------- Workflows ---------------------------------

export const BUILTIN_WORKFLOWS: AetherWorkflow[] = [
  {
    id: 'wf_worktree_cleanup',
    name: 'Git Worktree Cleanup',
    description: 'Prune stale worktrees and report remaining ones.',
    commandTemplate: 'git worktree prune && git worktree list',
    tags: ['git', 'maintenance'],
  },
  {
    id: 'wf_cargo_check',
    name: 'Cargo Workspace Check',
    description: 'Type-check every crate in the workspace.',
    commandTemplate: 'cargo check --package {{crate_name}} --all-targets',
    tags: ['rust', 'build'],
  },
  {
    id: 'wf_port_kill',
    name: 'Port Kill by Number',
    description: 'Free a TCP port held by a lingering process.',
    commandTemplate: 'fuser -k {{port}}/tcp || lsof -ti tcp:{{port}} | xargs -r kill -9',
    tags: ['network', 'process'],
  },
  {
    id: 'wf_broadcast_review',
    name: 'Broadcast Architecture Review',
    description: 'Ask every active agent to review the current architecture.',
    commandTemplate: 'echo "Architecture review requested for {{module}}: check boundaries, error handling, and tests."',
    tags: ['agents', 'review'],
  },
  {
    id: 'wf_docker_logs',
    name: 'Docker Container Logs',
    description: 'Tail the last 200 log lines of a container.',
    commandTemplate: 'docker logs --tail {{lines}} -f {{container}}',
    tags: ['docker', 'observability'],
  },
];

export async function loadWorkflows() {
  if (globalState.workflows.length === 0) {
    globalState.workflows = [...BUILTIN_WORKFLOWS];
    notify();
  }

  // Vault-backed workflows override built-ins with the same id.
  if (invoke) {
    try {
      const raw: {
        id: string;
        name: string;
        description: string;
        command_template: string;
        tags: string[];
        relative_path: string;
      }[] = await invoke('cmd_list_workflows', { workspaceId: globalState.workspaceId });

      if (raw && raw.length > 0) {
        const fromVault: AetherWorkflow[] = raw.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          commandTemplate: w.command_template,
          tags: w.tags,
          relativePath: w.relative_path,
        }));
        const byId = new Map(fromVault.map((w) => [w.id, w]));
        const merged = [
          ...fromVault,
          ...BUILTIN_WORKFLOWS.filter((b) => !byId.has(b.id)),
        ];
        globalState.workflows = merged;
        notify();
      }
    } catch (e) {
      console.warn('Vault workflow load failed, using built-ins:', e);
    }
  }

  return globalState.workflows;
}

export function toggleWorkflowsModal(open?: boolean) {
  globalState.workflowsModalOpen = open !== undefined ? open : !globalState.workflowsModalOpen;
  if (globalState.workflowsModalOpen) {
    // Fire and forget: built-ins show immediately, vault entries merge in after.
    void loadWorkflows();
  }
  notify();
}

export function extractWorkflowParams(template: string): string[] {
  const matches = template.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}

export function renderWorkflowTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}

export async function runWorkflow(template: string, values: Record<string, string>, paneId?: string) {
  const targetPane = paneId || globalState.activePaneId;
  if (!targetPane) return false;
  const command = renderWorkflowTemplate(template, values);
  await executeCommandInPane(targetPane, command);
  return true;
}
