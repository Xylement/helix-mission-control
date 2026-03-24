"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type WorkflowExecutionDetail,
  type WorkflowDetail,
  type WorkflowStepExecution,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  RefreshCw,
  Ban,
  ExternalLink,
  Loader2,
} from "lucide-react";

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  pending: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500", border: "border-gray-300 dark:border-gray-600", label: "Pending" },
  running: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600", border: "border-blue-400", label: "Running" },
  waiting_approval: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600", border: "border-amber-400", label: "Waiting Approval" },
  completed: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600", border: "border-emerald-400", label: "Completed" },
  failed: { bg: "bg-red-50 dark:bg-red-900/30", text: "text-red-600", border: "border-red-400", label: "Failed" },
  skipped: { bg: "bg-gray-50 dark:bg-gray-800", text: "text-gray-400 line-through", border: "border-gray-300 dark:border-gray-600", label: "Skipped" },
};

const EXEC_STATUS_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  running: { color: "text-blue-500", icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  paused: { color: "text-amber-500", icon: <Pause className="h-5 w-5" /> },
  completed: { color: "text-emerald-500", icon: <CheckCircle2 className="h-5 w-5" /> },
  failed: { color: "text-red-500", icon: <XCircle className="h-5 w-5" /> },
  cancelled: { color: "text-gray-400", icon: <Ban className="h-5 w-5" /> },
};

