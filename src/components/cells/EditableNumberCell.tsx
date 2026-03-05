import React, { useState, useRef, useEffect } from 'react';

export interface EditableNumberCellProps {
  initialValue: number;
  onSave: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
}

export const EditableNumberCell: React.FC<EditableNumberCellProps> = ({
  initialValue,
  onSave,
  className = '',
  min,
  max,
  step,
  format,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<string>(initialValue.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue.toString());
  }, [initialValue]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    let parsedValue = parseFloat(value);
    if (!isNaN(parsedValue) && parsedValue !== initialValue) {
      if (min !== undefined) parsedValue = Math.max(min, parsedValue);
      if (max !== undefined) parsedValue = Math.min(max, parsedValue);
      onSave(parsedValue);
    } else {
      // Revert if invalid or unchanged
      setValue(initialValue.toString());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(initialValue.toString());
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        step={step}
        className={`w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 ${className}`}
      />
    );
  }

  const displayValue = format ? format(initialValue) : initialValue;

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className={`text-left w-full cursor-pointer hover:bg-gray-100 px-2 py-1 rounded block min-h-[1.5rem] ${className}`}
    >
      {displayValue}
    </button>
  );
};
