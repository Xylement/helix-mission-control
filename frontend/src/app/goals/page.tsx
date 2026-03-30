"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type Goal, type GoalTree, type Agent, type Board, type Department } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// inline progress bar (no shadcn Progress component needed)
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Target,
  Plus,
  Loader2,
  ChevronRight,
  ChevronDown,
  List,
  GitBranch,
  Trash2,
  Pencil,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  mission: { label: "Mission", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  objective: { label: "Objective", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  key_result: { label: "Key Result", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
  completed: { label: "Completed", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  paused: { label: "Paused", className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

export default function GoalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [tree, setTree] = useState<GoalTree[]>([]);
  const [flatGoals, setFlatGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"tree" | "list">("tree");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formParentId, setFormParentId] = useState<string>("");
  const [formDepartmentId, setFormDepartmentId] = useState<string>("");
  const [formBoardId, setFormBoardId] = useState<string>("");
  const [formOwnerType, setFormOwnerType] = useState<string>("");
  const [formOwnerId, setFormOwnerId] = useState<string>("");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formStatus, setFormStatus] = useState("active");

  // Reference data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Expanded nodes in tree view
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const loadGoals = useCallback(async () => {
    try {
      const [treeData, flatData] = await Promise.all([
        api.getGoalTree(statusFilter !== "all" ? statusFilter : undefined),
        api.getGoals(statusFilter !== "all" ? { status: statusFilter } : undefined),
      ]);
      setTree(treeData);
      setFlatGoals(flatData);
      // Auto-expand missions
      const missionIds = new Set(treeData.map((t) => t.id));
      setExpanded((prev) => new Set([...Array.from(prev), ...Array.from(missionIds)]));
    } catch {
      toast.error("Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [d, b, a] = await Promise.all([
        api.departments(),
        api.boards(),
        api.agents(),
      ]);
      setDepartments(d);
      setBoards(b);
      setAgents(a);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (createOpen || editGoal) loadReferenceData();
  }, [createOpen, editGoal, loadReferenceData]);

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormParentId("");
    setFormDepartmentId("");
    setFormBoardId("");
    setFormOwnerType("");
    setFormOwnerId("");
    setFormTargetDate("");
    setFormStatus("active");
  };

  const openCreate = (parentId?: number) => {
    resetForm();
    if (parentId) setFormParentId(String(parentId));
    setCreateOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setFormTitle(goal.title);
    setFormDescription(goal.description || "");
    setFormParentId(goal.parent_goal_id ? String(goal.parent_goal_id) : "");
    setFormDepartmentId(goal.department_id ? String(goal.department_id) : "");
    setFormBoardId(goal.board_id ? String(goal.board_id) : "");
    setFormOwnerType(goal.owner_type || "");
    setFormOwnerId(goal.owner_id ? String(goal.owner_id) : "");
    setFormTargetDate(goal.target_date || "");
    setFormStatus(goal.status);
    setEditGoal(goal);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        parent_goal_id: formParentId && formParentId !== "none" ? Number(formParentId) : undefined,
        department_id: formDepartmentId && formDepartmentId !== "none" ? Number(formDepartmentId) : undefined,
        board_id: formBoardId && formBoardId !== "none" ? Number(formBoardId) : undefined,
        owner_type: formOwnerType && formOwnerType !== "none" ? formOwnerType : undefined,
        owner_id: formOwnerId && formOwnerId !== "none" ? Number(formOwnerId) : undefined,
        target_date: formTargetDate || undefined,
      };

      if (editGoal) {
        (data as Record<string, unknown>).status = formStatus;
        await api.updateGoal(editGoal.id, data);
        toast.success("Goal updated");
        setEditGoal(null);
      } else {
        await api.createGoal(data);
        toast.success("Goal created");
        setCreateOpen(false);
      }
      resetForm();
      loadGoals();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save goal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteGoal) return;
    setSaving(true);
    try {
      await api.deleteGoal(deleteGoal.id);
      toast.success("Goal deleted");
      setDeleteGoal(null);
      loadGoals();
    } catch {
      toast.error("Failed to delete goal");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoProgress = async (goalId: number) => {
    try {
      await api.updateGoalProgress(goalId, undefined, true);
      toast.success("Progress recalculated");
      loadGoals();
    } catch {
      toast.error("Failed to recalculate progress");
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Goals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Strategic goals: Mission &rarr; Objectives &rarr; Key Results
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={view === "tree" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("tree")}
              className="rounded-none"
            >
              <GitBranch className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="rounded-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {isAdmin && (
            <Button onClick={() => openCreate()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Mission
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {view === "tree" ? (
        <div className="space-y-3">
          {tree.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No goals yet. Create a mission to get started.</p>
              </CardContent>
            </Card>
          ) : (
            tree.map((mission) => (
              <GoalTreeNode
                key={mission.id}
                goal={mission}
                depth={0}
                expanded={expanded}
                toggleExpand={toggleExpand}
                isAdmin={isAdmin}
                onAddChild={openCreate}
                onEdit={openEdit}
                onDelete={setDeleteGoal}
                onAutoProgress={handleAutoProgress}
              />
            ))
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Target Date</TableHead>
                  <TableHead>Tasks</TableHead>
                  {isAdmin && <TableHead className="w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatGoals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">
                      No goals found
                    </TableCell>
                  </TableRow>
                ) : (
                  flatGoals.map((g) => {
                    const typeBadge = TYPE_BADGES[g.goal_type] || TYPE_BADGES.objective;
                    const statusBadge = STATUS_BADGES[g.status] || STATUS_BADGES.active;
                    return (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={typeBadge.className}>{typeBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadge.className}>{statusBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${g.progress}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-8">{g.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.target_date || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{g.tasks_count}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(g)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteGoal(g)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen || !!editGoal} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditGoal(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editGoal ? "Edit Goal" : "Create Goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Grow Instagram to 10K followers" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" rows={3} />
            </div>
            {!editGoal && (
              <div>
                <label className="text-sm font-medium mb-1 block">Parent Goal</label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None (top-level mission)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level mission)</SelectItem>
                    {flatGoals
                      .filter((g) => g.goal_type !== "key_result")
                      .map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.goal_type === "mission" ? "Mission" : "Objective"}: {g.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Department</label>
                <Select value={formDepartmentId} onValueChange={setFormDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Board</label>
                <Select value={formBoardId} onValueChange={setFormBoardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {boards.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Owner Type</label>
                <Select value={formOwnerType} onValueChange={(v) => { setFormOwnerType(v); setFormOwnerId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formOwnerType === "agent" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Agent</label>
                  <Select value={formOwnerId} onValueChange={setFormOwnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Target Date</label>
                <Input type="date" value={formTargetDate} onChange={(e) => setFormTargetDate(e.target.value)} />
              </div>
              {editGoal && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Status</label>
                  <Select value={formStatus} onValueChange={setFormStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setCreateOpen(false); setEditGoal(null); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={!formTitle.trim() || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editGoal ? "Save Changes" : "Create Goal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteGoal} onOpenChange={(open) => { if (!open) setDeleteGoal(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Goal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{deleteGoal?.title}&rdquo;? This will also delete all sub-goals. Tasks will be unlinked but not deleted.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteGoal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Tree Node Component ---

function GoalTreeNode({
  goal,
  depth,
  expanded,
  toggleExpand,
  isAdmin,
  onAddChild,
  onEdit,
  onDelete,
  onAutoProgress,
}: {
  goal: GoalTree;
  depth: number;
  expanded: Set<number>;
  toggleExpand: (id: number) => void;
  isAdmin: boolean;
  onAddChild: (parentId: number) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onAutoProgress: (goalId: number) => void;
}) {
  const isExpanded = expanded.has(goal.id);
  const hasChildren = goal.children && goal.children.length > 0;
  const typeBadge = TYPE_BADGES[goal.goal_type] || TYPE_BADGES.objective;
  const statusBadge = STATUS_BADGES[goal.status] || STATUS_BADGES.active;

  const depthColors = [
    "border-l-purple-500",   // mission
    "border-l-blue-500",     // objective
    "border-l-emerald-500",  // key_result
  ];

  const canAddChild = goal.goal_type !== "key_result";

  return (
    <div className={depth > 0 ? "ml-6" : ""}>
      <Card className={`border-l-4 ${depthColors[depth] || depthColors[2]} hover:shadow-md transition-all duration-200`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Expand/collapse */}
            <button
              onClick={() => hasChildren && toggleExpand(goal.id)}
              className={`mt-1 p-0.5 rounded transition-colors ${hasChildren ? "hover:bg-accent cursor-pointer" : "opacity-30 cursor-default"}`}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{goal.title}</span>
                <Badge variant="outline" className={typeBadge.className + " text-xs"}>{typeBadge.label}</Badge>
                <Badge variant="outline" className={statusBadge.className + " text-xs"}>{statusBadge.label}</Badge>
              </div>
              {goal.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${goal.progress}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{goal.progress}%</span>
                </div>
                {goal.target_date && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {goal.target_date}
                  </span>
                )}
                {goal.tasks_count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {goal.tasks_count} task{goal.tasks_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            {isAdmin && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Recalculate progress" onClick={() => onAutoProgress(goal.id)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {canAddChild && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Add sub-goal" onClick={() => onAddChild(goal.id)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => onEdit(goal as unknown as Goal)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="Delete" onClick={() => onDelete(goal as unknown as Goal)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="mt-2 space-y-2">
          {goal.children.map((child) => (
            <GoalTreeNode
              key={child.id}
              goal={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              isAdmin={isAdmin}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onAutoProgress={onAutoProgress}
            />
          ))}
        </div>
      )}
    </div>
  );
}
