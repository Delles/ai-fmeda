import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FmedaNode, ProjectContext } from '../types/fmeda';
import { exportToExcel, exportToJson, importProjectFile } from './export';
import { PROJECT_NOTES_DOCUMENT_ID, getCombinedDocumentText } from './projectDocuments';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const sampleNodes: FmedaNode[] = [
  {
    id: 'system-1',
    name: 'Brake System',
    type: 'System',
    parentId: null,
    childIds: ['subsystem-1'],
    asil: 'ASIL D',
    safetyGoal: 'Maintain braking stability',
  },
  {
    id: 'subsystem-1',
    name: 'Control Path',
    type: 'Subsystem',
    parentId: 'system-1',
    childIds: ['component-1', 'component-2'],
    asil: 'ASIL D',
    safetyGoal: 'Maintain braking stability',
  },
  {
    id: 'component-1',
    name: 'Brake Controller',
    type: 'Component',
    parentId: 'subsystem-1',
    childIds: ['function-1'],
    asil: 'ASIL D',
    safetyGoal: 'Maintain braking stability',
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
  {
    id: 'component-2',
    name: 'Hydraulic Backup',
    type: 'Component',
    parentId: 'subsystem-1',
    childIds: ['function-2'],
    asil: 'ASIL C',
    safetyGoal: 'Provide redundant pressure',
  },
  {
    id: 'function-2',
    name: 'Hold Pressure',
    type: 'Function',
    parentId: 'component-2',
    childIds: [],
  },
];

const sampleNodesRecord = Object.fromEntries(sampleNodes.map((node) => [node.id, node]));

const createProjectContext = (): ProjectContext => {
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

  return {
    projectName: 'Brake ECU',
    safetyStandard: 'ISO 26262',
    targetAsil: 'ASIL D',
    safetyGoal: 'Maintain braking stability',
    documents,
    documentText: getCombinedDocumentText(documents),
  };
};

const loadWorkbookFromBlob = async (blob: Blob) => {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook;
};

describe('export/import project round-trips', () => {
  let pickerFileName = 'roundtrip.json';
  let writtenBlob: Blob | null = null;

  beforeEach(() => {
    pickerFileName = 'roundtrip.json';
    writtenBlob = null;

    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(async () => ({
        name: pickerFileName,
        createWritable: async () => ({
          write: async (blob: Blob) => {
            writtenBlob = blob;
          },
          close: async () => {},
        }),
      })),
    });
  });

  afterEach(() => {
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('preserves project documents through JSON export/import round-trip', async () => {
    const projectContext = createProjectContext();
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

    expect(exportedPayload.projectContext.documents).toEqual(projectContext.documents);

    const imported = await importProjectFile(
      new File([exportedText], 'roundtrip.json', { type: 'application/json' })
    );

    expect(imported.nodes).toEqual(sampleNodesRecord);
    expect(imported.projectContext).toEqual(projectContext);
  });

  it('rebuilds aggregate document text from persisted documents during JSON round-trip', async () => {
    const projectContext: ProjectContext = {
      projectName: 'Hydraulic Gateway',
      documents: [
        {
          id: PROJECT_NOTES_DOCUMENT_ID,
          name: 'Project Notes',
          extractedText: 'Hydraulic system context',
          uploadedAt: '2026-03-09T09:45:00.000Z',
          kind: 'notes',
        },
        {
          id: 'doc-2',
          name: 'gateway-spec.pdf',
          extractedText: 'CAN gateway diagnostic behavior',
          uploadedAt: '2026-03-09T09:46:00.000Z',
          kind: 'uploaded',
        },
      ],
    };

    await exportToJson(sampleNodes, projectContext);

    expect(writtenBlob).not.toBeNull();
    const exportedText = await writtenBlob!.text();

    const imported = await importProjectFile(
      new File([exportedText], 'documents-only.json', { type: 'application/json' })
    );

    expect(imported.projectContext?.documents).toEqual(projectContext.documents);
    expect(imported.projectContext?.documentText).toBe(getCombinedDocumentText(projectContext.documents ?? []));
  });

  it('preserves hierarchy-only branches and project documents through Excel round-trip', async () => {
    pickerFileName = 'roundtrip.xlsx';
    const projectContext = createProjectContext();

    const exportResult = await exportToExcel(sampleNodes, projectContext);

    expect(exportResult).toEqual({
      success: true,
      fileName: 'roundtrip.xlsx',
    });
    expect(writtenBlob).not.toBeNull();

    const imported = await importProjectFile(
      new File([await writtenBlob!.arrayBuffer()], 'roundtrip.xlsx', { type: XLSX_MIME })
    );

    expect(imported.nodes).toEqual(sampleNodesRecord);
    expect(imported.projectContext).toEqual(projectContext);
  });

  it('imports engineer edits from the Excel workbook without losing structure', async () => {
    pickerFileName = 'engineer-edits.xlsx';
    const projectContext = createProjectContext();

    await exportToExcel(sampleNodes, projectContext);
    expect(writtenBlob).not.toBeNull();

    const workbook = await loadWorkbookFromBlob(writtenBlob!);
    const overviewSheet = workbook.getWorksheet('Overview');
    const hierarchySheet = workbook.getWorksheet('Hierarchy');
    const failureModesSheet = workbook.getWorksheet('Failure Modes');
    const documentsSheet = workbook.getWorksheet('Project Documents');

    expect(overviewSheet).toBeDefined();
    expect(hierarchySheet).toBeDefined();
    expect(failureModesSheet).toBeDefined();
    expect(documentsSheet).toBeDefined();

    overviewSheet!.getCell('B10').value = 'Brake ECU Rev B';
    overviewSheet!.getCell('B13').value = 'Maintain braking stability during degraded operation';

    hierarchySheet!.getCell('E4').value = 'Brake Controller ECU';

    failureModesSheet!.getCell('K2').value = 'Insufficient braking force';
    failureModesSheet!.getCell('M2').value = 'Redundant brake path and pressure monitor';
    failureModesSheet!.getCell('N2').value = 'Dangerous';
    failureModesSheet!.getCell('O2').value = '99.2%';
    failureModesSheet!.getCell('P2').value = 12.5;

    const duplicatedRowValues = (failureModesSheet!.getRow(2).values as unknown[]).slice(1);
    failureModesSheet!.insertRow(3, duplicatedRowValues);
    failureModesSheet!.getCell('A3').value = '';
    failureModesSheet!.getCell('K3').value = 'Delayed braking response';
    failureModesSheet!.getCell('L3').value = 'Stopping distance increases';
    failureModesSheet!.getCell('M3').value = 'Pressure watchdog';
    failureModesSheet!.getCell('N3').value = 'Dangerous';
    failureModesSheet!.getCell('O3').value = '85%';
    failureModesSheet!.getCell('P3').value = 4.5;

    documentsSheet!.getCell('E2').value = 'Updated project notes for re-import.';
    documentsSheet!.getCell('E3').value = 'Wheel speed sensor operating range and redundancy strategy.';

    const updatedBuffer = await workbook.xlsx.writeBuffer();
    const imported = await importProjectFile(
      new File([updatedBuffer], 'engineer-edits.xlsx', { type: XLSX_MIME })
    );

    expect(imported.projectContext?.projectName).toBe('Brake ECU Rev B');
    expect(imported.projectContext?.safetyGoal).toBe('Maintain braking stability during degraded operation');
    expect(imported.projectContext?.documents).toEqual([
      {
        id: PROJECT_NOTES_DOCUMENT_ID,
        name: 'Project Notes',
        extractedText: 'Updated project notes for re-import.',
        uploadedAt: '2026-03-09T09:30:00.000Z',
        kind: 'notes',
      },
      {
        id: 'doc-1',
        name: 'sensor-spec.txt',
        extractedText: 'Wheel speed sensor operating range and redundancy strategy.',
        uploadedAt: '2026-03-09T09:31:00.000Z',
        kind: 'uploaded',
      },
    ]);

    const importedNodes = Object.values(imported.nodes);
    expect(importedNodes).toHaveLength(sampleNodes.length + 1);
    expect(imported.nodes['component-1']?.name).toBe('Brake Controller ECU');
    expect(imported.nodes['failure-mode-1']).toMatchObject({
      id: 'failure-mode-1',
      name: 'Insufficient braking force',
      parentId: 'function-1',
      safetyMechanism: 'Redundant brake path and pressure monitor',
      diagnosticCoverage: 0.992,
      fitRate: 12.5,
      classification: 'Dangerous',
    });

    const addedFailureMode = importedNodes.find((node) => node.name === 'Delayed braking response');
    expect(addedFailureMode).toMatchObject({
      type: 'FailureMode',
      parentId: 'function-1',
      localEffect: 'Stopping distance increases',
      safetyMechanism: 'Pressure watchdog',
      diagnosticCoverage: 0.85,
      fitRate: 4.5,
      classification: 'Dangerous',
    });
    expect(imported.nodes['function-2']).toEqual(sampleNodesRecord['function-2']);
  });
});
