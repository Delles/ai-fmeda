import React, { useMemo, useRef, useState } from 'react';
import { selectRootNodeIds, useFmedaStore } from '../store/fmedaStore';
import { FmedaNodeType } from '../types/fmeda';
import {
  ChevronRight,
  ChevronDown,
  Layers,
  Box,
  Cpu,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useDevRenderProfile } from '../hooks/useDevRenderProfile';
import { useVirtualWindow } from '../hooks/useVirtualWindow';

const SIDEBAR_ROW_ESTIMATE = 34;

const NodeIcon = ({ type, className }: { type: FmedaNodeType; className?: string }) => {
  switch (type) {
    case 'System':
      return <Layers className={cn('w-4 h-4 text-blue-600', className)} />;
    case 'Subsystem':
      return <Box className={cn('w-4 h-4 text-indigo-600', className)} />;
    case 'Component':
      return <Cpu className={cn('w-4 h-4 text-purple-600', className)} />;
    case 'Function':
      return <Activity className={cn('w-4 h-4 text-emerald-600', className)} />;
    case 'FailureMode':
      return <AlertTriangle className={cn('w-4 h-4 text-amber-500', className)} />;
    default:
      return null;
  }
};

interface FlattenedTreeItem {
  nodeId: string;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export const SidebarLeft: React.FC = () => {
  const nodes = useFmedaStore((state) => state.nodes);
  const selectedId = useFmedaStore((state) => state.selectedId);
  const setSelectedId = useFmedaStore((state) => state.setSelectedId);
  const rootNodeIds = useFmedaStore(selectRootNodeIds);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, true>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const flattenedItems = useMemo<FlattenedTreeItem[]>(() => {
    const items: FlattenedTreeItem[] = [];

    const visit = (nodeId: string, level: number) => {
      const node = nodes[nodeId];
      if (!node) return;

      const hasChildren = node.childIds.length > 0;
      const isExpanded = !collapsedIds[nodeId];

      items.push({
        nodeId,
        level,
        hasChildren,
        isExpanded,
      });

      if (hasChildren && isExpanded) {
        node.childIds.forEach((childId) => visit(childId, level + 1));
      }
    };

    rootNodeIds.forEach((nodeId) => visit(nodeId, 0));
    return items;
  }, [collapsedIds, nodes, rootNodeIds]);

  const { totalSize, virtualItems, registerItem } = useVirtualWindow({
    count: flattenedItems.length,
    estimateSize: SIDEBAR_ROW_ESTIMATE,
    overscan: 10,
    scrollRef,
    enabled: flattenedItems.length > 24,
  });

  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? Math.max(0, totalSize - virtualItems[virtualItems.length - 1].end)
      : 0;
  const isVirtualized = flattenedItems.length > 24;

  useDevRenderProfile('SidebarLeft', {
    totalItems: flattenedItems.length,
    renderedItems: virtualItems.length,
    collapsedCount: Object.keys(collapsedIds).length,
    isVirtualized,
  });

  const toggleNode = (nodeId: string) => {
    setCollapsedIds((current) => {
      if (current[nodeId]) {
        const next = { ...current };
        delete next[nodeId];
        return next;
      }

      return { ...current, [nodeId]: true };
    });
  };

  return (
    <aside className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hierarchy</h2>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {rootNodeIds.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500 italic">
            No nodes found. Start by creating a project.
          </div>
        ) : (
          <div className="space-y-0.5">
            {paddingTop > 0 && <div aria-hidden="true" style={{ height: paddingTop }} />}
            {virtualItems.map((item) => {
              const treeItem = flattenedItems[item.index];
              const node = treeItem ? nodes[treeItem.nodeId] : null;

              if (!treeItem || !node) {
                return null;
              }

              return (
                <div
                  key={treeItem.nodeId}
                  ref={(element) => registerItem(item.index, element)}
                  className="select-none"
                >
                  <div
                    className={cn(
                      'flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 rounded-md transition-colors group',
                      selectedId === treeItem.nodeId && 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    )}
                    style={{ paddingLeft: `${treeItem.level * 12 + 8}px` }}
                    onClick={() => setSelectedId(treeItem.nodeId)}
                  >
                    <div
                      className="w-4 h-4 mr-1 flex items-center justify-center flex-shrink-0"
                      onClick={(event) => {
                        if (!treeItem.hasChildren) return;
                        event.stopPropagation();
                        toggleNode(treeItem.nodeId);
                      }}
                    >
                      {treeItem.hasChildren ? (
                        treeItem.isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-gray-400" />
                        )
                      ) : null}
                    </div>
                    <NodeIcon type={node.type} className="mr-2 flex-shrink-0" />
                    <span className="text-sm font-medium truncate" title={node.name}>
                      {node.name}
                    </span>
                  </div>
                </div>
              );
            })}
            {paddingBottom > 0 && <div aria-hidden="true" style={{ height: paddingBottom }} />}
          </div>
        )}
      </div>
    </aside>
  );
};
