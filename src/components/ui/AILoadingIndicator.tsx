import React, { useState, useEffect } from 'react';
import { BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_MESSAGES = [
  "Firing up the neural pathways...",
  "Analyzing context and documents...",
  "Processing engineering rules...",
  "Aligning with safety standards...",
  "Thinking deeply about edge cases...",
  "Synthesizing components...",
  "Formatting output...",
];

interface AILoadingIndicatorProps {
  progress?: { current: number; total: number; label?: string } | null;
  messages?: string[];
  interval?: number;
  className?: string;
  inline?: boolean;
}

export const AILoadingIndicator: React.FC<AILoadingIndicatorProps> = ({
  progress,
  messages = DEFAULT_MESSAGES,
  interval = 3000,
  className,
  inline = false,
}) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [messages, interval]);

  if (inline) {
    return (
      <div className={cn("flex flex-col sm:flex-row items-start sm:items-center gap-4 px-5 py-4 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-100 rounded-xl", className)}>
        <div className="relative flex items-center justify-center p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-md border-indigo-200 shadow-indigo-500/20">
          <BrainCircuit className="w-5 h-5 animate-pulse text-white" />
        </div>
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between text-sm font-semibold text-indigo-900 mb-1.5 animate-pulse">
            <span>{messages[msgIndex]}</span>
            {progress && (
              <span className="text-xs font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                {progress.current} / {progress.total}
              </span>
            )}
          </div>
          {progress && (
            <div className="flex flex-col gap-1 w-full mt-1">
              <div className="flex justify-between text-[11px] font-medium text-indigo-600 uppercase tracking-wider">
                <span className="truncate max-w-[200px]">{progress.label || 'Processing...'}</span>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-indigo-200/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 relative"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                >
                  <div className="absolute inset-0 bg-white/30 w-full animate-[pulse_2s_infinite]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center p-8 space-y-6 bg-white/80 backdrop-blur-md rounded-2xl border border-indigo-100 shadow-xl shadow-indigo-100/50", className)}>
      <div className="relative w-20 h-20 flex items-center justify-center">
        {/* Pulsing background rings */}
        <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute -inset-4 bg-purple-500/5 rounded-full animate-ping" style={{ animationDuration: '4s', animationDelay: '1s' }} />

        {/* Icon container */}
        <div className="relative flex flex-col items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/40 rotate-3 transform transition-transform hover:scale-105">
          <BrainCircuit className="w-8 h-8 text-white animate-pulse" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-bounce" />
        </div>
      </div>

      <div className="text-center w-full max-w-sm space-y-3">
        <h3 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-purple-700 animate-pulse transition-all">
          {messages[msgIndex]}
        </h3>

        {progress && (
          <div className="w-full space-y-2 mx-auto pt-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              <span className="truncate max-w-[200px]">{progress.label || 'Processing...'}</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-in-out relative"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full animate-pulse" />
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Step {progress.current} of {progress.total}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
