import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  type Column,
  type ColumnFiltersState,
  type ColumnSizingState,
  type ColumnPinningState,
  type RowSelectionState,
  type VisibilityState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  ExpandedState,
  FilterFn,
  Row,
  SortingState,
} from '@tanstack/react-table';
import {
  Trash2,
  Plus,
  ChevronRight,
  ChevronDown,
  Layers,
  Box,
  Cpu,
  Activity,
  AlertTriangle,
  Sparkles,
  Pencil,
  Loader2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Search,
  X,
} from 'lucide-react';
import { FmedaNode, FmedaNodeType } from '../types/fmeda';
import { selectSelectedPath, selectVisibleNodes, useFmedaStore } from '../store/fmedaStore';
import { useAIStore } from '../store/aiStore';
import {
  generateFunctionsForComponent,
  generateFailureModesForFunction,
  refineFailureMode,
  generateSubsystemsForSystem,
  generateComponentsForSubsystem,
  generateSystems
} from '../services/aiService';
import { EditableTextCell } from './cells/EditableTextCell';
import { EditableNumberCell } from './cells/EditableNumberCell';
import { EditableAICell } from './cells/EditableAICell';
import { useConfirm } from '../hooks/useConfirm';
import { formatAIError } from '../lib/errorUtils';
import { generateId } from '../utils/id';
import { cn } from '../lib/utils';
import { AILoadingIndicator } from './ui/AILoadingIndicator';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useDevRenderProfile } from '../hooks/useDevRenderProfile';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import { toast } from 'sonner';


type TableRowData = FmedaNode & { isPlaceholder?: boolean };
type EditableColumnId =
  | 'name'
  | 'classification'
  | 'localEffect'
  | 'safetyMechanism'
  | 'diagnosticCoverage'
  | 'fitRate';
type NumericRangeFilterValue = {
  min?: string;
  max?: string;
};
type CellRef = {
  rowId: string;
  columnId: EditableColumnId;
};
type CellRange = {
  anchor: CellRef;
  focus: CellRef;
};
type PersistedTableViewState = {
  columnPinning?: ColumnPinningState;
  columnVisibility?: VisibilityState;
  columnSizing?: ColumnSizingState;
};

const columnHelper = createColumnHelper<TableRowData>();

// FIX #6 & #3: Node type icon for table rows + breadcrumb
const NODE_TYPE_CONFIG: Record<
  FmedaNodeType,
  { icon: React.ReactNode; rowClass: string; stickyCellClass: string; label: string; accentClass: string }
> = {
  System: {
    icon: <Layers className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />,
    rowClass: 'bg-blue-50/80 text-blue-900 border-b border-blue-100 font-semibold',
    stickyCellClass: 'bg-blue-50 text-blue-900',
    accentClass: 'bg-blue-600',
    label: 'System',
  },
  Subsystem: {
    icon: <Box className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />,
    rowClass: 'bg-indigo-50/60 text-indigo-900 border-b border-indigo-100 font-medium',
    stickyCellClass: 'bg-indigo-50 text-indigo-900',
    accentClass: 'bg-indigo-500',
    label: 'Subsystem',
  },
  Component: {
    icon: <Cpu className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />,
    rowClass: 'bg-purple-50/40 text-purple-900 border-b border-purple-100 font-medium',
    stickyCellClass: 'bg-purple-50 text-purple-900',
    accentClass: 'bg-purple-400',
    label: 'Component',
  },
  Function: {
    icon: <Activity className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />,
    rowClass: 'bg-emerald-50/30 text-emerald-900 border-b border-emerald-100',
    stickyCellClass: 'bg-emerald-50 text-emerald-900',
    accentClass: 'bg-emerald-400',
    label: 'Function',
  },
  FailureMode: {
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
    rowClass: 'bg-white text-gray-700 border-b border-gray-100',
    stickyCellClass: 'bg-white text-gray-700',
    accentClass: 'bg-gray-200',
    label: 'Failure Mode',
  },
};

