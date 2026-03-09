import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFmedaStore } from '../store/fmedaStore';
import { FmedaNode } from '../types/fmeda';
import { FmedaTable } from './FmedaTable';

vi.mock('../hooks/useVirtualWindow', () => ({
  useVirtualWindow: ({ count }: { count: number }) => ({
    totalSize: count * 56,
    virtualItems: Array.from({ length: count }, (_, index) => ({
      index,
      start: index * 56,
      size: 56,
      end: (index + 1) * 56,
    })),
    registerItem: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

vi.mock('../hooks/useDevRenderProfile', () => ({
  useDevRenderProfile: () => undefined,
}));

const sampleNodes: Record<string, FmedaNode> = {
  'sys-1': {
    id: 'sys-1',
    name: 'Brake System',
    type: 'System',
    parentId: null,
    childIds: ['sub-1'],
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
    childIds: ['fm-1', 'fm-2', 'fm-3'],
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
    name: 'Degraded output',
    type: 'FailureMode',
    parentId: 'func-1',
    childIds: [],
    fitRate: 40,
    diagnosticCoverage: 0.6,
    classification: 'Dangerous',
  },
  'fm-3': {
    id: 'fm-3',
    name: 'Intermittent output',
    type: 'FailureMode',
    parentId: 'func-1',
    childIds: [],
    fitRate: 10,
    diagnosticCoverage: 0.2,
    classification: 'Safe',
  },
};

describe('FmedaTable multi-row selection', () => {
  beforeEach(() => {
    localStorage.clear();

    act(() => {
      useFmedaStore.setState({
        nodes: sampleNodes,
        projectContext: null,
        selectedId: 'func-1',
      });
    });
  });

  it('supports multi-selecting visible rows with checkboxes', () => {
    render(<FmedaTable />);

    const firstRow = screen.getByRole('checkbox', { name: /select row no output/i }) as HTMLInputElement;
    const secondRow = screen.getByRole('checkbox', { name: /select row degraded output/i }) as HTMLInputElement;
    const thirdRow = screen.getByRole('checkbox', { name: /select row intermittent output/i }) as HTMLInputElement;

    fireEvent.click(firstRow);

    expect(firstRow).toBeChecked();

    fireEvent.click(thirdRow);

    expect(screen.getByRole('checkbox', { name: /select row no output/i })).toBeChecked();
    expect(secondRow).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select row intermittent output/i })).toBeChecked();
  });

  it('selects and clears all visible rows from the header controls', () => {
    render(<FmedaTable />);

    fireEvent.click(screen.getByRole('button', { name: /select all visible/i }));

    expect(screen.getByRole('checkbox', { name: /select row no output/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select row degraded output/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select row intermittent output/i })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(screen.getByRole('checkbox', { name: /select row no output/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select row degraded output/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select row intermittent output/i })).not.toBeChecked();
  }, 10000);
});
