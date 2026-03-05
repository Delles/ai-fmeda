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
import { useConfirm } from '../../hooks/useConfirm';
import { formatAIError } from '../../lib/errorUtils';
import { cn } from '../../lib/utils';

/** Human-readable labels for FMEDA fields */
const FIELD_LABELS: Record<string, string> = {
  localEffect: 'Local Effect',
  safetyMechanism: 'Safety Mechanism',
  name: 'Failure Mode Name',
  diagnosticCoverage: 'Diagnostic Coverage',
  fitRate: 'FIT Rate',
};

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

  // AI State
  const [isAILoading, setIsAILoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Track if suggestion was just applied for visual feedback
  const [justApplied, setJustApplied] = useState(false);

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

  const confirm = useConfirm();

  const handleAISuggest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!config.apiKey) {
      await confirm({
        title: 'API Key Missing',
        description: 'Please configure your AI API key in settings first to use AI features.',
        type: 'alert',
        icon: 'info'
      });
      return;
    }

    setIsAILoading(true);
    setShowSuggestions(true);

    try {
      const contextText = documents.map(d => d.extractedText).join('\n\n');
      const result = await getAISuggestions(config, aiContext, contextText, field);
      setSuggestions(result);
    } catch (error) {
      console.error('Failed to get AI suggestions:', error);
      const { title, message, icon } = formatAIError(error);

      await confirm({
        title,
        description: message,
        type: 'alert',
        icon,
        variant: title.includes('Limit') || title.includes('Quota') ? 'default' : 'destructive'
      });

      setShowSuggestions(false);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setValue(suggestion);

    // Flash a brief "applied" indicator
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 1200);

    if (inputRef.current) {
      inputRef.current.focus();
      setTimeout(adjustHeight, 0);
    }
  };

  const renderAITrigger = () => (
    <button
      type="button"
      onMouseDown={handleAISuggest}
      disabled={isAILoading}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all',
        'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border border-blue-200',
        'hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 hover:shadow-sm',
        isAILoading && 'opacity-60 cursor-not-allowed',
      )}
      title="Get AI Suggestions"
      tabIndex={-1}
    >
      {isAILoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">Suggest</span>
    </button>
  );

  // Calculate the popover width based on whether suggestions are showing
  const popoverWidth = showSuggestions ? 'w-[52rem]' : 'w-[28rem]';

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group relative text-left w-full cursor-pointer hover:bg-white/50 px-2 py-1 rounded block min-h-[1.5rem] border border-transparent hover:border-gray-200 hover:shadow-sm transition-all',
            !value && 'text-gray-400 italic',
            className,
          )}
        >
          {value || placeholder}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="w-3 h-3 text-gray-400" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          popoverWidth,
          'p-0 transition-[width] duration-200 ease-out',
        )}
        align="start"
        collisionPadding={16}
        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
      >
        <div className={cn(
          'flex',
          showSuggestions ? 'flex-row' : 'flex-col',
        )}>
          {/* ── Left side: Editor ── */}
          <div className={cn(
            'flex flex-col gap-2 p-3',
            showSuggestions ? 'w-1/2 border-r border-gray-100' : 'w-full',
          )}>
            {/* Applied flash indicator */}
            {justApplied && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium animate-[fadeIn_0.2s_ease-out]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Suggestion applied — edit below if needed
              </div>
            )}

            <div className={cn(
              'relative w-full flex-1 rounded-lg border transition-colors bg-white',
              justApplied ? 'border-emerald-400 ring-2 ring-emerald-400/20' : 'border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20',
            )}>
              {multiline ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    adjustHeight();
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full min-h-[6rem] p-2.5 pr-10 focus:outline-none text-sm text-gray-900 overflow-hidden resize-none bg-transparent rounded-lg"
                  placeholder={placeholder}
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full p-2.5 pr-10 focus:outline-none text-sm text-gray-900 bg-transparent rounded-lg"
                  placeholder={placeholder}
                />
              )}
            </div>

            {/* Editor footer: AI button + keyboard hints */}
            <div className="flex items-center justify-between gap-2">
              {renderAITrigger()}
              <div className="text-[10px] text-gray-400 flex gap-2">
                <span><kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono text-[9px]">Esc</kbd> cancel</span>
                <span><kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono text-[9px]">{multiline ? 'Ctrl+↵' : '↵'}</kbd> save</span>
              </div>
            </div>
          </div>

          {/* ── Right side: AI Suggestions ── */}
          {showSuggestions && (
            <div
              className="w-1/2 p-3 bg-gray-50/50 animate-[slideIn_0.2s_ease-out]"
              onMouseDown={(e) => e.preventDefault()}
            >
              <AISuggestionPanel
                suggestions={suggestions}
                isLoading={isAILoading}
                onSelect={handleSelectSuggestion}
                onClose={() => setShowSuggestions(false)}
                fieldLabel={FIELD_LABELS[field] || field}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
