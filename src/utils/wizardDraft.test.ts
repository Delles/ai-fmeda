import { beforeEach, describe, expect, it } from 'vitest';
import { loadWizardDraft, saveWizardDraft, WIZARD_STORAGE_KEY } from './wizardDraft';
import { PROJECT_NOTES_DOCUMENT_ID } from './projectDocuments';
import type { WizardState } from '../types/ai';

describe('wizardDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads document-based drafts', () => {
    const state: WizardState = {
      projectName: 'ABS Controller',
      safetyStandard: 'ISO 26262',
      targetAsil: 'ASIL D',
      safetyGoal: 'Maintain braking stability',
      documents: [
        {
          id: PROJECT_NOTES_DOCUMENT_ID,
          name: 'Project Notes',
          extractedText: 'Manual notes',
          uploadedAt: new Date(0).toISOString(),
          kind: 'notes',
        },
      ],
      architecture: [],
      currentStep: 2,
      lastSavedAt: null,
    };

    const savedAt = saveWizardDraft(state);
    const loaded = loadWizardDraft();

    expect(loaded).toEqual({
      ...state,
      lastSavedAt: savedAt,
    });
  });

  it('migrates legacy wrapped drafts that only stored documentText', () => {
    localStorage.setItem(
      WIZARD_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 1234,
        state: {
          projectName: 'Legacy Project',
          safetyStandard: 'ISO 26262',
          targetAsil: 'ASIL B',
          safetyGoal: 'Avoid false braking',
          documentText: 'Legacy draft text',
          architecture: [],
          currentStep: 3,
        },
      })
    );

    const loaded = loadWizardDraft();

    expect(loaded?.documents).toEqual([
      expect.objectContaining({
        id: PROJECT_NOTES_DOCUMENT_ID,
        extractedText: 'Legacy draft text',
        kind: 'notes',
      }),
    ]);
    expect(loaded?.currentStep).toBe(3);
    expect(loaded?.lastSavedAt).toBe(1234);
  });
});