// FIX #3: Breadcrumb component
const HierarchyBreadcrumb: React.FC = () => {
  const ancestors = useFmedaStore(selectSelectedPath);
  const setSelectedId = useFmedaStore((state) => state.setSelectedId);

  if (ancestors.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500 flex-wrap">
      <button
        onClick={() => setSelectedId(null)}
        className="text-blue-600 hover:underline font-medium"
      >
        All
      </button>
      {ancestors.map((node, i) => {
        const isLast = i === ancestors.length - 1;
        const config = NODE_TYPE_CONFIG[node.type];
        return (
          <React.Fragment key={node.id}>
            <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
            {isLast ? (
              <span className="flex items-center gap-1 font-semibold text-gray-700">
                {config.icon}
                {node.name}
              </span>
            ) : (
              <button
                onClick={() => setSelectedId(node.id)}
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                {config.icon}
                {node.name}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

const getNextNodeType = (currentType: FmedaNodeType): FmedaNodeType | null => {
  switch (currentType) {
    case 'System': return 'Subsystem';
    case 'Subsystem': return 'Component';
    case 'Component': return 'Function';
    case 'Function': return 'FailureMode';
    case 'FailureMode': return null;
    default: return null;
  }
};

const TABLE_ROW_ESTIMATE = 56;
const PINNED_HIERARCHY_COLUMN_ID = 'name';
const TABLE_MIN_WIDTH_CLASS = 'min-w-[88rem]';
const LEFT_PINNED_COLUMN_SHADOW_CLASS = 'shadow-[6px_0_12px_-10px_rgba(15,23,42,0.28)]';
const RIGHT_PINNED_COLUMN_SHADOW_CLASS = 'shadow-[-6px_0_12px_-10px_rgba(15,23,42,0.28)]';
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  type: false,
  classification: false,
};
const DEFAULT_COLUMN_PINNING: ColumnPinningState = {
  left: [PINNED_HIERARCHY_COLUMN_ID],
  right: ['actions'],
};
const DEFAULT_COLUMN_SIZING: ColumnSizingState = {};
const TABLE_VIEW_STORAGE_KEY = 'fmeda-table-view-state:v1';
const COLUMN_LABELS: Record<string, string> = {
  name: 'Hierarchy / Name',
  type: 'Type',
  classification: 'Classification',
  localEffect: 'Local Effect',
  safetyMechanism: 'Safety Mechanism',
  diagnosticCoverage: 'DC (%)',
  fitRate: 'FIT Rate',
  actions: 'Actions',
};
const EDITABLE_COLUMN_IDS: EditableColumnId[] = [
  'name',
  'classification',
  'localEffect',
  'safetyMechanism',
  'diagnosticCoverage',
  'fitRate',
];
const EMPTY_NUMERIC_FILTER: NumericRangeFilterValue = {};

const isEditableColumnId = (columnId: string): columnId is EditableColumnId =>
  EDITABLE_COLUMN_IDS.includes(columnId as EditableColumnId);

const readPersistedTableViewState = (): PersistedTableViewState => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(TABLE_VIEW_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    return JSON.parse(rawValue) as PersistedTableViewState;
  } catch {
    return {};
  }
};

const getCellClipboardValue = (node: TableRowData, columnId: EditableColumnId): string => {
  switch (columnId) {
    case 'name':
      return node.name ?? '';
    case 'classification':
      return node.classification ?? '';
    case 'localEffect':
      return node.localEffect ?? '';
    case 'safetyMechanism':
      return node.safetyMechanism ?? '';
    case 'diagnosticCoverage':
      return String(((node.diagnosticCoverage ?? 0) * 100).toFixed(1).replace(/\.0$/, ''));
    case 'fitRate':
      return String((node.fitRate ?? 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1'));
    default:
      return '';
  }
};

const textFacetFilter: FilterFn<TableRowData> = (row, columnId, filterValue) => {
  const query = String(filterValue ?? '').trim().toLowerCase();

  if (!query) {
    return true;
  }

  if (row.original.isPlaceholder) {
    return false;
  }

  return String(row.getValue(columnId) ?? '').toLowerCase().includes(query);
};

const numericRangeFilter: FilterFn<TableRowData> = (row, columnId, filterValue) => {
  const { min, max } = (filterValue ?? {}) as NumericRangeFilterValue;
  const minValue = min?.trim() ? Number.parseFloat(min) : undefined;
  const maxValue = max?.trim() ? Number.parseFloat(max) : undefined;

  if (minValue === undefined && maxValue === undefined) {
    return true;
  }

  if (row.original.isPlaceholder) {
    return false;
  }

  const value = Number(row.getValue(columnId) ?? 0);
  const normalizedValue = columnId === 'diagnosticCoverage' ? value * 100 : value;

  if (minValue !== undefined && normalizedValue < minValue) {
    return false;
  }

  if (maxValue !== undefined && normalizedValue > maxValue) {
    return false;
  }

  return true;
};

const normalizeClassificationValue = (value: string): 'Safe' | 'Dangerous' | null => {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'safe') {
    return 'Safe';
  }

  if (normalized === 'dangerous') {
    return 'Dangerous';
  }

  return null;
};

const normalizeDiagnosticCoverageValue = (value: string): number | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  const hasPercent = trimmed.endsWith('%');
  const parsed = Number.parseFloat(trimmed.replace('%', ''));
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  const normalized = hasPercent ? parsed / 100 : parsed <= 1 ? parsed : parsed / 100;

  if (normalized < 0 || normalized > 1) {
    return null;
  }

  return normalized;
};

const normalizeFitRateValue = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parsed = Number.parseFloat(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

const normalizeSpreadsheetValue = (
  columnId: EditableColumnId,
  value: string
): Partial<FmedaNode> | null => {
  const trimmed = value.trim();

  switch (columnId) {
    case 'name':
      return { name: trimmed };
    case 'classification': {
      const classification = normalizeClassificationValue(trimmed);
      return classification ? { classification } : null;
    }
    case 'localEffect':
      return { localEffect: trimmed };
    case 'safetyMechanism':
      return { safetyMechanism: trimmed };
    case 'diagnosticCoverage': {
      const diagnosticCoverage = normalizeDiagnosticCoverageValue(trimmed);
      return diagnosticCoverage === null ? null : { diagnosticCoverage };
    }
    case 'fitRate': {
      const fitRate = normalizeFitRateValue(trimmed);
      return fitRate === null ? null : { fitRate };
    }
    default:
      return null;
  }
};

const getNodeSearchText = (node: TableRowData): string => {
  const diagnosticCoverage =
    node.type === 'FailureMode'
      ? (node.diagnosticCoverage ?? 0) * 100
      : (node.avgDc ?? 0) * 100;
  const fitRate = node.type === 'FailureMode' ? node.fitRate ?? 0 : node.totalFit ?? 0;

  return [
    node.name,
    node.type,
    node.classification,
    node.localEffect,
    node.safetyMechanism,
    diagnosticCoverage.toFixed(1),
    fitRate.toFixed(2),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const globalTableFilter: FilterFn<TableRowData> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? '').trim().toLowerCase();

  if (!query) {
    return true;
  }

  if (row.original.isPlaceholder) {
    return false;
  }

  return getNodeSearchText(row.original).includes(query);
};

const exactFacetFilter: FilterFn<TableRowData> = (row, columnId, filterValue) => {
  const query = String(filterValue ?? '').trim();

  if (!query) {
    return true;
  }

  if (row.original.isPlaceholder) {
    return false;
  }

  return String(row.getValue(columnId) ?? '') === query;
};

const getPinnedColumnStyles = (
  column: Column<TableRowData> | undefined,
  options?: { isHeader?: boolean }
): React.CSSProperties => {
  if (!column) {
    return {};
  }

  const pinned = column.getIsPinned();

  return {
    width: column.getSize(),
    minWidth: column.getSize(),
    maxWidth: column.getSize(),
    position: pinned ? 'sticky' : 'relative',
    left: pinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: pinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    zIndex: options?.isHeader ? (pinned ? 35 : 20) : (pinned ? 10 : 0),
  };
};

export const FmedaTable: React.FC = () => {
  const nodes = useFmedaStore(selectVisibleNodes);
  const selectedId = useFmedaStore((state) => state.selectedId);
  const updateNode = useFmedaStore((state) => state.updateNode);
  const updateNodes = useFmedaStore((state) => state.updateNodes);
  const applyNodeUpdates = useFmedaStore((state) => state.applyNodeUpdates);
  const deleteNode = useFmedaStore((state) => state.deleteNode);
  const addNode = useFmedaStore((state) => state.addNode);
  const setSelectedId = useFmedaStore((state) => state.setSelectedId);
  const projectContext = useFmedaStore((state) => state.projectContext);
  const persistedTableViewStateRef = useRef<PersistedTableViewState>(readPersistedTableViewState());

  const aiConfig = useAIStore((state) => state.config);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => persistedTableViewStateRef.current.columnVisibility ?? DEFAULT_COLUMN_VISIBILITY
  );
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(
    () => persistedTableViewStateRef.current.columnPinning ?? DEFAULT_COLUMN_PINNING
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    () => persistedTableViewStateRef.current.columnSizing ?? DEFAULT_COLUMN_SIZING
  );
  const [activeCell, setActiveCell] = useState<CellRef | null>(null);
  const [selectionRange, setSelectionRange] = useState<CellRange | null>(null);
  const selectedNode = selectedId ? nodes[selectedId] ?? null : null;
  const hasActiveFilter = globalFilter.trim().length > 0;
  const hasActiveFacetFilters = columnFilters.length > 0;
  const hasActiveAnyFilter = hasActiveFilter || hasActiveFacetFilters;
  const hasActiveTableTransforms = hasActiveFilter || hasActiveFacetFilters || sorting.length > 0;

  const tableData = useMemo(() => {
    if (!selectedId) {
      return Object.values(nodes).filter(n => !n.parentId);
    }

    const selectedNode = nodes[selectedId];
    if (!selectedNode) return [];

    const children = selectedNode.childIds.map(id => nodes[id]).filter(Boolean) as (FmedaNode & { isPlaceholder?: boolean })[];
    const nextType = getNextNodeType(selectedNode.type);
    if (nextType && !hasActiveTableTransforms) {
      children.push({
        id: `placeholder-${selectedNode.id}`,
        name: `Add ${nextType}...`,
        type: nextType,
        parentId: selectedNode.id,
        childIds: [],
        isPlaceholder: true,
      } as FmedaNode & { isPlaceholder?: boolean });
    }
    return children;
  }, [hasActiveTableTransforms, nodes, selectedId]);

  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [bulkClassification, setBulkClassification] = useState<'' | 'Safe' | 'Dangerous'>('');
  const [bulkDiagnosticCoverage, setBulkDiagnosticCoverage] = useState('');
  const [bulkFitRate, setBulkFitRate] = useState('');
  const [bulkUpdateMessage, setBulkUpdateMessage] = useState<string | null>(null);
  const selectableRowIdsRef = useRef<string[]>([]);
  const lastSelectedRowIdRef = useRef<string | null>(null);
  const pendingCheckboxRangeRef = useRef(false);
  const bulkEditorRef = useRef<HTMLFormElement>(null);
  const bulkClassificationRef = useRef<HTMLSelectElement>(null);
  const previousSelectedFailureModeCountRef = useRef(0);

  const handleDelete = useCallback(async (row: Row<FmedaNode>) => {
    const original = row.original;
    const isConfirmed = await confirm({
      title: `Delete ${original.type}?`,
      description: `Are you sure you want to delete "${original.name}" and all its descendants?`,
      variant: 'destructive',
      confirmText: 'Delete',
      icon: 'warning'
    });

    if (isConfirmed) {
      deleteNode(original.id);
    }
  }, [confirm, deleteNode]);

  const handleAddChild = useCallback((parent: FmedaNode) => {
    const nextType = getNextNodeType(parent.type);

    if (nextType) {
      const newNode: FmedaNode = {
        id: generateId(),
        name: `New ${nextType}`,
        type: nextType,
        parentId: parent.id,
        childIds: [],
        ...(nextType === 'FailureMode' ? {
          localEffect: '',
          safetyMechanism: '',
          diagnosticCoverage: 0,
          fitRate: 0,
          classification: 'Safe'
        } : {})
      };
      addNode(newNode);
      setExpanded(prev => {
        if (prev === true) return true;
        return { ...prev, [parent.id]: true };
      });
    }
  }, [addNode]);

  const handleAddForCurrentContext = useCallback(() => {
    if (!selectedNode) {
      addNode({
        id: generateId(),
        name: 'New System',
        type: 'System',
        parentId: null,
        childIds: [],
      });
      return;
    }

    handleAddChild(selectedNode);
  }, [handleAddChild, addNode, selectedNode]);

  const getAiContext = useCallback((row: Row<FmedaNode & { isPlaceholder?: boolean }>) => {
    const allNodes = useFmedaStore.getState().nodes;
    let systemName = '';
    let subsystemName = '';
    let componentName = '';
    let functionName = '';
    const failureMode: Partial<FmedaNode> = row.original;

    let current: FmedaNode | null = row.original;
    while (current) {
      if (current.type === 'System') systemName = current.name;
      if (current.type === 'Subsystem') subsystemName = current.name;
      if (current.type === 'Component') componentName = current.name;
      if (current.type === 'Function') functionName = current.name;
      current = current.parentId ? (allNodes[current.parentId] ?? null) : null;
    }

    return { systemName, subsystemName, componentName, functionName, failureMode };
  }, []);

  const handleCellSave = useCallback((row: Row<FmedaNode & { isPlaceholder?: boolean }>, field: string, value: string | number) => {
    updateNode(row.original.id, { [field]: value });
  }, [updateNode]);

  const handleRowAiEdit = useCallback(async (row: Row<FmedaNode>) => {
    if (!aiConfig.apiKey) {
      await confirm({
        title: 'API Key Missing',
        description: 'Please set your AI API key in the settings (top right) first.',
        type: 'alert',
        icon: 'info'
      });
      return;
    }
    if (!projectContext) {
      await confirm({
        title: 'Context Missing',
        description: 'Project context is missing. Please ensure you have uploaded documents or described the project.',
        type: 'alert',
        icon: 'info'
      });
      return;
    }

    const node = row.original;
    if (node.type !== 'FailureMode') return;

    // Check if row already has data
    const hasExistingData = node.localEffect || node.safetyMechanism || (node.fitRate && node.fitRate > 0);

    if (hasExistingData) {
      const isConfirmed = await confirm({
        title: 'Refine Failure Mode?',
        description: 'This row already has data. Do you want AI to suggest improvements and complete missing fields? This will overwrite existing values.',
        confirmText: 'Refine',
        variant: 'default',
        icon: 'sparkles'
      });
      if (!isConfirmed) return;
    }

    setIsAiLoading(true);
    setLoadingNodeId(node.id);

    try {
      const { systemName, subsystemName, componentName, functionName } = getAiContext(row as Row<FmedaNode & { isPlaceholder?: boolean }>);

      const refined = await refineFailureMode(
        aiConfig,
        projectContext,
        systemName,
        subsystemName,
        componentName,
        functionName,
        {
          name: node.name,
          localEffect: node.localEffect,
          safetyMechanism: node.safetyMechanism,
          diagnosticCoverage: node.diagnosticCoverage,
          fitRate: node.fitRate
        }
      );

      updateNode(node.id, {
        localEffect: refined.localEffect,
        safetyMechanism: refined.safetyMechanism,
        diagnosticCoverage: refined.diagnosticCoverage,
        fitRate: refined.fitRate,
      });
    } catch (error) {
      console.error('AI Refinement failed:', error);
      const { title, message, icon } = formatAIError(error);
      await confirm({
        title,
        description: message,
        type: 'alert',
        icon,
        variant: title.includes('Limit') || title.includes('Quota') ? 'default' : 'destructive'
      });
    } finally {
      setIsAiLoading(false);
      setLoadingNodeId(null);
    }
  }, [aiConfig, projectContext, confirm, getAiContext, updateNode]);

  const handleBulkGenerate = async () => {
    if (!aiConfig.apiKey) {
      await confirm({
        title: 'API Key Missing',
        description: 'Please set your AI API key in the settings (top right) first.',
        type: 'alert',
        icon: 'info'
      });
      return;
    }
    if (!projectContext) {
      await confirm({
        title: 'Context Missing',
        description: 'Project context is missing. Please ensure you have uploaded documents in the Wizard or Project Setup.',
        type: 'alert',
        icon: 'info'
      });
      return;
    }

    const allNodes = useFmedaStore.getState().nodes;
    const selectedNodeFromStore = selectedId ? allNodes[selectedId] ?? null : null;
    const nextType = selectedNodeFromStore ? getNextNodeType(selectedNodeFromStore.type) : 'System';
    if (!nextType) return;

    setIsAiLoading(true);

    try {
      // Find parent hierarchy names
      let systemName = '';
      let subsystemName = '';
      let componentName = '';
      let functionName = '';

      if (selectedNodeFromStore) {
        let current: FmedaNode | null = selectedNodeFromStore;
        while (current) {
          if (current.type === 'System') systemName = current.name;
          if (current.type === 'Subsystem') subsystemName = current.name;
          if (current.type === 'Component') componentName = current.name;
          if (current.type === 'Function') functionName = current.name;
          current = current.parentId ? (allNodes[current.parentId] ?? null) : null;
        }
      }

      if (nextType === 'System') {
        const existingNames = Object.values(allNodes).filter((node) => !node.parentId).map((node) => node.name);
        const systems = await generateSystems(aiConfig, projectContext, existingNames);
        systems.forEach(s => {
          addNode({
            id: generateId(),
            name: s.name,
            type: 'System',
            parentId: null,
            childIds: []
          });
        });
      } else if (nextType === 'Subsystem') {
        if (!selectedNodeFromStore) return;
        const parentNode = selectedNodeFromStore;
        const existingNames = parentNode.childIds.map(id => nodes[id]?.name).filter(Boolean);
        const subsystems = await generateSubsystemsForSystem(
          aiConfig,
          projectContext,
          systemName,
          existingNames
        );

        subsystems.forEach(sub => {
          addNode({
            id: generateId(),
            name: sub.name,
            type: 'Subsystem',
            parentId: parentNode.id,
            childIds: []
          });
        });
      } else if (nextType === 'Component') {
        if (!selectedNodeFromStore) return;
        const parentNode = selectedNodeFromStore;
        const existingNames = parentNode.childIds.map(id => nodes[id]?.name).filter(Boolean);
        const components = await generateComponentsForSubsystem(
          aiConfig,
          projectContext,
          systemName,
          subsystemName,
          existingNames
        );

        components.forEach(comp => {
          addNode({
            id: generateId(),
            name: comp.name,
            type: 'Component',
            parentId: parentNode.id,
            childIds: []
          });
        });
      } else if (nextType === 'Function') {
        if (!selectedNodeFromStore) return;
        const parentNode = selectedNodeFromStore;
        const existingNames = parentNode.childIds.map(id => nodes[id]?.name).filter(Boolean);
        const functions = await generateFunctionsForComponent(
          aiConfig,
          projectContext,
          systemName,
          subsystemName,
          componentName,
          existingNames
        );

        functions.forEach(f => {
          addNode({
            id: generateId(),
            name: f.name,
            type: 'Function',
            parentId: parentNode.id,
            childIds: []
          });
        });
      } else if (nextType === 'FailureMode') {
        if (!selectedNodeFromStore) return;
        const parentNode = selectedNodeFromStore;
        const existingNames = parentNode.childIds.map(id => nodes[id]?.name).filter(Boolean);
        const failureModes = await generateFailureModesForFunction(
          aiConfig,
          projectContext,
          systemName,
          subsystemName,
          componentName,
          functionName,
          existingNames
        );

        failureModes.forEach(fm => {
          addNode({
            id: generateId(),
            name: fm.name,
            type: 'FailureMode',
            parentId: parentNode.id,
            childIds: [],
            localEffect: fm.localEffect || '',
            safetyMechanism: fm.safetyMechanism || '',
            diagnosticCoverage: fm.diagnosticCoverage || 0,
            fitRate: fm.fitRate || 0,
            classification: 'Safe'
          });
        });
      }

      if (selectedId) {
        setExpanded(prev => {
          if (typeof prev === 'boolean') return prev;
          return { ...prev, [selectedId]: true };
        });
      }
    } catch (error) {
      console.error('Bulk generation failed:', error);
      const { title, message, icon } = formatAIError(error);
      await confirm({
        title,
        description: message,
        type: 'alert',
        icon,
        variant: title.includes('Limit') || title.includes('Quota') ? 'default' : 'destructive'
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const getRangeSelection = useCallback((anchorId: string, targetId: string) => {
    const selectableRowIds = selectableRowIdsRef.current;
    const startIndex = selectableRowIds.indexOf(anchorId);
    const endIndex = selectableRowIds.indexOf(targetId);

    if (startIndex === -1 || endIndex === -1) {
      return [targetId];
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    return selectableRowIds.slice(from, to + 1);
  }, []);

  const clearRowSelection = useCallback(() => {
    setRowSelection({});
    lastSelectedRowIdRef.current = null;
  }, []);

  const selectAllVisibleRows = useCallback(() => {
    const selectableRowIds = selectableRowIdsRef.current;
    setRowSelection(
      Object.fromEntries(selectableRowIds.map((rowId) => [rowId, true])) as RowSelectionState
    );
    lastSelectedRowIdRef.current = selectableRowIds[selectableRowIds.length - 1] ?? null;
  }, []);

  const toggleRowSelection = useCallback(
    (
      rowId: string,
      options: {
        mode: 'replace' | 'toggle' | 'range';
        shouldSelect?: boolean;
      }
    ) => {
      setRowSelection((current) => {
        const nextSelection = { ...current };
        const isCurrentlySelected = Boolean(nextSelection[rowId]);
        const shouldSelect = options.shouldSelect ?? !isCurrentlySelected;

        if (options.mode === 'replace') {
          return shouldSelect ? { [rowId]: true } : {};
        }

        if (options.mode === 'range' && lastSelectedRowIdRef.current) {
          const rangeIds = getRangeSelection(lastSelectedRowIdRef.current, rowId);

          rangeIds.forEach((id) => {
            if (shouldSelect) {
              nextSelection[id] = true;
            } else {
              delete nextSelection[id];
            }
          });

          return nextSelection;
        }

        if (shouldSelect) {
          nextSelection[rowId] = true;
        } else {
          delete nextSelection[rowId];
        }

        return nextSelection;
      });

      lastSelectedRowIdRef.current = rowId;
    },
    [getRangeSelection]
  );

  const renderSortGlyph = useCallback(
    (column: Column<TableRowData>) => {
      const sort = column.getIsSorted();
      const sortIndex = column.getSortIndex();

      return (
        <span className="inline-flex items-center gap-1">
          {sort === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : sort === 'desc' ? (
            <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
          )}
          {sortIndex >= 0 && sorting.length > 1 && (
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-700">
              {sortIndex + 1}
            </span>
          )}
        </span>
      );
    },
    [sorting.length]
  );

  const handleColumnSort = useCallback((columnId: string, multiSort: boolean) => {
    setSorting((current) => {
      const existingSort = current.find((entry) => entry.id === columnId);
      const remainingSorts = multiSort ? current.filter((entry) => entry.id !== columnId) : [];

      if (!existingSort) {
        return [...remainingSorts, { id: columnId, desc: false }];
      }

      if (!existingSort.desc) {
        return [...remainingSorts, { id: columnId, desc: true }];
      }

      return remainingSorts;
    });
  }, []);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        id: 'name',
        enableHiding: false,
        filterFn: textFacetFilter,
        size: 384,
        minSize: 280,
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by hierarchy name"
            >
              <span>Hierarchy / Name</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        cell: ({ row, getValue }) => {
          const isFailureMode = row.original.type === 'FailureMode';
          const isRenaming = renamingId === row.original.id;
          const isSelected = row.getIsSelected();
          const fontClass =
            row.original.type === 'System' ? 'font-bold' :
            row.original.type === 'Subsystem' ? 'font-semibold' :
            row.original.type === 'Component' ? 'font-semibold' :
            row.original.type === 'Function' ? 'font-medium' : '';

          return (
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: `${row.depth * 1.25}rem` }}
            >
              {isFailureMode ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onMouseDown={(event) => {
                    pendingCheckboxRangeRef.current = event.shiftKey;
                  }}
                  onChange={(event) => {
                    const mode = pendingCheckboxRangeRef.current && lastSelectedRowIdRef.current ? 'range' : 'toggle';
                    pendingCheckboxRangeRef.current = false;
                    toggleRowSelection(row.original.id, {
                      mode,
                      shouldSelect: event.target.checked,
                    });
                  }}
                  data-spreadsheet-ignore="true"
                  aria-label={`Select row ${row.original.name}`}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              ) : (
                <span className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              )}
              {row.getCanExpand() ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    row.getToggleExpandedHandler()();
                  }}
                  className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                >
                  {row.getIsExpanded() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-5 flex-shrink-0" />
              )}
              {NODE_TYPE_CONFIG[row.original.type]?.icon}
              <div className="flex-1 min-w-0 group/name">
                {isFailureMode ? (
                  // FailureMode: keep inline editing, no navigation
                  <EditableTextCell
                    initialValue={getValue()}
                    onSave={(val) => handleCellSave(row, 'name', val)}
                    multiline
                    className=""
                  />
                ) : isRenaming ? (
                  // Rename mode: show EditableTextCell, auto-committed on blur
                  <EditableTextCell
                    initialValue={getValue()}
                    onSave={(val) => {
                      handleCellSave(row, 'name', val);
                      setRenamingId(null);
                    }}
                    autoOpen
                    multiline
                    className={fontClass}
                  />
                ) : (
                  // Nav mode: blue link navigates, pencil appears on hover
                  <div className="flex items-start gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.original.id)}
                      className={cn(
                        "w-full whitespace-normal break-words text-left leading-snug transition-colors hover:text-blue-700 hover:underline underline-offset-2 text-blue-600",
                        fontClass
                      )}
                      title={`Open ${row.original.type}: ${getValue()}`}
                    >
                      {getValue()}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(row.original.id);
                      }}
                      className="opacity-0 group-hover/name:opacity-60 hover:!opacity-100 p-0.5 rounded hover:bg-gray-200 transition-all flex-shrink-0"
                      title="Rename"
                    >
                      <Pencil size={12} className="text-gray-500" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('type', {
        id: 'type',
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by node type"
            >
              <span>Type</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        filterFn: exactFacetFilter,
        size: 148,
        minSize: 128,
        cell: ({ row, getValue }) => {
          if (row.original.isPlaceholder) {
            return null;
          }

          const type = getValue();
          const config = NODE_TYPE_CONFIG[type];

          return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 shadow-sm">
              {config.icon}
              {config.label}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.classification ?? '', {
        id: 'classification',
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by failure mode classification"
            >
              <span>Classification</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        filterFn: exactFacetFilter,
        size: 156,
        minSize: 136,
        cell: ({ row, getValue }) => {
          if (row.original.type !== 'FailureMode') {
            return <span className="text-xs text-gray-400">-</span>;
          }

          const classification = getValue();

          return (
            <select
              aria-label={`Classification for ${row.original.name}`}
              value={(classification as string) || 'Safe'}
              onChange={(event) =>
                handleCellSave(row, 'classification', event.target.value as 'Safe' | 'Dangerous')
              }
              className={cn(
                'w-full rounded-md border px-2 py-1 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                classification === 'Dangerous'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              )}
            >
              <option value="Safe">Safe</option>
              <option value="Dangerous">Dangerous</option>
            </select>
          );
        },
      }),
      columnHelper.accessor((row) => row.localEffect || '', {
        id: 'localEffect',
        filterFn: textFacetFilter,
        size: 320,
        minSize: 240,
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by local effect"
            >
              <span>Local Effect</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        cell: ({ row, getValue }) => {
          if (row.original.type !== 'FailureMode') return null;
          return (
            <EditableAICell
              initialValue={getValue() as string}
              onSave={(val) => handleCellSave(row, 'localEffect', val)}
              aiContext={getAiContext(row)}
              field="localEffect"
              multiline
              className=""
            />
          );
        },
      }),
      columnHelper.accessor((row) => row.safetyMechanism || '', {
        id: 'safetyMechanism',
        filterFn: textFacetFilter,
        size: 320,
        minSize: 240,
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by safety mechanism"
            >
              <span>Safety Mechanism</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        cell: ({ row, getValue }) => {
          if (row.original.type !== 'FailureMode') return null;
          return (
            <EditableAICell
              initialValue={getValue() as string}
              onSave={(val) => handleCellSave(row, 'safetyMechanism', val)}
              aiContext={getAiContext(row)}
              field="safetyMechanism"
              multiline
              className=""
            />
          );
        },
      }),
      columnHelper.accessor(
        (row) => (row.type === 'FailureMode' ? row.diagnosticCoverage ?? 0 : row.avgDc ?? 0),
        {
        id: 'diagnosticCoverage',
        filterFn: numericRangeFilter,
        size: 136,
        minSize: 120,
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by diagnostic coverage"
            >
              <span>DC (%)</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        cell: ({ row, getValue }) => {
          const value = row.original.type !== 'FailureMode' ? row.original.avgDc || 0 : getValue();
          const numValue = typeof value === 'number' ? value : 0;
          const percentage = numValue * 100;

          let colorClass = "text-gray-500 bg-gray-50 border-gray-200";
          if (percentage < 60) colorClass = "text-red-700 bg-red-50 border-red-200";
          else if (percentage < 90) colorClass = "text-amber-700 bg-amber-50 border-amber-200";
          else colorClass = "text-emerald-700 bg-emerald-50 border-emerald-200";

          if (row.original.type !== 'FailureMode') {
            return (
              <div className={`text-xs font-mono px-2 py-1 rounded border inline-block font-bold ${colorClass}`}>
                {percentage.toFixed(1)}%
              </div>
            );
          }

          return (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                percentage < 60 ? "bg-red-500" : percentage < 90 ? "bg-amber-500" : "bg-emerald-500"
              }`} />
              <EditableNumberCell
                initialValue={percentage}
                onSave={(val) => handleCellSave(row, 'diagnosticCoverage', val / 100)}
                format={(val) => `${val.toFixed(1)}%`}
                min={0}
                max={100}
                step={0.1}
                className={percentage < 60 ? "text-red-700 font-medium" : ""}
              />
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => (row.type === 'FailureMode' ? row.fitRate ?? 0 : row.totalFit ?? 0), {
        id: 'fitRate',
        filterFn: numericRangeFilter,
        size: 128,
        minSize: 112,
        header: ({ column }) => {
          return (
            <button
              type="button"
              onClick={(event) => handleColumnSort(column.id, event.shiftKey)}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by FIT rate"
            >
              <span>FIT Rate</span>
              {renderSortGlyph(column)}
            </button>
          );
        },
        cell: ({ row, getValue }) => {
          const value = row.original.type !== 'FailureMode' ? row.original.totalFit || 0 : getValue();
          const numValue = typeof value === 'number' ? value : 0;

          // FIX #9-related: Use consistent border colors
          let colorClass = "text-gray-500 bg-gray-50 border-gray-200";
          if (numValue > 100) colorClass = "text-red-700 bg-red-50 border-red-200";
          else if (numValue >= 10) colorClass = "text-orange-700 bg-orange-50 border-orange-200";

          if (row.original.type !== 'FailureMode') {
            return (
              <div className={`text-xs font-mono px-2 py-1 rounded border inline-block font-bold ${colorClass}`}>
                {numValue.toFixed(2)}
              </div>
            );
          }

          return (
            <EditableNumberCell
              initialValue={numValue}
              onSave={(val) => handleCellSave(row, 'fitRate', val)}
              min={0}
              step={0.1}
              className={numValue > 100 ? "text-red-700 font-bold" : numValue >= 10 ? "text-orange-700 font-medium" : ""}
            />
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 108,
        minSize: 92,
        enableResizing: false,
        cell: (info) => (
          <div className="flex items-center gap-1 justify-end">
            {getNextNodeType(info.row.original.type) && (
            <button
              onClick={() => handleAddChild(info.row.original)}
              data-spreadsheet-ignore="true"
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title={`Add ${getNextNodeType(info.row.original.type)}`}
            >
                <Plus size={15} />
              </button>
            )}
            {info.row.original.type === 'FailureMode' && (
              <button
                onClick={() => handleRowAiEdit(info.row as Row<FmedaNode>)}
                disabled={isAiLoading}
                data-spreadsheet-ignore="true"
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  isAiLoading ? "text-gray-300 cursor-not-allowed" : "text-purple-600 hover:bg-purple-50"
                )}
                title="Refine row with AI"
              >
                {loadingNodeId === info.row.original.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
              </button>
            )}
            <button
              onClick={() => handleDelete(info.row as Row<FmedaNode>)}
              data-spreadsheet-ignore="true"
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
      }),
    ],
    [
      getAiContext,
      handleColumnSort,
      handleAddChild,
      handleCellSave,
      handleDelete,
      handleRowAiEdit,
      isAiLoading,
      loadingNodeId,
      renamingId,
      renderSortGlyph,
      setRenamingId,
      setSelectedId,
      toggleRowSelection,
    ]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: (row) => row.id,
    state: {
      columnFilters,
      columnSizing,
      columnPinning,
      columnVisibility,
      expanded: hasActiveTableTransforms ? true : expanded,
      globalFilter,
      rowSelection,
      sorting,
    },
    enableColumnPinning: true,
    enableColumnResizing: true,
    enableMultiSort: true,
    isMultiSortEvent: (event) => (event as MouseEvent).shiftKey,
    enableMultiRowSelection: true,
    enableRowSelection: (row) => row.original.type === 'FailureMode' && !row.id.startsWith('placeholder-'),
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 96,
      size: 160,
    },
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    globalFilterFn: globalTableFilter,
    getSubRows: (row) => {
      const children = row.childIds.map(id => nodes[id]).filter(Boolean) as (FmedaNode & { isPlaceholder?: boolean })[];
      const nextType = getNextNodeType(row.type);
      if (nextType && !hasActiveTableTransforms) {
        children.push({
          id: `placeholder-${row.id}`,
          name: `Add ${nextType}...`,
          type: nextType,
          parentId: row.id,
          childIds: [],
          isPlaceholder: true,
        } as FmedaNode & { isPlaceholder?: boolean });
      }
      return children;
    },
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    filterFromLeafRows: true,
    maxLeafRowFilterDepth: 8,
  });

  const allRows = table.getRowModel().rows;
  const selectableRowIds = useMemo(
    () =>
      allRows
        .filter((row) => !row.original.id.startsWith('placeholder-') && row.original.type === 'FailureMode')
        .map((row) => row.original.id),
    [allRows]
  );
  const selectedRowIds = useMemo(
    () => Object.keys(rowSelection).filter((rowId) => rowSelection[rowId]),
    [rowSelection]
  );
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedFailureModeIds = useMemo(
    () =>
      selectedRows
        .filter((row) => row.original.type === 'FailureMode')
        .map((row) => row.original.id),
    [selectedRows]
  );
  const selectedFailureModeCount = useMemo(
    () => selectedFailureModeIds.length,
    [selectedFailureModeIds]
  );
  const allVisibleRowsSelected =
    selectableRowIds.length > 0 && selectableRowIds.every((rowId) => rowSelection[rowId]);
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const visibleColumnCount = visibleLeafColumns.length;
  const visibleEditableColumnIds = visibleLeafColumns
    .map((column) => column.id)
    .filter(isEditableColumnId);
  const visibleFailureModeRows = allRows.filter(
    (row) => row.original.type === 'FailureMode' && !row.original.id.startsWith('placeholder-')
  );
  const rowIndexById = useMemo(
    () =>
      new Map<string, number>(allRows.map((row, index) => [row.original.id, index])),
    [allRows]
  );
  const failureModeRowIndexById = useMemo(
    () =>
      new Map<string, number>(visibleFailureModeRows.map((row, index) => [row.original.id, index])),
    [visibleFailureModeRows]
  );
  const visibleColumnIndexById = useMemo(
    () =>
      new Map<string, number>(visibleLeafColumns.map((column, index) => [column.id, index])),
    [visibleLeafColumns]
  );
  const editableColumnIndexById = useMemo(
    () =>
      new Map<string, number>(visibleEditableColumnIds.map((columnId, index) => [columnId, index])),
    [visibleEditableColumnIds]
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { totalSize, virtualItems, registerItem: registerRow, scrollToIndex } = useVirtualWindow({
    count: allRows.length,
    estimateSize: TABLE_ROW_ESTIMATE,
    overscan: 8,
    scrollRef: scrollContainerRef,
    enabled: allRows.length > 20,
  });
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? Math.max(0, totalSize - virtualItems[virtualItems.length - 1].end)
      : 0;
  const isVirtualized = allRows.length > 20;
  const getSelectionBounds = useCallback(
    (range: CellRange | null) => {
      if (!range) {
        return null;
      }

      const anchorRowIndex = failureModeRowIndexById.get(range.anchor.rowId);
      const focusRowIndex = failureModeRowIndexById.get(range.focus.rowId);
      const anchorColumnIndex = editableColumnIndexById.get(range.anchor.columnId);
      const focusColumnIndex = editableColumnIndexById.get(range.focus.columnId);

      if (
        anchorRowIndex === undefined ||
        focusRowIndex === undefined ||
        anchorColumnIndex === undefined ||
        focusColumnIndex === undefined
      ) {
        return null;
      }

      return {
        rowStart: Math.min(anchorRowIndex, focusRowIndex),
        rowEnd: Math.max(anchorRowIndex, focusRowIndex),
        columnStart: Math.min(anchorColumnIndex, focusColumnIndex),
        columnEnd: Math.max(anchorColumnIndex, focusColumnIndex),
      };
    },
    [editableColumnIndexById, failureModeRowIndexById]
  );
  selectableRowIdsRef.current = selectableRowIds;

  useEffect(() => {
    const visibleRowIdSet = new Set(selectableRowIds);

    setRowSelection((current) => {
      let changed = false;
      const next: RowSelectionState = {};

      Object.entries(current).forEach(([rowId, isSelected]) => {
        if (isSelected && visibleRowIdSet.has(rowId)) {
          next[rowId] = true;
          return;
        }

        if (isSelected) {
          changed = true;
        }
      });

      return changed ? next : current;
    });

    if (lastSelectedRowIdRef.current && !visibleRowIdSet.has(lastSelectedRowIdRef.current)) {
      lastSelectedRowIdRef.current = null;
    }
  }, [selectableRowIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      TABLE_VIEW_STORAGE_KEY,
      JSON.stringify({
        columnPinning,
        columnVisibility,
        columnSizing,
      } satisfies PersistedTableViewState)
    );
  }, [columnPinning, columnSizing, columnVisibility]);

  useEffect(() => {
    if (
      activeCell &&
      (failureModeRowIndexById.get(activeCell.rowId) === undefined ||
        editableColumnIndexById.get(activeCell.columnId) === undefined)
    ) {
      setActiveCell(null);
      setSelectionRange(null);
    }
  }, [activeCell, editableColumnIndexById, failureModeRowIndexById]);

  useEffect(() => {
    if (!bulkUpdateMessage) return;

    const timer = window.setTimeout(() => setBulkUpdateMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [bulkUpdateMessage]);

  const hasPendingBulkUpdates =
    bulkClassification !== '' || bulkDiagnosticCoverage.trim() !== '' || bulkFitRate.trim() !== '';

  const openBulkEditor = useCallback(() => {
    bulkEditorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    requestAnimationFrame(() => {
      bulkClassificationRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const previousCount = previousSelectedFailureModeCountRef.current;

    if (previousCount === 0 && selectedFailureModeCount > 0) {
      openBulkEditor();
    }

    previousSelectedFailureModeCountRef.current = selectedFailureModeCount;
  }, [openBulkEditor, selectedFailureModeCount]);

  const handleApplyBulkUpdates = useCallback(() => {
    if (selectedFailureModeIds.length === 0) {
      return;
    }

    const updates: Partial<FmedaNode> = {};

    if (bulkClassification !== '') {
      updates.classification = bulkClassification;
    }

    if (bulkDiagnosticCoverage.trim() !== '') {
      const parsedDc = Number.parseFloat(bulkDiagnosticCoverage);
      if (!Number.isNaN(parsedDc)) {
        updates.diagnosticCoverage = Math.min(100, Math.max(0, parsedDc)) / 100;
      }
    }

    if (bulkFitRate.trim() !== '') {
      const parsedFit = Number.parseFloat(bulkFitRate);
      if (!Number.isNaN(parsedFit)) {
        updates.fitRate = Math.max(0, parsedFit);
      }
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    updateNodes(selectedFailureModeIds, updates);
    setBulkClassification('');
    setBulkDiagnosticCoverage('');
    setBulkFitRate('');
    setBulkUpdateMessage(`Applied to ${selectedFailureModeIds.length} failure mode${selectedFailureModeIds.length === 1 ? '' : 's'}.`);
  }, [
    bulkClassification,
    bulkDiagnosticCoverage,
    bulkFitRate,
    selectedFailureModeIds,
    updateNodes,
  ]);

  const isSpreadsheetCell = useCallback(
    (row: TableRowData, columnId: string): columnId is EditableColumnId =>
      row.type === 'FailureMode' &&
      !row.isPlaceholder &&
      isEditableColumnId(columnId),
    []
  );

  const focusSpreadsheetCell = useCallback(
    (cell: CellRef) => {
      const rowIndex = rowIndexById.get(cell.rowId);
      const columnIndex = visibleColumnIndexById.get(cell.columnId);

      if (rowIndex === undefined || columnIndex === undefined) {
        return;
      }

      const focusVisibleCell = () => {
        const container = scrollContainerRef.current;
        const selector = `td[data-row-index="${rowIndex}"][data-col-index="${columnIndex}"]`;
        const nextCell = container?.querySelector(selector) as HTMLTableCellElement | null;

        if (!nextCell) {
          return false;
        }

        const focusTarget =
          (nextCell.querySelector('button, input, select, textarea') as HTMLElement | null) ?? nextCell;
        focusTarget.focus();
        return true;
      };

      if (!focusVisibleCell()) {
        scrollToIndex(rowIndex);
        requestAnimationFrame(() => {
          focusVisibleCell();
        });
      }
    },
    [rowIndexById, scrollToIndex, visibleColumnIndexById]
  );

  const setSpreadsheetSelection = useCallback(
    (cell: CellRef, options?: { extend?: boolean; focus?: boolean }) => {
      const nextRange =
        options?.extend && selectionRange
          ? { anchor: selectionRange.anchor, focus: cell }
          : { anchor: cell, focus: cell };

      setActiveCell(cell);
      setSelectionRange(nextRange);

      if (options?.focus !== false) {
        focusSpreadsheetCell(cell);
      }
    },
    [focusSpreadsheetCell, selectionRange]
  );

  const isCellSelected = useCallback(
    (rowId: string, columnId: string) => {
      if (!isEditableColumnId(columnId)) {
        return false;
      }

      const bounds = getSelectionBounds(selectionRange);
      const rowIndex = failureModeRowIndexById.get(rowId);
      const columnIndex = editableColumnIndexById.get(columnId);

      if (!bounds || rowIndex === undefined || columnIndex === undefined) {
        return false;
      }

      return (
        rowIndex >= bounds.rowStart &&
        rowIndex <= bounds.rowEnd &&
        columnIndex >= bounds.columnStart &&
        columnIndex <= bounds.columnEnd
      );
    },
    [editableColumnIndexById, failureModeRowIndexById, getSelectionBounds, selectionRange]
  );

  const handleSpreadsheetCopy = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('input, textarea, [contenteditable="true"]') ||
        !selectionRange
      ) {
        return;
      }

      const bounds = getSelectionBounds(selectionRange);
      if (!bounds) {
        return;
      }

      const rows = visibleFailureModeRows.slice(bounds.rowStart, bounds.rowEnd + 1);
      const columns = visibleEditableColumnIds.slice(bounds.columnStart, bounds.columnEnd + 1);
      const copiedText = rows
        .map((row) =>
          columns
            .map((columnId) => getCellClipboardValue(row.original, columnId))
            .join('\t')
        )
        .join('\n');

      event.preventDefault();
      event.clipboardData.setData('text/plain', copiedText);
      toast.success(
        rows.length === 1 && columns.length === 1
          ? 'Copied active cell.'
          : `Copied ${rows.length} row${rows.length === 1 ? '' : 's'} x ${columns.length} column${columns.length === 1 ? '' : 's'}.`
      );
    },
    [getSelectionBounds, selectionRange, visibleEditableColumnIds, visibleFailureModeRows]
  );

  const handleSpreadsheetPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('input, textarea, [contenteditable="true"]') ||
        !activeCell
      ) {
        return;
      }

      const rawText = event.clipboardData.getData('text/plain');
      if (!rawText.trim()) {
        return;
      }

      const startRowIndex = failureModeRowIndexById.get(activeCell.rowId);
      const startColumnIndex = editableColumnIndexById.get(activeCell.columnId);

      if (startRowIndex === undefined || startColumnIndex === undefined) {
        return;
      }

      const rows = rawText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter((row, index, source) => row.length > 0 || index < source.length - 1);

      const patchMap = new Map<string, Partial<FmedaNode>>();
      let appliedCellCount = 0;
      let skippedCellCount = 0;
      let overflowCellCount = 0;

      rows.forEach((rowText, rowOffset) => {
        const targetRow = visibleFailureModeRows[startRowIndex + rowOffset];
        const values = rowText.split('\t');

        values.forEach((value, columnOffset) => {
          const targetColumnId = visibleEditableColumnIds[startColumnIndex + columnOffset];

          if (!targetRow || !targetColumnId) {
            overflowCellCount += 1;
            return;
          }

          const normalizedPatch = normalizeSpreadsheetValue(targetColumnId, value);
          if (!normalizedPatch) {
            skippedCellCount += 1;
            return;
          }

          const existingPatch = patchMap.get(targetRow.original.id) ?? {};
          patchMap.set(targetRow.original.id, { ...existingPatch, ...normalizedPatch });
          appliedCellCount += 1;
        });
      });

      event.preventDefault();

      if (patchMap.size === 0) {
        toast.error('Paste did not contain any valid spreadsheet values.');
        return;
      }

      applyNodeUpdates(
        Array.from(patchMap.entries()).map(([id, updates]) => ({
          id,
          updates,
        }))
      );

      setSelectionRange({
        anchor: activeCell,
        focus: {
          rowId:
            visibleFailureModeRows[Math.min(visibleFailureModeRows.length - 1, startRowIndex + rows.length - 1)]
              ?.original.id ?? activeCell.rowId,
          columnId:
            visibleEditableColumnIds[
              Math.min(visibleEditableColumnIds.length - 1, startColumnIndex + Math.max(0, rows[0]?.split('\t').length - 1))
            ] ?? activeCell.columnId,
        },
      });

      const feedback: string[] = [`Applied ${appliedCellCount} cell${appliedCellCount === 1 ? '' : 's'}.`];
      if (skippedCellCount > 0) {
        feedback.push(`Skipped ${skippedCellCount} invalid value${skippedCellCount === 1 ? '' : 's'}.`);
      }
      if (overflowCellCount > 0) {
        feedback.push(`Ignored ${overflowCellCount} overflow cell${overflowCellCount === 1 ? '' : 's'}.`);
      }
      toast.success(feedback.join(' '));
    },
    [
      activeCell,
      applyNodeUpdates,
      editableColumnIndexById,
      failureModeRowIndexById,
      visibleEditableColumnIds,
      visibleFailureModeRows,
    ]
  );

  const handleFillDown = useCallback(() => {
    if (!activeCell || !selectionRange) {
      return;
    }

    const bounds = getSelectionBounds(selectionRange);
    const sourceRow = visibleFailureModeRows[failureModeRowIndexById.get(activeCell.rowId) ?? -1];

    if (!bounds || !sourceRow) {
      return;
    }

    const sourceValue = getCellClipboardValue(sourceRow.original, activeCell.columnId);
    const patches = visibleFailureModeRows
      .slice(bounds.rowStart, bounds.rowEnd + 1)
      .filter((row) => row.original.id !== activeCell.rowId)
      .map((row) => {
        const updates = normalizeSpreadsheetValue(activeCell.columnId, sourceValue);
        return updates ? { id: row.original.id, updates } : null;
      })
      .filter(Boolean) as Array<{ id: string; updates: Partial<FmedaNode> }>;

    if (patches.length === 0) {
      return;
    }

    applyNodeUpdates(patches);
    toast.success(`Filled down ${patches.length} row${patches.length === 1 ? '' : 's'}.`);
  }, [
    activeCell,
    applyNodeUpdates,
    failureModeRowIndexById,
    getSelectionBounds,
    selectionRange,
    visibleFailureModeRows,
  ]);

  useDevRenderProfile('FmedaTable', {
    selectedId: selectedId ?? 'all',
    totalRows: allRows.length,
    renderedRows: virtualItems.length,
    isVirtualized,
    selectedRows: selectedRowIds.length,
  });

  const handleTableKeyDown = useCallback((event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;

    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      handleFillDown();
      return;
    }

    if (activeCell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const currentRowIndex = failureModeRowIndexById.get(activeCell.rowId);
      const currentColumnIndex = editableColumnIndexById.get(activeCell.columnId);

      if (currentRowIndex === undefined || currentColumnIndex === undefined) {
        return;
      }

      let nextRowIndex = currentRowIndex;
      let nextColumnIndex = currentColumnIndex;

      switch (event.key) {
        case 'ArrowUp':
          nextRowIndex -= 1;
          break;
        case 'ArrowDown':
          nextRowIndex += 1;
          break;
        case 'ArrowLeft':
          nextColumnIndex -= 1;
          break;
        case 'ArrowRight':
          nextColumnIndex += 1;
          break;
      }

      if (
        nextRowIndex >= 0 &&
        nextRowIndex < visibleFailureModeRows.length &&
        nextColumnIndex >= 0 &&
        nextColumnIndex < visibleEditableColumnIds.length
      ) {
        setSpreadsheetSelection(
          {
            rowId: visibleFailureModeRows[nextRowIndex].original.id,
            columnId: visibleEditableColumnIds[nextColumnIndex],
          },
          { extend: event.shiftKey }
        );
        event.preventDefault();
      }

      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    const cell = target.closest('td');
    if (!cell) {
      return;
    }

    const rowIndex = Number.parseInt(cell.getAttribute('data-row-index') || '-1', 10);
    const colIndex = Number.parseInt(cell.getAttribute('data-col-index') || '-1', 10);

    if (rowIndex === -1 || colIndex === -1) {
      return;
    }

    let nextRow = rowIndex;
    let nextCol = colIndex;

    switch (event.key) {
      case 'ArrowUp':
        nextRow -= 1;
        break;
      case 'ArrowDown':
        nextRow += 1;
        break;
      case 'ArrowLeft':
        nextCol -= 1;
        break;
      case 'ArrowRight':
        nextCol += 1;
        break;
    }

    if (nextRow >= 0 && nextRow < allRows.length && nextCol >= 0 && nextCol < visibleLeafColumns.length) {
      const focusSelector = `td[data-row-index="${nextRow}"][data-col-index="${nextCol}"]`;
      const container = scrollContainerRef.current;
      const focusVisibleCell = () => {
        const nextCell = container?.querySelector(focusSelector);
        if (!nextCell) return false;

        const focusable = nextCell.querySelector('button, input, select, textarea') as HTMLElement | null;
        if (!focusable) return false;

        focusable.focus();
        return true;
      };

      if (!focusVisibleCell()) {
        scrollToIndex(nextRow);
        requestAnimationFrame(() => {
          focusVisibleCell();
        });
      }

      event.preventDefault();
    }
  }, [
    activeCell,
    allRows.length,
    editableColumnIndexById,
    failureModeRowIndexById,
    handleFillDown,
    scrollToIndex,
    setSpreadsheetSelection,
    visibleEditableColumnIds,
    visibleFailureModeRows,
    visibleLeafColumns.length,
  ]);

  // FIX #14: Context-aware empty state message
  const getEmptyStateMessage = () => {
    if (hasActiveAnyFilter) {
      return {
        title: 'No matching rows',
        sub: 'Try a different search term or clear the current filter.',
      };
    }

    if (!selectedId) return { title: 'No FMEDA data yet', sub: 'Please go back to the Dashboard to create or import a project.' };
    if (!selectedNode) return { title: 'Nothing here', sub: 'No children found.' };
    const nextType = getNextNodeType(selectedNode.type);
    if (!nextType) return { title: 'No children', sub: `${selectedNode.type} nodes are leaf items.` };
    return {
      title: `No ${nextType}s yet`,
      sub: `Add a ${nextType} to "${selectedNode.name}" using the + button in the actions column above, or select a different item.`,
    };
  };

  const emptyState = getEmptyStateMessage();

  // Compute summary stats for KPI badges
  const allNodes = Object.values(nodes);
  const componentCount = allNodes.filter(n => n.type === 'Component').length;
  const functionCount = allNodes.filter(n => n.type === 'Function').length;
  const failureModeCount = allNodes.filter(n => n.type === 'FailureMode').length;
  const nextSelectedType = selectedNode ? getNextNodeType(selectedNode.type) : null;
  const bulkGenerateLabel = selectedId && nextSelectedType ? `${nextSelectedType}s` : 'Systems';
  const manualAddLabel = selectedId && nextSelectedType ? nextSelectedType : 'System';
  const activeSort = sorting[0];
  const sortColumnLabel = activeSort ? COLUMN_LABELS[activeSort.id] ?? activeSort.id : null;
  const nameColumn = table.getColumn('name');
  const typeColumn = table.getColumn('type');
  const classificationColumn = table.getColumn('classification');
  const localEffectColumn = table.getColumn('localEffect');
  const safetyMechanismColumn = table.getColumn('safetyMechanism');
  const diagnosticCoverageColumn = table.getColumn('diagnosticCoverage');
  const fitRateColumn = table.getColumn('fitRate');
  const nameFilterValue = (nameColumn?.getFilterValue() as string | undefined) ?? '';
  const typeFilterValue = (typeColumn?.getFilterValue() as string | undefined) ?? '';
  const classificationFilterValue = (classificationColumn?.getFilterValue() as string | undefined) ?? '';
  const localEffectFilterValue = (localEffectColumn?.getFilterValue() as string | undefined) ?? '';
  const safetyMechanismFilterValue = (safetyMechanismColumn?.getFilterValue() as string | undefined) ?? '';
  const diagnosticCoverageFilterValue =
    (diagnosticCoverageColumn?.getFilterValue() as NumericRangeFilterValue | undefined) ?? EMPTY_NUMERIC_FILTER;
  const fitRateFilterValue =
    (fitRateColumn?.getFilterValue() as NumericRangeFilterValue | undefined) ?? EMPTY_NUMERIC_FILTER;
  const typeFacetOptions = useMemo(() => {
    const values = Array.from(typeColumn?.getFacetedUniqueValues().keys() ?? []).filter(
      (value): value is FmedaNodeType => Boolean(value)
    );
    const order: Record<FmedaNodeType, number> = {
      System: 0,
      Subsystem: 1,
      Component: 2,
      Function: 3,
      FailureMode: 4,
    };

    return values.sort((left, right) => order[left] - order[right]);
  }, [typeColumn]);
  const classificationFacetOptions = useMemo(() => {
    const values = Array.from(classificationColumn?.getFacetedUniqueValues().keys() ?? []).filter(
      (value): value is 'Safe' | 'Dangerous' => value === 'Safe' || value === 'Dangerous'
    );
    const order = ['Dangerous', 'Safe'] as const;

    return values.sort((left, right) => order.indexOf(left) - order.indexOf(right));
  }, [classificationColumn]);
  const updateNumericColumnFilter = useCallback(
    (columnId: 'diagnosticCoverage' | 'fitRate', updates: Partial<NumericRangeFilterValue>) => {
      const column = table.getColumn(columnId);
      const currentFilter = (column?.getFilterValue() as NumericRangeFilterValue | undefined) ?? EMPTY_NUMERIC_FILTER;
      const nextFilter = {
        ...currentFilter,
        ...updates,
      };

      if (!nextFilter.min?.trim() && !nextFilter.max?.trim()) {
        column?.setFilterValue(undefined);
        return;
      }

      column?.setFilterValue(nextFilter);
    },
    [table]
  );

  const getSubFailureModes = (node: FmedaNode): FmedaNode[] => {
    if (node.type === 'FailureMode') return [node];
    return node.childIds.flatMap(id => nodes[id] ? getSubFailureModes(nodes[id]) : []);
  };

  const contextFailureModes = selectedNode
    ? getSubFailureModes(selectedNode)
    : allNodes.filter(n => n.type === 'FailureMode');

  const contextTotalFit = selectedNode
    ? (selectedNode.type === 'FailureMode' ? selectedNode.fitRate : selectedNode.totalFit) || 0
    : contextFailureModes.reduce((sum, fm) => sum + (fm.fitRate || 0), 0);

  const contextDangerousCount = contextFailureModes.filter(fm => fm.classification === 'Dangerous').length;

  const contextAvgDc = selectedNode
    ? (selectedNode.type === 'FailureMode'
        ? (selectedNode.classification === 'Safe' ? 1 : (selectedNode.diagnosticCoverage || 0))
        : (selectedNode.avgDc || 0))
    : (contextFailureModes.length > 0
      ? (contextFailureModes.reduce((sum, fm) => sum + (fm.classification === 'Dangerous' ? (fm.fitRate || 0) : 0), 0) > 0
          ? contextFailureModes.reduce((sum, fm) => sum + (fm.classification === 'Dangerous' ? ((fm.diagnosticCoverage || 0) * (fm.fitRate || 0)) : 0), 0) /
            contextFailureModes.reduce((sum, fm) => sum + (fm.classification === 'Dangerous' ? (fm.fitRate || 0) : 0), 0)
          : 1)
      : 0);

  const pageTitle = selectedNode ? selectedNode.name : 'Full System Analysis';
  const renderSubtitle = () => {
    if (!selectedNode) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
          <span><strong className="text-gray-700 font-medium">{componentCount}</strong> Components</span>
          <span className="text-gray-300">•</span>
          <span><strong className="text-gray-700 font-medium">{functionCount}</strong> Functions</span>
          <span className="text-gray-300">•</span>
          <span><strong className="text-gray-700 font-medium">{failureModeCount}</strong> Failure Modes</span>
        </div>
      );
    }

    if (selectedNode.type === 'FailureMode') {
      return <div className="text-sm text-gray-500 mt-0.5 font-medium">Failure Mode</div>;
    }

    const nextType = getNextNodeType(selectedNode.type);
    const nextTypeLabel = nextType ? NODE_TYPE_CONFIG[nextType]?.label : 'Item';
    const childCount = selectedNode.childIds.length;

    return (
      <div className="flex items-center gap-1.5 text-sm mt-0.5">
        <span className="text-gray-500 font-medium">{NODE_TYPE_CONFIG[selectedNode.type]?.label}</span>
        <span className="text-gray-300">•</span>
        <span className="text-gray-500">
          <strong className="text-gray-700 font-semibold">{childCount}</strong> {nextTypeLabel}{childCount !== 1 ? 's' : ''}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-0 relative">
      {/* Global overlay for bulk operations (blocking) */}
      {isAiLoading && !loadingNodeId && (
        <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm rounded-lg flex items-center justify-center p-4">
          <AILoadingIndicator className="shadow-2xl" />
        </div>
      )}

      {/* Floating toast for single row refinement (non-blocking) */}
      {isAiLoading && loadingNodeId && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <AILoadingIndicator inline className="shadow-xl shadow-indigo-500/10 bg-white/95 backdrop-blur-md border border-indigo-100 pr-8" />
        </div>
      )}

      {/* ── Page Header & Action Bar Section ── */}
      <div className="pb-4 mb-4 border-b border-gray-200 sticky top-0 z-30 bg-white/95 backdrop-blur-md pt-3 -mt-3 shadow-sm flex flex-col gap-3">
        {/* Top Row: Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <HierarchyBreadcrumb />
          </div>
        </div>

        {/* Bottom Row: Title + Subtitle and Actions */}
        <div className="flex flex-wrap items-end justify-between gap-4 w-full">
          {/* Icon & Title */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {selectedNode && (
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 shadow-sm shrink-0 [&>svg]:w-5 [&>svg]:h-5">
                {NODE_TYPE_CONFIG[selectedNode.type]?.icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight tracking-tight whitespace-normal break-words">
                {pageTitle}
              </h2>
              {renderSubtitle()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {(failureModeCount > 0 || (selectedNode && selectedNode.type === 'FailureMode')) && (
              <div className="flex items-center gap-2 flex-shrink-0 animate-in fade-in duration-300 mr-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm shadow-sm transition-all hover:shadow hover:bg-white">
                  <span className="text-gray-500 font-medium tracking-tight">Total FIT</span>
                  <span className={cn(
                    "font-bold font-mono",
                    contextTotalFit > 100 ? "text-red-600" : contextTotalFit >= 10 ? "text-orange-600" : "text-gray-700"
                  )}>
                    {contextTotalFit.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm shadow-sm transition-all hover:shadow hover:bg-white">
                  <span className="text-gray-500 font-medium tracking-tight">Avg DC</span>
                  <span className={cn(
                    "font-bold font-mono",
                    contextAvgDc * 100 < 60 ? "text-red-600" : contextAvgDc * 100 < 90 ? "text-amber-600" : "text-emerald-600"
                  )}>
                    {(contextAvgDc * 100).toFixed(1)}%
                  </span>
                </div>
                {contextDangerousCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-sm shadow-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-red-700 font-bold">{contextDangerousCount} Dangerous</span>
                  </div>
                )}
              </div>
            )}

            {(!selectedId || nextSelectedType) && (
              <>
                <button
                  onClick={handleAddForCurrentContext}
                  disabled={isAiLoading}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg shadow-sm transition-all text-sm font-semibold focus:outline-none focus:ring-2",
                    isAiLoading
                      ? "bg-blue-100 text-blue-300 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500/20"
                  )}
                >
                  <Plus size={16} />
                  <span>Add {manualAddLabel}</span>
                </button>
                <button
                  onClick={handleBulkGenerate}
                  disabled={isAiLoading}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 text-white rounded-lg shadow-sm transition-all text-sm font-semibold focus:outline-none focus:ring-2",
                    isAiLoading
                      ? "bg-purple-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 focus:ring-purple-500/20"
                  )}
                >
                  {isAiLoading && !loadingNodeId ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>
                    {isAiLoading && !loadingNodeId
                      ? `Generating ${bulkGenerateLabel}...`
                      : `Generate ${bulkGenerateLabel}`}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {selectedNode && selectedNode.type === 'FailureMode' ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mt-4">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
             <div className="font-semibold text-gray-800 text-sm uppercase tracking-wider">Failure Mode Details</div>
             <button
                onClick={() => handleRowAiEdit({ original: selectedNode } as Row<FmedaNode>)}
                disabled={isAiLoading}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm",
                  isAiLoading ? "bg-purple-300 text-white cursor-not-allowed" : "bg-purple-600 text-white hover:bg-purple-700"
                )}
             >
                {loadingNodeId === selectedNode.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Refine with AI
             </button>
          </div>
          <div className="p-8 space-y-8 max-w-5xl">
            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Failure Mode Name</label>
              <div className="border border-gray-200 rounded-lg bg-gray-50/50 overflow-hidden shadow-sm">
                <EditableTextCell
                  initialValue={selectedNode.name}
                  onSave={(val) => updateNode(selectedNode.id, { name: val })}
                  multiline
                  className="text-base font-medium px-4 py-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Local Effect</label>
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 shadow-sm min-h-[120px]">
                  <EditableAICell
                    initialValue={selectedNode.localEffect || ''}
                    onSave={(val) => updateNode(selectedNode.id, { localEffect: val })}
                    aiContext={getAiContext({ original: selectedNode } as Row<FmedaNode & { isPlaceholder?: boolean }>)}
                    field="localEffect"
                    multiline
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Safety Mechanism</label>
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 shadow-sm min-h-[120px]">
                  <EditableAICell
                    initialValue={selectedNode.safetyMechanism || ''}
                    onSave={(val) => updateNode(selectedNode.id, { safetyMechanism: val })}
                    aiContext={getAiContext({ original: selectedNode } as Row<FmedaNode & { isPlaceholder?: boolean }>)}
                    field="safetyMechanism"
                    multiline
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6 pt-4 border-t border-gray-100">
              {/* Classification */}
              <div>
                 <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Classification</label>
                 <select
                   value={selectedNode.classification || 'Safe'}
                   onChange={(e) => updateNode(selectedNode.id, { classification: e.target.value as 'Safe' | 'Dangerous' })}
                   className={cn(
                     "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all text-gray-700",
                     selectedNode.classification === 'Dangerous' ? "border-red-300 bg-red-50 text-red-800" : ""
                   )}
                 >
                   <option value="Safe">Safe</option>
                   <option value="Dangerous">Dangerous</option>
                 </select>
              </div>
              {/* DC */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Diagnostic Coverage</label>
                <div className={cn(
                  "border border-gray-200 rounded-lg bg-gray-50/50 px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500",
                  (selectedNode.diagnosticCoverage || 0) * 100 < 60 ? "border-red-300 bg-red-50 text-red-800 focus-within:ring-red-500" :
                  (selectedNode.diagnosticCoverage || 0) * 100 < 90 ? "border-amber-300 bg-amber-50 text-amber-800 focus-within:ring-amber-500" : ""
                )}>
                  <EditableNumberCell
                     initialValue={(selectedNode.diagnosticCoverage || 0) * 100}
                     onSave={(val) => updateNode(selectedNode.id, { diagnosticCoverage: val / 100 })}
                     format={(val) => `${val.toFixed(1)}%`}
                     min={0}
                     max={100}
                     step={0.1}
                     className="bg-transparent font-medium"
                  />
                </div>
              </div>
              {/* FIT Rate */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">FIT Rate</label>
                <div className={cn(
                  "border border-gray-200 rounded-lg bg-gray-50/50 px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500",
                  (selectedNode.fitRate || 0) > 100 ? "border-red-300 bg-red-50 text-red-800 focus-within:ring-red-500" :
                  (selectedNode.fitRate || 0) >= 10 ? "border-orange-300 bg-orange-50 text-orange-800 focus-within:ring-orange-500" : ""
                )}>
                   <EditableNumberCell
                      initialValue={selectedNode.fitRate || 0}
                      onSave={(val) => updateNode(selectedNode.id, { fitRate: val })}
                      min={0}
                      step={0.1}
                      className="bg-transparent font-medium"
                   />
                </div>
              </div>

              {/* Computed fields */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Safe FIT / Dangerous FIT</label>
                <div className="flex items-center gap-2 h-10">
                  <div className="flex-1 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-sm font-bold shadow-sm text-center">
                    {(selectedNode.safeFit || 0).toFixed(1)}
                  </div>
                  <div className="text-gray-400">/</div>
                  <div className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm font-bold shadow-sm text-center">
                    {(selectedNode.dangerousFit || 0).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[16rem] max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={globalFilter}
                  onChange={(event) => setGlobalFilter(event.target.value)}
                  placeholder={selectedNode ? `Search within ${selectedNode.name}` : 'Search names, effects, mechanisms, FIT, or classification'}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-700 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {globalFilter && (
                  <button
                    type="button"
                    onClick={() => setGlobalFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <label className="flex min-w-[13rem] flex-col gap-1 text-xs font-medium text-gray-500">
                Failure mode name
                <input
                  aria-label="Filter by failure mode name"
                  value={nameFilterValue}
                  onChange={(event) => nameColumn?.setFilterValue(event.target.value || undefined)}
                  placeholder="Contains..."
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-gray-500">
                Type
                <select
                  aria-label="Filter by type"
                  value={typeFilterValue}
                  onChange={(event) => typeColumn?.setFilterValue(event.target.value || undefined)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">All types</option>
                  {typeFacetOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-[11rem] flex-col gap-1 text-xs font-medium text-gray-500">
                Classification
                <select
                  aria-label="Filter by classification"
                  value={classificationFilterValue}
                  onChange={(event) => classificationColumn?.setFilterValue(event.target.value || undefined)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">All classifications</option>
                  {classificationFacetOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2 self-end">
                {hasActiveAnyFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalFilter('');
                      setColumnFilters([]);
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    Clear filters
                  </button>
                )}

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Table view options"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      <Columns3 className="h-4 w-4" />
                      View
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[22rem] space-y-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-gray-900">Table view</div>
                      <div className="text-xs text-gray-500">
                        Toggle columns, pin them left or right, and drag header edges to resize.
                      </div>
                    </div>

                    <div className="space-y-2">
                      {table.getAllLeafColumns().map((column) => {
                        const pinned = column.getIsPinned();

                        return (
                          <div key={column.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2">
                            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={column.getIsVisible()}
                                disabled={!column.getCanHide()}
                                onChange={column.getToggleVisibilityHandler()}
                                aria-label={`Toggle ${COLUMN_LABELS[column.id] ?? column.id} column`}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className={cn(!column.getCanHide() && 'text-gray-400')}>
                                {COLUMN_LABELS[column.id] ?? column.id}
                              </span>
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => column.pin(pinned === 'left' ? false : 'left')}
                                aria-label={`Pin ${COLUMN_LABELS[column.id] ?? column.id} left`}
                                className={cn(
                                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                                  pinned === 'left'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                )}
                              >
                                Left
                              </button>
                              <button
                                type="button"
                                onClick={() => column.pin(pinned === 'right' ? false : 'right')}
                                aria-label={`Pin ${COLUMN_LABELS[column.id] ?? column.id} right`}
                                className={cn(
                                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                                  pinned === 'right'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                )}
                              >
                                Right
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
                        setColumnPinning(DEFAULT_COLUMN_PINNING);
                        setColumnSizing(DEFAULT_COLUMN_SIZING);
                        table.resetColumnSizing();
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      Reset view
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-500">
                Local effect
                <input
                  aria-label="Filter by local effect"
                  value={localEffectFilterValue}
                  onChange={(event) => localEffectColumn?.setFilterValue(event.target.value || undefined)}
                  placeholder="Contains..."
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-500">
                Safety mechanism
                <input
                  aria-label="Filter by safety mechanism"
                  value={safetyMechanismFilterValue}
                  onChange={(event) => safetyMechanismColumn?.setFilterValue(event.target.value || undefined)}
                  placeholder="Contains..."
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-500">
                DC min/max
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Minimum diagnostic coverage"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.1}
                    value={diagnosticCoverageFilterValue.min ?? ''}
                    onChange={(event) => updateNumericColumnFilter('diagnosticCoverage', { min: event.target.value })}
                    placeholder="Min %"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <input
                    aria-label="Maximum diagnostic coverage"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.1}
                    value={diagnosticCoverageFilterValue.max ?? ''}
                    onChange={(event) => updateNumericColumnFilter('diagnosticCoverage', { max: event.target.value })}
                    placeholder="Max %"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-gray-500">
                FIT min/max
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Minimum FIT rate"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.1}
                    value={fitRateFilterValue.min ?? ''}
                    onChange={(event) => updateNumericColumnFilter('fitRate', { min: event.target.value })}
                    placeholder="Min"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <input
                    aria-label="Maximum FIT rate"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.1}
                    value={fitRateFilterValue.max ?? ''}
                    onChange={(event) => updateNumericColumnFilter('fitRate', { max: event.target.value })}
                    placeholder="Max"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </label>

              <div className="flex flex-col justify-end rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">Spreadsheet shortcuts</span>
                <span className="mt-1">Copy: Ctrl/Cmd+C</span>
                <span>Paste: Ctrl/Cmd+V</span>
                <span>Fill down: Ctrl/Cmd+D</span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
                {allRows.length} visible row{allRows.length === 1 ? '' : 's'}
              </span>
              {selectedRowIds.length > 0 && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                  {selectedRowIds.length} selected
                </span>
              )}
              {selectedFailureModeCount > 0 && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                  {selectedFailureModeCount} failure mode{selectedFailureModeCount === 1 ? '' : 's'} selected
                </span>
              )}
              {selectionRange && activeCell && (
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
                  Active cell: {COLUMN_LABELS[activeCell.columnId]} ({selectionRange.anchor.rowId === selectionRange.focus.rowId && selectionRange.anchor.columnId === selectionRange.focus.columnId ? 'single' : 'range'})
                </span>
              )}
              {selectedFailureModeCount > 0 && (
                <button
                  type="button"
                  onClick={openBulkEditor}
                  className="rounded-full bg-blue-600 px-2.5 py-1 font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Bulk edit selected
                </button>
              )}
              {hasActiveAnyFilter && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                  Filtered from current hierarchy scope
                </span>
              )}
              {sortColumnLabel && (
                <button
                  type="button"
                  onClick={() => setSorting([])}
                  className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 transition-colors hover:bg-amber-100"
                  title="Clear active sorting"
                >
                  Sorted by {sortColumnLabel} ({activeSort?.desc ? 'desc' : 'asc'})
                </button>
              )}
              {allRows.length > 0 && !allVisibleRowsSelected && (
                <button
                  type="button"
                  onClick={selectAllVisibleRows}
                  className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  Select all visible
                </button>
              )}
              {selectedRowIds.length > 0 && (
                <button
                  type="button"
                  onClick={clearRowSelection}
                  className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  Clear selection
                </button>
              )}
              {selectionRange && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCell(null);
                    setSelectionRange(null);
                  }}
                  className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  Clear cell range
                </button>
              )}
              <span className="text-gray-400">
                Use failure mode checkboxes to build a selection in the current view
              </span>
            </div>
          </div>

          {selectedFailureModeCount > 0 && (
            <form
              ref={bulkEditorRef}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-indigo-50 px-4 py-3 shadow-sm"
              onSubmit={(event) => {
                event.preventDefault();
                handleApplyBulkUpdates();
              }}
            >
              <div className="min-w-[14rem] flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  Bulk edit selected failure modes
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>
                    Applying changes to {selectedFailureModeCount} selected failure mode{selectedFailureModeCount === 1 ? '' : 's'}.
                  </span>
                  {bulkUpdateMessage && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                      {bulkUpdateMessage}
                    </span>
                  )}
                </div>
              </div>

              <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-gray-600">
                Classification
                <select
                  ref={bulkClassificationRef}
                  aria-label="Bulk classification"
                  value={bulkClassification}
                  onChange={(event) => setBulkClassification(event.target.value as '' | 'Safe' | 'Dangerous')}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">No change</option>
                  <option value="Safe">Safe</option>
                  <option value="Dangerous">Dangerous</option>
                </select>
              </label>

              <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600">
                DC (%)
                <input
                  aria-label="Bulk diagnostic coverage"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.1}
                  value={bulkDiagnosticCoverage}
                  onChange={(event) => setBulkDiagnosticCoverage(event.target.value)}
                  placeholder="No change"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600">
                FIT rate
                <input
                  aria-label="Bulk FIT rate"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  value={bulkFitRate}
                  onChange={(event) => setBulkFitRate(event.target.value)}
                  placeholder="No change"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!hasPendingBulkUpdates}
                  className={cn(
                    'rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition-all',
                    hasPendingBulkUpdates
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-100 text-blue-300 cursor-not-allowed',
                  )}
                >
                  Apply to selection
                </button>
                {hasPendingBulkUpdates && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkClassification('');
                      setBulkDiagnosticCoverage('');
                      setBulkFitRate('');
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    Reset
                  </button>
                )}
              </div>
            </form>
          )}

          <div
            ref={scrollContainerRef}
            aria-label="FMEDA spreadsheet grid"
            onKeyDownCapture={handleTableKeyDown}
            onCopyCapture={handleSpreadsheetCopy}
            onPasteCapture={handleSpreadsheetPaste}
            tabIndex={0}
            className="overflow-auto border border-gray-200 rounded-lg shadow-sm h-[clamp(24rem,calc(100vh-15rem),48rem)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
          {/* FIX #9: Single border strategy — wrapper border only, no border-x on cells */}
          <table
            className={cn("table-fixed divide-y divide-gray-200", TABLE_MIN_WIDTH_CLASS)}
            style={{ width: table.getTotalSize() }}
          >
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        "border-r border-gray-200 px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 last:border-r-0",
                        header.column.getIsPinned() === 'left' && cn("bg-gray-50", LEFT_PINNED_COLUMN_SHADOW_CLASS),
                        header.column.getIsPinned() === 'right' && cn("bg-gray-50", RIGHT_PINNED_COLUMN_SHADOW_CLASS),
                      )}
                      style={getPinnedColumnStyles(header.column, { isHeader: true })}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="relative flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </div>
                          {header.column.getCanResize() && (
                            <div
                              onDoubleClick={() => header.column.resetSize()}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className="absolute right-[-3px] top-0 h-full w-1.5 cursor-col-resize rounded-full bg-transparent transition-colors hover:bg-blue-200"
                            />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {allRows.length > 0 ? (
                <>
                  {paddingTop > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={visibleColumnCount} className="p-0 border-0" style={{ height: paddingTop }} />
                    </tr>
                  )}
                  {virtualItems.map((item) => {
                  const row = allRows[item.index];
                  const rowIndex = item.index;
                  const isPlaceholder = row.original.id.startsWith('placeholder-');

                  if (isPlaceholder) {
                    const typeConfig = NODE_TYPE_CONFIG[row.original.type];
                    const pinnedNameColumn = table.getColumn(PINNED_HIERARCHY_COLUMN_ID);

                    return (
                      <tr
                        key={row.id}
                        ref={(element) => registerRow(rowIndex, element)}
                        className="transition-all border-b border-gray-100 bg-gray-50/20"
                      >
                        <td
                          className={cn(
                            "border-r border-gray-200 bg-gray-50 px-2 py-2 text-sm",
                            typeConfig && "border-l-[4px]",
                            typeConfig && typeConfig.accentClass.replace('bg-', 'border-l-'),
                            pinnedNameColumn?.getIsPinned() === 'left' && LEFT_PINNED_COLUMN_SHADOW_CLASS,
                            pinnedNameColumn?.getIsPinned() === 'right' && RIGHT_PINNED_COLUMN_SHADOW_CLASS,
                          )}
                          style={getPinnedColumnStyles(pinnedNameColumn)}
                        >
                          <button
                            onClick={() => {
                              const parent = row.original.parentId ? nodes[row.original.parentId] : null;
                              if (parent) handleAddChild(parent);
                            }}
                            data-spreadsheet-ignore="true"
                            className="flex items-center gap-2 text-blue-500/80 hover:text-blue-700 font-medium transition-all px-3 py-2 rounded-md hover:bg-white w-[85%] text-left border border-blue-50 hover:border-blue-200 hover:shadow-sm"
                            style={{ marginLeft: `${row.depth * 1.25 + 1.25}rem` }}
                          >
                            <Plus size={15} className="shrink-0" />
                            <span className="italic">{row.original.name}</span>
                          </button>
                        </td>
                        {visibleColumnCount > 1 && (
                          <td colSpan={visibleColumnCount - 1} className="px-0 py-0" />
                        )}
                      </tr>
                    );
                  }

                  // FIX #6: Color by node type, not by depth
                  const typeConfig = NODE_TYPE_CONFIG[row.original.type];
                  const rowClass = typeConfig.rowClass;
                  const isSelected = row.getIsSelected();

                  return (
                    <tr
                      key={row.id}
                      ref={(element) => registerRow(rowIndex, element)}
                      className={cn(
                        rowClass,
                        isSelected ? "bg-blue-50/80" : "hover:brightness-[0.97]",
                        "transition-all"
                      )}
                    >
                      {row.getVisibleCells().map((cell, colIndex) => (
                        (() => {
                          const isEditableCell = isSpreadsheetCell(row.original, cell.column.id);
                          const isActiveSpreadsheetCell =
                            activeCell?.rowId === row.original.id && activeCell.columnId === cell.column.id;
                          const isWithinSpreadsheetSelection = isCellSelected(row.original.id, cell.column.id);

                          return (
                            <td
                              key={cell.id}
                              className={cn(
                                "relative border-r border-gray-200 px-2 py-3 text-sm whitespace-normal group/cell last:border-r-0",
                                colIndex === 0 && "border-l-[4px]",
                                colIndex === 0 && typeConfig.accentClass.replace('bg-', 'border-l-'),
                                isEditableCell && "cursor-cell select-none",
                                cell.column.getIsPinned() === 'left'
                                  ? cn(
                                      "border-r border-gray-200",
                                      isSelected ? "bg-blue-50/95 text-blue-950" : typeConfig.stickyCellClass,
                                      LEFT_PINNED_COLUMN_SHADOW_CLASS,
                                    )
                                  : cell.column.getIsPinned() === 'right'
                                    ? cn(
                                        "border-r border-gray-200",
                                        isSelected ? "bg-blue-50/95 text-blue-950" : typeConfig.stickyCellClass,
                                        RIGHT_PINNED_COLUMN_SHADOW_CLASS,
                                      )
                                    : isSelected
                                    ? "bg-blue-50/70"
                                    : "",
                                isWithinSpreadsheetSelection && "bg-indigo-50/70",
                                isActiveSpreadsheetCell && "ring-2 ring-inset ring-indigo-500 bg-indigo-50/90"
                              )}
                              style={getPinnedColumnStyles(cell.column)}
                              data-row-index={rowIndex}
                              data-col-index={colIndex}
                              data-row-id={row.original.id}
                              data-column-id={cell.column.id}
                              onMouseDownCapture={(event) => {
                                if (!isEditableCell) {
                                  return;
                                }

                                const target = event.target as HTMLElement;
                                if (target.closest('[data-spreadsheet-ignore="true"]')) {
                                  return;
                                }

                                setSpreadsheetSelection(
                                  {
                                    rowId: row.original.id,
                                    columnId: cell.column.id as EditableColumnId,
                                  },
                                  { extend: event.shiftKey, focus: false }
                                );
                              }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })()
                      ))}
                    </tr>
                  );
                })}
                  {paddingBottom > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={visibleColumnCount} className="p-0 border-0" style={{ height: paddingBottom }} />
                    </tr>
                  )}
                </>
              ) : (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
                    className="px-6 py-14 text-center"
                  >
                    <p className="text-gray-500 font-medium text-sm">{emptyState.title}</p>
                    <p className="text-gray-400 text-xs mt-1 max-w-xs mx-auto">{emptyState.sub}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
};
