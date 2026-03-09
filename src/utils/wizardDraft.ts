import { WizardState, WizardStepNumber } from '../types/ai';
import {
  PROJECT_NOTES_DOCUMENT_ID,
  PROJECT_NOTES_DOCUMENT_NAME,
  getCombinedDocumentText,
  normalizeProjectDocuments,
} from './projectDocuments';

export const WIZARD_STORAGE_KEY = 'fmeda-wizard-progress';
const WIZARD_STORAGE_VERSION = 1;

type WizardDraftState = Omit<WizardState, 'lastSavedAt'>;

interface PersistedWizardDraft {
  version: number;
  savedAt: number;
  state: WizardDraftState;
}

export interface WizardDraftSummary {
  projectName: string;
  currentStep: WizardStepNumber;
  lastSavedAt: number;
}

const DEFAULT_DRAFT_STATE: WizardDraftState = {
  projectName: '',
  safetyStandard: '',
  targetAsil: '',
  safetyGoal: '',
  documents: [],
  architecture: [],
  currentStep: 1,
};

const normalizeCurrentStep = (value: unknown): WizardStepNumber => {
  if (value === 2 || value === 3 || value === 4) {
    return value;
  }

  return 1;
};

const normalizeState = (value: unknown): WizardDraftState | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const draft = value as Partial<WizardDraftState> & { documentText?: unknown };
  const documents = normalizeProjectDocuments(
    draft.documents ??
      (typeof draft.documentText === 'string'
        ? [
            {
              id: PROJECT_NOTES_DOCUMENT_ID,
              name: PROJECT_NOTES_DOCUMENT_NAME,
              extractedText: draft.documentText,
              uploadedAt: new Date(0).toISOString(),
              kind: 'notes' as const,
            },
          ]
        : [])
  );

  return {
    projectName: typeof draft.projectName === 'string' ? draft.projectName : DEFAULT_DRAFT_STATE.projectName,
    safetyStandard: typeof draft.safetyStandard === 'string' ? draft.safetyStandard : DEFAULT_DRAFT_STATE.safetyStandard,
    targetAsil: typeof draft.targetAsil === 'string' ? draft.targetAsil : DEFAULT_DRAFT_STATE.targetAsil,
    safetyGoal: typeof draft.safetyGoal === 'string' ? draft.safetyGoal : DEFAULT_DRAFT_STATE.safetyGoal,
    documents,
    architecture: Array.isArray(draft.architecture) ? draft.architecture : DEFAULT_DRAFT_STATE.architecture,
    currentStep: normalizeCurrentStep(draft.currentStep),
  };
};

const normalizeSavedAt = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const toDraftState = (state: WizardState): WizardDraftState => ({
  projectName: state.projectName,
  safetyStandard: state.safetyStandard,
  targetAsil: state.targetAsil,
  safetyGoal: state.safetyGoal,
  documents: state.documents,
  architecture: state.architecture,
  currentStep: state.currentStep,
});

export const getWizardDraftSnapshot = (state: WizardState): string => {
  return JSON.stringify(toDraftState(state));
};

export const hasWizardDraftContent = (
  state: Pick<WizardState, 'projectName' | 'safetyStandard' | 'targetAsil' | 'safetyGoal' | 'documents' | 'architecture'>
): boolean => {
  return Boolean(
    state.projectName.trim() ||
    state.safetyStandard.trim() ||
    state.targetAsil.trim() ||
    state.safetyGoal.trim() ||
    getCombinedDocumentText(state.documents).trim() ||
    state.architecture.length > 0
  );
};

export const loadWizardDraft = (): WizardState | null => {
  const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved) as PersistedWizardDraft | Partial<WizardState>;

    if ('version' in parsed && 'state' in parsed) {
      const state = normalizeState(parsed.state);
      const savedAt = normalizeSavedAt(parsed.savedAt);

      if (!state || savedAt === null) {
        return null;
      }

      return {
        ...state,
        lastSavedAt: savedAt,
      };
    }

    const state = normalizeState(parsed);
    const savedAt = normalizeSavedAt(parsed.lastSavedAt);

    if (!state || savedAt === null) {
      return null;
    }

    return {
      ...state,
      lastSavedAt: savedAt,
    };
  } catch {
    return null;
  }
};

export const saveWizardDraft = (state: WizardState): number => {
  const savedAt = Date.now();
  const payload: PersistedWizardDraft = {
    version: WIZARD_STORAGE_VERSION,
    savedAt,
    state: toDraftState(state),
  };

  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(payload));
  return savedAt;
};

export const clearWizardDraft = (): void => {
  localStorage.removeItem(WIZARD_STORAGE_KEY);
};

export const getWizardDraftSummary = (): WizardDraftSummary | null => {
  const draft = loadWizardDraft();
  if (!draft || !draft.lastSavedAt || !hasWizardDraftContent(draft)) {
    return null;
  }

  return {
    projectName: draft.projectName || 'Untitled project',
    currentStep: draft.currentStep,
    lastSavedAt: draft.lastSavedAt,
  };
};
