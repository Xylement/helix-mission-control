"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { api, type Board, type Task, type Agent, type Comment as CommentType, type Goal } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWS } from "@/contexts/WebSocketContext";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TaskResultRenderer } from "@/components/TaskResultRenderer";
import { TaskAttachments } from "@/components/TaskAttachments";
import { MentionAutocomplete } from "@/components/mention-autocomplete";
import {
  Plus, MessageSquare, Play, Loader2, Zap, Bot, Tag, Columns3,
  Calendar, Clock, User, ChevronDown, ChevronUp, Pencil, Trash2, Check, Archive, X, Target, Activity,
} from "lucide-react";
import { toast } from "sonner";

const COLUMNS = [
  { key: "todo", label: "Todo", color: "border-t-slate-400 dark:border-t-slate-500", bg: "bg-slate-50/50 dark:bg-slate-900/20" },
  { key: "in_progress", label: "In Progress", color: "border-t-blue-500", bg: "bg-blue-50/30 dark:bg-blue-900/10" },
  { key: "review", label: "Review", color: "border-t-amber-500", bg: "bg-amber-50/30 dark:bg-amber-900/10" },
  { key: "done", label: "Done", color: "border-t-emerald-500", bg: "bg-emerald-50/30 dark:bg-emerald-900/10" },
] as const;

