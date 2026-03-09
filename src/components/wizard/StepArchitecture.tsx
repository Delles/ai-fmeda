import React, { useState } from 'react';
import {
  Layers, Cpu, CircuitBoard, ChevronDown, ChevronRight as ChevronRightIcon,
  Pencil, Trash2, Plus, Loader2, Sparkles, Check, X, ChevronLeft,
} from 'lucide-react';
import { FmedaSystemDeep } from '@/types/ai';
import type { ProjectContext } from '@/types/fmeda';
import { useAIStore } from '@/store/aiStore';
import { generateArchitecture } from '@/services/aiService';
import { cn } from '@/lib/utils';
import { AILoadingIndicator } from '../ui/AILoadingIndicator';

interface StepArchitectureProps {
  architecture: FmedaSystemDeep[];
  projectContext: ProjectContext;
  onUpdateArchitecture: (arch: FmedaSystemDeep[]) => void;
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
}

// ─── Inline Editable Name ───────────────────────────────────────────────────

const InlineEdit: React.FC<{
  value: string;
  onSave: (val: string) => void;
  className?: string;
}> = ({ value, onSave, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        className={cn("cursor-pointer hover:underline decoration-dotted underline-offset-4", className)}
        onDoubleClick={() => { setDraft(value); setEditing(true); }}
      >
        {value}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        className="px-2 py-0.5 text-sm border border-blue-400 rounded focus:ring-2 focus:ring-blue-300 focus:outline-none bg-white"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && draft.trim()) { onSave(draft.trim()); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        autoFocus
      />
      <button type="button" onClick={() => { if (draft.trim()) { onSave(draft.trim()); setEditing(false); } }}
        className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={() => setEditing(false)}
        className="p-0.5 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
};

// ─── Add Item Inline ────────────────────────────────────────────────────────

const AddItemInline: React.FC<{
  placeholder: string;
  onAdd: (name: string) => void;
}> = ({ placeholder, onAdd }) => {
  const [active, setActive] = useState(false);
  const [name, setName] = useState('');

  if (!active) {
    return (
      <button type="button" onClick={() => setActive(true)}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors">
        <Plus className="w-3.5 h-3.5" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 ml-1">
      <input
        className="px-2 py-1 text-xs border border-blue-400 rounded focus:ring-2 focus:ring-blue-300 focus:outline-none flex-1"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) { onAdd(name.trim()); setName(''); setActive(false); }
          if (e.key === 'Escape') { setName(''); setActive(false); }
        }}
        autoFocus
      />
      <button type="button" onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); setActive(false); } }}
        className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3 h-3" /></button>
      <button type="button" onClick={() => { setName(''); setActive(false); }}
        className="p-0.5 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3 h-3" /></button>
    </div>
  );
};

// ─── Action Buttons ─────────────────────────────────────────────────────────

const RowActions: React.FC<{
  onRename: () => void;
  onDelete: () => void;
}> = ({ onRename, onDelete }) => (
  <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
    <button type="button" onClick={onRename}
      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
    <button type="button" onClick={onDelete}
      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
      title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
  </div>
);

// ─── Main Component ─────────────────────────────────────────────────────────

