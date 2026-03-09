import React, { useState, useCallback, useRef } from 'react';
import {
  Settings, ChevronLeft, ChevronRight, Sparkles,
  Plus, Trash2, Check, X, Cpu, CircuitBoard, Layers,
  Square,
} from 'lucide-react';
import { FmedaSystemDeep, FmedaFunctionDeep } from '@/types/ai';
import type { ProjectContext } from '@/types/fmeda';
import { useAIStore } from '@/store/aiStore';
import { generateFunctionsForComponent } from '@/services/aiService';
import { cn } from '@/lib/utils';
import { AILoadingIndicator } from '../ui/AILoadingIndicator';

interface StepFunctionsProps {
  architecture: FmedaSystemDeep[];
  projectContext: ProjectContext;
  onUpdateArchitecture: (arch: FmedaSystemDeep[]) => void;
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
}

// Flatten architecture into a list of component refs for processing
interface ComponentRef {
  sysIdx: number;
  subIdx: number;
  compIdx: number;
  systemName: string;
  subsystemName: string;
  componentName: string;
  functions: FmedaFunctionDeep[];
}

function flattenComponents(arch: FmedaSystemDeep[]): ComponentRef[] {
  const refs: ComponentRef[] = [];
  arch.forEach((sys, sysIdx) => {
    (sys.subsystems || []).forEach((sub, subIdx) => {
      (sub.components || []).forEach((comp, compIdx) => {
        refs.push({
          sysIdx, subIdx, compIdx,
          systemName: sys.name,
          subsystemName: sub.name,
          componentName: comp.name,
          functions: comp.functions || [],
        });
      });
    });
  });
  return refs;
}

// ─── Inline Edit ────────────────────────────────────────────────────────────

