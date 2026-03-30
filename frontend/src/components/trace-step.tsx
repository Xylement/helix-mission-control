"use client";

import { useState } from "react";
import type { TraceStep } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";

const STEP_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  reasoning: { icon: Brain, color: "text-blue-500", label: "Reasoning" },
  tool_call: { icon: Wrench, color: "text-amber-500", label: "Tool Call" },
  tool_result: { icon: CheckCircle, color: "text-green-500", label: "Tool Result" },
  error: { icon: AlertTriangle, color: "text-red-500", label: "Error" },
  system: { icon: Info, color: "text-muted-foreground", label: "System" },
};

export function TraceStepCard({ step }: { step: TraceStep }) {
  const config = STEP_CONFIG[step.step_type] || STEP_CONFIG.system;
  const Icon = config.icon;
  const isLong = (step.content?.length || 0) > 500;
  const isToolOutput = step.step_type === "tool_result" && (step.tool_output?.length || 0) > 200;
  const [expanded, setExpanded] = useState(!isLong && !isToolOutput);
  const [copied, setCopied] = useState(false);

  const copyContent = () => {
    const text = step.content || step.tool_output || "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tokens = step.input_tokens + step.output_tokens;

  return (
    <div className="flex gap-3 group">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={`p-1.5 rounded-full border ${step.step_type === "error" ? "border-red-500/30 bg-red-500/10" : "border-border bg-muted"}`}>
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">#{step.step_number}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {config.label}
          </Badge>
          {step.tool_name && step.step_type === "tool_call" && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
              {step.tool_name}
            </Badge>
          )}
          {step.tool_name && step.step_type === "tool_result" && (
            <Badge className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/20">
              {step.tool_name}
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            {tokens > 0 && <span>{tokens.toLocaleString()} tok</span>}
            {step.estimated_cost_usd > 0 && <span>${step.estimated_cost_usd.toFixed(4)}</span>}
            {step.duration_ms != null && step.duration_ms > 0 && (
              <span>{step.duration_ms < 1000 ? `${step.duration_ms}ms` : `${(step.duration_ms / 1000).toFixed(1)}s`}</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={copyContent}
            >
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        {/* Step content */}
        {step.step_type === "error" ? (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {step.content}
          </div>
        ) : step.step_type === "tool_call" && step.tool_input ? (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Input JSON
            </button>
            {expanded && (
              <pre className="mt-1 rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-64 overflow-y-auto">
                {JSON.stringify(step.tool_input, null, 2)}
              </pre>
            )}
          </div>
        ) : step.step_type === "tool_result" ? (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Output ({(step.tool_output?.length || 0).toLocaleString()} chars)
            </button>
            {expanded && (
              <pre className="mt-1 rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                {(step.tool_output || "").slice(0, 2000)}
                {(step.tool_output?.length || 0) > 2000 && (
                  <span className="text-muted-foreground">... (truncated)</span>
                )}
              </pre>
            )}
          </div>
        ) : step.step_type === "system" ? (
          <p className="text-xs text-muted-foreground">{step.content}</p>
        ) : (
          <div>
            {(isLong && !expanded) ? (
              <>
                <p className="text-sm whitespace-pre-wrap">{step.content?.slice(0, 500)}...</p>
                <button
                  onClick={() => setExpanded(true)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Show more
                </button>
              </>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap">{step.content}</p>
                {isLong && (
                  <button
                    onClick={() => setExpanded(false)}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Show less
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