export const StepArchitecture: React.FC<StepArchitectureProps> = ({
  architecture,
  projectContext,
  onUpdateArchitecture,
  onNext,
  onBack,
  onFinish,
}) => {
  const { config } = useAIStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSystems, setExpandedSystems] = useState<Set<number>>(new Set());
  const [expandedSubsystems, setExpandedSubsystems] = useState<Set<string>>(new Set());

  // Count helpers
  const totalSystems = architecture.length;
  const totalSubsystems = architecture.reduce((sum, s) => sum + (s.subsystems?.length || 0), 0);
  const totalComponents = architecture.reduce((sum, s) =>
    sum + (s.subsystems || []).reduce((sSum, sub) => sSum + (sub.components?.length || 0), 0), 0);

  const toggleSystem = (idx: number) => {
    const next = new Set(expandedSystems);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setExpandedSystems(next);
  };

  const toggleSubsystem = (key: string) => {
    const next = new Set(expandedSubsystems);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedSubsystems(next);
  };

  // ─── AI Generation ────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!config.apiKey) {
      setError('Please configure your AI API Key in settings first.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateArchitecture(config, projectContext);
      onUpdateArchitecture(result);
      // Expand all systems by default
      setExpandedSystems(new Set(result.map((_, i) => i)));
      const subKeys = new Set<string>();
      result.forEach((sys, sIdx) => (sys.subsystems || []).forEach((_, subIdx) => subKeys.add(`${sIdx}-${subIdx}`)));
      setExpandedSubsystems(subKeys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate architecture');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── CRUD Helpers ─────────────────────────────────────────────────────────

  const updateArch = (fn: (draft: FmedaSystemDeep[]) => FmedaSystemDeep[]) => {
    onUpdateArchitecture(fn(JSON.parse(JSON.stringify(architecture))));
  };

  const renameSystem = (idx: number, name: string) => updateArch(a => { a[idx].name = name; return a; });
  const deleteSystem = (idx: number) => updateArch(a => { a.splice(idx, 1); return a; });
  const addSystem = (name: string) => updateArch(a => [...a, { name, subsystems: [] }]);

  const renameSubsystem = (sysIdx: number, subIdx: number, name: string) =>
    updateArch(a => { a[sysIdx].subsystems![subIdx].name = name; return a; });
  const deleteSubsystem = (sysIdx: number, subIdx: number) =>
    updateArch(a => { a[sysIdx].subsystems!.splice(subIdx, 1); return a; });
  const addSubsystem = (sysIdx: number, name: string) =>
    updateArch(a => {
      if (!a[sysIdx].subsystems) a[sysIdx].subsystems = [];
      a[sysIdx].subsystems!.push({ name, components: [] });
      return a;
    });

  const renameComponent = (sysIdx: number, subIdx: number, compIdx: number, name: string) =>
    updateArch(a => { a[sysIdx].subsystems![subIdx].components![compIdx].name = name; return a; });
  const deleteComponent = (sysIdx: number, subIdx: number, compIdx: number) =>
    updateArch(a => { a[sysIdx].subsystems![subIdx].components!.splice(compIdx, 1); return a; });
  const addComponent = (sysIdx: number, subIdx: number, name: string) =>
    updateArch(a => {
      if (!a[sysIdx].subsystems![subIdx].components) a[sysIdx].subsystems![subIdx].components = [];
      a[sysIdx].subsystems![subIdx].components!.push({ name });
      return a;
    });

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            System Architecture
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Define the system → subsystem → component hierarchy.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-lg hover:from-violet-700 hover:to-blue-700 transition-all disabled:opacity-50 text-sm font-semibold shadow-sm"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isGenerating ? 'Generating...' : architecture.length > 0 ? 'Regenerate' : 'Generate with AI'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {isGenerating && (
        <div className="py-4">
          <AILoadingIndicator inline />
        </div>
      )}

      {/* Tree View */}
      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[480px] overflow-y-auto bg-white">
        {architecture.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Layers className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">No architecture defined yet</p>
            <p className="text-xs mt-1">Generate with AI or add systems manually below.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {architecture.map((sys, sysIdx) => {
              const sysExpanded = expandedSystems.has(sysIdx);
              return (
                <div key={sysIdx}>
                  {/* System row */}
                  <div className="group/row flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                    onClick={() => toggleSystem(sysIdx)}>
                    {sysExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRightIcon className="w-4 h-4 text-slate-400" />}
                    <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <InlineEdit value={sys.name} onSave={(n) => renameSystem(sysIdx, n)} className="text-sm font-bold text-slate-800 flex-1" />
                    <span className="text-[10px] font-medium text-slate-400 mr-2">{sys.subsystems?.length || 0} subsystems</span>
                    <RowActions
                      onRename={() => { /* InlineEdit handles this via double-click */ }}
                      onDelete={() => deleteSystem(sysIdx)}
                    />
                  </div>
                  {/* Subsystems */}
                  {sysExpanded && (
                    <div className="pl-8 py-1">
                      {(sys.subsystems || []).map((sub, subIdx) => {
                        const subKey = `${sysIdx}-${subIdx}`;
                        const subExpanded = expandedSubsystems.has(subKey);
                        return (
                          <div key={subIdx}>
                            <div className="group/row flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                              onClick={() => toggleSubsystem(subKey)}>
                              {subExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />}
                              <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                <Cpu className="w-3 h-3" />
                              </div>
                              <InlineEdit value={sub.name} onSave={(n) => renameSubsystem(sysIdx, subIdx, n)} className="text-sm font-semibold text-slate-700 flex-1" />
                              <span className="text-[10px] font-medium text-slate-400 mr-2">{sub.components?.length || 0} components</span>
                              <RowActions
                                onRename={() => {}}
                                onDelete={() => deleteSubsystem(sysIdx, subIdx)}
                              />
                            </div>
                            {/* Components */}
                            {subExpanded && (
                              <div className="pl-10 py-1 space-y-0.5">
                                {(sub.components || []).map((comp, compIdx) => (
                                  <div key={compIdx} className="group/row flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50/60 rounded-lg transition-colors">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                    <CircuitBoard className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    <InlineEdit value={comp.name} onSave={(n) => renameComponent(sysIdx, subIdx, compIdx, n)} className="text-sm text-slate-600 flex-1" />
                                    <RowActions
                                      onRename={() => {}}
                                      onDelete={() => deleteComponent(sysIdx, subIdx, compIdx)}
                                    />
                                  </div>
                                ))}
                                <AddItemInline placeholder="Add component" onAdd={(n) => addComponent(sysIdx, subIdx, n)} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <AddItemInline placeholder="Add subsystem" onAdd={(n) => addSubsystem(sysIdx, n)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add system at the bottom */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
          <AddItemInline placeholder="Add system" onAdd={addSystem} />
        </div>
      </div>

      {/* Summary bar */}
      {architecture.length > 0 && (
        <div className="flex items-center gap-4 text-xs font-medium text-slate-500 bg-slate-50 rounded-lg px-4 py-2.5">
          <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-blue-500" /> {totalSystems} System{totalSystems !== 1 ? 's' : ''}</span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-indigo-500" /> {totalSubsystems} Subsystem{totalSubsystems !== 1 ? 's' : ''}</span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1"><CircuitBoard className="w-3.5 h-3.5 text-slate-400" /> {totalComponents} Component{totalComponents !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-slate-100">
        <div className="flex gap-3">
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {architecture.length > 0 && (
            <button type="button" onClick={onFinish}
              className="px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium transition-colors text-sm">
              Finish with Architecture Only
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={totalComponents === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed font-semibold shadow-sm"
        >
          Next: Identify Functions
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