const InlineEdit: React.FC<{
  value: string;
  onSave: (val: string) => void;
  className?: string;
}> = ({ value, onSave, className }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span className={cn("cursor-pointer hover:underline decoration-dotted underline-offset-4", className)}
        onDoubleClick={() => { setDraft(value); setEditing(true); }}>
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

// ─── Add Function Inline ────────────────────────────────────────────────────

const AddFunctionInline: React.FC<{ onAdd: (name: string) => void }> = ({ onAdd }) => {
  const [active, setActive] = useState(false);
  const [name, setName] = useState('');

  if (!active) {
    return (
      <button type="button" onClick={() => setActive(true)}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Add function
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2">
      <input
        className="px-2 py-1 text-xs border border-blue-400 rounded focus:ring-2 focus:ring-blue-300 focus:outline-none flex-1"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Enter function name..."
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) { onAdd(name.trim()); setName(''); setActive(false); }
          if (e.key === 'Escape') { setName(''); setActive(false); }
        }}
        autoFocus
      />
      <button type="button" onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); setActive(false); } }}
        className="p-0.5 text-emerald-600"><Check className="w-3 h-3" /></button>
      <button type="button" onClick={() => { setName(''); setActive(false); }}
        className="p-0.5 text-slate-400"><X className="w-3 h-3" /></button>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const StepFunctions: React.FC<StepFunctionsProps> = ({
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
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const cancelRef = useRef(false);

  const components = flattenComponents(architecture);
  const totalFunctions = components.reduce((sum, c) => sum + c.functions.length, 0);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const updateComponent = (sysIdx: number, subIdx: number, compIdx: number, fns: FmedaFunctionDeep[]) => {
    const updated = JSON.parse(JSON.stringify(architecture)) as FmedaSystemDeep[];
    updated[sysIdx].subsystems![subIdx].components![compIdx].functions = fns;
    onUpdateArchitecture(updated);
  };

  const addFunction = (ref: ComponentRef, name: string) => {
    const fns = [...ref.functions, { name }];
    updateComponent(ref.sysIdx, ref.subIdx, ref.compIdx, fns);
  };

  const renameFunction = (ref: ComponentRef, funcIdx: number, name: string) => {
    const fns = [...ref.functions];
    fns[funcIdx] = { ...fns[funcIdx], name };
    updateComponent(ref.sysIdx, ref.subIdx, ref.compIdx, fns);
  };

  const deleteFunction = (ref: ComponentRef, funcIdx: number) => {
    const fns = ref.functions.filter((_, i) => i !== funcIdx);
    updateComponent(ref.sysIdx, ref.subIdx, ref.compIdx, fns);
  };

  // ─── Single Component Generation ──────────────────────────────────────

  const generateForOne = async (ref: ComponentRef) => {
    if (!config.apiKey) {
      setError('Please configure your AI API Key in settings first.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    setProgress({ current: 0, total: 1, label: ref.componentName });
    try {
      const existingNames = ref.functions.map(f => f.name).filter(Boolean);
      const functions = await generateFunctionsForComponent(
        config, projectContext, ref.systemName, ref.subsystemName, ref.componentName, existingNames
      );
      const updated = JSON.parse(JSON.stringify(architecture)) as FmedaSystemDeep[];
      const currentFns = updated[ref.sysIdx].subsystems![ref.subIdx].components![ref.compIdx].functions || [];
      updated[ref.sysIdx].subsystems![ref.subIdx].components![ref.compIdx].functions = [...currentFns, ...functions];
      onUpdateArchitecture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate functions');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  // ─── Generate All ─────────────────────────────────────────────────────

  const handleGenerateAll = useCallback(async () => {
    if (!config.apiKey) {
      setError('Please configure your AI API Key in settings first.');
      return;
    }
    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);

    const updated = JSON.parse(JSON.stringify(architecture)) as FmedaSystemDeep[];
    const refs = flattenComponents(updated);
    const toGenerate = refs.filter(r => r.functions.length === 0);

    for (let i = 0; i < toGenerate.length; i++) {
      if (cancelRef.current) break;

      const ref = toGenerate[i];
      setProgress({ current: i + 1, total: toGenerate.length, label: ref.componentName });

      try {
        const existingNames = ref.functions.map(f => f.name).filter(Boolean);
        const functions = await generateFunctionsForComponent(
          config, projectContext, ref.systemName, ref.subsystemName, ref.componentName, existingNames
        );
        const currentFns = updated[ref.sysIdx].subsystems![ref.subIdx].components![ref.compIdx].functions || [];
        updated[ref.sysIdx].subsystems![ref.subIdx].components![ref.compIdx].functions = [...currentFns, ...functions];
        onUpdateArchitecture(JSON.parse(JSON.stringify(updated)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        console.error(`Failed for ${ref.componentName}:`, msg);
      }
    }

    setIsGenerating(false);
    setProgress(null);
  }, [architecture, config, projectContext, onUpdateArchitecture]);

  const handleStop = () => { cancelRef.current = true; };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            Component Functions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Identify key functions for each component.</p>
        </div>
        <div className="flex items-center gap-3">
          {!isGenerating ? (
            <button type="button" onClick={handleGenerateAll} disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-lg hover:from-violet-700 hover:to-blue-700 transition-all disabled:opacity-50 text-sm font-semibold shadow-sm">
              <Sparkles className="w-4 h-4" />
              Generate All
            </button>
          ) : (
            <button type="button" onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold shadow-sm">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <AILoadingIndicator progress={progress} inline />
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Component list */}
      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
        {components.map((ref, idx) => {
          // Refresh ref from current architecture
          const currentComp = architecture[ref.sysIdx]?.subsystems?.[ref.subIdx]?.components?.[ref.compIdx];
          const currentFunctions = currentComp?.functions || [];
          const updatedRef = { ...ref, functions: currentFunctions };
          const hasFunctions = currentFunctions.length > 0;

          return (
            <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Component header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-400 font-medium">{ref.systemName}</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-400 font-medium">{ref.subsystemName}</span>
                <ChevronRight className="w-3 h-3 text-slate-300" />
                <CircuitBoard className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-sm font-semibold text-slate-700">{ref.componentName}</span>

                <div className="flex-1" />

                {hasFunctions && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {currentFunctions.length} function{currentFunctions.length > 1 ? 's' : ''}
                  </span>
                )}

                {!isGenerating && (
                  <button type="button" onClick={() => generateForOne(updatedRef)}
                    className="flex items-center gap-1 text-[11px] text-violet-600 hover:bg-violet-50 px-2 py-1 rounded font-medium transition-colors"
                    title="Generate functions for this component">
                    <Sparkles className="w-3 h-3" />
                    {hasFunctions ? 'Regen' : 'Generate'}
                  </button>
                )}
              </div>

              {/* Functions list */}
              <div className="p-3 space-y-1">
                {currentFunctions.length === 0 ? (
                  <div className="flex items-center justify-center py-4 text-xs text-slate-400">
                    <Settings className="w-4 h-4 mr-2 opacity-40" />
                    No functions yet — generate or add manually
                  </div>
                ) : (
                  currentFunctions.map((func, funcIdx) => (
                    <div key={funcIdx} className="group/row flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50/60 rounded-lg transition-colors">
                      <Settings className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <InlineEdit
                        value={func.name}
                        onSave={(n) => renameFunction(updatedRef, funcIdx, n)}
                        className="text-sm text-slate-700 flex-1"
                      />
                      <button type="button" onClick={() => deleteFunction(updatedRef, funcIdx)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover/row:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
                <AddFunctionInline onAdd={(n) => addFunction(updatedRef, n)} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {totalFunctions > 0 && (
        <div className="flex items-center gap-4 text-xs font-medium text-slate-500 bg-slate-50 rounded-lg px-4 py-2.5">
          <span>{components.length} component{components.length !== 1 ? 's' : ''}</span>
          <span className="text-slate-300">•</span>
          <span className="text-emerald-600 font-semibold">{totalFunctions} function{totalFunctions !== 1 ? 's' : ''} total</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-slate-100">
        <div className="flex gap-3">
          <button type="button" onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {totalFunctions > 0 && (
            <button type="button" onClick={onFinish}
              className="px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium transition-colors text-sm">
              Finish with Functions
            </button>
          )}
        </div>
        <button type="button" onClick={onNext} disabled={totalFunctions === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed font-semibold shadow-sm">
          Next: Failure Modes
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
