import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AetherWorkflow,
  extractWorkflowParams,
  runWorkflow,
  toggleWorkflowsModal,
  useAetherStore,
} from '../stores/aetherStore';
import { Search, Play, X, Workflow as WorkflowIcon } from 'lucide-react';

export const WorkflowsModal: React.FC = () => {
  const store = useAetherStore();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AetherWorkflow | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (store.workflowsModalOpen) {
      setTimeout(() => searchRef.current?.focus(), 40);
      setSelected(null);
      setValues({});
      setSearch('');
    }
  }, [store.workflowsModalOpen]);

  const params = useMemo(
    () => (selected ? extractWorkflowParams(selected.commandTemplate) : []),
    [selected]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return store.workflows;
    return store.workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [store.workflows, search]);

  if (!store.workflowsModalOpen) return null;

  const canRun = params.every((p) => (values[p] || '').trim().length > 0);

  const execute = async () => {
    if (!selected) return;
    const ok = await runWorkflow(selected.commandTemplate, values);
    if (ok) toggleWorkflowsModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="h-12 px-3 flex items-center gap-2 border-b border-slate-800 bg-slate-950">
          <WorkflowIcon className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-200 shrink-0">Aether Drive</span>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') toggleWorkflowsModal(false);
            }}
            placeholder="Search parameterized workflows..."
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono"
          />
          <Search className="w-3.5 h-3.5 text-slate-600" />
          <button
            onClick={() => toggleWorkflowsModal(false)}
            className="p-1 rounded text-slate-500 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex max-h-[60vh] min-h-[280px]">
          <div className="w-1/2 border-r border-slate-800 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-[11px] text-slate-500 font-mono">No workflow matches.</div>
            ) : (
              filtered.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => {
                    setSelected(wf);
                    setValues({});
                  }}
                  className={`w-full text-left px-3 py-2 border-b border-slate-800/60 transition-colors ${
                    selected?.id === wf.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-slate-100">{wf.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{wf.description}</div>
                  <div className="mt-1 flex gap-1">
                    {wf.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="w-1/2 p-3 flex flex-col gap-2 overflow-y-auto">
            {!selected ? (
              <div className="text-[11px] text-slate-500 font-mono">
                Select a workflow to fill its parameters.
              </div>
            ) : (
              <>
                <div className="text-[11px] font-semibold text-slate-200">{selected.name}</div>
                <pre className="text-[10px] font-mono text-cyan-300 bg-slate-950 border border-slate-800 rounded p-2 whitespace-pre-wrap break-words">
                  {selected.commandTemplate}
                </pre>

                {params.length === 0 ? (
                  <div className="text-[10px] text-slate-500 font-mono">
                    No parameters required. Press Enter to run.
                  </div>
                ) : (
                  params.map((p) => (
                    <label key={p} className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono text-slate-400">{p}</span>
                      <input
                        value={values[p] || ''}
                        onChange={(e) => setValues({ ...values, [p]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && canRun) execute();
                        }}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-100 focus:outline-none focus:border-cyan-600/60"
                        placeholder={p}
                      />
                    </label>
                  ))
                )}

                <button
                  onClick={execute}
                  disabled={!canRun}
                  className={`mt-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-colors ${
                    canRun
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  Run in Active Pane
                </button>
              </>
            )}
          </div>
        </div>

        <div className="h-8 px-3 flex items-center justify-between text-[10px] text-slate-600 font-mono border-t border-slate-800">
          <span>Alt+R to open · Enter to run · Esc to close</span>
          <span>{store.workflows.length} workflows</span>
        </div>
      </div>
    </div>
  );
};
