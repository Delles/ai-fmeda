import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, Pencil } from 'lucide-react';
import { AISuggestionContext, getAISuggestions } from '../../services/aiService';
import { useAIStore } from '../../store/aiStore';
import { useDocumentStore } from '../../store/documentStore';
import { FmedaFailureMode } from '../../types/fmeda';
import { AISuggestion } from '../../types/ai';
import { AISuggestionPanel } from '../AISuggestionPanel';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';

export interface EditableAICellProps {
  initialValue: string;
  onSave: (value: string) => void;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
  aiContext: AISuggestionContext;
  field: keyof FmedaFailureMode;
}

export const EditableAICell: React.FC<EditableAICellProps> = ({
  initialValue,
  onSave,
  className = '',
  multiline = false,
  placeholder = 'Click to edit',
  aiContext,
  field,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(initialValue || '');
  const [isHovered, setIsHovered] = useState(false);

  // AI State
  const [isAILoading, setIsAILoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const { config } = useAIStore();
  const { documents } = useDocumentStore();

  useEffect(() => {
    setValue(initialValue || '');
  }, [initialValue]);

  const adjustHeight = useCallback(() => {
    if (multiline && inputRef.current) {
      const el = inputRef.current as HTMLTextAreaElement;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [multiline]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(adjustHeight, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, value, adjustHeight]);

  const openPopover = () => {
    setValue(initialValue || '');
    setIsOpen(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
        adjustHeight();
      }
    }, 0);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (value !== initialValue) {
        onSave(value);
      }
      setShowSuggestions(false);
      setIsOpen(false);
    } else {
      openPopover();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (value !== initialValue) {
        onSave(value);
      }
      setIsOpen(false);
      setShowSuggestions(false);
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      if (value !== initialValue) {
        onSave(value);
      }
      setIsOpen(false);
      setShowSuggestions(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setValue(initialValue || '');
      setIsOpen(false);
      setShowSuggestions(false);
    }
  };

  const handleAISuggest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!config.apiKey) {
      alert('Please configure your AI API key in settings first.');
      return;
    }

    setIsAILoading(true);
    setShowSuggestions(true);
    if (!isOpen) {
      openPopover();
    }

    try {
      const contextText = documents.map(d => d.extractedText).join('\n\n');
      const result = await getAISuggestions(config, aiContext, contextText, field);
      setSuggestions(result);
    } catch (error) {
      console.error('Failed to get AI suggestions:', error);
      alert('Failed to get AI suggestions. Check console for details.');
      setShowSuggestions(false);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setValue(suggestion);
    setShowSuggestions(false);
    if (inputRef.current) {
      inputRef.current.focus();
      setTimeout(adjustHeight, 0);
    }
  };

  const renderAIButton = (absolute: boolean = true) => (
    <button
      type="button"
      onMouseDown={handleAISuggest}
      disabled={isAILoading}
      className={`${absolute ? 'absolute right-6 top-1/2 -translate-y-1/2' : ''} p-1 rounded-md text-blue-500 hover:bg-blue-100 transition-colors ${isAILoading ? 'opacity-50 cursor-not-allowed' : ''} z-10`}
      title="Get AI Suggestions"
      tabIndex={-1}
    >
      {isAILoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
    </button>
  );

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <div
        className="relative w-full group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`group/btn relative text-left w-full cursor-pointer hover:bg-white/50 px-2 py-1 rounded block min-h-[1.5rem] pr-8 border border-transparent hover:border-gray-200 hover:shadow-sm transition-all ${!value ? 'text-gray-400 italic' : ''} ${className}`}
          >
            {value || placeholder}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none">
              <Pencil className="w-3 h-3 text-gray-400 hidden group-hover/btn:block" />
            </div>
          </button>
        </PopoverTrigger>
        {!isOpen && (isHovered || !value) && renderAIButton(true)}
      </div>

      <PopoverContent
        className="w-[32rem] p-3 flex flex-col gap-2"
        align="start"
        collisionPadding={16}
        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
      >
        <div className="relative w-full flex-1 overflow-y-auto rounded border border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 bg-white">
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[8rem] p-2 pr-8 focus:outline-none text-gray-900 overflow-hidden resize-none bg-transparent"
              placeholder={placeholder}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-2 pr-8 focus:outline-none text-gray-900 bg-transparent"
              placeholder={placeholder}
            />
          )}
          {renderAIButton(true)}

          {showSuggestions && (
            <div
              className="absolute z-50 left-0 top-full mt-1 w-full max-w-[90vw]"
              onMouseDown={(e) => e.preventDefault()}
            >
              <AISuggestionPanel
                suggestions={suggestions}
                isLoading={isAILoading}
                onSelect={handleSelectSuggestion}
                onClose={() => setShowSuggestions(false)}
              />
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500 flex justify-between shrink-0">
          <span>Esc to cancel</span>
          <span>{multiline ? 'Ctrl+Enter to save' : 'Enter to save'}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};