export default function ExecutionViewPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = Number(params.id);
  const execId = Number(params.execId);

  const [execution, setExecution] = useState<WorkflowExecutionDetail | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchExecution = useCallback(async () => {
    try {
      const exe = await api.workflowExecution(execId);
      setExecution(exe);
    } catch {
      toast.error("Failed to load execution");
    }
  }, [execId]);

  const fetchWorkflow = useCallback(async () => {
    try {
      const wf = await api.workflow(workflowId);
      setWorkflow(wf);
    } catch {
      // non-critical for display
    }
  }, [workflowId]);

  useEffect(() => {
    Promise.all([fetchExecution(), fetchWorkflow()]).finally(() => setLoading(false));
  }, [fetchExecution, fetchWorkflow]);

  // Auto-refresh while running
  const execStatus = execution?.status;
  useEffect(() => {
    if (!execStatus || (execStatus !== "running" && execStatus !== "paused")) return;
    const interval = setInterval(fetchExecution, 3000);
    return () => clearInterval(interval);
  }, [execStatus, fetchExecution]);

  const handleCancel = async () => {
    try {
      await api.cancelWorkflowExecution(execId);
      toast.success("Execution cancelled");
      fetchExecution();
    } catch {
      toast.error("Failed to cancel");
    }
  };

  const handleRetry = async () => {
    try {
      const newExec = await api.retryWorkflowExecution(execId);
      toast.success("Retrying workflow");
      router.push(`/workflows/${workflowId}/executions/${newExec.id}`);
    } catch {
      toast.error("Failed to retry");
    }
  };

  // Build node positions from workflow steps
  const NODE_W = 200;
  const NODE_H = 72;

  const stepPositions = useMemo(() => {
    if (!workflow) return new Map<string, { x: number; y: number }>();
    const m = new Map<string, { x: number; y: number }>();
    for (const s of workflow.steps) {
      m.set(s.step_id, { x: s.position_x, y: s.position_y });
    }
    return m;
  }, [workflow]);

  const stepExecMap = useMemo(() => {
    if (!execution) return new Map<string, WorkflowStepExecution>();
    const m = new Map<string, WorkflowStepExecution>();
    for (const se of execution.step_executions) {
      m.set(se.step_id, se);
    }
    return m;
  }, [execution]);

  // Edges from workflow steps
  const edges = useMemo(() => {
    if (!workflow) return [];
    const result: Array<{ fromId: string; toId: string }> = [];
    for (const s of workflow.steps) {
      for (const dep of s.depends_on) {
        result.push({ fromId: dep, toId: s.step_id });
      }
    }
    return result;
  }, [workflow]);

  // Timeline
  const timeline = useMemo(() => {
    if (!execution) return [];
    return [...execution.step_executions]
      .filter((se) => se.started_at)
      .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime())
      .map((se) => ({
        ...se,
        step_name: se.step_name || se.step_id,
      }));
  }, [execution]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading execution...</div>
      </div>
    );
  }

  if (!execution) return null;

  const execStyle = EXEC_STATUS_STYLES[execution.status] || EXEC_STATUS_STYLES.cancelled;
  const progress = execution.progress;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/workflows/${workflowId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">
              {execution.workflow_name || "Workflow"} — Execution #{execution.id}
            </h1>
            <span className={execStyle.color}>{execStyle.icon}</span>
            <Badge
              variant={execution.status === "completed" ? "default" : execution.status === "failed" ? "destructive" : "secondary"}
            >
              {execution.status}
            </Badge>
          </div>
          {execution.error_message && (
            <p className="text-sm text-red-500 mt-0.5">{execution.error_message}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(execution.status === "running" || execution.status === "paused") && (
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              <Ban className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          )}
          {execution.status === "failed" && (
            <Button size="sm" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress.completed} / {progress.total} steps</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                execution.status === "failed" ? "bg-red-500" :
                execution.status === "completed" ? "bg-emerald-500" : "bg-blue-500"
              }`}
              style={{ width: progress.total > 0 ? `${(progress.completed / progress.total) * 100}%` : "0%" }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual DAG (read-only) */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-[repeating-linear-gradient(0deg,transparent,transparent_19px,hsl(var(--border)/0.3)_19px,hsl(var(--border)/0.3)_20px),repeating-linear-gradient(90deg,transparent,transparent_19px,hsl(var(--border)/0.3)_19px,hsl(var(--border)/0.3)_20px)] overflow-auto relative"
            style={{ minHeight: 400 }}
          >
            <div className="relative" style={{ minHeight: 400, minWidth: 600 }}>
              {/* SVG edges */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {edges.map(({ fromId, toId }) => {
                  const from = stepPositions.get(fromId);
                  const to = stepPositions.get(toId);
                  if (!from || !to) return null;
                  const x1 = from.x + NODE_W / 2;
                  const y1 = from.y + NODE_H;
                  const x2 = to.x + NODE_W / 2;
                  const y2 = to.y;
                  const midY = (y1 + y2) / 2;
                  return (
                    <path
                      key={`${fromId}-${toId}`}
                      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                      fill="none"
                      stroke="hsl(var(--primary) / 0.3)"
                      strokeWidth={2}
                    />
                  );
                })}
              </svg>

              {/* Nodes */}
              {workflow?.steps.map((step) => {
                const se = stepExecMap.get(step.step_id);
                const status = se?.status || "pending";
                const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
                return (
                  <div
                    key={step.step_id}
                    className={`absolute rounded-xl border-2 shadow-sm ${style.bg} ${style.border} ${
                      status === "running" ? "animate-pulse" : ""
                    }`}
                    style={{
                      left: step.position_x,
                      top: step.position_y,
                      width: NODE_W,
                      height: NODE_H,
                      zIndex: 2,
                    }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 h-full">
                      <div className="text-lg">
                        {status === "completed" ? "✅" :
                         status === "failed" ? "❌" :
                         status === "running" ? "⚡" :
                         status === "waiting_approval" ? "⏳" :
                         status === "skipped" ? "⏭️" : "⬜"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${style.text}`}>{step.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {style.label}
                          {se?.task_id && (
                            <button
                              onClick={() => window.open(`/boards?task=${se.task_id}`, "_blank")}
                              className="ml-1 inline-flex items-center text-primary hover:underline"
                            >
                              Task #{se.task_id}
                              <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Timeline</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Started {new Date(execution.started_at).toLocaleString()}
            </div>
            {timeline.map((se) => {
              const style = STATUS_STYLES[se.status] || STATUS_STYLES.pending;
              return (
                <Card key={se.id} className={`border ${style.border}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${style.text}`}>{se.step_name}</span>
                      <Badge variant="outline" className={`text-[10px] ${style.text}`}>
                        {style.label}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {se.started_at && (
                        <div>Started: {new Date(se.started_at).toLocaleTimeString()}</div>
                      )}
                      {se.completed_at && (
                        <div>Completed: {new Date(se.completed_at).toLocaleTimeString()}</div>
                      )}
                      {se.error_message && (
                        <div className="text-red-500">{se.error_message}</div>
                      )}
                      {se.task_id && (
                        <button
                          onClick={() => window.open(`/boards?task=${se.task_id}`, "_blank")}
                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          View Task #{se.task_id}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {execution.completed_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Finished {new Date(execution.completed_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
