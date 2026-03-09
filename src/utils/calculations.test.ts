import { describe, expect, it } from 'vitest';
import { FmedaNode } from '../types/fmeda';
import { recalculateAffectedTotals, recalculateAllTotals } from './calculations';

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

describe('Calculations Utility', () => {
  it('correctly calculates FMEDA totals for nested hierarchy', () => {
    const updatedNodes = recalculateAllTotals(sampleNodes);

    const fm1 = updatedNodes['fm-1'];
    const fm2 = updatedNodes['fm-2'];
    const func1 = updatedNodes['func-1'];
    const sys1 = updatedNodes['sys-1'];

    expect(fm1.totalFit).toBeCloseTo(100);
    expect(fm1.safeFit).toBeCloseTo(90);
    expect(fm1.dangerousFit).toBeCloseTo(100);
    expect(fm1.detectedFit).toBeCloseTo(90);
    expect(fm1.avgDc).toBeCloseTo(0.9);

    expect(fm2.totalFit).toBeCloseTo(50);
    expect(fm2.safeFit).toBeCloseTo(50);
    expect(fm2.dangerousFit).toBeCloseTo(0);
    expect(fm2.detectedFit).toBeCloseTo(0);
    expect(fm2.avgDc).toBeCloseTo(1.0);

    expect(func1.totalFit).toBeCloseTo(150);
    expect(func1.safeFit).toBeCloseTo(140);
    expect(func1.dangerousFit).toBeCloseTo(100);
    expect(func1.detectedFit).toBeCloseTo(90);
    expect(func1.avgDc).toBeCloseTo(0.9);

    expect(sys1.totalFit).toBeCloseTo(170);
    expect(sys1.safeFit).toBeCloseTo(150);
    expect(sys1.dangerousFit).toBeCloseTo(120);
    expect(sys1.detectedFit).toBeCloseTo(100);
    expect(sys1.avgDc).toBeCloseTo(100 / 120);
  });

  it('recalculates only the affected ancestor chain for leaf edits', () => {
    const baselineNodes = recalculateAllTotals(sampleNodes);
    const draftNodes = {
      ...baselineNodes,
      'fm-1': {
        ...baselineNodes['fm-1'],
        fitRate: 200,
      },
    };

    const updatedNodes = recalculateAffectedTotals(draftNodes, ['fm-1']);

    expect(updatedNodes['fm-1']).not.toBe(baselineNodes['fm-1']);
    expect(updatedNodes['func-1']).not.toBe(baselineNodes['func-1']);
    expect(updatedNodes['comp-1']).not.toBe(baselineNodes['comp-1']);
    expect(updatedNodes['sub-1']).not.toBe(baselineNodes['sub-1']);
    expect(updatedNodes['sys-1']).not.toBe(baselineNodes['sys-1']);

    expect(updatedNodes['fm-2']).toBe(baselineNodes['fm-2']);
    expect(updatedNodes['sub-2']).toBe(baselineNodes['sub-2']);
    expect(updatedNodes['comp-2']).toBe(baselineNodes['comp-2']);
    expect(updatedNodes['func-2']).toBe(baselineNodes['func-2']);
    expect(updatedNodes['fm-3']).toBe(baselineNodes['fm-3']);

    expect(updatedNodes['func-1'].totalFit).toBeCloseTo(250);
    expect(updatedNodes['sub-1'].dangerousFit).toBeCloseTo(200);
    expect(updatedNodes['sys-1'].totalFit).toBeCloseTo(270);
    expect(updatedNodes['sys-1'].avgDc).toBeCloseTo(190 / 220);
  });

  it('recalculates both ancestor chains after moving a subtree', () => {
    const baselineNodes = recalculateAllTotals(sampleNodes);
    const draftNodes = {
      ...baselineNodes,
      'comp-1': {
        ...baselineNodes['comp-1'],
        childIds: [],
      },
      'comp-2': {
        ...baselineNodes['comp-2'],
        childIds: ['func-2', 'func-1'],
      },
      'func-1': {
        ...baselineNodes['func-1'],
        parentId: 'comp-2',
      },
    };

    const updatedNodes = recalculateAffectedTotals(draftNodes, ['comp-1', 'comp-2']);

    expect(updatedNodes['func-1']).toBe(draftNodes['func-1']);
    expect(updatedNodes['fm-1']).toBe(baselineNodes['fm-1']);
    expect(updatedNodes['fm-2']).toBe(baselineNodes['fm-2']);

    expect(updatedNodes['comp-1'].totalFit).toBeCloseTo(0);
    expect(updatedNodes['sub-1'].totalFit).toBeCloseTo(0);
    expect(updatedNodes['comp-2'].totalFit).toBeCloseTo(170);
    expect(updatedNodes['sub-2'].dangerousFit).toBeCloseTo(120);
    expect(updatedNodes['sys-1'].totalFit).toBeCloseTo(170);
  });
});
