import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FmedaNode, ProjectContext } from '../types/fmeda';
import { exportToJson, importProjectFile } from './export';
import { PROJECT_NOTES_DOCUMENT_ID, getCombinedDocumentText } from './projectDocuments';

const sampleNodes: FmedaNode[] = [
  {
    id: 'component-1',
    name: 'Brake Controller',
    type: 'Component',
    parentId: null,
    childIds: ['function-1'],
  },
  {
    id: 'function-1',
    name: 'Apply Braking Force',
    type: 'Function',
    parentId: 'component-1',
    childIds: ['failure-mode-1'],
  },
  {
    id: 'failure-mode-1',
    name: 'No braking force',
    type: 'FailureMode',
    parentId: 'function-1',
    childIds: [],
    localEffect: 'Vehicle does not slow down',
    safetyMechanism: 'Redundant brake path',
    diagnosticCoverage: 0.98,
    fitRate: 10,
    classification: 'Dangerous',
  },
];

describe('export/import project document persistence', () => {
  let writtenBlob: Blob | null = null;

  beforeEach(() => {
    writtenBlob = null;

    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue({
        name: 'roundtrip.json',
        createWritable: async () => ({
          write: async (blob: Blob) => {
            writtenBlob = blob;
          },
          close: async () => {},
        }),
      }),
    });
  });

  afterEach(() => {
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('preserves project documents through JSON export/import round-trip', async () => {
    const documents = [
      {
        id: PROJECT_NOTES_DOCUMENT_ID,
        name: 'Project Notes',
        extractedText: 'Brake-by-wire overview',
        uploadedAt: '2026-03-09T09:30:00.000Z',
        kind: 'notes' as const,
      },
      {
        id: 'doc-1',
        name: 'sensor-spec.txt',
        extractedText: 'Wheel speed sensor operating range',
        uploadedAt: '2026-03-09T09:31:00.000Z',
        kind: 'uploaded' as const,
      },
    ];

    const projectContext: ProjectContext = {
      projectName: 'Brake ECU',
      safetyStandard: 'ISO 26262',
      targetAsil: 'ASIL D',
      safetyGoal: 'Maintain braking stability',
      documents,
      documentText: getCombinedDocumentText(documents),
    };

    const exportResult = await exportToJson(sampleNodes, projectContext);

    expect(exportResult).toEqual({
      success: true,
      fileName: 'roundtrip.json',
    });
    expect(writtenBlob).not.toBeNull();

    const exportedText = await writtenBlob!.text();
    const exportedPayload = JSON.parse(exportedText) as {
      nodes: FmedaNode[];
      projectContext: ProjectContext;
    };

    expect(exportedPayload.projectContext.documents).toEqual(documents);

    const imported = await importProjectFile(
      new File([exportedText], 'roundtrip.json', { type: 'application/json' })
    );

    expect(Object.values(imported.nodes)).toEqual(sampleNodes);
    expect(imported.projectContext).toEqual(projectContext);
  });

  it('rebuilds aggregate document text from persisted documents during JSON round-trip', async () => {
    const documents = [
      {
        id: PROJECT_NOTES_DOCUMENT_ID,
        name: 'Project Notes',
        extractedText: 'Hydraulic system context',
        uploadedAt: '2026-03-09T09:45:00.000Z',
        kind: 'notes' as const,
      },
      {
        id: 'doc-2',
        name: 'gateway-spec.pdf',
        extractedText: 'CAN gateway diagnostic behavior',
        uploadedAt: '2026-03-09T09:46:00.000Z',
        kind: 'uploaded' as const,
      },
    ];

    const projectContext: ProjectContext = {
      projectName: 'Hydraulic Gateway',
      documents,
    };

    await exportToJson(sampleNodes, projectContext);

    expect(writtenBlob).not.toBeNull();
    const exportedText = await writtenBlob!.text();

    const imported = await importProjectFile(
      new File([exportedText], 'documents-only.json', { type: 'application/json' })
    );

    expect(imported.projectContext?.documents).toEqual(documents);
    expect(imported.projectContext?.documentText).toBe(getCombinedDocumentText(documents));
  });
});
