import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock } from 'lucide-react';
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

const WIZARD_STORAGE_KEY = 'fmeda-wizard-progress';

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

interface CreateProjectWizardProps {
  onComplete: (architecture: FmedaSystemDeep[]) => void;
  onCancel: () => void;
}

export const CreateProjectWizard: React.FC<CreateProjectWizardProps> = ({ onComplete, onCancel }) => {
  // ─── State ──────────────────────────────────────────────────────────────

  const [state, setState] = useState<WizardState>(() => {
    // Try to restore from localStorage
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WizardState;
        if (parsed.lastSavedAt) return parsed;
      }
    } catch { /* ignore */ }
    return INITIAL_STATE;
  });

  const [showResumeDialog, setShowResumeDialog] = useState(() => {
    try {
      const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WizardState;
        return parsed.lastSavedAt !== null && parsed.currentStep > 1;
      }
    } catch { /* ignore */ }
    return false;
  });

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
    onConfirm: () => {}
  });

  // ─── Persistence ────────────────────────────────────────────────────────

  const saveProgress = useCallback((newState: WizardState) => {
    const stateToSave = { ...newState, lastSavedAt: Date.now() };
    localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(stateToSave));
    setState(stateToSave);
  }, []);

  const clearProgress = useCallback(() => {
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  }, []);

  // Auto-save on state change (debounced via effect)
  useEffect(() => {
    if (state.projectName || state.architecture.length > 0) {
      const timeout = setTimeout(() => {
        const stateToSave = { ...state, lastSavedAt: Date.now() };
        localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(stateToSave));
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [state]);

  // ─── Navigation ─────────────────────────────────────────────────────────

  const goToStep = (step: WizardStepNumber) => {
    saveProgress({ ...state, currentStep: step });
  };

  const updateState = (updates: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  // ─── Project Context for AI calls ─────────────────────────────────────

  const projectContext = {
    projectName: state.projectName,
    safetyStandard: state.safetyStandard,
    targetAsil: state.targetAsil,
    safetyGoal: state.safetyGoal,
    documentText: state.documentText,
  };

  // ─── Completion ───────────────────────────────────────────────────────

  const handleFinish = (confirmMessage?: string) => {
    const doFinish = () => {
      clearProgress();
      onComplete(state.architecture);
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
    if (state.projectName || state.architecture.length > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Discard Progress?',
        description: 'Your wizard progress is saved automatically. You can resume later by clicking "Create New Project" again.',
        actionLabel: 'Discard & Exit',
        onConfirm: () => {
          clearProgress();
          onCancel();
        },
      });
    } else {
      onCancel();
    }
  };

  // ─── Resume Dialog ────────────────────────────────────────────────────

  const handleResumeYes = () => {
    setShowResumeDialog(false);
    // State is already loaded from localStorage
  };

  const handleResumeNo = () => {
    setShowResumeDialog(false);
    clearProgress();
    setState(INITIAL_STATE);
  };

  // ─── Render ───────────────────────────────────────────────────────────

  const stepTitles: Record<WizardStepNumber, string> = {
    1: 'Project Setup',
    2: 'System Architecture',
    3: 'Component Functions',
    4: 'Failure Modes',
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Create New FMEDA Project
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Step {state.currentStep} of 4 — {stepTitles[state.currentStep]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {state.lastSavedAt && (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="w-3 h-3" />
              Auto-saved
            </span>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-8 pt-6">
        <WizardStepIndicator currentStep={state.currentStep} />
      </div>

      {/* Step Content */}
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

      {/* Resume Dialog */}
      <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Previous Wizard?</AlertDialogTitle>
            <AlertDialogDescription>
              You have a saved wizard session for project "<strong>{state.projectName || 'Untitled'}</strong>" 
              (Step {state.currentStep}).
              Would you like to continue where you left off?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleResumeNo}>Start Fresh</AlertDialogCancel>
            <AlertDialogAction onClick={handleResumeYes}>Resume</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
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
