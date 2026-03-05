import React, { useState, useEffect, useRef } from 'react';
import { useFmedaStore } from '../store/fmedaStore';
import { FmedaNode } from '../types/fmeda';
import { X, Layers, Box, Cpu, Activity, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * A text input that debounces its changes to avoid excessive store updates.
 */
interface DebouncedInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const DebouncedInput: React.FC<DebouncedInputProps> = ({ label, value, onChange, placeholder }) => {
  const [localValue, setLocalValue] = useState(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localValue, onChange, value]);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      <input
        type="text"
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
};

// FIX #2: Node type badge with color per type
const NodeTypeBadge = ({ type }: { type: string }) => {
  const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    System:      { label: 'System',      icon: <Layers className="w-3 h-3" />,       className: 'bg-blue-100 text-blue-700 border-blue-200' },
    Subsystem:   { label: 'Subsystem',   icon: <Box className="w-3 h-3" />,           className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    Component:   { label: 'Component',   icon: <Cpu className="w-3 h-3" />,           className: 'bg-purple-100 text-purple-700 border-purple-200' },
    Function:    { label: 'Function',    icon: <Activity className="w-3 h-3" />,      className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    FailureMode: { label: 'Failure Mode',icon: <AlertTriangle className="w-3 h-3" />, className: 'bg-amber-100 text-amber-700 border-amber-200' },
  };
  const c = config[type] ?? { label: type, icon: null, className: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium', c.className)}>
      {c.icon}
      {c.label}
    </span>
  );
};

export const SidebarRight: React.FC = () => {
  const { nodes, selectedId, setSelectedId, updateNode } = useFmedaStore();
  const node = selectedId ? nodes[selectedId] : null;

  if (!node) {
    return (
      <aside className="w-80 border-l border-gray-200 bg-white flex flex-col h-full items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Layers className="w-5 h-5 text-gray-400" />
        </div>
        <div className="text-gray-500 text-sm font-medium mb-1">No item selected</div>
        <p className="text-xs text-gray-400">Select an item from the hierarchy or table to view and edit its details.</p>
      </aside>
    );
  }

  const handleChange = (field: keyof FmedaNode, value: any) => {
    updateNode(node.id, { [field]: value });
  };

  const renderField = (label: string, field: keyof FmedaNode, type: string = 'text', options?: string[]) => {
    const value = node[field] ?? '';

    if (type === 'text' && field !== 'type') {
      return (
        <DebouncedInput
          label={label}
          value={value as string}
          onChange={(val) => handleChange(field, val)}
        />
      );
    }

    return (
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
        {type === 'select' ? (
          <select
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={value as string}
            onChange={(e) => handleChange(field, e.target.value)}
          >
            {options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={value as number}
            onChange={(e) => handleChange(field, parseFloat(e.target.value) || 0)}
            onBlur={(e) => handleChange(field, parseFloat(e.target.value) || 0)}
          />
        )}
      </div>
    );
  };

  const isHighLevel = ['System', 'Subsystem', 'Component'].includes(node.type);
  const isFailureMode = node.type === 'FailureMode';

  // FIX #2: Show aggregated summary only for nodes that have children
  const hasChildren = node.childIds.length > 0;
  const showAggStats = hasChildren || isFailureMode;

  // Computed values for the summary
  const totalFit = node.totalFit ?? 0;
  const avgDcPct = (node.avgDc ?? 0) * 100;
  const safeFit = node.safeFit ?? 0;
  const dangerousFit = node.dangerousFit ?? 0;

  return (
    <aside className="w-80 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 truncate" title={node.name || 'Unnamed Item'}>
              {node.name || 'Unnamed Item'}
            </h2>
            <div className="mt-1">
              <NodeTypeBadge type={node.type} />
            </div>
          </div>
          <button 
            onClick={() => setSelectedId(null)}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Basic Fields */}
        <div className="space-y-4">
          {renderField('Name', 'name')}
          {renderField('Type', 'type', 'select', ['System', 'Subsystem', 'Component', 'Function', 'FailureMode'])}
        </div>

        {isHighLevel && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest">Safety Context</h3>
            {renderField('ASIL', 'asil', 'select', ['QM', 'ASIL A', 'ASIL B', 'ASIL C', 'ASIL D'])}
            {renderField('Safety Goal', 'safetyGoal')}
          </div>
        )}

        {isFailureMode && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest">Failure Analysis</h3>
            {renderField('Local Effect', 'localEffect')}
            {renderField('Safety Mechanism', 'safetyMechanism')}
            {renderField('Diagnostic Coverage (0-1)', 'diagnosticCoverage', 'number')}
            {renderField('FIT Rate', 'fitRate', 'number')}
            {renderField('Classification', 'classification', 'select', ['Safe', 'Dangerous'])}
          </div>
        )}

        {/* FIX #2: Quantitative Summary with correct conditional colors */}
        {showAggStats && (
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Quantitative Summary</h3>
            <div className="grid grid-cols-2 gap-3">

              {/* Total FIT */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">Total FIT</label>
                <div className={cn(
                  "text-sm font-mono p-2 rounded border",
                  totalFit > 100
                    ? "bg-red-50 border-red-200 text-red-700 font-bold"
                    : totalFit >= 10
                    ? "bg-orange-50 border-orange-200 text-orange-700 font-medium"
                    : "bg-gray-50 border-gray-200 text-gray-700"
                )}>
                  {totalFit.toFixed(2)}
                </div>
              </div>

              {/* Avg DC */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">Avg DC</label>
                <div className={cn(
                  "text-sm font-mono p-2 rounded border",
                  avgDcPct < 60
                    ? "bg-red-50 border-red-200 text-red-700 font-bold"
                    : avgDcPct < 90
                    ? "bg-amber-50 border-amber-200 text-amber-700 font-medium"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold"
                )}>
                  {avgDcPct.toFixed(1)}%
                </div>
              </div>

              {/* Safe FIT — green when higher is better */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">Safe FIT</label>
                <div className={cn(
                  "text-sm font-mono p-2 rounded border",
                  safeFit > 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-medium"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                )}>
                  {safeFit.toFixed(2)}
                </div>
              </div>

              {/* Dangerous FIT — red only when > 0 */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">Dangerous FIT</label>
                <div className={cn(
                  "text-sm font-mono p-2 rounded border",
                  dangerousFit > 0
                    ? "bg-red-50 border-red-200 text-red-700 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                )}>
                  {dangerousFit.toFixed(2)}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
