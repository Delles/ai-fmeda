import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Pencil } from 'lucide-react';

export interface EditableTextCellProps {
  initialValue: string;
  onSave: (value: string) => void;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
}

export const EditableTextCell: React.FC<EditableTextCellProps> = ({
  initialValue,
  onSave,
  className = '',
  multiline = false,
  placeholder = 'Click to edit',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(initialValue || '');
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

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
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      if (value !== initialValue) {
        onSave(value);
      }
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setValue(initialValue || '');
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group relative text-left w-full cursor-pointer hover:bg-white/50 px-2 py-1 rounded block min-h-[1.5rem] border border-transparent hover:border-gray-200 hover:shadow-sm transition-all ${!value ? 'text-gray-400 italic' : ''} ${className}`}
        >
          {value || placeholder}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="w-3 h-3 text-gray-400" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[32rem] p-3 flex flex-col gap-2"
        align="start"
        collisionPadding={16}
        style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}
      >
        <div className="overflow-y-auto flex-1 rounded border border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 bg-white">
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[8rem] p-2 focus:outline-none text-gray-900 overflow-hidden resize-none bg-transparent"
              placeholder={placeholder}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-2 focus:outline-none text-gray-900 bg-transparent"
              placeholder={placeholder}
            />
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
