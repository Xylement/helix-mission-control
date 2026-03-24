"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type WorkflowDetail,
  type WorkflowStepCreate,
  type Agent,
  type WorkflowExecutionListItem,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Play,
  Plus,
  Trash2,
  Bot,
  User,
  AlertTriangle,
  History,
  X,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

interface DraftStep {
  step_id: string;
  name: string;
  agent_id: number | null;
  action_prompt: string;
  depends_on: string[];
  timeout_minutes: number;
  requires_approval: boolean;
  step_order: number;
  position_x: number;
  position_y: number;
  config: Record<string, unknown> | null;
  _db_id?: number;
}

function generateStepId() {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function WorkflowBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = Number(params.id);

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecutionListItem[]>([]);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [wfName, setWfName] = useState("");
  const [wfDesc, setWfDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [showExecutions, setShowExecutions] = useState(false);

  // Canvas state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connLine, setConnLine] = useState<{ x: number; y: number } | null>(null);

  const fetchWorkflow = useCallback(async () => {
    try {
      const [wf, agentList] = await Promise.all([
        api.workflow(workflowId),
        api.agents(),
      ]);
      setWorkflow(wf);
      setWfName(wf.name);
      setWfDesc(wf.description || "");
      setSteps(
        wf.steps.map((s) => ({
          step_id: s.step_id,
          name: s.name,
          agent_id: s.agent_id,
          action_prompt: s.action_prompt || "",
          depends_on: s.depends_on || [],
          timeout_minutes: s.timeout_minutes,
          requires_approval: s.requires_approval,
          step_order: s.step_order,
          position_x: s.position_x,
          position_y: s.position_y,
          config: s.config,
          _db_id: s.id,
        }))
      );
      setAgents(agentList);

      try {
        const execs = await api.workflowExecutions(workflowId);
        setExecutions(execs.slice(0, 5));
      } catch {
        // non-critical
      }
    } catch {
      toast.error("Failed to load workflow");
      router.push("/workflows");
    } finally {
      setLoading(false);
    }
  }, [workflowId, router]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Validation
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    const ids = new Set(steps.map((s) => s.step_id));

    // Duplicate step IDs
    if (ids.size !== steps.length) errs.push("Duplicate step IDs detected");

    // Unknown dependencies
    for (const s of steps) {
      for (const dep of s.depends_on) {
        if (!ids.has(dep)) errs.push(`Step "${s.name}" depends on unknown "${dep}"`);
      }
    }

    // Simple cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();
    function hasCycle(sid: string): boolean {
      if (inStack.has(sid)) return true;
      if (visited.has(sid)) return false;
      visited.add(sid);
      inStack.add(sid);
      const step = steps.find((s) => s.step_id === sid);
      if (step) {
        for (const dep of step.depends_on) {
          if (hasCycle(dep)) return true;
        }
      }
      inStack.delete(sid);
      return false;
    }
    for (const s of steps) {
      visited.clear();
      inStack.clear();
      if (hasCycle(s.step_id)) {
        errs.push("Circular dependency detected");
        break;
      }
    }

    // Orphan check (no root steps)
    if (steps.length > 0) {
      const hasRoot = steps.some((s) => s.depends_on.length === 0);
      if (!hasRoot) errs.push("No root step found (all steps have dependencies)");
    }

    return errs;
  }, [steps]);

  // Add step
  const addStep = (type: "agent" | "human") => {
    const id = generateStepId();
    const maxY = steps.length > 0 ? Math.max(...steps.map((s) => s.position_y)) : 0;
    const newStep: DraftStep = {
      step_id: id,
      name: type === "agent" ? "New Agent Step" : "Human Review",
      agent_id: null,
      action_prompt: "",
      depends_on: [],
      timeout_minutes: 60,
      requires_approval: type === "human",
      step_order: steps.length,
      position_x: 250,
      position_y: maxY + 150,
      config: null,
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStep(id);
    setDirty(true);
  };

  // Delete step
  const deleteStep = (stepId: string) => {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.step_id !== stepId);
      return filtered.map((s) => ({
        ...s,
        depends_on: s.depends_on.filter((d) => d !== stepId),
      }));
    });
    if (selectedStep === stepId) setSelectedStep(null);
    setDirty(true);
  };

  // Update step
  const updateStep = (stepId: string, updates: Partial<DraftStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.step_id === stepId ? { ...s, ...updates } : s))
    );
    setDirty(true);
  };

  // Save
  const handleSave = async () => {
    if (validationErrors.length > 0) {
      toast.error("Fix validation errors before saving");
      return;
    }
    setSaving(true);
    try {
      // Update workflow name/desc
      if (wfName !== workflow?.name || wfDesc !== (workflow?.description || "")) {
        await api.updateWorkflow(workflowId, { name: wfName, description: wfDesc || undefined } as Partial<import("@/lib/api").WorkflowListItem>);
      }
      // Bulk update steps
      const stepData: WorkflowStepCreate[] = steps.map((s, i) => ({
        step_id: s.step_id,
        name: s.name,
        agent_id: s.agent_id,
        action_prompt: s.action_prompt || undefined,
        depends_on: s.depends_on,
        timeout_minutes: s.timeout_minutes,
        requires_approval: s.requires_approval,
        step_order: i,
        position_x: s.position_x,
        position_y: s.position_y,
        config: s.config,
      }));
      await api.bulkUpdateWorkflowSteps(workflowId, stepData);
      toast.success("Workflow saved");
      setDirty(false);
      fetchWorkflow();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Run
  const handleRun = async () => {
    if (dirty) {
      toast.error("Save changes before running");
      return;
    }
    try {
      const exec = await api.startWorkflowExecution(workflowId);
      toast.success("Workflow started");
      router.push(`/workflows/${workflowId}/executions/${exec.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start");
    }
  };

  // Canvas drag handlers
  const handleNodeMouseDown = (stepId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-handle]")) return;
    e.preventDefault();
    const step = steps.find((s) => s.step_id === stepId);
    if (!step) return;
    setDragging(stepId);
    const rect = canvasRef.current?.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - (rect?.left || 0) - step.position_x,
      y: e.clientY - (rect?.top || 0) - step.position_y,
    });
    setSelectedStep(stepId);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (dragging) {
      const x = Math.max(0, e.clientX - rect.left - dragOffset.x);
      const y = Math.max(0, e.clientY - rect.top - dragOffset.y);
      updateStep(dragging, { position_x: Math.round(x), position_y: Math.round(y) });
    }
    if (connecting) {
      setConnLine({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (dragging) setDragging(null);
    if (connecting) {
      // Check if dropped on a node
      const target = (e.target as HTMLElement).closest("[data-step-id]");
      if (target) {
        const targetId = target.getAttribute("data-step-id");
        if (targetId && targetId !== connecting) {
          // Add dependency: target depends on connecting (source)
          const targetStep = steps.find((s) => s.step_id === targetId);
          if (targetStep && !targetStep.depends_on.includes(connecting)) {
            updateStep(targetId, {
              depends_on: [...targetStep.depends_on, connecting],
            });
          }
        }
      }
      setConnecting(null);
      setConnLine(null);
    }
  };

  const handleConnectStart = (stepId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConnecting(stepId);
  };

  // Remove edge
  const removeEdge = (targetId: string, sourceId: string) => {
    updateStep(targetId, {
      depends_on: steps.find((s) => s.step_id === targetId)?.depends_on.filter((d) => d !== sourceId) || [],
    });
  };

  // SVG edge paths
  const NODE_W = 200;
  const NODE_H = 72;

  const edges = useMemo(() => {
    const result: Array<{ from: DraftStep; to: DraftStep; fromId: string; toId: string }> = [];
    for (const s of steps) {
      for (const dep of s.depends_on) {
        const from = steps.find((st) => st.step_id === dep);
        if (from) result.push({ from, to: s, fromId: dep, toId: s.step_id });
      }
    }
    return result;
  }, [steps]);

  const getAgentName = (id: number | null) => {
    if (!id) return null;
    return agents.find((a) => a.id === id)?.name || null;
  };

  const selected = steps.find((s) => s.step_id === selectedStep);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading workflow...</div>
      </div>
    );
  }

  if (!workflow) return null;

  const statusColor: Record<string, string> = {
    running: "text-blue-500",
    completed: "text-emerald-500",
    failed: "text-red-500",
    cancelled: "text-gray-400",
    paused: "text-amber-500",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 pb-4 border-b mb-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/workflows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={wfName}
          onChange={(e) => { setWfName(e.target.value); setDirty(true); }}
          className="font-semibold text-lg border-none shadow-none focus-visible:ring-0 h-auto py-0 px-1 max-w-xs"
        />
        <Badge variant="secondary" className="text-xs">{workflow.trigger_type}</Badge>
        {dirty && <Badge variant="outline" className="text-xs text-amber-500 border-amber-500">Unsaved</Badge>}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowExecutions(!showExecutions)}
        >
          <History className="h-4 w-4 mr-1.5" />
          Runs
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" onClick={handleRun} disabled={dirty || steps.length === 0}>
          <Play className="h-4 w-4 mr-1.5" />
          Run
        </Button>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left — Step Palette */}
        <div className="w-48 shrink-0 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Add Step</p>
          <button
            onClick={() => addStep("agent")}
            className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-sm"
          >
            <Bot className="h-4 w-4 text-blue-500" />
            Agent Step
          </button>
          <button
            onClick={() => addStep("human")}
            className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-sm"
          >
            <User className="h-4 w-4 text-emerald-500" />
            Human Review
          </button>

          {/* Recent Executions */}
          {showExecutions && executions.length > 0 && (
            <div className="mt-4 pt-4 border-t space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Runs</p>
              {executions.map((exe) => (
                <button
                  key={exe.id}
                  onClick={() => router.push(`/workflows/${workflowId}/executions/${exe.id}`)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent text-xs text-left"
                >
                  <span className={statusColor[exe.status] || "text-gray-400"}>
                    {exe.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                     exe.status === "failed" ? <XCircle className="h-3.5 w-3.5" /> :
                     exe.status === "running" ? <Clock className="h-3.5 w-3.5 animate-spin" /> :
                     <Clock className="h-3.5 w-3.5" />}
                  </span>
                  <span className="flex-1 truncate">
                    {new Date(exe.started_at).toLocaleDateString()}
                  </span>
                  {exe.progress && (
                    <span className="text-muted-foreground">
                      {exe.progress.completed}/{exe.progress.total}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center — Canvas */}
        <div className="flex-1 relative rounded-xl border bg-[repeating-linear-gradient(0deg,transparent,transparent_19px,hsl(var(--border)/0.3)_19px,hsl(var(--border)/0.3)_20px),repeating-linear-gradient(90deg,transparent,transparent_19px,hsl(var(--border)/0.3)_19px,hsl(var(--border)/0.3)_20px)] overflow-auto">
          <div
            ref={canvasRef}
            className="relative min-h-full min-w-full"
            style={{ minHeight: 600, minWidth: 800 }}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { setDragging(null); setConnecting(null); setConnLine(null); }}
            onClick={(e) => {
              if (e.target === e.currentTarget || e.target === canvasRef.current) {
                setSelectedStep(null);
              }
            }}
          >
            {/* SVG edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {edges.map(({ from, to, fromId, toId }) => {
                const x1 = from.position_x + NODE_W / 2;
                const y1 = from.position_y + NODE_H;
                const x2 = to.position_x + NODE_W / 2;
                const y2 = to.position_y;
                const midY = (y1 + y2) / 2;
                return (
                  <g key={`${fromId}-${toId}`}>
                    <path
                      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                      fill="none"
                      stroke="hsl(var(--primary) / 0.4)"
                      strokeWidth={2}
                      markerEnd="url(#arrowhead)"
                    />
                    {/* Click target for edge removal */}
                    <path
                      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); removeEdge(toId, fromId); }}
                    >
                      <title>Click to remove connection</title>
                    </path>
                  </g>
                );
              })}
              {/* Temp connection line */}
              {connecting && connLine && (() => {
                const src = steps.find((s) => s.step_id === connecting);
                if (!src) return null;
                const x1 = src.position_x + NODE_W / 2;
                const y1 = src.position_y + NODE_H;
                return (
                  <line
                    x1={x1} y1={y1} x2={connLine.x} y2={connLine.y}
                    stroke="hsl(var(--primary) / 0.6)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                  />
                );
              })()}
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary) / 0.4)" />
                </marker>
              </defs>
            </svg>

            {/* Nodes */}
            {steps.map((step) => {
              const agentName = getAgentName(step.agent_id);
              const isSelected = selectedStep === step.step_id;
              return (
                <div
                  key={step.step_id}
                  data-step-id={step.step_id}
                  className={`absolute rounded-xl border-2 bg-card shadow-sm transition-shadow cursor-grab active:cursor-grabbing select-none ${
                    isSelected
                      ? "border-primary shadow-md ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40 hover:shadow-md"
                  }`}
                  style={{
                    left: step.position_x,
                    top: step.position_y,
                    width: NODE_W,
                    height: NODE_H,
                    zIndex: isSelected ? 10 : 2,
                  }}
                  onMouseDown={(e) => handleNodeMouseDown(step.step_id, e)}
                >
                  <div className="flex items-center gap-2 px-3 py-2 h-full">
                    <div className="text-lg">
                      {step.requires_approval ? "👤" : step.agent_id ? "🤖" : "📋"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{step.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {agentName || (step.requires_approval ? "Human review" : "Unassigned")}
                      </div>
                    </div>
                  </div>
                  {/* Output handle (bottom) */}
                  <div
                    data-handle="output"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 rounded-full bg-primary/80 border-2 border-background cursor-crosshair hover:bg-primary hover:scale-125 transition-transform"
                    style={{ zIndex: 20 }}
                    onMouseDown={(e) => handleConnectStart(step.step_id, e)}
                  />
                  {/* Input handle (top) */}
                  <div
                    data-step-id={step.step_id}
                    className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-muted border-2 border-background"
                    style={{ zIndex: 20 }}
                  />
                </div>
              );
            })}

            {steps.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Plus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Add steps from the palette to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right — Config Panel */}
        {selected && (
          <div className="w-72 shrink-0 border rounded-xl p-4 space-y-4 overflow-y-auto bg-card">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Step Config</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedStep(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <Input
                value={selected.name}
                onChange={(e) => updateStep(selected.step_id, { name: e.target.value })}
                className="h-8 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Step ID</label>
              <Input value={selected.step_id} disabled className="h-8 text-sm font-mono" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Agent</label>
              <Select
                value={selected.agent_id ? String(selected.agent_id) : "_none"}
                onValueChange={(v) => updateStep(selected.step_id, { agent_id: v === "_none" ? null : Number(v) })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No agent (human step)</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Action Prompt</label>
              <Textarea
                value={selected.action_prompt}
                onChange={(e) => updateStep(selected.step_id, { action_prompt: e.target.value })}
                rows={4}
                className="text-sm"
                placeholder="Instructions for this step..."
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Dependencies ({selected.depends_on.length})
              </label>
              <div className="space-y-1">
                {selected.depends_on.map((dep) => {
                  const depStep = steps.find((s) => s.step_id === dep);
                  return (
                    <div key={dep} className="flex items-center gap-1 text-xs bg-accent rounded px-2 py-1">
                      <span className="flex-1 truncate">{depStep?.name || dep}</span>
                      <button
                        onClick={() =>
                          updateStep(selected.step_id, {
                            depends_on: selected.depends_on.filter((d) => d !== dep),
                          })
                        }
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {steps.filter((s) => s.step_id !== selected.step_id && !selected.depends_on.includes(s.step_id)).length > 0 && (
                  <Select
                    value="_add"
                    onValueChange={(v) => {
                      if (v !== "_add") {
                        updateStep(selected.step_id, {
                          depends_on: [...selected.depends_on, v],
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Add dependency..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_add" disabled>Add dependency...</SelectItem>
                      {steps
                        .filter((s) => s.step_id !== selected.step_id && !selected.depends_on.includes(s.step_id))
                        .map((s) => (
                          <SelectItem key={s.step_id} value={s.step_id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Timeout (minutes)</label>
              <Input
                type="number"
                value={selected.timeout_minutes}
                onChange={(e) => updateStep(selected.step_id, { timeout_minutes: parseInt(e.target.value) || 60 })}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requires_approval"
                checked={selected.requires_approval}
                onChange={(e) => updateStep(selected.step_id, { requires_approval: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="requires_approval" className="text-xs">Requires approval</label>
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => deleteStep(selected.step_id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete Step
            </Button>
          </div>
        )}
      </div>

      {/* Validation bar */}
      {validationErrors.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {validationErrors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
