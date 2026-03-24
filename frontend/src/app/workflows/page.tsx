"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type WorkflowListItem,
} from "@/lib/api";
import { isFeatureError } from "@/lib/billing";
import { FeatureGateModal } from "@/components/billing/FeatureGateModal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  GitBranch,
  Plus,
  Play,
  Pencil,
  Clock,
  Store,
  Bot,
  Layers,
  Trash2,
} from "lucide-react";

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [featureGate, setFeatureGate] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await api.workflows();
      setWorkflows(data);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const wf = await api.createWorkflow({ name: newName.trim(), description: newDesc.trim() || undefined });
      toast.success(`Workflow "${wf.name}" created`);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      router.push(`/workflows/${wf.id}`);
    } catch (err) {
      if (isFeatureError(err)) {
        setShowCreate(false);
        setFeatureGate(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to create workflow");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRun = async (wfId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.startWorkflowExecution(wfId);
      toast.success("Workflow started");
      fetchWorkflows();
    } catch (err) {
      if (isFeatureError(err)) {
        setFeatureGate(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to start workflow");
      }
    }
  };

  const handleDelete = async (wfId: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete workflow "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteWorkflow(wfId);
      toast.success("Workflow deleted");
      fetchWorkflows();
    } catch {
      toast.error("Failed to delete workflow");
    }
  };

  const statusColor: Record<string, string> = {
    running: "bg-blue-500",
    completed: "bg-emerald-500",
    failed: "bg-red-500",
    cancelled: "bg-gray-400",
    paused: "bg-amber-500",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <GitBranch className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Workflows</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Automate multi-step processes across your agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/marketplace?type=workflow")}>
            <Store className="h-4 w-4 mr-1.5" />
            Browse Templates
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Workflow
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="h-5 w-2/3 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-full bg-muted rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No workflows yet</p>
          <p className="text-sm mb-4">Create a workflow to automate multi-step agent processes</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Workflow
            </Button>
            <Button variant="outline" onClick={() => router.push("/marketplace?type=workflow")}>
              <Store className="h-4 w-4 mr-1.5" />
              Browse Templates
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map((wf) => (
            <Card
              key={wf.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
              onClick={() => router.push(`/workflows/${wf.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                      {wf.name}
                    </h3>
                    {wf.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {wf.description}
                      </p>
                    )}
                  </div>
                  {!wf.is_active && (
                    <Badge variant="secondary" className="text-[10px] ml-2">Inactive</Badge>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {wf.step_count} step{wf.step_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Bot className="h-3 w-3" />
                    {wf.agent_count} agent{wf.agent_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {wf.trigger_type}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    {wf.last_execution ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${statusColor[wf.last_execution.status] || "bg-gray-400"}`} />
                        Last run: {wf.last_execution.status}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Never run</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => handleRun(wf.id, e)}
                      title="Run workflow"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}`); }}
                      title="Edit workflow"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={(e) => handleDelete(wf.id, wf.name, e)}
                      title="Delete workflow"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {wf.marketplace_template_slug && (
                  <div className="mt-2 pt-2 border-t">
                    <Badge variant="outline" className="text-[10px]">
                      <Store className="h-3 w-3 mr-1" />
                      {wf.marketplace_template_slug}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Content Pipeline"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Describe what this workflow does..."
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feature Gate */}
      <FeatureGateModal
        open={featureGate}
        onClose={() => setFeatureGate(false)}
        feature="workflow_builder"
        requiredPlan="pro"
      />
    </div>
  );
}
