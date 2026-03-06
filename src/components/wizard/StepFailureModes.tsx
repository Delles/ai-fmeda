import React, { useState, useRef } from 'react';
import {
  AlertTriangle, ChevronLeft, Check, Sparkles,
  CircuitBoard, Settings, Square, Rocket,
  Shield,
} from 'lucide-react';
import { FmedaSystemDeep, FmedaFunctionDeep, ProjectContext } from '@/types/ai';
import { useAIStore } from '@/store/aiStore';
import { generateFailureModesForFunction } from '@/services/aiService';
import { cn } from '@/lib/utils';
import { AILoadingIndicator } from '../ui/AILoadingIndicator';

interface StepFailureModesProps {
  architecture: FmedaSystemDeep[];
  projectContext: ProjectContext;
  onUpdateArchitecture: (arch: FmedaSystemDeep[]) => void;
  onFinish: () => void;
  onBack: () => void;
}

type ApproachMode = 'skip' | 'selective' | 'full';

// Flatten architecture for component picker
interface ComponentRef {
  sysIdx: number;
  subIdx: number;
  compIdx: number;
  systemName: string;
  subsystemName: string;
  componentName: string;
  functions: FmedaFunctionDeep[];
  totalFM: number;
}

function flattenForPicker(arch: FmedaSystemDeep[]): ComponentRef[] {
  const refs: ComponentRef[] = [];
  arch.forEach((sys, sysIdx) => {
    (sys.subsystems || []).forEach((sub, subIdx) => {
      (sub.components || []).forEach((comp, compIdx) => {
        const fns = comp.functions || [];
        const totalFM = fns.reduce((sum, f) => sum + (f.failureModes?.length || 0), 0);
        refs.push({
          sysIdx, subIdx, compIdx,
          systemName: sys.name,
          subsystemName: sub.name,
          componentName: comp.name,
          functions: fns,
          totalFM,
        });
      });
    });
  });
  return refs;
}

