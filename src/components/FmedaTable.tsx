import React, { useMemo, useState, useCallback } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  ExpandedState,
  Row,
} from '@tanstack/react-table';
import {
  Trash2,
  Plus,
  Download,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Layers,
  Box,
  Cpu,
  Activity,
  AlertTriangle,
  FileJson,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';
import { FmedaNode, FmedaNodeType } from '../types/fmeda';
import { useFmedaStore } from '../store/fmedaStore';
import { exportToJson } from '../utils/export';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { EditableTextCell } from './cells/EditableTextCell';
import { EditableNumberCell } from './cells/EditableNumberCell';
import { EditableAICell } from './cells/EditableAICell';
import { DocumentUpload } from './DocumentUpload';
import { useConfirm } from '../hooks/useConfirm';
import { generateId } from '../utils/id';
import { cn } from '../lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu';

const columnHelper = createColumnHelper<FmedaNode & { isPlaceholder?: boolean }>();

// FIX #6 & #3: Node type icon for table rows + breadcrumb
const NODE_TYPE_CONFIG: Record<FmedaNodeType, { icon: React.ReactNode; rowClass: string; label: string; accentClass: string }> = {
  System: {
    icon: <Layers className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />,
    rowClass: 'bg-blue-50/80 text-blue-900 border-b border-blue-100 font-semibold',
    accentClass: 'bg-blue-600',
    label: 'System',
  },
  Subsystem: {
    icon: <Box className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />,
    rowClass: 'bg-indigo-50/60 text-indigo-900 border-b border-indigo-100 font-medium',
    accentClass: 'bg-indigo-500',
    label: 'Subsystem',
  },
  Component: {
    icon: <Cpu className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />,
    rowClass: 'bg-purple-50/40 text-purple-900 border-b border-purple-100 font-medium',
    accentClass: 'bg-purple-400',
    label: 'Component',
  },
  Function: {
    icon: <Activity className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />,
    rowClass: 'bg-emerald-50/30 text-emerald-900 border-b border-emerald-100',
    accentClass: 'bg-emerald-400',
    label: 'Function',
  },
  FailureMode: {
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
    rowClass: 'bg-white text-gray-700 border-b border-gray-100',
    accentClass: 'bg-gray-200',
    label: 'Failure Mode',
  },
};

// FIX #3: Breadcrumb component
const HierarchyBreadcrumb: React.FC<{ selectedId: string | null }> = ({ selectedId }) => {
  const { nodes, setSelectedId } = useFmedaStore();

  if (!selectedId) return null;

  // Build ancestor chain from root to selected
  const ancestors: FmedaNode[] = [];
  let current: FmedaNode | null = nodes[selectedId] ?? null;
  while (current) {
    ancestors.unshift(current);
    current = current.parentId ? (nodes[current.parentId] ?? null) : null;
  }

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

export const FmedaTable: React.FC = () => {
  const {
    nodes,
    selectedId,
    updateNode,
    deleteNode,
    addNode,
    setSelectedId
  } = useFmedaStore();

  const tableData = useMemo(() => {
    if (!selectedId) {
      return Object.values(nodes).filter(n => !n.parentId);
    }

    const selectedNode = nodes[selectedId];
    if (!selectedNode) return [];

    const children = selectedNode.childIds.map(id => nodes[id]).filter(Boolean) as (FmedaNode & { isPlaceholder?: boolean })[];
    const nextType = getNextNodeType(selectedNode.type);
    if (nextType) {
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
  }, [nodes, selectedId]);

  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const handleExport = () => {
    exportToJson(Object.values(nodes), useFmedaStore.getState().projectContext);
  };

  const handleDelete = async (row: Row<FmedaNode>) => {
    const original = row.original;
    const isConfirmed = await confirm({
      title: `Delete ${original.type}?`,
      description: `Are you sure you want to delete "${original.name}" and all its descendants?`,
      variant: 'destructive',
      confirmText: 'Delete'
    });

    if (isConfirmed) {
      deleteNode(original.id);
    }
  };

  const handleAddChild = (parent: FmedaNode) => {
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
  };

  const getAiContext = (row: Row<FmedaNode & { isPlaceholder?: boolean }>) => {
    let systemName = '';
    let subsystemName = '';
    let componentName = '';
    let functionName = '';
    let failureMode: Partial<FmedaNode> = row.original;

    let current: FmedaNode | null = row.original;
    while (current) {
      if (current.type === 'System') systemName = current.name;
      if (current.type === 'Subsystem') subsystemName = current.name;
      if (current.type === 'Component') componentName = current.name;
      if (current.type === 'Function') functionName = current.name;
      current = current.parentId ? nodes[current.parentId] : null;
    }

    return { systemName, subsystemName, componentName, functionName, failureMode };
  };

  const handleCellSave = (row: Row<FmedaNode & { isPlaceholder?: boolean }>, field: string, value: any) => {
    updateNode(row.original.id, { [field]: value });
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Hierarchy / Name',
        cell: ({ row, getValue }) => (
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: `${row.depth * 1.25}rem` }}
          >
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
            {/* FIX #6: Show type-based icon in every row */}
            {NODE_TYPE_CONFIG[row.original.type]?.icon}
            <div className="flex-1 min-w-0">
              <EditableTextCell
                initialValue={getValue()}
                onSave={(val) => handleCellSave(row, 'name', val)}
                multiline
                className={
                  row.original.type === 'System' ? "font-bold" :
                  row.original.type === 'Subsystem' ? "font-semibold" :
                  row.original.type === 'Component' ? "font-semibold" :
                  row.original.type === 'Function' ? "font-medium" :
                  ""
                }
              />
            </div>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.localEffect || '', {
        id: 'localEffect',
        header: 'Local Effect',
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
        header: 'Safety Mechanism',
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
      columnHelper.accessor((row) => row.diagnosticCoverage || 0, {
        id: 'diagnosticCoverage',
        header: 'DC (%)',
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
      columnHelper.accessor((row) => row.fitRate || 0, {
        id: 'fitRate',
        header: 'FIT Rate',
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
        cell: (info) => (
          // FIX #7: Cleaner actions with more spacing and better icons
          <div className="flex items-center gap-1 justify-end">
            {getNextNodeType(info.row.original.type) && (
              <button
                onClick={() => handleAddChild(info.row.original)}
                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                title={`Add ${getNextNodeType(info.row.original.type)}`}
              >
                <Plus size={15} />
              </button>
            )}
            <button
              onClick={() => setSelectedId(info.row.original.id)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Drill into children"
            >
              {/* FIX #7: ChevronsRight is much clearer than ExternalLink for "drill down" */}
              <ChevronsRight size={15} />
            </button>
            <button
              onClick={() => handleDelete(info.row as any)}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
      }),
    ],
    [deleteNode, addNode, updateNode, nodes, confirm, setSelectedId]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getSubRows: (row) => {
      const children = row.childIds.map(id => nodes[id]).filter(Boolean) as (FmedaNode & { isPlaceholder?: boolean })[];
      const nextType = getNextNodeType(row.type);
      if (nextType) {
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
    getExpandedRowModel: getExpandedRowModel(),
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

    const totalRows = table.getRowModel().rows.length;
    const totalCols = 6;

    switch (e.key) {
      case 'ArrowUp': nextRow--; break;
      case 'ArrowDown': nextRow++; break;
      case 'ArrowLeft': nextCol--; break;
      case 'ArrowRight': nextCol++; break;
    }

    if (nextRow >= 0 && nextRow < totalRows && nextCol >= 0 && nextCol < totalCols) {
      const nextCell = document.querySelector(
        `td[data-row-index="${nextRow}"][data-col-index="${nextCol}"]`
      );

      if (nextCell) {
        const focusable = nextCell.querySelector('button, input, select, textarea') as HTMLElement;
        if (focusable) {
          focusable.focus();
          e.preventDefault();
        }
      }
    }
  }, [table]);

  // FIX #14: Context-aware empty state message
  const getEmptyStateMessage = () => {
    if (!selectedId) return { title: 'No FMEDA data yet', sub: 'Please go back to the Dashboard to create or import a project.' };
    const sel = nodes[selectedId];
    if (!sel) return { title: 'Nothing here', sub: 'No children found.' };
    const nextType = getNextNodeType(sel.type);
    if (!nextType) return { title: 'No children', sub: `${sel.type} nodes are leaf items.` };
    return {
      title: `No ${nextType}s yet`,
      sub: `Add a ${nextType} to "${sel.name}" using the + button in the actions column above, or select a different item.`,
    };
  };

  const emptyState = getEmptyStateMessage();

  // Compute summary stats for KPI badges
  const allNodes = Object.values(nodes);
  const componentCount = allNodes.filter(n => n.type === 'Component').length;
  const functionCount = allNodes.filter(n => n.type === 'Function').length;
  const failureModeCount = allNodes.filter(n => n.type === 'FailureMode').length;
  const failureModes = allNodes.filter(n => n.type === 'FailureMode');
  const totalSystemFit = failureModes.reduce((sum, fm) => sum + (fm.fitRate || 0), 0);
  const avgSystemDc = failureModes.length > 0
    ? failureModes.reduce((sum, fm) => sum + (fm.diagnosticCoverage || 0), 0) / failureModes.length
    : 0;
  const dangerousCount = failureModes.filter(fm => fm.classification === 'Dangerous').length;

  const selectedNode = selectedId ? nodes[selectedId] : null;
  const pageTitle = selectedNode ? selectedNode.name : 'Full System Analysis';
  const pageSubtitle = selectedNode
    ? `${NODE_TYPE_CONFIG[selectedNode.type]?.label} — ${selectedNode.childIds.length} children`
    : `${componentCount} Components • ${functionCount} Functions • ${failureModeCount} Failure Modes`;

  return (
    <div className="space-y-0">
      {/* ── Page Header Section ── */}
      <div className="pb-3 mb-3 border-b border-gray-100 sticky top-0 z-30 bg-white/95 backdrop-blur-sm pt-2 -mt-2">
        {/* Row 1: Title + KPI Badges */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              {selectedNode && (
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
                  {NODE_TYPE_CONFIG[selectedNode.type]?.icon}
                </span>
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">
                  {pageTitle}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{pageSubtitle}</p>
              </div>
            </div>
            {/* Breadcrumb navigation — own row */}
            <div className="mt-2">
              <HierarchyBreadcrumb selectedId={selectedId} />
            </div>
          </div>

          {/* KPI Summary Badges — right side of header */}
          {failureModeCount > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                <span className="text-gray-500 font-medium">Total FIT</span>
                <span className={cn(
                  "font-bold font-mono",
                  totalSystemFit > 100 ? "text-red-600" : totalSystemFit >= 10 ? "text-orange-600" : "text-gray-700"
                )}>
                  {totalSystemFit.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                <span className="text-gray-500 font-medium">Avg DC</span>
                <span className={cn(
                  "font-bold font-mono",
                  avgSystemDc * 100 < 60 ? "text-red-600" : avgSystemDc * 100 < 90 ? "text-amber-600" : "text-emerald-600"
                )}>
                  {(avgSystemDc * 100).toFixed(1)}%
                </span>
              </div>
              {dangerousCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-red-700 font-bold">{dangerousCount} Dangerous</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Action Bar (separated from header) ── */}
      <div className="flex items-center justify-between gap-3 pb-3">
        {/* Left: Document & Data Management */}
        <div className="flex items-center gap-2">
          <DocumentUpload />

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1.5 text-gray-600 px-2.5 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                title="Save As"
              >
                <Download size={14} />
                <span>Save As</span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 p-1.5 border border-gray-200 shadow-lg rounded-xl">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors text-left"
                >
                  <FileJson size={16} className="text-blue-500 shrink-0" />
                  <span>JSON File</span>
                </button>
                <button
                  disabled
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed rounded-lg text-left"
                  title="Coming Soon"
                >
                  <FileCode size={16} className="shrink-0" />
                  <span>XML File (Soon)</span>
                </button>
                <button
                  disabled
                  className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed rounded-lg text-left"
                  title="Coming Soon"
                >
                  <FileSpreadsheet size={16} className="shrink-0" />
                  <span>CSV / Excel (Soon)</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* FIX #9: Single border strategy — wrapper border only, no border-x on cells */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, i) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider",
                      i === 0 ? "w-[25%]" : "",
                      i === 1 || i === 2 ? "w-[22%]" : "",
                      i === 3 || i === 4 ? "w-[10%]" : "",
                      i === 5 ? "w-[11%]" : "",
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, rowIndex) => {
                const isPlaceholder = row.original.id.startsWith('placeholder-');

                if (isPlaceholder) {
                  const typeConfig = NODE_TYPE_CONFIG[row.original.type];

                  return (
                    <tr
                      key={row.id}
                      className="transition-all border-b border-gray-100 bg-gray-50/20"
                    >
                      <td
                        colSpan={6}
                        className={cn(
                          "px-2 py-2 text-sm",
                          typeConfig && "border-l-[4px]",
                          typeConfig && typeConfig.accentClass.replace('bg-', 'border-l-')
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
                    </tr>
                  );
                }

                // FIX #6: Color by node type, not by depth
                const typeConfig = NODE_TYPE_CONFIG[row.original.type];
                const rowClass = typeConfig.rowClass;

                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>
                      <tr
                        className={cn(rowClass, "hover:brightness-[0.97] transition-all")}
                      >
                        {row.getVisibleCells().map((cell, colIndex) => (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-2 py-3 whitespace-normal text-sm relative group/cell",
                              colIndex === 0 && "border-l-[4px]",
                              colIndex === 0 && typeConfig.accentClass.replace('bg-', 'border-l-')
                            )}
                            data-row-index={rowIndex}
                            data-col-index={colIndex}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      {getNextNodeType(row.original.type) && (
                        <ContextMenuItem onClick={() => handleAddChild(row.original)}>
                          <Plus size={14} className="mr-2 text-emerald-600" />
                          Add {getNextNodeType(row.original.type)}
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem onClick={() => setSelectedId(row.original.id)}>
                        <ChevronsRight size={14} className="mr-2 text-blue-600" />
                        Drill Down
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleDelete(row as any)}
                        className="text-red-600 focus:bg-red-50 focus:text-red-700"
                      >
                        <Trash2 size={14} className="mr-2" />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
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
  );
};
