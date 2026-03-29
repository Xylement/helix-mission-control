"use client";

import { Check } from "lucide-react";

const DEFAULT_STEP_LABELS = [
  "Welcome",
  "Organization",
  "License",
  "AI Model",
  "Departments",
  "Agents",
  "Telegram",
  "Team",
  "Complete",
];

interface StepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  labels?: string[];
}

export function Stepper({ currentStep, onStepClick, labels }: StepperProps) {
  const stepLabels = labels || DEFAULT_STEP_LABELS;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        {stepLabels.map((label, idx) => {
          const step = idx + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={step} className="flex flex-col items-center flex-1">
              <div className="flex items-center w-full">
                {idx > 0 && (
                  <div
                    className={`flex-1 h-0.5 transition-colors ${
                      step <= currentStep ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => step < currentStep && onStepClick?.(step)}
                  disabled={step > currentStep}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all ${
                    isCompleted
                      ? "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step}
                </button>
                {idx < stepLabels.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 transition-colors ${
                      step < currentStep ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <span
                className={`text-[10px] mt-1.5 text-center hidden sm:block ${
                  isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
