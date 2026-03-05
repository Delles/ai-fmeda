import React, { useState } from 'react';
import { AISuggestion } from '../types/ai';
import { Check, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface AISuggestionPanelProps {
  suggestions: AISuggestion[];
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  isLoading: boolean;
  fieldLabel?: string;
}

/** Shimmer skeleton shown while AI is generating */
const SuggestionSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-xl border border-gray-100 p-3.5 space-y-2 animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
        <div className="h-4 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 rounded-md w-[85%] bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]" />
        <div className="h-3 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 rounded-md w-[60%] bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
      </div>
    ))}
  </div>
);

/** Individual suggestion card */
const SuggestionCard: React.FC<{
  suggestion: AISuggestion;
  index: number;
  onSelect: (suggestion: string) => void;
}> = ({ suggestion, index, onSelect }) => {
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);

  return (
    <div
      className={cn(
        'group/card rounded-xl border border-gray-150 bg-white',
        'hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5',
        'transition-all duration-200 ease-out',
        'animate-[slideUp_0.3s_ease-out_both]',
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Suggestion content */}
      <div className="p-3.5">
        <p className="text-sm text-gray-800 leading-relaxed font-medium">{suggestion.suggestion}</p>
      </div>

      {/* Footer: reasoning toggle + apply button */}
      <div className="flex items-center justify-between px-3.5 pb-3 pt-0">
        {suggestion.reasoning ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsReasoningOpen(!isReasoningOpen);
            }}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isReasoningOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>Why this?</span>
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(suggestion.suggestion);
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
            'bg-blue-50 text-blue-600 border border-blue-200',
            'hover:bg-blue-600 hover:text-white hover:border-blue-600',
            'transition-all duration-150',
            'opacity-80 group-hover/card:opacity-100',
          )}
        >
          <Check size={12} />
          <span>Apply</span>
        </button>
      </div>

      {/* Expandable reasoning section */}
      {suggestion.reasoning && isReasoningOpen && (
        <div className="border-t border-gray-100 px-3.5 py-2.5 bg-gray-50/50 rounded-b-xl">
          <p className="text-xs text-gray-500 leading-relaxed">{suggestion.reasoning}</p>
        </div>
      )}
    </div>
  );
};

export const AISuggestionPanel: React.FC<AISuggestionPanelProps> = ({
  suggestions,
  onSelect,
  onClose,
  isLoading,
  fieldLabel,
}) => {
  return (
    <div className="flex flex-col w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 shadow-sm">
            <Sparkles size={12} className="text-white" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-700 leading-tight">AI Suggestions</h4>
            {fieldLabel && (
              <p className="text-[10px] text-gray-400 mt-0.5">for {fieldLabel}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5 scrollbar-thin">
        {isLoading ? (
          <SuggestionSkeleton />
        ) : suggestions.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs">
            No suggestions generated. Try again.
          </div>
        ) : (
          suggestions.map((s, idx) => (
            <SuggestionCard
              key={idx}
              suggestion={s}
              index={idx}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      {!isLoading && suggestions.length > 0 && (
        <p className="text-[10px] text-gray-400 text-center mt-2.5 pt-2 border-t border-gray-100">
          Click <span className="font-semibold">Apply</span> to use a suggestion. You can still edit the value afterwards.
        </p>
      )}
    </div>
  );
};
