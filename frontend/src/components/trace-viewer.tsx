"use client";

import { useEffect, useState } from "react";
import { api, type TraceDetail } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TraceStepCard } from "@/components/trace-step";
import {
  Clock,
  Cpu,
  DollarSign,
  Loader2,
  Layers,
  AlertTriangle,
} from "lucide-react";

const STATUS_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  running: { variant: "default", label: "Running" },
  completed: { variant: "secondary", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
  cancelled: { variant: "outline", label: "Cancelled" },
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function TraceViewer({ traceId }: { traceId: string }) {
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getTraceDetail(traceId)
      .then(setTrace)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [traceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div className="flex items-center gap-2 text-destructive p-4">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">{error || "Trace not found"}</span>
      </div>
    );
  }

  const status = STATUS_STYLES[trace.trace_status] || STATUS_STYLES.running;
  const totalTokens = trace.total_input_tokens + trace.total_output_tokens;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={status.variant}>{status.label}</Badge>
            {trace.model_provider && trace.model_name && (
              <Badge variant="outline" className="text-xs">
                {trace.model_provider}/{trace.model_name}
              </Badge>
            )}
            <div className="flex items-center gap-4 ml-auto text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                {trace.total_steps} steps
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" />
                {totalTokens.toLocaleString()} tokens
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                ${trace.total_estimated_cost_usd.toFixed(4)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(trace.duration_ms)}
              </span>
            </div>
          </div>
          {trace.error_message && (
            <div className="mt-3 rounded-md bg-red-500/10 border border-red-500/20 p-2 text-sm text-red-600 dark:text-red-400">
              {trace.error_message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <div className="pl-2">
        {trace.steps.map((step) => (
          <TraceStepCard key={step.id} step={step} />
        ))}
        {trace.steps.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No steps recorded for this trace.</p>
        )}
      </div>
    </div>
  );
}
