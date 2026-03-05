import React from 'react';
import { useFmedaStore } from '../store/fmedaStore';
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

const NodeIcon = ({ type, className }: { type: FmedaNodeType; className?: string }) => {
  switch (type) {
    case 'System':
      return <Layers className={cn("w-4 h-4 text-blue-600", className)} />;
    case 'Subsystem':
      return <Box className={cn("w-4 h-4 text-indigo-600", className)} />;
    case 'Component':
      return <Cpu className={cn("w-4 h-4 text-purple-600", className)} />;
    case 'Function':
      return <Activity className={cn("w-4 h-4 text-emerald-600", className)} />;
    case 'FailureMode':
      return <AlertTriangle className={cn("w-4 h-4 text-amber-500", className)} />;
    default:
      return null;
  }
};

interface TreeItemProps {
  nodeId: string;
  level: number;
}

const TreeItem: React.FC<TreeItemProps> = ({ nodeId, level }) => {
  const { nodes, selectedId, setSelectedId } = useFmedaStore();
  const node = nodes[nodeId];
  const [isExpanded, setIsExpanded] = React.useState(true);

  if (!node) return null;

  const hasChildren = node.childIds.length > 0;
  const isSelected = selectedId === nodeId;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 rounded-md transition-colors group",
          isSelected && "bg-blue-50 text-blue-700 hover:bg-blue-100"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => setSelectedId(nodeId)}
      >
        <div 
          className="w-4 h-4 mr-1 flex items-center justify-center flex-shrink-0"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {hasChildren && (
            isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />
          )}
        </div>
        <NodeIcon type={node.type} className="mr-2 flex-shrink-0" />
        {/* FIX #4: Add title for native tooltip on truncated names */}
        <span className="text-sm font-medium truncate" title={node.name}>{node.name}</span>
      </div>
      
      {isExpanded && hasChildren && (
        <div className="mt-0.5">
          {node.childIds.map((childId) => (
            <TreeItem key={childId} nodeId={childId} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const SidebarLeft: React.FC = () => {
  const { nodes } = useFmedaStore();
  
  // Find root nodes (nodes without a parentId)
  const rootNodes = Object.values(nodes).filter(node => !node.parentId);

  return (
    <aside className="w-64 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hierarchy</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {rootNodes.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500 italic">
            No nodes found. Start by creating a project.
          </div>
        ) : (
          rootNodes.map((node) => (
            <TreeItem key={node.id} nodeId={node.id} level={0} />
          ))
        )}
      </div>
    </aside>
  );
};
