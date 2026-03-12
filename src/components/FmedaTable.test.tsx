import { act } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
const TABLE_VIEW_STORAGE_KEY = 'fmeda-table-view-state:v1';

const setPersistedTableViewState = (overrides: Record<string, unknown>) => {
  localStorage.setItem(
    TABLE_VIEW_STORAGE_KEY,
    JSON.stringify({
      columnPinning: {
        left: ['name'],
        right: ['actions'],
      },
      columnVisibility: {
        type: false,
        classification: false,
      },
      columnSizing: {},
      ...overrides,
    })
  );
};

const getGrid = () => screen.getByLabelText(/fmeda spreadsheet grid/i);

const selectCellByText = (text: RegExp | string, options?: { shiftKey?: boolean }) => {
  const cell = screen.getByText(text).closest('td');
  expect(cell).not.toBeNull();
  fireEvent.mouseDown(cell as HTMLTableCellElement, options);
  return cell as HTMLTableCellElement;
};

const createClipboardData = (initialText = '') => ({
  getData: vi.fn(() => initialText),
  setData: vi.fn(),
});

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

  it('reveals the bulk action after manually selecting a failure mode row', () => {
    render(<FmedaTable />);

    const firstRow = screen.getByRole('checkbox', { name: /select row no output/i }) as HTMLInputElement;

    fireEvent.click(firstRow);

    expect(firstRow).toBeChecked();
    expect(screen.getByRole('button', { name: /bulk edit selected/i })).toBeInTheDocument();
  });

  it('shows selection checkboxes only for failure mode rows', () => {
    act(() => {
      useFmedaStore.setState({
        nodes: sampleNodes,
        projectContext: null,
        selectedId: 'sys-1',
      });
    });

    render(<FmedaTable />);

    expect(screen.queryByRole('checkbox', { name: /select row brake controller/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /select row mcu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /select row process braking command/i })).not.toBeInTheDocument();
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

  it('applies bulk classification and metrics updates to selected failure modes', () => {
    render(<FmedaTable />);

    fireEvent.click(screen.getByRole('button', { name: /select all visible/i }));

    expect(screen.getByText(/bulk edit selected failure modes/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/bulk classification/i), {
      target: { value: 'Safe' },
    });

    fireEvent.change(screen.getByLabelText(/bulk diagnostic coverage/i), {
      target: { value: '75' },
    });
    fireEvent.change(screen.getByLabelText(/bulk fit rate/i), {
      target: { value: '12.5' },
    });

    fireEvent.click(screen.getByRole('button', { name: /apply to selection/i }));

    const nodes = useFmedaStore.getState().nodes;

    expect(nodes['fm-1'].classification).toBe('Safe');
    expect(nodes['fm-2'].classification).toBe('Safe');
    expect(nodes['fm-3'].classification).toBe('Safe');
    expect(nodes['fm-1'].diagnosticCoverage).toBeCloseTo(0.75);
    expect(nodes['fm-2'].diagnosticCoverage).toBeCloseTo(0.75);
    expect(nodes['fm-3'].diagnosticCoverage).toBeCloseTo(0.75);
    expect(nodes['fm-1'].fitRate).toBeCloseTo(12.5);
    expect(nodes['fm-2'].fitRate).toBeCloseTo(12.5);
    expect(nodes['fm-3'].fitRate).toBeCloseTo(12.5);
    expect(screen.getByText(/applied to 3 failure modes\./i)).toBeInTheDocument();
  });

  it('filters visible rows by failure mode classification', () => {
    render(<FmedaTable />);

    fireEvent.change(screen.getByLabelText(/filter by classification/i), {
      target: { value: 'Dangerous' },
    });

    expect(screen.getByText(/no output/i)).toBeInTheDocument();
    expect(screen.getByText(/degraded output/i)).toBeInTheDocument();
    expect(screen.queryByText(/intermittent output/i)).not.toBeInTheDocument();
  });

  it('supports text and numeric column filters for spreadsheet-heavy views', () => {
    act(() => {
      useFmedaStore.setState({
        nodes: {
          ...sampleNodes,
          'fm-1': {
            ...sampleNodes['fm-1'],
            localEffect: 'Brake pressure lost',
          },
          'fm-2': {
            ...sampleNodes['fm-2'],
            localEffect: 'Brake pressure reduced',
          },
          'fm-3': {
            ...sampleNodes['fm-3'],
            localEffect: 'Signal jitter',
          },
        },
        projectContext: null,
        selectedId: 'func-1',
      });
    });

    render(<FmedaTable />);

    fireEvent.change(screen.getByLabelText(/filter by local effect/i), {
      target: { value: 'Brake pressure' },
    });
    fireEvent.change(screen.getByLabelText(/maximum diagnostic coverage/i), {
      target: { value: '80' },
    });

    expect(screen.queryByText(/no output/i)).not.toBeInTheDocument();
    expect(screen.getByText(/degraded output/i)).toBeInTheDocument();
    expect(screen.queryByText(/intermittent output/i)).not.toBeInTheDocument();
  });

  it('lets the user reveal hidden columns from the table view panel', () => {
    render(<FmedaTable />);

    fireEvent.click(screen.getByRole('button', { name: /table view options/i }));
    fireEvent.click(screen.getByLabelText(/toggle classification column/i));

    expect(screen.getByRole('columnheader', { name: /classification/i })).toBeInTheDocument();
  });

  it('restores persisted view state for pinned and visible columns', () => {
    setPersistedTableViewState({
      columnPinning: {
        left: ['name', 'classification'],
        right: ['actions'],
      },
      columnVisibility: {
        type: false,
        classification: true,
      },
      columnSizing: {
        classification: 220,
      },
    });

    render(<FmedaTable />);

    const classificationHeader = screen.getByRole('columnheader', { name: /classification/i });

    expect(classificationHeader).toBeInTheDocument();
    expect(classificationHeader).toHaveStyle({ position: 'sticky' });
    expect(classificationHeader.style.left).not.toBe('');
  });

  it('supports multi-sort with shift-click on headers', () => {
    setPersistedTableViewState({
      columnVisibility: {
        type: false,
        classification: true,
      },
    });

    render(<FmedaTable />);

    fireEvent.click(screen.getByRole('button', { name: /classification/i }));
    fireEvent.click(screen.getByRole('button', { name: /fit rate/i }), { shiftKey: true });

    const table = screen.getByRole('table');
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent ?? '');

    expect(rows[0]).toContain('Degraded output');
    expect(rows[1]).toContain('No output');
    expect(rows[2]).toContain('Intermittent output');
  });

  it('copies the selected cell range as TSV', () => {
    setPersistedTableViewState({
      columnVisibility: {
        type: false,
        classification: true,
      },
    });

    render(<FmedaTable />);

    selectCellByText(/no output/i);
    const classificationCell = screen.getByLabelText(/classification for degraded output/i).closest('td');
    expect(classificationCell).not.toBeNull();
    fireEvent.mouseDown(classificationCell as HTMLTableCellElement, { shiftKey: true });

    const clipboardData = createClipboardData();
    fireEvent.copy(getGrid(), { clipboardData });

    expect(clipboardData.setData).toHaveBeenCalledWith(
      'text/plain',
      'No output\tDangerous\nDegraded output\tDangerous'
    );
  });

  it('pastes multi-column clipboard data into spreadsheet cells', () => {
    setPersistedTableViewState({
      columnVisibility: {
        type: false,
        classification: true,
      },
    });

    render(<FmedaTable />);

    selectCellByText(/no output/i);

    const clipboardData = createClipboardData(
      'Renamed failure\tSafe\tUpdated effect\tUpdated mechanism\t75\t12.5\nSecond failure\tDangerous\tSecond effect\tSecond mechanism\t0.25\t2'
    );
    fireEvent.paste(getGrid(), { clipboardData });

    const nodes = useFmedaStore.getState().nodes;

    expect(nodes['fm-1'].name).toBe('Renamed failure');
    expect(nodes['fm-1'].classification).toBe('Safe');
    expect(nodes['fm-1'].localEffect).toBe('Updated effect');
    expect(nodes['fm-1'].safetyMechanism).toBe('Updated mechanism');
    expect(nodes['fm-1'].diagnosticCoverage).toBeCloseTo(0.75);
    expect(nodes['fm-1'].fitRate).toBeCloseTo(12.5);

    expect(nodes['fm-2'].name).toBe('Second failure');
    expect(nodes['fm-2'].classification).toBe('Dangerous');
    expect(nodes['fm-2'].localEffect).toBe('Second effect');
    expect(nodes['fm-2'].safetyMechanism).toBe('Second mechanism');
    expect(nodes['fm-2'].diagnosticCoverage).toBeCloseTo(0.25);
    expect(nodes['fm-2'].fitRate).toBeCloseTo(2);
  });

  it('skips invalid pasted values while applying valid spreadsheet cells', () => {
    render(<FmedaTable />);

    const dcCell = screen.getByText('60.0%').closest('td');
    expect(dcCell).not.toBeNull();
    fireEvent.mouseDown(dcCell as HTMLTableCellElement);

    const clipboardData = createClipboardData('not-a-number\t5\n75\t2');
    fireEvent.paste(getGrid(), { clipboardData });

    const nodes = useFmedaStore.getState().nodes;

    expect(nodes['fm-2'].diagnosticCoverage).toBeCloseTo(0.6);
    expect(nodes['fm-2'].fitRate).toBeCloseTo(5);
    expect(nodes['fm-3'].diagnosticCoverage).toBeCloseTo(0.75);
    expect(nodes['fm-3'].fitRate).toBeCloseTo(2);
  });

  it('fills down the active cell value across the selected failure mode range', () => {
    render(<FmedaTable />);

    const sourceCell = screen.getByText('100').closest('td');
    expect(sourceCell).not.toBeNull();
    fireEvent.mouseDown(sourceCell as HTMLTableCellElement);

    const targetCell = screen.getByText('10').closest('td');
    expect(targetCell).not.toBeNull();
    fireEvent.mouseDown(targetCell as HTMLTableCellElement, { shiftKey: true });

    fireEvent.keyDown(getGrid(), { key: 'd', ctrlKey: true });

    const nodes = useFmedaStore.getState().nodes;

    expect(nodes['fm-1'].fitRate).toBeCloseTo(10);
    expect(nodes['fm-2'].fitRate).toBeCloseTo(10);
    expect(nodes['fm-3'].fitRate).toBeCloseTo(10);
  });
});
