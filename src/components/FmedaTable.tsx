import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
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
import { useDevRenderProfile } from '../hooks/useDevRenderProfile';
import { useVirtualWindow } from '../hooks/useVirtualWindow';


type TableRowData = FmedaNode & { isPlaceholder?: boolean };

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
const PINNED_COLUMN_SHADOW_CLASS = 'shadow-[6px_0_12px_-10px_rgba(15,23,42,0.28)]';

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

export const FmedaTable: React.FC = () => {
  const nodes = useFmedaStore(selectVisibleNodes);
  const selectedId = useFmedaStore((state) => state.selectedId);
  const updateNode = useFmedaStore((state) => state.updateNode);
  const deleteNode = useFmedaStore((state) => state.deleteNode);
  const addNode = useFmedaStore((state) => state.addNode);
  const setSelectedId = useFmedaStore((state) => state.setSelectedId);
  const projectContext = useFmedaStore((state) => state.projectContext);

  const aiConfig = useAIStore((state) => state.config);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loadingNodeId, setLoadingNodeId] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const selectedNode = selectedId ? nodes[selectedId] ?? null : null;
  const hasActiveFilter = globalFilter.trim().length > 0;
  const hasActiveTableTransforms = hasActiveFilter || sorting.length > 0;

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
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const selectableRowIdsRef = useRef<string[]>([]);
  const lastSelectedRowIdRef = useRef<string | null>(null);
  const pendingCheckboxRangeRef = useRef(false);
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);

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
    setSelectedRowIds([]);
    lastSelectedRowIdRef.current = null;
  }, []);

  const selectAllVisibleRows = useCallback(() => {
    const selectableRowIds = selectableRowIdsRef.current;
    setSelectedRowIds(selectableRowIds);
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
      setSelectedRowIds((current) => {
        const isCurrentlySelected = current.includes(rowId);
        const shouldSelect = options.shouldSelect ?? !isCurrentlySelected;

        if (options.mode === 'replace') {
          return shouldSelect ? [rowId] : [];
        }

        if (options.mode === 'range' && lastSelectedRowIdRef.current) {
          const rangeIds = getRangeSelection(lastSelectedRowIdRef.current, rowId);
          const nextSelection = new Set(current);

          rangeIds.forEach((id) => {
            if (shouldSelect) {
              nextSelection.add(id);
            } else {
              nextSelection.delete(id);
            }
          });

          return Array.from(nextSelection);
        }

        const nextSelection = new Set(current);
        if (shouldSelect) {
          nextSelection.add(rowId);
        } else {
          nextSelection.delete(rowId);
        }
        return Array.from(nextSelection);
      });

      lastSelectedRowIdRef.current = rowId;
    },
    [getRangeSelection]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        id: 'name',
        header: ({ column }) => {
          const sort = column.getIsSorted();

          return (
            <button
              type="button"
              onClick={column.getToggleSortingHandler()}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by hierarchy name"
            >
              <span>Hierarchy / Name</span>
              {sort === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : sort === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
              )}
            </button>
          );
        },
        cell: ({ row, getValue }) => {
          const isFailureMode = row.original.type === 'FailureMode';
          const isRenaming = renamingId === row.original.id;
          const isSelected = selectedRowIdSet.has(row.original.id);
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
                onClickCapture={(event) => event.stopPropagation()}
                aria-label={`Select row ${row.original.name}`}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
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
      columnHelper.accessor((row) => row.localEffect || '', {
        id: 'localEffect',
        header: ({ column }) => {
          const sort = column.getIsSorted();

          return (
            <button
              type="button"
              onClick={column.getToggleSortingHandler()}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by local effect"
            >
              <span>Local Effect</span>
              {sort === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : sort === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
              )}
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
        header: ({ column }) => {
          const sort = column.getIsSorted();

          return (
            <button
              type="button"
              onClick={column.getToggleSortingHandler()}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by safety mechanism"
            >
              <span>Safety Mechanism</span>
              {sort === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : sort === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
              )}
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
        header: ({ column }) => {
          const sort = column.getIsSorted();

          return (
            <button
              type="button"
              onClick={column.getToggleSortingHandler()}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by diagnostic coverage"
            >
              <span>DC (%)</span>
              {sort === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : sort === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
              )}
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
        header: ({ column }) => {
          const sort = column.getIsSorted();

          return (
            <button
              type="button"
              onClick={column.getToggleSortingHandler()}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-700"
              title="Sort by FIT rate"
            >
              <span>FIT Rate</span>
              {sort === 'asc' ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : sort === 'desc' ? (
                <ArrowDown className="h-3.5 w-3.5" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
              )}
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
        cell: (info) => (
          <div className="flex items-center gap-1 justify-end">
            {getNextNodeType(info.row.original.type) && (
              <button
                onClick={() => handleAddChild(info.row.original)}
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
      handleAddChild,
      handleCellSave,
      handleDelete,
      handleRowAiEdit,
      isAiLoading,
      loadingNodeId,
      renamingId,
      selectedRowIdSet,
      setRenamingId,
      setSelectedId,
      toggleRowSelection,
    ]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      expanded: hasActiveFilter ? true : expanded,
      globalFilter,
      sorting,
    },
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setGlobalFilter,
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
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    filterFromLeafRows: true,
    maxLeafRowFilterDepth: 8,
  });

  const allRows = table.getRowModel().rows;
  const selectableRowIds = useMemo(
    () => allRows.filter((row) => !row.original.id.startsWith('placeholder-')).map((row) => row.original.id),
    [allRows]
  );
  const selectedRows = useMemo(
    () => allRows.filter((row) => selectedRowIdSet.has(row.original.id)),
    [allRows, selectedRowIdSet]
  );
  const selectedFailureModeCount = useMemo(
    () => selectedRows.filter((row) => row.original.type === 'FailureMode').length,
    [selectedRows]
  );
  const allVisibleRowsSelected =
    selectableRowIds.length > 0 && selectedRowIds.length === selectableRowIds.length;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
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
  selectableRowIdsRef.current = selectableRowIds;

  useEffect(() => {
    const visibleRowIdSet = new Set(selectableRowIds);

    setSelectedRowIds((current) => {
      const next = current.filter((id) => visibleRowIdSet.has(id));
      return next.length === current.length ? current : next;
    });

    if (lastSelectedRowIdRef.current && !visibleRowIdSet.has(lastSelectedRowIdRef.current)) {
      lastSelectedRowIdRef.current = null;
    }
  }, [selectableRowIds]);

  useDevRenderProfile('FmedaTable', {
    selectedId: selectedId ?? 'all',
    totalRows: allRows.length,
    renderedRows: virtualItems.length,
    isVirtualized,
    selectedRows: selectedRowIds.length,
  });

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    const target = e.target as HTMLElement;
    const cell = target.closest('td');
    if (!cell) return;

    const rowIndex = parseInt(cell.getAttribute('data-row-index') || '-1');
    const colIndex = parseInt(cell.getAttribute('data-col-index') || '-1');

    if (rowIndex === -1 || colIndex === -1) return;

    let nextRow = rowIndex;
    let nextCol = colIndex;

    const totalRows = allRows.length;
    const totalCols = table.getVisibleLeafColumns().length;

    switch (e.key) {
      case 'ArrowUp': nextRow--; break;
      case 'ArrowDown': nextRow++; break;
      case 'ArrowLeft': nextCol--; break;
      case 'ArrowRight': nextCol++; break;
    }

    if (nextRow >= 0 && nextRow < totalRows && nextCol >= 0 && nextCol < totalCols) {
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

      e.preventDefault();
    }
  }, [allRows.length, scrollToIndex, table]);

  // FIX #14: Context-aware empty state message
  const getEmptyStateMessage = () => {
    if (hasActiveFilter) {
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
  const sortColumnLabel = activeSort
    ? ({
        name: 'name',
        localEffect: 'local effect',
        safetyMechanism: 'safety mechanism',
        diagnosticCoverage: 'diagnostic coverage',
        fitRate: 'FIT rate',
      }[activeSort.id] ?? activeSort.id)
    : null;

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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
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
              {hasActiveFilter && (
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
              <span className="text-gray-400">
                Use row checkboxes to build a selection in the current view
              </span>
            </div>
          </div>

          <div
            ref={scrollContainerRef}
            className="overflow-auto border border-gray-200 rounded-lg shadow-sm h-[clamp(24rem,calc(100vh-15rem),48rem)]"
          >
          {/* FIX #9: Single border strategy — wrapper border only, no border-x on cells */}
          <table className={cn("w-full table-fixed divide-y divide-gray-200", TABLE_MIN_WIDTH_CLASS)}>
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, i) => (
                    <th
                      key={header.id}
                      className={cn(
                        "border-r border-gray-200 px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 last:border-r-0",
                        i === 0 ? "w-[24rem] min-w-[24rem]" : "",
                        i === 1 || i === 2 ? "w-[20rem] min-w-[20rem]" : "",
                        i === 3 || i === 4 ? "w-[8.5rem] min-w-[8.5rem]" : "",
                        i === 5 ? "w-[7rem] min-w-[7rem]" : "",
                        header.column.id === PINNED_HIERARCHY_COLUMN_ID
                          ? cn("sticky left-0 z-30 border-r border-gray-200 bg-gray-50", PINNED_COLUMN_SHADOW_CLASS)
                          : "",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-white divide-y divide-gray-100" onKeyDown={handleTableKeyDown}>
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

                    return (
                      <tr
                        key={row.id}
                        ref={(element) => registerRow(rowIndex, element)}
                        className="transition-all border-b border-gray-100 bg-gray-50/20"
                      >
                        <td
                          className={cn(
                            "sticky left-0 z-10 border-r border-gray-200 bg-gray-50 px-2 py-2 text-sm",
                            typeConfig && "border-l-[4px]",
                            typeConfig && typeConfig.accentClass.replace('bg-', 'border-l-'),
                            PINNED_COLUMN_SHADOW_CLASS,
                          )}
                        >
                          <button
                            onClick={() => {
                              const parent = row.original.parentId ? nodes[row.original.parentId] : null;
                              if (parent) handleAddChild(parent);
                            }}
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
                  const isSelected = selectedRowIdSet.has(row.original.id);

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
                        <td
                          key={cell.id}
                          className={cn(
                            "relative border-r border-gray-200 px-2 py-3 text-sm whitespace-normal group/cell last:border-r-0",
                            colIndex === 0 && "border-l-[4px]",
                            colIndex === 0 && typeConfig.accentClass.replace('bg-', 'border-l-'),
                            cell.column.id === PINNED_HIERARCHY_COLUMN_ID
                              ? cn(
                                  "sticky left-0 z-10 border-r border-gray-200",
                                  isSelected ? "bg-blue-50/95 text-blue-950" : typeConfig.stickyCellClass,
                                  PINNED_COLUMN_SHADOW_CLASS,
                                )
                              : isSelected
                                ? "bg-blue-50/70"
                                : "",
                          )}
                          data-row-index={rowIndex}
                          data-col-index={colIndex}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
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