const PRIORITY_CONFIG: Record<string, { color: string; label: string; border: string }> = {
  urgent: { color: "bg-red-500/10 text-red-600 dark:text-red-400 border-0", label: "URGENT", border: "border-l-red-500" },
  high: { color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-0", label: "HIGH", border: "border-l-orange-500" },
  medium: { color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0", label: "MED", border: "border-l-blue-500" },
  low: { color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-0", label: "LOW", border: "border-l-gray-400" },
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-0",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0",
  review: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  todo: ["in_progress"],
  in_progress: ["todo", "review"],
  review: ["in_progress", "done"],
  done: [],
};

function DroppableColumn({
  status,
  label,
  children,
  count,
  isDragActive,
  dragFromStatus,
}: {
  status: string;
  label: string;
  children: React.ReactNode;
  count: number;
  isDragActive: boolean;
  dragFromStatus: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const isAllowed = dragFromStatus ? ALLOWED_TRANSITIONS[dragFromStatus]?.includes(status) : false;
  const isDisallowed = isDragActive && dragFromStatus !== status && !isAllowed;

  const colMeta = COLUMNS.find((c) => c.key === status);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl p-3 min-w-[280px] flex-1 transition-all duration-200 border-t-2 ${colMeta?.color || ""} ${
        isOver && isAllowed
          ? "bg-emerald-50/50 dark:bg-emerald-900/20 ring-2 ring-emerald-400/40"
          : isOver && isDisallowed
          ? "bg-red-50/50 dark:bg-red-900/20 ring-2 ring-red-400/40"
          : colMeta?.bg || "bg-muted/50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm tracking-tight">{label}</h3>
        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full">
          {count}
        </Badge>
      </div>
      <div className="space-y-2">
        {children}
        {count === 0 && !isDragActive && (
          <div className="text-center py-6 text-xs text-muted-foreground/60">No tasks</div>
        )}
      </div>
    </div>
  );
}

function DraggableTaskCard({
  task,
  onClick,
  onExecute,
  executing,
  gatewayConnected,
}: {
  task: Task;
  onClick: () => void;
  onExecute: (task: Task) => void;
  executing: boolean;
  gatewayConnected: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });

  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <Card
      ref={setNodeRef}
      className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 dark:hover:border-white/[0.12] group border-l-[3px] ${priority.border} ${
        isDragging ? "opacity-30 scale-95" : ""
      } ${task.archived ? "opacity-50 border-dashed" : ""}`}
      {...attributes}
      {...listeners}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <Badge className={`text-[10px] px-1.5 py-0 ${priority.color}`}>
            {priority.label}
          </Badge>
          {task.due_date && (
            <span className={`text-[10px] flex items-center gap-1 ${
              isOverdue ? "text-red-500 font-semibold" : "text-muted-foreground"
            }`}>
              <Calendar className="h-3 w-3" />
              {new Date(task.due_date).toLocaleDateString("en-MY", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>

        <h4 className="text-sm font-medium line-clamp-2 mb-1">
          {task.goal_id && <Target className="h-3 w-3 text-primary inline mr-1" />}
          {task.title}
        </h4>

        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-1
                         opacity-0 group-hover:opacity-100 transition-opacity">
            {task.description}
          </p>
        )}

        {task.assigned_agent && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Bot className="h-3 w-3" />
            <span>{task.assigned_agent.name}</span>
            {task.assigned_agent.execution_mode === "auto" && (
              <Zap className="h-3 w-3 text-yellow-500" />
            )}
          </div>
        )}

        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{task.tags.length - 3}</span>
            )}
          </div>
        )}

        {task.status === "todo" && task.assigned_agent?.execution_mode === "manual" && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="h-7 text-xs w-full"
              disabled={executing || !gatewayConnected}
              onClick={() => onExecute(task)}
            >
              <Play className="mr-1 h-3 w-3" />
              Execute
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskCardOverlay({ task }: { task: Task }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  return (
    <Card className="shadow-xl bg-card w-[280px] rotate-1 scale-[1.02] border-l-[3px] border-l-primary">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <Badge className={`text-[10px] px-1.5 py-0 ${priority.color}`}>
            {priority.label}
          </Badge>
        </div>
        <h4 className="text-sm font-medium line-clamp-2">{task.title}</h4>
        {task.assigned_agent && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Bot className="h-3 w-3" />
            <span>{task.assigned_agent.name}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const STEP_ORDER = ["todo", "in_progress", "review", "done"] as const;
const STEP_LABELS: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

function StatusStepper({ status }: { status: string }) {
  const currentIdx = STEP_ORDER.indexOf(status as (typeof STEP_ORDER)[number]);

  return (
    <div className="flex items-center w-full">
      {STEP_ORDER.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  isCompleted
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground border-2 border-muted-foreground/20"
                }`}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isCurrent
                    ? "text-primary"
                    : isCompleted
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 -mt-5 ${
                  i < currentIdx ? "bg-emerald-500" : "bg-muted-foreground/20"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CommentContent({ content, isAgent }: { content: string; isAgent: boolean }) {
  if (isAgent) {
    return <TaskResultRenderer content={content} />;
  }
  const parts = content.split(/(@[\w]+)/g);
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

function hasPermission(level: string | null | undefined, required: string): boolean {
  const levels: Record<string, number> = { no_access: -1, view: 0, create: 1, manage: 2 };
  if (!level) return true; // null = admin
  return (levels[level] ?? -1) >= (levels[required] ?? -1);
}

export default function BoardPage() {
  const { id } = useParams();
  const boardId = Number(id);
  const { user } = useAuth();
  const { subscribe } = useWS();
  const [board, setBoard] = useState<Board | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [commentText, setCommentText] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [executing, setExecuting] = useState(false);
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [resultOpen, setResultOpen] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit/Delete dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAgent, setEditAgent] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editGoalId, setEditGoalId] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newAgent, setNewAgent] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newGoalId, setNewGoalId] = useState<string>("");
  const [boardGoals, setBoardGoals] = useState<Goal[]>([]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const loadData = useCallback(async () => {
    const taskParams: { board_id: number; archived?: boolean } = { board_id: boardId };
    if (showArchived) {
      taskParams.archived = true;
    } else {
      taskParams.archived = false;
    }
    try {
      const [boardsRes, tasksRes, agentsRes, allAgentsRes, gwStatus] = await Promise.all([
        api.boards(),
        api.tasks(taskParams),
        api.agents({ board_id: boardId }),
        api.agents(),
        api.gatewayStatus().catch(() => ({ connected: false, pending_tasks: 0 })),
      ]);
      const foundBoard = boardsRes.find((b) => b.id === boardId);
      if (!foundBoard) {
        setAccessDenied(true);
        return;
      }
      // Load goals for this board (for banner and task creation dropdown)
      api.getGoals({ board_id: boardId, status: "active" })
        .then(setBoardGoals)
        .catch(() => setBoardGoals([]));
      setBoard(foundBoard);
      setTasks(tasksRes);
      setAgents(agentsRes);
      setAllAgents(allAgentsRes);
      setGatewayConnected(gwStatus.connected);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "error" in err && (err as Record<string, unknown>).error === "insufficient_permission") {
        setAccessDenied(true);
      }
    }
  }, [boardId, showArchived]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates via WebSocket
  useEffect(() => {
    const unsubs = [
      subscribe("task.created", (event) => {
        const meta = (event.data as Record<string, unknown>)?.metadata as Record<string, unknown>;
        if (meta?.board_id === boardId) loadData();
      }),
      subscribe("task.updated", (event) => {
        const meta = (event.data as Record<string, unknown>)?.metadata as Record<string, unknown>;
        if (meta?.board_id === boardId) loadData();
      }),
      subscribe("task.completed", (event) => {
        const meta = (event.data as Record<string, unknown>)?.metadata as Record<string, unknown>;
        if (meta?.board_id === boardId) loadData();
      }),
      subscribe("task.assigned", (event) => {
        const meta = (event.data as Record<string, unknown>)?.metadata as Record<string, unknown>;
        if (meta?.board_id === boardId) loadData();
      }),
      subscribe("task.deleted", (event) => {
        const meta = (event.data as Record<string, unknown>)?.metadata as Record<string, unknown>;
        if (meta?.board_id === boardId) loadData();
      }),
      subscribe("task.submitted_for_review", () => loadData()),
      subscribe("comment.added", (event) => {
        const data = event.data as Record<string, unknown>;
        if (detailTask && String(data.target_id) === String(detailTask.id)) {
          api.comments(detailTask.id).then(setComments).catch(() => {});
        }
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, boardId, loadData, detailTask]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      await api.createTask({
        title: newTitle,
        description: newDesc || undefined,
        priority: newPriority,
        board_id: boardId,
        assigned_agent_id: newAgent ? Number(newAgent) : undefined,
        due_date: newDueDate || undefined,
        tags: newTags.length > 0 ? newTags : undefined,
        goal_id: newGoalId && newGoalId !== "none" ? Number(newGoalId) : undefined,
      });
      setNewTitle("");
      setNewDesc("");
      setNewPriority("medium");
      setNewAgent("");
      setNewDueDate("");
      setNewTags([]);
      setNewTagInput("");
      setNewGoalId("");
      setCreateOpen(false);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (taskId: number, newStatus: string) => {
    await api.updateTask(taskId, { status: newStatus });
    loadData();
  };

  const openDetail = async (task: Task) => {
    setDetailTask(task);
    setResultOpen(true);
    const c = await api.comments(task.id);
    setComments(c);
  };

  const refreshDetail = async () => {
    if (!detailTask) return;
    const [t, c] = await Promise.all([
      api.task(detailTask.id),
      api.comments(detailTask.id),
    ]);
    setDetailTask(t);
    setComments(c);
    loadData();
  };

  const handleComment = async () => {
    if (!detailTask || !commentText.trim()) return;
    await api.addComment(detailTask.id, commentText);
    setCommentText("");
    const c = await api.comments(detailTask.id);
    setComments(c);
  };

  const handleExecuteTask = async (task: Task) => {
    setExecuting(true);
    try {
      await api.executeTask(task.id);
      setDetailTask((prev) => prev?.id === task.id ? { ...prev, status: "in_progress" } : prev);
      toast.success(`Task dispatched to ${task.assigned_agent?.name}`);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to execute task");
    } finally {
      setExecuting(false);
    }
  };

  const openEditDialog = () => {
    if (!detailTask) return;
    setEditTitle(detailTask.title);
    setEditDesc(detailTask.description || "");
    setEditPriority(detailTask.priority);
    setEditAgent(detailTask.assigned_agent_id ? String(detailTask.assigned_agent_id) : "");
    setEditDueDate(detailTask.due_date ? detailTask.due_date.split("T")[0] : "");
    setEditTags(detailTask.tags || []);
    setEditTagInput("");
    setEditGoalId(detailTask.goal_id ? String(detailTask.goal_id) : "none");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!detailTask) return;
    setEditSaving(true);
    try {
      const updated = await api.updateTask(detailTask.id, {
        title: editTitle,
        description: editDesc || null,
        priority: editPriority,
        assigned_agent_id: editAgent ? Number(editAgent) : null,
        due_date: editDueDate || null,
        tags: editTags,
        goal_id: editGoalId && editGoalId !== "none" ? Number(editGoalId) : null,
      } as Partial<Task>);
      setDetailTask(updated);
      setEditOpen(false);
      toast.success("Task updated!");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!detailTask) return;
    setDeleting(true);
    try {
      await api.deleteTask(detailTask.id);
      setDeleteOpen(false);
      setDetailTask(null);
      toast.success("Task deleted");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = Number(active.id);
    const fromStatus = (active.data.current as { status: string })?.status;
    const toStatus = String(over.id);

    if (fromStatus === toStatus) return;

    if (!ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus)) {
      toast.error(`Can't move directly from ${fromStatus.replace("_", " ")} to ${toStatus.replace("_", " ")}`);
      return;
    }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: toStatus } : t))
    );

    try {
      await api.updateTask(taskId, { status: toStatus });
      loadData();
    } catch {
      // Revert
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: fromStatus } : t))
      );
      toast.error("Failed to update task status");
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;
  const dragFromStatus = activeTask?.status || null;

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "\u2014";

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in-page">
        <div className="bg-muted/50 rounded-full p-6 mb-4">
          <Columns3 className="h-12 w-12 text-muted-foreground/50" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          You don&apos;t have permission to view this board. Contact an admin to request access.
        </p>
      </div>
    );
  }

  if (!board) return <div className="text-muted-foreground">Loading board...</div>;

  const isCreator = detailTask?.created_by_user_id === user?.id;
  const isAdmin = user?.role === "admin";
  const boardPerm = board.user_permission;
  const canCreate = hasPermission(boardPerm, "create");
  const canManage = hasPermission(boardPerm, "manage");
  const canEditTask = (task: Task | null) => {
    if (!task) return false;
    if (canManage) return true;
    if (canCreate && task.created_by_user_id === user?.id) return true;
    return false;
  };
  const canDeleteTask = (task: Task | null) => {
    if (!task) return false;
    if (canManage) return true;
    if (canCreate && task.created_by_user_id === user?.id) return true;
    return false;
  };

  return (
    <div className="animate-in-page space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{board.name}</h1>
          <div className="flex flex-wrap gap-2 mt-1">
            {agents.map((a) => (
              <Badge key={a.id} variant="outline" className="text-xs">
                <span
                  className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                    a.status === "online"
                      ? "bg-green-500"
                      : a.status === "busy"
                        ? "bg-yellow-500 animate-pulse"
                        : "bg-gray-300 dark:bg-gray-600"
                  }`}
                />
                {a.name}
                {a.execution_mode === "auto" && (
                  <Zap className="ml-1 inline h-3 w-3 text-yellow-500" />
                )}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                gatewayConnected ? "bg-green-500" : "bg-red-400"
              }`}
            />
            Gateway {gatewayConnected ? "Connected" : "Offline"}
          </Badge>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs"
          >
            <Archive className="mr-1 h-3.5 w-3.5" />
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
        {canCreate && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                placeholder="Task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
              <Textarea
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newAgent} onValueChange={setNewAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {allAgents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                placeholder="Due date (optional)"
              />
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tags <span className="text-[10px]">— activate context-specific agent skills</span></label>
                {newTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {newTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] gap-0.5 pr-0.5 h-5">
                        {tag}
                        <button type="button" onClick={() => setNewTags(newTags.filter((t) => t !== tag))} className="ml-0.5 hover:text-destructive">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && newTagInput.trim()) {
                      e.preventDefault();
                      const t = newTagInput.trim().toLowerCase();
                      if (!newTags.includes(t)) setNewTags([...newTags, t]);
                      setNewTagInput("");
                    }
                  }}
                  onBlur={() => {
                    if (newTagInput.trim()) {
                      const t = newTagInput.trim().toLowerCase();
                      if (!newTags.includes(t)) setNewTags([...newTags, t]);
                      setNewTagInput("");
                    }
                  }}
                  placeholder="Type tag, press Enter..."
                  className="h-8 text-sm"
                />
              </div>
              {/* Goal link */}
              {boardGoals.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Goal</label>
                  <Select value={newGoalId} onValueChange={setNewGoalId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {boardGoals.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          <span className="flex items-center gap-1.5">
                            <Target className="h-3 w-3" />
                            {g.title}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={creating || !newTitle.trim()}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        )}
        </div>
      </div>

      {/* Board Goal Banner */}
      {boardGoals.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Board objective:</span>
          <span className="font-medium">{boardGoals[0].title}</span>
          {boardGoals[0].progress > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">{boardGoals[0].progress}%</span>
          )}
        </div>
      )}

      {/* Kanban Board with DnD */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <DroppableColumn
                key={col.key}
                status={col.key}
                label={col.label}
                count={colTasks.length}
                isDragActive={!!activeId}
                dragFromStatus={dragFromStatus}
              >
                {colTasks.map((task) => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => openDetail(task)}
                    onExecute={handleExecuteTask}
                    executing={executing}
                    gatewayConnected={gatewayConnected}
                  />
                ))}
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Dialog */}
      <Dialog open={!!detailTask} onOpenChange={(open) => !open && setDetailTask(null)}>
        <DialogContent className="max-w-full h-full sm:max-w-4xl sm:h-auto max-h-[90vh] overflow-y-auto p-0">
          {detailTask && (
            <div>
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-border/50">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <DialogHeader>
                      <DialogTitle className="text-xl leading-tight">{detailTask.title}</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge className={PRIORITY_CONFIG[detailTask.priority]?.color || ""}>
                        {(detailTask.priority || "").toUpperCase()}
                      </Badge>
                      <Badge className={STATUS_COLORS[detailTask.status] || "bg-gray-200 text-gray-700"}>
                        {detailTask.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    {detailTask.status === "todo" &&
                      detailTask.assigned_agent?.execution_mode === "manual" && (
                        <Button
                          size="sm"
                          disabled={executing || !gatewayConnected}
                          onClick={() => handleExecuteTask(detailTask)}
                        >
                          {executing ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-4 w-4" />
                          )}
                          Execute
                        </Button>
                      )}
                    {detailTask.status !== "done" && canEditTask(detailTask) && (
                      <Button variant="outline" size="sm" onClick={openEditDialog}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    )}
                    {(detailTask.status === "done" || detailTask.status === "cancelled") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const newArchived = !detailTask.archived;
                          await api.updateTask(detailTask.id, { archived: newArchived } as Partial<Task>);
                          setDetailTask({ ...detailTask, archived: newArchived });
                          toast.success(newArchived ? "Task archived" : "Task unarchived");
                          loadData();
                        }}
                      >
                        <Archive className="h-4 w-4 mr-1" />
                        {detailTask.archived ? "Unarchive" : "Archive"}
                      </Button>
                    )}
                    {canDeleteTask(detailTask) && (
                      <Button variant="outline" size="sm" className="text-destructive"
                              onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
                {/* Status Stepper */}
                <div className="mt-5">
                  <StatusStepper status={detailTask.status} />
                </div>
              </div>

              {/* Two-column content */}
              <div className="px-6 py-5 grid md:grid-cols-[1fr,280px] gap-6">
                {/* Left: Main content */}
                <div className="space-y-5 min-w-0">
                  {/* Description */}
                  {detailTask.description && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
                      <Card>
                        <CardContent className="p-4">
                          <TaskResultRenderer content={detailTask.description} />
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Result (collapsible) */}
                  {detailTask.result && (
                    <div>
                      <Card>
                        <Collapsible open={resultOpen} onOpenChange={setResultOpen}>
                          <CardContent className="p-4">
                            <CollapsibleTrigger className="flex items-center justify-between w-full">
                              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Agent Result
                              </h3>
                              {resultOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-3">
                              <TaskResultRenderer content={detailTask.result} />
                            </CollapsibleContent>
                          </CardContent>
                        </Collapsible>
                      </Card>
                    </div>
                  )}

                  {/* View Trace button */}
                  {detailTask.traces_count > 0 && ["review", "approved", "done", "rejected"].includes(detailTask.status) && (
                    <div>
                      <a
                        href={`/tasks/${detailTask.id}/traces`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="w-full gap-2">
                          <Activity className="w-4 h-4" />
                          View Execution Trace ({detailTask.traces_count})
                        </Button>
                      </a>
                    </div>
                  )}

                  {/* Attachments */}
                  <div>
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Attachments</h3>
                    <Card>
                      <CardContent className="p-4">
                        <TaskAttachments taskId={detailTask.id} />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Comments - Chat style */}
                  <div>
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5" /> Comments ({comments.length})
                    </h3>
                    <div className="space-y-4 mb-4">
                      {comments.map((c) => {
                        const isAgentComment = c.author_type === "agent";
                        return (
                          <div key={c.id} className="flex gap-3">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                isAgentComment ? "bg-primary/10" : "bg-muted"
                              }`}
                            >
                              {isAgentComment ? (
                                <Bot className="h-4 w-4 text-primary" />
                              ) : (
                                <User className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {isAgentComment && (
                                  <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 h-4">
                                    AI
                                  </Badge>
                                )}
                                <span className="font-medium text-xs">
                                  {c.author_name || c.author_type}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(c.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div
                                className={`rounded-2xl rounded-tl-sm p-3 ${
                                  isAgentComment
                                    ? "bg-primary/5 border border-primary/10"
                                    : "bg-muted/50"
                                }`}
                              >
                                <CommentContent content={c.content} isAgent={isAgentComment} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {comments.length === 0 && (
                        <div className="text-center py-8 text-sm text-muted-foreground/60">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No comments yet
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 relative">
                      <MentionAutocomplete
                        textareaRef={commentTextareaRef}
                        value={commentText}
                        onChange={setCommentText}
                      />
                      <Textarea
                        ref={commentTextareaRef}
                        className="min-h-[80px] resize-y rounded-xl"
                        rows={3}
                        placeholder="Add a comment... Use @name to mention. Ctrl+Enter to send."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleComment();
                          }
                        }}
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">
                          Ctrl+Enter to send
                        </span>
                        <Button onClick={handleComment} size="sm" className="rounded-lg">
                          Send
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Sidebar */}
                <div className="space-y-4">
                  {/* Meta info */}
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <Bot className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Agent</div>
                          <div className="font-medium text-sm">
                            {detailTask.assigned_agent
                              ? detailTask.assigned_agent.name
                              : "Unassigned"}
                          </div>
                          {detailTask.assigned_agent && (
                            <span
                              className={`text-xs ${
                                detailTask.assigned_agent.status === "online"
                                  ? "text-green-500"
                                  : detailTask.assigned_agent.status === "busy"
                                    ? "text-yellow-500"
                                    : "text-gray-400 dark:text-gray-500"
                              }`}
                            >
                              {detailTask.assigned_agent.status}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="h-px bg-border/50" />

                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Created By</div>
                          <div className="font-medium text-sm">
                            {detailTask.created_by?.name || "Unknown"}
                          </div>
                        </div>
                      </div>

                      <div className="h-px bg-border/50" />

                      <div className="flex items-start gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Due Date</div>
                          <div
                            className={`font-medium text-sm ${
                              detailTask.due_date && new Date(detailTask.due_date) < new Date()
                                ? "text-red-500"
                                : ""
                            }`}
                          >
                            {detailTask.due_date ? fmt(detailTask.due_date) : "No due date"}
                          </div>
                        </div>
                      </div>

                      {detailTask.tags && detailTask.tags.length > 0 && (
                        <>
                          <div className="h-px bg-border/50" />
                          <div className="flex items-start gap-3">
                            <Tag className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Tags</div>
                              <div className="flex flex-wrap gap-1">
                                {detailTask.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] font-normal">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="h-px bg-border/50" />

                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Timestamps</div>
                          <div className="text-xs space-y-0.5 text-muted-foreground">
                            <div>Created: {fmt(detailTask.created_at)}</div>
                            <div>Updated: {fmt(detailTask.updated_at)}</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Status workflow */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Status</div>
                      <div className="flex flex-col gap-1.5">
                        {COLUMNS.map((col) => (
                          <Button
                            key={col.key}
                            variant={detailTask.status === col.key ? "default" : "ghost"}
                            size="sm"
                            className={`justify-start text-xs h-8 ${
                              detailTask.status === col.key ? "" : "text-muted-foreground"
                            }`}
                            onClick={() => {
                              handleStatusChange(detailTask.id, col.key);
                              setDetailTask({ ...detailTask, status: col.key });
                            }}
                          >
                            {col.label}
                          </Button>
                        ))}
                        {detailTask.status === "review" && (isAdmin || isCreator) && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-xs h-8 justify-start mt-1"
                            onClick={async () => {
                              await api.updateTask(detailTask.id, { status: "done" } as Partial<Task>);
                              toast.success("Task approved!");
                              refreshDetail();
                            }}
                          >
                            <Check className="h-3.5 w-3.5 mr-1.5" /> Approve
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Indicators */}
                  {detailTask.status === "in_progress" && detailTask.assigned_agent && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      <span>{detailTask.assigned_agent.name} is working...</span>
                    </div>
                  )}

                  {detailTask.assigned_agent?.execution_mode === "auto" &&
                    detailTask.status === "todo" && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                        <Zap className="h-3.5 w-3.5 text-yellow-500" />
                        <span>Auto-dispatch enabled</span>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Task Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Task title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
            <Textarea
              placeholder="Description"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select value={editPriority} onValueChange={setEditPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Select value={editAgent} onValueChange={setEditAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {allAgents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
            />
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
              {editTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {editTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] gap-0.5 pr-0.5 h-5">
                      {tag}
                      <button type="button" onClick={() => setEditTags(editTags.filter((t) => t !== tag))} className="ml-0.5 hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Input
                value={editTagInput}
                onChange={(e) => setEditTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && editTagInput.trim()) {
                    e.preventDefault();
                    const t = editTagInput.trim().toLowerCase();
                    if (!editTags.includes(t)) setEditTags([...editTags, t]);
                    setEditTagInput("");
                  }
                }}
                onBlur={() => {
                  if (editTagInput.trim()) {
                    const t = editTagInput.trim().toLowerCase();
                    if (!editTags.includes(t)) setEditTags([...editTags, t]);
                    setEditTagInput("");
                  }
                }}
                placeholder="Type tag, press Enter..."
                className="h-8 text-sm"
              />
            </div>
            {/* Goal link */}
            {boardGoals.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1 block">Goal</label>
                <Select value={editGoalId} onValueChange={setEditGoalId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {boardGoals.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        <span className="flex items-center gap-1.5">
                          <Target className="h-3 w-3" />
                          {g.title}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{detailTask?.title}&quot;? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