export const StepFailureModes: React.FC<StepFailureModesProps> = ({
  architecture,
  projectContext,
  onUpdateArchitecture,
  onFinish,
  onBack,
}) => {
  const { config } = useAIStore();
  const [mode, setMode] = useState<ApproachMode>('skip');
  const [selectedComponent, setSelectedComponent] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const cancelRef = useRef(false);

  const components = flattenForPicker(architecture);
  const totalFunctions = components.reduce((sum, c) => sum + c.functions.length, 0);

  // ─── Selective Generation for One Component ───────────────────────────

  const handleGenerateForSelected = async () => {
    if (selectedComponent === null || !config.apiKey) {
      setError(!config.apiKey ? 'Please configure your AI API Key in settings first.' : 'Please select a component.');
      return;
    }

    const ref = components[selectedComponent];
    if (ref.functions.length === 0) {
      setError('This component has no functions. Go back and add functions first.');
      return;
    }

    cancelRef.current = false;
    setIsGenerating(true);
    setError(null);

    const updated = JSON.parse(JSON.stringify(architecture)) as FmedaSystemDeep[];

    for (let i = 0; i < ref.functions.length; i++) {
      if (cancelRef.current) break;

      const func = ref.functions[i];
      setProgress({ current: i + 1, total: ref.functions.length, label: func.name });

      try {
        const existingNames = func.failureModes?.map(fm => fm.name).filter(Boolean) || [];
        const newFailureModes = await generateFailureModesForFunction(
          config, projectContext,
          ref.systemName, ref.subsystemName, ref.componentName, func.name, existingNames
        );

        const comp = updated[ref.sysIdx].subsystems![ref.subIdx].components![ref.compIdx];
        if (!comp.functions) comp.functions = [];
        comp.functions[i] = {
          ...comp.functions[i],
          failureModes: [...(comp.functions[i].failureModes || []), ...newFailureModes]
        };
        onUpdateArchitecture(JSON.parse(JSON.stringify(updated)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        console.error(`Failed for function ${func.name}:`, msg);
      }
    }

    setIsGenerating(false);
    setProgress(null);
  };

  const handleStop = () => { cancelRef.current = true; };

  // Calculate if selected component has already generated FMs
  const selectedRef = selectedComponent !== null ? components[selectedComponent] : null;
  const selectedHasFM = selectedRef ? selectedRef.totalFM > 0 : false;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Failure Modes
            <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Optional</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Generate failure modes now or add them later during analysis.</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Approach Selection */}
      <div className="space-y-3">
        {/* Option: Skip */}
        <button
          type="button"
          onClick={() => setMode('skip')}
          className={cn(
            "w-full text-left p-4 rounded-xl border-2 transition-all",
            mode === 'skip'
              ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-200"
              : "border-slate-200 hover:border-slate-300 bg-white"
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mt-0.5",
              mode === 'skip' ? "bg-emerald-100" : "bg-slate-100"
            )}>
              <Rocket className={cn("w-4 h-4", mode === 'skip' ? "text-emerald-600" : "text-slate-400")} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">Skip & Use Inline AI Later</span>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Recommended</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Add failure modes manually in the Analysis table and use cell-level AI suggestions as you go.
                Best for large projects or when you want full control.
              </p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
              mode === 'skip' ? "border-emerald-500" : "border-slate-300"
            )}>
              {mode === 'skip' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
            </div>
          </div>
        </button>

        {/* Option: Selective */}
        <button
          type="button"
          onClick={() => setMode('selective')}
          className={cn(
            "w-full text-left p-4 rounded-xl border-2 transition-all",
            mode === 'selective'
              ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-200"
              : "border-slate-200 hover:border-slate-300 bg-white"
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mt-0.5",
              mode === 'selective' ? "bg-blue-100" : "bg-slate-100"
            )}>
              <Shield className={cn("w-4 h-4", mode === 'selective' ? "text-blue-600" : "text-slate-400")} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">Selective Generation</span>
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Demo</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Pick one component to generate failure modes for. Great for testing the AI output quality
                before committing to a full project analysis.
              </p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
              mode === 'selective' ? "border-blue-500" : "border-slate-300"
            )}>
              {mode === 'selective' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
            </div>
          </div>
        </button>

        {/* Option: Full — disabled for demo */}
        <div className={cn(
          "w-full text-left p-4 rounded-xl border-2 border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
        )}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mt-0.5">
              <Sparkles className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">AI-Generate All Failure Modes</span>
                <span className="text-[10px] font-semibold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">Coming Soon</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Estimated: ~{totalFunctions} API calls for {totalFunctions} function{totalFunctions !== 1 ? 's' : ''}.
                Available in the full version — requires higher API limits.
              </p>
            </div>
            <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
          </div>
        </div>
      </div>

      {/* Selective: Component Picker */}
      {mode === 'selective' && (
        <div className="space-y-3">
          <label className="text-sm font-semibold text-slate-700">Select a component to generate failure modes for:</label>
          <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
            {components.map((ref, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedComponent(idx)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all text-left",
                  selectedComponent === idx
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                )}
              >
                <CircuitBoard className={cn("w-4 h-4", selectedComponent === idx ? "text-blue-500" : "text-slate-400")} />
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-700">{ref.componentName}</span>
                  <span className="text-[10px] text-slate-400 ml-2">
                    {ref.subsystemName} · {ref.functions.length} function{ref.functions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {ref.totalFM > 0 && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {ref.totalFM} FM
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Generate button */}
          {selectedComponent !== null && !isGenerating && (
            <button type="button" onClick={handleGenerateForSelected}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-lg hover:from-violet-700 hover:to-blue-700 transition-all text-sm font-semibold shadow-sm">
              <Sparkles className="w-4 h-4" />
              {selectedHasFM ? 'Regenerate' : 'Generate'} Failure Modes for {selectedRef?.componentName}
            </button>
          )}

          {isGenerating && (
            <div className="space-y-3">
              <AILoadingIndicator progress={progress} inline />
              <button type="button" onClick={handleStop}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs font-semibold transition-colors">
                <Square className="w-3 h-3" /> Stop & Keep Progress
              </button>
            </div>
          )}

          {/* Preview generated FM */}
          {selectedRef && selectedRef.totalFM > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-600">
                Generated Failure Modes for {selectedRef.componentName}
              </div>
              <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
                {selectedRef.functions.map((func, fIdx) => (
                  <div key={fIdx}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                      <Settings className="w-3 h-3 text-slate-400" />
                      {func.name}
                    </div>
                    <div className="ml-5 space-y-1">
                      {(func.failureModes || []).map((fm, fmIdx) => (
                        <div key={fmIdx} className="flex items-start gap-2 p-2 bg-amber-50/50 border border-amber-100 rounded-lg">
                          <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <span className="text-xs font-medium text-slate-700">{fm.name}</span>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500">
                              <span>Effect: {fm.localEffect}</span>
                              <span>DC: {((fm.diagnosticCoverage || 0) * 100).toFixed(0)}%</span>
                              <span>FIT: {fm.fitRate}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {(!func.failureModes || func.failureModes.length === 0) && (
                        <span className="text-[10px] text-slate-400 italic">No FM yet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-slate-100">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={onFinish} disabled={isGenerating}
          className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all font-bold shadow-sm disabled:opacity-50">
          <Check className="w-5 h-5" />
          Create Project
        </button>
      </div>
    </div>
  );
};
