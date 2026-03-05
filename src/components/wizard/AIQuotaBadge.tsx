import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { getAIQuota } from '@/services/aiService';
import { cn } from '@/lib/utils';

export const AIQuotaBadge: React.FC = () => {
  const [quota, setQuota] = useState(getAIQuota());

  // Refresh quota every 5s  
  useEffect(() => {
    const interval = setInterval(() => setQuota(getAIQuota()), 5000);
    return () => clearInterval(interval);
  }, []);

  const dayPercent = (quota.dayRemaining / quota.dayMax) * 100;
  const isLow = quota.dayRemaining <= 5;
  const isDepleted = quota.dayRemaining === 0 || quota.minuteRemaining === 0;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
      isDepleted ? "bg-red-50 border-red-200 text-red-700" :
      isLow ? "bg-amber-50 border-amber-200 text-amber-700" :
      "bg-slate-50 border-slate-200 text-slate-600"
    )}>
      <Zap className={cn("w-3.5 h-3.5", isDepleted ? "text-red-500" : isLow ? "text-amber-500" : "text-blue-500")} />
      <div className="flex flex-col leading-tight">
        <span>{quota.dayRemaining}/{quota.dayMax} daily</span>
        <span className="text-[10px] opacity-70">{quota.minuteRemaining}/{quota.minuteMax} per min</span>
      </div>
      {/* Mini progress bar */}
      <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden ml-1">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isDepleted ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-blue-500"
          )}
          style={{ width: `${dayPercent}%` }}
        />
      </div>
    </div>
  );
};
