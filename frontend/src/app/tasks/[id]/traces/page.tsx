"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Trace, type Task } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TraceViewer } from "@/components/trace-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Cpu,
  Layers,
  Loader2,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { DelegationTree } from "@/components/delegation-tree";

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
  cancelled: "bg-muted text-muted-foreground",
};

export default function TaskTracesPage() {
  useAuth();
  const params = useParams();
  const router = useRouter();
  const taskId = Number(params.id);

  const [traces, setTraces] = useState<Trace[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getTaskTraces(taskId),
      api.task(taskId),
    ])
      .then(([t, tk]) => {
        setTraces(t);
        setTask(tk);
        // Auto-expand if single trace
        if (t.length === 1) setSelectedTraceId(t[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in-page max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            // Trace page is typically opened in a new tab from the board task detail,
            // so router.back() would go nowhere useful. Navigate to the board directly.
            router.push(task?.board_id ? `/boards/${task.board_id}` : "/");
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Execution Traces</h1>
          {task && (
            <p className="text-sm text-muted-foreground">
              Task: {task.title}
            </p>
          )}
        </div>
      </div>

      {traces.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No execution traces found for this task.
          </CardContent>
        </Card>
      ) : traces.length === 1 && selectedTraceId ? (
        <TraceViewer traceId={selectedTraceId} />
      ) : (
        <div className="space-y-3">
          {traces.map((trace) => (
            <Card
              key={trace.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedTraceId === trace.id ? "ring-1 ring-primary" : ""}`}
              onClick={() => setSelectedTraceId(selectedTraceId === trace.id ? null : trace.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Badge className={STATUS_COLORS[trace.trace_status] || ""}>
                    {trace.trace_status}
                  </Badge>
                  {trace.model_provider && trace.model_name && (
                    <span className="text-xs text-muted-foreground">
                      {trace.model_provider}/{trace.model_name}
                    </span>
                  )}
                  <div className="flex items-center gap-4 ml-auto text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {trace.total_steps}
                    </span>
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> {(trace.total_input_tokens + trace.total_output_tokens).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> ${trace.total_estimated_cost_usd.toFixed(4)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDuration(trace.duration_ms)}
                    </span>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedTraceId === trace.id ? "rotate-90" : ""}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(trace.started_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}

          {/* Expanded trace detail */}
          {selectedTraceId && (
            <div className="mt-4">
              <TraceViewer traceId={selectedTraceId} />
            </div>
          )}
        </div>
      )}
      {/* Delegation tree for tasks with sub-tasks */}
      {task && task.sub_tasks_count > 0 && (
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <GitBranch className="h-4 w-4 text-purple-500" />
            Delegated Sub-tasks
          </h2>
          <Card>
            <CardContent className="p-4">
              <DelegationTree
                taskId={taskId}
                onTaskClick={(id) => router.push(`/tasks/${id}/traces`)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
