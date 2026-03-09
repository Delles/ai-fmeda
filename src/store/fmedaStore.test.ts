import { beforeEach, describe, expect, it } from 'vitest';
import { FmedaNode } from '../types/fmeda';
import {
  selectProjectDocuments,
  selectSelectedPath,
  selectVisibleNodes,
  useFmedaStore,
} from './fmedaStore';

const sampleNodes: Record<string, FmedaNode> = {
  'sys-1': {
    id: 'sys-1',
    name: 'Brake System',
    type: 'System',
    parentId: null,
    childIds: ['sub-1', 'sub-2'],
  },
  'sub-1': {
    id: 'sub-1',
    name: 'Brake Controller',
    type: 'Subsystem',
    parentId: 'sys-1',
    childIds: ['comp-1'],
  },
  'comp-1': {
    id: 'comp-1',
    name: 'MCU',
    type: 'Component',
    parentId: 'sub-1',
    childIds: ['func-1'],
  },
  'func-1': {
    id: 'func-1',
    name: 'Process Braking Command',
    type: 'Function',
    parentId: 'comp-1',
    childIds: ['fm-1', 'fm-2'],
  },
  'fm-1': {
    id: 'fm-1',
    name: 'No output',
    type: 'FailureMode',
    parentId: 'func-1',
    childIds: [],
    fitRate: 100,
    diagnosticCoverage: 0.9,
    classification: 'Dangerous',
  },
  'fm-2': {
    id: 'fm-2',
    name: 'Safe failure',
    type: 'FailureMode',
    parentId: 'func-1',
    childIds: [],
    fitRate: 50,
    diagnosticCoverage: 0,
    classification: 'Safe',
  },
  'sub-2': {
    id: 'sub-2',
    name: 'Hydraulic Actuation',
    type: 'Subsystem',
    parentId: 'sys-1',
    childIds: ['comp-2'],
  },
  'comp-2': {
    id: 'comp-2',
    name: 'Valve Driver',
    type: 'Component',
    parentId: 'sub-2',
    childIds: ['func-2'],
  },
  'func-2': {
    id: 'func-2',
    name: 'Open valve',
    type: 'Function',
    parentId: 'comp-2',
    childIds: ['fm-3'],
  },
  'fm-3': {
    id: 'fm-3',
    name: 'Stuck closed',
    type: 'FailureMode',
    parentId: 'func-2',
    childIds: [],
    fitRate: 20,
    diagnosticCoverage: 0.5,
    classification: 'Dangerous',
  },
};

describe('fmedaStore targeted recalculation', () => {
  beforeEach(() => {
    localStorage.clear();
    useFmedaStore.setState({
      nodes: {},
      projectContext: null,
      selectedId: null,
    });
  });

  it('updates only the edited branch when a failure mode changes', () => {
    useFmedaStore.getState().setNodes(sampleNodes);
    const beforeNodes = useFmedaStore.getState().nodes;

    useFmedaStore.getState().updateNode('fm-1', { fitRate: 200 });
    const afterNodes = useFmedaStore.getState().nodes;

    expect(afterNodes['fm-1']).not.toBe(beforeNodes['fm-1']);
    expect(afterNodes['func-1']).not.toBe(beforeNodes['func-1']);
    expect(afterNodes['comp-1']).not.toBe(beforeNodes['comp-1']);
    expect(afterNodes['sub-1']).not.toBe(beforeNodes['sub-1']);
    expect(afterNodes['sys-1']).not.toBe(beforeNodes['sys-1']);

    expect(afterNodes['fm-2']).toBe(beforeNodes['fm-2']);
    expect(afterNodes['sub-2']).toBe(beforeNodes['sub-2']);
    expect(afterNodes['comp-2']).toBe(beforeNodes['comp-2']);
    expect(afterNodes['func-2']).toBe(beforeNodes['func-2']);
    expect(afterNodes['fm-3']).toBe(beforeNodes['fm-3']);

    expect(afterNodes['func-1'].totalFit).toBeCloseTo(250);
    expect(afterNodes['sys-1'].dangerousFit).toBeCloseTo(220);
  });

  it('recomputes old and new parent chains when moving a subtree', () => {
    useFmedaStore.getState().setNodes(sampleNodes);
    const beforeNodes = useFmedaStore.getState().nodes;

    useFmedaStore.getState().moveNode('func-1', 'comp-2');
    const afterNodes = useFmedaStore.getState().nodes;

    expect(afterNodes['func-1']).not.toBe(beforeNodes['func-1']);
    expect(afterNodes['func-1'].parentId).toBe('comp-2');
    expect(afterNodes['fm-1']).toBe(beforeNodes['fm-1']);
    expect(afterNodes['fm-2']).toBe(beforeNodes['fm-2']);
    expect(afterNodes['fm-3']).toBe(beforeNodes['fm-3']);

    expect(afterNodes['comp-1'].totalFit).toBeCloseTo(0);
    expect(afterNodes['sub-1'].totalFit).toBeCloseTo(0);
    expect(afterNodes['comp-2'].totalFit).toBeCloseTo(170);
    expect(afterNodes['sub-2'].dangerousFit).toBeCloseTo(120);
    expect(afterNodes['sys-1'].totalFit).toBeCloseTo(170);
  });
});

describe('selectProjectDocuments', () => {
  beforeEach(() => {
    localStorage.clear();
    useFmedaStore.setState({
      nodes: {},
      projectContext: null,
      selectedId: null,
    });
  });

  it('returns a stable empty array when legacy project context has no documents', () => {
    useFmedaStore.setState({
      projectContext: {
        projectName: 'Legacy Project',
        documentText: 'Legacy notes only',
      },
    });

    const firstDocuments = selectProjectDocuments(useFmedaStore.getState());
    const secondDocuments = selectProjectDocuments(useFmedaStore.getState());

    expect(firstDocuments).toBe(secondDocuments);
    expect(firstDocuments).toEqual([]);
  });

  it('returns the persisted documents array when documents exist', () => {
    const documents = [
      {
        id: 'doc-1',
        name: 'spec.txt',
        extractedText: 'spec content',
        uploadedAt: new Date(0).toISOString(),
        kind: 'uploaded' as const,
      },
    ];

    useFmedaStore.setState({
      projectContext: {
        projectName: 'Current Project',
        documents,
        documentText: 'spec content',
      },
    });

    expect(selectProjectDocuments(useFmedaStore.getState())).toBe(documents);
  });
});

describe('stable selector snapshots', () => {
  beforeEach(() => {
    localStorage.clear();
    useFmedaStore.setState({
      nodes: sampleNodes,
      projectContext: null,
      selectedId: null,
    });
  });

  it('returns the same empty path reference when nothing is selected', () => {
    const firstPath = selectSelectedPath(useFmedaStore.getState());
    const secondPath = selectSelectedPath(useFmedaStore.getState());

    expect(firstPath).toBe(secondPath);
    expect(firstPath).toEqual([]);
  });

  it('returns the same empty visible-map reference when selectedId is missing from the store', () => {
    useFmedaStore.setState({ selectedId: 'missing-node' });

    const firstVisibleNodes = selectVisibleNodes(useFmedaStore.getState());
    const secondVisibleNodes = selectVisibleNodes(useFmedaStore.getState());

    expect(firstVisibleNodes).toBe(secondVisibleNodes);
    expect(firstVisibleNodes).toEqual({});
  });
});
