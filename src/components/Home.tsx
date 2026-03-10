import React, { useEffect, useRef, useState } from 'react';
import { FilePlus, Upload, FolderOpen, Zap, ShieldCheck, Activity, Target, Clock3 } from 'lucide-react';
import { selectHomeSummary, useFmedaStore } from '../store/fmedaStore';
import { importProjectFile } from '../utils/export';
import { useConfirm } from '../hooks/useConfirm';
import { getWizardDraftSummary, type WizardDraftSummary } from '../utils/wizardDraft';

interface HomeProps {
  onNewProject: () => void;
  onImportSuccess: () => void;
}

const formatSavedAt = (timestamp: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
};

export const Home: React.FC<HomeProps> = ({ onNewProject, onImportSuccess }) => {
  const { hasProject, componentCount, functionCount, failureModeCount, projectContext } = useFmedaStore(selectHomeSummary);
  const setNodes = useFmedaStore((state) => state.setNodes);
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardDraftSummary | null>(() => getWizardDraftSummary());

  useEffect(() => {
    const syncDraft = () => {
      setWizardDraft(getWizardDraftSummary());
    };

    window.addEventListener('storage', syncDraft);
    window.addEventListener('focus', syncDraft);

    return () => {
      window.removeEventListener('storage', syncDraft);
      window.removeEventListener('focus', syncDraft);
    };
  }, []);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const result = await importProjectFile(file);
        setNodes(result.nodes);
        useFmedaStore.getState().setProjectContext(result.projectContext);
        useFmedaStore.getState().setSelectedId(null);
        onImportSuccess();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'An unexpected error occurred during import.';
        await confirm({
          title: 'Import Failed',
          description: message,
          type: 'alert',
          variant: 'destructive',
        });
      } finally {
        e.target.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-5xl mx-auto py-12">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">
          FMEDA Workspace
        </h2>
        <p className="text-slate-500 mt-2">Functional Safety Analysis</p>
      </div>

      {hasProject && (
        <div className="w-full mb-10 text-left">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-2">Resume Session</h3>
          <div className="bg-white border-2 border-blue-100 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-blue-300">
            <div className="bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-gray-100 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <FolderOpen className="w-5 h-5 mr-3 text-blue-600" />
                {projectContext?.projectName || 'Current Active Project'}
              </h3>
              <span className="text-xs font-bold bg-white text-blue-700 px-3 py-1 rounded-full border border-blue-200 shadow-sm">Local Storage Saved</span>
            </div>

            <div className="p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                <div className="flex gap-10 mb-6 md:mb-0">
                  <div className="flex flex-col">
                    <span className="text-4xl font-extrabold text-slate-800">{componentCount}</span>
                    <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">Components</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-4xl font-extrabold text-slate-800">{functionCount}</span>
                    <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">Functions</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-4xl font-extrabold text-slate-800">{failureModeCount}</span>
                    <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">Failure Modes</span>
                  </div>
                </div>

                <button
                  onClick={onImportSuccess}
                  className="w-full md:w-auto px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors flex items-center justify-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  Continue Analysis
                  <Zap className="w-5 h-5 ml-2" />
                </button>
              </div>

              {(projectContext?.safetyStandard || projectContext?.targetAsil || projectContext?.safetyGoal) && (
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-5 border-t border-slate-100">
                  {projectContext.safetyStandard && (
                    <div className="flex items-center text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 mr-2" />
                      <span className="text-sm font-medium">Standard:</span>
                      <span className="text-sm font-bold text-slate-800 ml-1.5">{projectContext.safetyStandard}</span>
                    </div>
                  )}
                  {projectContext.targetAsil && (
                    <div className="flex items-center text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      <Activity className="w-4 h-4 text-blue-500 mr-2" />
                      <span className="text-sm font-medium">Target ASIL:</span>
                      <span className="text-sm font-bold text-slate-800 ml-1.5">{projectContext.targetAsil}</span>
                    </div>
                  )}
                  {projectContext.safetyGoal && (
                    <div className="flex items-start text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-full md:w-auto md:flex-1">
                      <Target className="w-4 h-4 text-purple-500 mr-2 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-sm font-medium">Safety Goal:</span>
                        <span className="text-sm font-bold text-slate-800 ml-1.5 line-clamp-2" title={projectContext.safetyGoal}>{projectContext.safetyGoal}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {wizardDraft && (
        <div className="w-full mb-10 text-left">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-2">Resume Wizard Draft</h3>
          <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-amber-300">
            <div className="bg-gradient-to-r from-amber-50 to-white border-b border-amber-100 px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <Clock3 className="w-5 h-5 mr-3 text-amber-600" />
                  {wizardDraft.projectName}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Step {wizardDraft.currentStep} of 4, last saved {formatSavedAt(wizardDraft.lastSavedAt)}.
                </p>
              </div>
              <button
                onClick={onNewProject}
                className="w-full md:w-auto px-6 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors flex items-center justify-center shadow-sm"
              >
                Resume Draft
                <Zap className="w-5 h-5 ml-2" />
              </button>
            </div>
            <div className="px-6 py-4 text-sm text-slate-600">
              Local autosave is active for the project wizard. You can resume this draft, or choose <strong>Start Fresh</strong> after opening it.
            </div>
          </div>
        </div>
      )}

      <div className="w-full text-left mb-3 ml-2 mt-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">New Analysis</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <button
          onClick={onNewProject}
          className="flex flex-col text-left p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-blue-400 transition-all group"
        >
          <div className="flex items-center mb-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform mr-4 border border-blue-100">
              <FilePlus size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Create New Project</h3>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">
            Start a new FMEDA project using the setup wizard. You can begin from scratch or use AI to parse preliminary requirements.
          </p>
        </button>

        <button
          onClick={handleImportClick}
          className="flex flex-col text-left p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-400 transition-all group"
        >
          <div className="flex items-center mb-3">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform mr-4 border border-emerald-100">
              <Upload size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Import Existing Project</h3>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">
            Load an existing FMEDA from a JSON, CSV, or Excel file to continue your analysis.
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,.csv,.xlsx"
            className="hidden"
          />
        </button>
      </div>
    </div>
  );
};
