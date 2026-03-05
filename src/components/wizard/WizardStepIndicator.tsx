import React from 'react';
import { Check, FileText, Layers, Settings, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepNumber } from '@/types/ai';

interface WizardStepIndicatorProps {
  currentStep: WizardStepNumber;
}

const STEPS: { step: WizardStepNumber; label: string; icon: React.ElementType; exitLabel?: string }[] = [
  { step: 1, label: 'Project Setup', icon: FileText },
  { step: 2, label: 'Architecture', icon: Layers, exitLabel: 'Can finish here' },
  { step: 3, label: 'Functions', icon: Settings, exitLabel: 'Can finish here' },
  { step: 4, label: 'Failure Modes', icon: AlertTriangle, exitLabel: 'Optional' },
];

export const WizardStepIndicator: React.FC<WizardStepIndicatorProps> = ({ currentStep }) => {
  return (
    <div className="flex items-center justify-between mb-8 px-2">
      {STEPS.map((s, idx) => {
        const isCompleted = currentStep > s.step;
        const isCurrent = currentStep === s.step;
        const isFuture = currentStep < s.step;
        const Icon = s.icon;

        return (
          <React.Fragment key={s.step}>
            <div className="flex flex-col items-center relative group">
              {/* Step circle */}
              <div className={cn(
                "w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                isCompleted && "border-emerald-500 bg-emerald-50 text-emerald-600 shadow-sm",
                isCurrent && "border-blue-600 bg-blue-50 text-blue-600 shadow-md ring-4 ring-blue-100",
                isFuture && "border-slate-200 bg-white text-slate-400"
              )}>
                {isCompleted ? (
                  <Check className="w-5 h-5" strokeWidth={2.5} />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>

              {/* Label */}
              <span className={cn(
                "text-xs mt-2 font-semibold tracking-wide transition-colors",
                isCompleted && "text-emerald-600",
                isCurrent && "text-blue-600",
                isFuture && "text-slate-400"
              )}>
                {s.label}
              </span>

              {/* Exit badge */}
              {s.exitLabel && (
                <span className={cn(
                  "text-[10px] mt-0.5 font-medium",
                  isCompleted ? "text-emerald-500" :
                  isCurrent ? "text-blue-500" : "text-slate-300"
                )}>
                  {s.exitLabel}
                </span>
              )}
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div className="flex-1 mx-3 mb-5 relative">
                <div className="h-0.5 bg-slate-200 rounded-full" />
                <div
                  className={cn(
                    "absolute top-0 left-0 h-0.5 rounded-full transition-all duration-500",
                    currentStep > STEPS[idx].step ? "bg-emerald-500 w-full" : "bg-transparent w-0"
                  )}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
