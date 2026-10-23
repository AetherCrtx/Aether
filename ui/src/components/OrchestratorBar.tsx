import React, { useState, useEffect, useRef } from 'react';
import {
  toggleOrchestrator,
  useAetherStore,
  spawnAgentPane,
  sendPtyInput,
} from '../stores/aetherStore';
import { Command, Sparkles, ArrowRight, X, Bot, FileText, Send } from 'lucide-react';

export const OrchestratorBar: React.FC = () => {
  const store = useAetherStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (store.orchestratorOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [store.orchestratorOpen]);

  if (!store.orchestratorOpen) return null;

  const normalizeCliType = (tag: string): string => {
    const lower = tag.toLowerCase();
    const detected = store.detectedTools.find(
      (t) => t.id === lower || t.binary.toLowerCase() === lower || t.name.toLowerCase() === lower
    );
    if (detected) return detected.id;
    if (lower === 'claude') return 'claude-code';
    if (lower === 'bash' || lower === 'zsh') return 'shell';
    return lower;
  };

  const handleExecute = async () => {
    if (!query.trim()) return;

    // Check for pipeline syntax "@agent1 prompt -> @agent2 prompt"
    const stages = query.split('->').map((s) => s.trim());

    for (const stage of stages) {
      // Find @agent tag
      const match = stage.match(/@([\w-]+)/);
      const rawTag = match ? match[1] : 'claude-code';
      const agentType = normalizeCliType(rawTag);
      const prompt = stage.replace(/@[\w-]+/, '').trim();

      // Check if pane for agentType is already active, otherwise spawn one
      const existingPane = store.panes.find((p) => p.cliType === agentType);
      if (existingPane) {
        sendPtyInput(existingPane.id, `${prompt}\n`);
      } else {
        const newlyCreated = await spawnAgentPane(agentType, true);
        if (newlyCreated) {
          setTimeout(() => {
            sendPtyInput(newlyCreated.id, `${prompt}\n`);
          }, 600);
        }
      }
    }

    setQuery('');
    toggleOrchestrator(false);
  };

  const insertSuggestion = (text: string) => {
    setQuery(text);
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-tokyo-panel border border-tokyo-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scaleUp">
        {/* Top Input Bar */}
        <div className="h-14 px-4 flex items-center gap-3 border-b border-tokyo-border/70 bg-tokyo-bgDark">
          <Sparkles className="w-5 h-5 text-tokyo-blue flex-shrink-0 animate-pulse" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExecute();
              if (e.key === 'Escape') toggleOrchestrator(false);
            }}
            placeholder="Dispatch prompt or estafet pipeline: @claude create auth -> @codex write tests"
            className="flex-1 bg-transparent text-sm text-white placeholder-tokyo-comment focus:outline-none font-mono"
          />
          <button
            onClick={handleExecute}
            className="px-3 py-1.5 rounded-md bg-tokyo-blue text-tokyo-bgDark font-semibold text-xs hover:bg-tokyo-cyan transition-colors flex items-center gap-1.5"
          >
            <span>Run</span>
            <Send className="w-3 h-3" />
          </button>
          <button
            onClick={() => toggleOrchestrator(false)}
            className="p-1.5 text-tokyo-comment hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Suggestions & Shortcuts list */}
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-tokyo-comment">
            Agentic Pipeline Presets
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() =>
                insertSuggestion(
                  '@claude refactor src/auth.rs to Argon2id -> @codex write unit tests in tests/auth_test.rs'
                )
              }
              className="w-full p-2.5 rounded-lg bg-tokyo-bgDark/60 border border-tokyo-border hover:border-tokyo-blue/50 text-left transition-all group flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#D97757]" />
                <span className="text-xs text-tokyo-fg font-mono">
                  @claude refactor auth.rs <span className="text-tokyo-blue">→</span> @codex write unit tests
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-tokyo-comment group-hover:text-tokyo-blue transition-colors" />
            </button>

            <button
              onClick={() =>
                insertSuggestion(
                  '@claude design REST API schema -> @opencode implement route handlers -> @codex audit security'
                )
              }
              className="w-full p-2.5 rounded-lg bg-tokyo-bgDark/60 border border-tokyo-border hover:border-tokyo-purple/50 text-left transition-all group flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#3B82F6]" />
                <span className="text-xs text-tokyo-fg font-mono">
                  @claude design schema <span className="text-tokyo-blue">→</span> @opencode implement <span className="text-tokyo-blue">→</span> @codex audit
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-tokyo-comment group-hover:text-tokyo-purple transition-colors" />
            </button>
          </div>

          <div className="mt-2 pt-3 border-t border-tokyo-border/50 flex items-center justify-between text-[11px] text-tokyo-comment">
            <span>Syntax: Type <span className="text-tokyo-blue">@agent</span> to target CLI, <span className="text-tokyo-blue">-&gt;</span> to chain estafet tasks.</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
