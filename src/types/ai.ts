export interface AISuggestion {
  field: string;
  suggestion: string;
  reasoning: string;
}

export interface AIConfig {
  apiKey: string;
  provider: 'gemini';
  model: string;
}

export interface FmedaFailureModeDeep {
  name: string;
  localEffect?: string;
  safetyMechanism?: string;
  diagnosticCoverage?: number;
  fitRate?: number;
  classification?: 'Safe' | 'Dangerous';
}

export interface FmedaFunctionDeep {
  name: string;
  failureModes?: FmedaFailureModeDeep[];
}

export interface FmedaComponentDeep {
  name: string;
  asil?: 'QM' | 'ASIL A' | 'ASIL B' | 'ASIL C' | 'ASIL D';
  safetyGoal?: string;
  functions?: FmedaFunctionDeep[];
}

export interface FmedaSubsystemDeep {
  name: string;
  asil?: 'QM' | 'ASIL A' | 'ASIL B' | 'ASIL C' | 'ASIL D';
  safetyGoal?: string;
  components?: FmedaComponentDeep[];
}

export interface FmedaSystemDeep {
  name: string;
  asil?: 'QM' | 'ASIL A' | 'ASIL B' | 'ASIL C' | 'ASIL D';
  safetyGoal?: string;
  subsystems?: FmedaSubsystemDeep[];
}

export interface ProjectContext {
  projectName?: string;
  safetyStandard?: string;
  targetAsil?: string;
  safetyGoal?: string;
  documentText?: string;
}

export type WizardStepNumber = 1 | 2 | 3 | 4;

export interface WizardState {
  /** Step 1 — Project metadata */
  projectName: string;
  safetyStandard: string;
  targetAsil: string;
  safetyGoal: string;
  documentText: string;
  /** Step 2+ — Generated/edited architecture */
  architecture: FmedaSystemDeep[];
  /** Current wizard step */
  currentStep: WizardStepNumber;
  /** Timestamp of last save */
  lastSavedAt: number | null;
}
