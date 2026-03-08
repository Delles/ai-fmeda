import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock, AlertCircle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FmedaSystemDeep, WizardState, WizardStepNumber } from '../types/ai';
import { WizardStepIndicator } from './wizard/WizardStepIndicator';
import { StepProjectSetup } from './wizard/StepProjectSetup';
import { StepArchitecture } from './wizard/StepArchitecture';
import { StepFunctions } from './wizard/StepFunctions';
import { StepFailureModes } from './wizard/StepFailureModes';
import {
  clearWizardDraft,
  getWizardDraftSnapshot,
  hasWizardDraftContent,
  loadWizardDraft,
  saveWizardDraft,
} from '../utils/wizardDraft';

const INITIAL_STATE: WizardState = {
  projectName: '',
  safetyStandard: '',
  targetAsil: '',
  safetyGoal: '',
  documentText: '',
  architecture: [],
  currentStep: 1,
  lastSavedAt: null,
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface CreateProjectWizardProps {
  onComplete: (architecture: FmedaSystemDeep[], context: WizardState) => void;
  onCancel: () => void;
}

const getInitialWizardState = (): WizardState => {
  return loadWizardDraft() ?? INITIAL_STATE;
};

const shouldShowResumeDialog = (): boolean => {
  const draft = loadWizardDraft();
  return Boolean(draft && hasWizardDraftContent(draft));
};

const formatSavedAt = (timestamp: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
};

export const CreateProjectWizard: React.FC<CreateProjectWizardProps> = ({ onComplete, onCancel }) => {
  const [state, setState] = useState<WizardState>(getInitialWizardState);
  const [showResumeDialog, setShowResumeDialog] = useState(shouldShowResumeDialog);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(() => (state.lastSavedAt ? 'saved' : 'idle'));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionLabel: 'Confirm',
    onConfirm: () => {},
  });

  const latestStateRef = useRef(state);
  const lastSavedSnapshotRef = useRef<string | null>(state.lastSavedAt ? getWizardDraftSnapshot(state) : null);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const persistDraft = useCallback((stateToSave: WizardState) => {
    if (!hasWizardDraftContent(stateToSave)) {
      clearWizardDraft();
      lastSavedSnapshotRef.current = null;
      setSaveStatus('idle');
      setSaveError(null);
      return true;
    }

    try {
      const savedAt = saveWizardDraft(stateToSave);
      const snapshot = getWizardDraftSnapshot(stateToSave);

      lastSavedSnapshotRef.current = snapshot;
      if (getWizardDraftSnapshot(latestStateRef.current) === snapshot) {
        latestStateRef.current = { ...latestStateRef.current, lastSavedAt: savedAt };
      }
      setSaveStatus('saved');
      setSaveError(null);
      setState((prev) => {
        if (getWizardDraftSnapshot(prev) !== snapshot || prev.lastSavedAt === savedAt) {
          return prev;
        }

        return { ...prev, lastSavedAt: savedAt };
      });
      return true;
    } catch (error) {
      setSaveStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Failed to save your draft locally.');
      return false;
    }
  }, []);

  const flushPendingSave = useCallback(() => {
    const currentState = latestStateRef.current;
    if (!hasWizardDraftContent(currentState)) {
      clearWizardDraft();
      lastSavedSnapshotRef.current = null;
      return true;
    }

    const snapshot = getWizardDraftSnapshot(currentState);
    if (snapshot === lastSavedSnapshotRef.current) {
      return true;
    }

    setSaveStatus('saving');
    return persistDraft(currentState);
  }, [persistDraft]);

  useEffect(() => {
    if (!hasWizardDraftContent(state)) {
      clearWizardDraft();
      lastSavedSnapshotRef.current = null;
      setSaveStatus('idle');
      setSaveError(null);

      if (state.lastSavedAt !== null) {
        setState((prev) => (prev.lastSavedAt === null ? prev : { ...prev, lastSavedAt: null }));
      }

      return;
    }

    const snapshot = getWizardDraftSnapshot(state);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setSaveStatus('saving');
    const timeoutId = window.setTimeout(() => {
      persistDraft(latestStateRef.current);
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [state, persistDraft]);

  useEffect(() => {
    const handlePageHide = () => {
      flushPendingSave();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };

    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushPendingSave]);

  const goToStep = (step: WizardStepNumber) => {
    const nextState = { ...latestStateRef.current, currentStep: step };
    latestStateRef.current = nextState;
    setState(nextState);
    setSaveStatus('saving');
    persistDraft(nextState);
  };

  const updateState = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const projectContext = {
    projectName: state.projectName,
    safetyStandard: state.safetyStandard,
    targetAsil: state.targetAsil,
    safetyGoal: state.safetyGoal,
    documentText: state.documentText,
  };

  const resetDraftState = () => {
    clearWizardDraft();
    lastSavedSnapshotRef.current = null;
    latestStateRef.current = INITIAL_STATE;
    setSaveStatus('idle');
    setSaveError(null);
  };

  const handleFinish = (confirmMessage?: string) => {
    const doFinish = () => {
      resetDraftState();
      onComplete(state.architecture, state);
    };

    if (confirmMessage) {
      setConfirmDialog({
        isOpen: true,
        title: 'Create Project?',
        description: confirmMessage,
        actionLabel: 'Create Project',
        onConfirm: doFinish,
      });
    } else {
      doFinish();
    }
  };

  const handleCancel = () => {
    if (hasWizardDraftContent(state)) {
      flushPendingSave();
    } else {
      resetDraftState();
    }

    onCancel();
  };

  const handleResumeYes = () => {
    setShowResumeDialog(false);
  };

  const handleResumeNo = () => {
    setShowResumeDialog(false);
    resetDraftState();
    setState(INITIAL_STATE);
  };

  const stepTitles: Record<WizardStepNumber, string> = {
    1: 'Project Setup',
    2: 'System Architecture',
    3: 'Component Functions',
    4: 'Failure Modes',
  };

  const saveStatusContent = (() => {
    if (saveStatus === 'saving') {
      return {
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        label: 'Saving locally...',
        className: 'text-[10px] text-slate-400',
        title: 'Saving your draft to local storage.',
      };
    }

    if (saveStatus === 'error') {
      return {
        icon: <AlertCircle className="w-3 h-3" />,
        label: 'Local save failed',
        className: 'text-[10px] text-red-500',
        title: saveError || 'Unable to save your draft locally.',
      };
    }

    if (state.lastSavedAt) {
      return {
        icon: <Clock className="w-3 h-3" />,
        label: `Saved locally ${formatSavedAt(state.lastSavedAt)}`,
        className: 'text-[10px] text-slate-400',
        title: `Last saved ${formatSavedAt(state.lastSavedAt)}`,
      };
    }

    return null;
  })();

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Create New FMEDA Project
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Step {state.currentStep} of 4 - {stepTitles[state.currentStep]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatusContent && (
            <span
              className={`flex items-center gap-1 ${saveStatusContent.className}`}
              title={saveStatusContent.title}
            >
              {saveStatusContent.icon}
              {saveStatusContent.label}
            </span>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            title="Close wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-8 pt-6">
        <WizardStepIndicator currentStep={state.currentStep} />
      </div>

      <div className="px-8 pb-8">
        {state.currentStep === 1 && (
          <StepProjectSetup
            projectName={state.projectName}
            safetyStandard={state.safetyStandard}
            targetAsil={state.targetAsil}
            safetyGoal={state.safetyGoal}
            documentText={state.documentText}
            onUpdate={(updates) => updateState(updates)}
            onNext={() => goToStep(2)}
          />
        )}

        {state.currentStep === 2 && (
          <StepArchitecture
            architecture={state.architecture}
            projectContext={projectContext}
            onUpdateArchitecture={(arch) => updateState({ architecture: arch })}
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
            onFinish={() => handleFinish('This will create the project with only the architecture (Systems, Subsystems, Components). Functions and failure modes can be added later in the Analysis table.')}
          />
        )}

        {state.currentStep === 3 && (
          <StepFunctions
            architecture={state.architecture}
            projectContext={projectContext}
            onUpdateArchitecture={(arch) => updateState({ architecture: arch })}
            onNext={() => goToStep(4)}
            onBack={() => goToStep(2)}
            onFinish={() => handleFinish('This will create the project with architecture and functions. Failure modes can be added later using inline AI suggestions in the Analysis table.')}
          />
        )}

        {state.currentStep === 4 && (
          <StepFailureModes
            architecture={state.architecture}
            projectContext={projectContext}
            onUpdateArchitecture={(arch) => updateState({ architecture: arch })}
            onFinish={() => handleFinish()}
            onBack={() => goToStep(3)}
          />
        )}
      </div>

      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Previous Wizard?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                You have a saved local draft for <strong>{state.projectName || 'Untitled project'}</strong>.
              </span>
              <span className="mt-2 block text-sm text-slate-500">
                Step {state.currentStep} of 4{state.lastSavedAt ? `, last saved ${formatSavedAt(state.lastSavedAt)}` : ''}.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleResumeNo}>Start Fresh</AlertDialogCancel>
            <AlertDialogAction onClick={handleResumeYes}>Resume Draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDialog.onConfirm}>
              {confirmDialog.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

