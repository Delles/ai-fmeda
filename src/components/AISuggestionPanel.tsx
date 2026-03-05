import React from 'react';
import { AISuggestion } from '../types/ai';

interface AISuggestionPanelProps {
  suggestions: AISuggestion[];
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export const AISuggestionPanel: React.FC<AISuggestionPanelProps> = ({
  suggestions,
  onSelect,
  onClose,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="p-4 border rounded bg-gray-50 mt-2">
        <p className="text-sm text-gray-600 animate-pulse">Generating suggestions...</p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="p-4 border rounded bg-blue-50 mt-2 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-semibold text-blue-800">AI Suggestions</h4>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-xs"
        >
          Close
        </button>
      </div>
      <div className="space-y-3">
        {suggestions.map((s, idx) => (
          <div
            key={idx}
            className="p-2 bg-white border border-blue-200 rounded hover:border-blue-400 cursor-pointer transition-colors"
            onClick={() => onSelect(s.suggestion)}
          >
            <p className="text-sm font-medium text-gray-900">{s.suggestion}</p>
            <p className="text-xs text-gray-600 mt-1">{s.reasoning}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
