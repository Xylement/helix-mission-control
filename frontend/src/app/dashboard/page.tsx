"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  type DashboardStats,
  type DashboardActivity,
  type Department,
  type Board,
  type Agent,
  type GoalTree,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWS } from "@/contexts/WebSocketContext";
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Clock,
  Eye,
  CheckCircle2,
  Plus,
  ArrowRight,
  User,
  Cpu,
  Activity as ActivityIcon,
  Target,
} from "lucide-react";
import { toast } from "sonner";

function getDepartmentColor(department: string | null): { text: string; pill: string } {
  const colors: Record<string, { text: string; pill: string }> = {
    'marketing': {
      text: 'text-purple-600 dark:text-purple-400 font-semibold',
      pill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    },
    'customer service': {
      text: 'text-blue-600 dark:text-blue-400 font-semibold',
      pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    'operations': {
      text: 'text-amber-600 dark:text-amber-400 font-semibold',
      pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
    'tech': {
      text: 'text-emerald-600 dark:text-emerald-400 font-semibold',
      pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    'finance & hr': {
      text: 'text-slate-500 dark:text-slate-400 font-semibold',
      pill: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
    },
  };
  return colors[(department || '').toLowerCase()] || {
    text: 'text-gray-600 dark:text-gray-400 font-medium',
    pill: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  };
}

function getActionColor(action: string): string {
  const colors: Record<string, string> = {
    'created': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'completed': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'commented': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    'review': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'approved': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'rejected': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'assigned': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    'started': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    'dispatched': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    'executed': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    'failed': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'recovered': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'online': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'offline': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    'updated': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    'deleted': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  const key = Object.keys(colors).find(k => action.toLowerCase().includes(k));
  return key ? colors[key] : colors['commented'];
}

function getActionVerb(action: string): string {
  const verbs: Record<string, string> = {
    'task.created': 'created',
    'task.completed': 'completed',
    'task.assigned': 'assigned',
    'task.updated': 'updated',
    'task.executed': 'executed',
    'task.dispatched': 'dispatched',
    'task.deleted': 'deleted',
    'task.submitted_for_review': 'submitted for review',
    'task.failed': 'failed',
    'task.recovered': 'recovered',
    'comment.added': 'commented',
    'agent.online': 'online',
    'agent.offline': 'offline',
  };
  return verbs[action] || action.split('.').pop() || action;
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function getActivityHref(a: DashboardActivity): string | null {
  const meta = a.metadata || {};
  if (a.action.startsWith("task.") || a.action === "comment.added") {
    const boardId = meta.board_id as number | undefined;
    if (boardId && a.target_id) return `/boards/${boardId}?task=${a.target_id}`;
    if (boardId) return `/boards/${boardId}`;
  }
  if (a.action.startsWith("agent.") && a.actor_type === "agent" && a.actor_id) {
    return `/agents/${a.actor_id}`;
  }
  return null;
}

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
}) {
  const accentStyles: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
    emerald: {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-t-emerald-500",
      iconBg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    },
    blue: {
      bg: "bg-blue-500/10 dark:bg-blue-500/15",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-t-blue-500",
      iconBg: "bg-blue-500/15 dark:bg-blue-500/20",
    },
    amber: {
      bg: "bg-amber-500/10 dark:bg-amber-500/15",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-t-amber-500",
      iconBg: "bg-amber-500/15 dark:bg-amber-500/20",
    },
    teal: {
      bg: "bg-teal-500/10 dark:bg-teal-500/15",
      text: "text-teal-600 dark:text-teal-400",
      border: "border-t-teal-500",
      iconBg: "bg-teal-500/15 dark:bg-teal-500/20",
    },
  };
  const s = accentStyles[accent] || accentStyles.blue;

  return (
    <Card className={`border-t-2 ${s.border} hover:shadow-md dark:hover:border-white/[0.12] transition-all duration-200`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold tracking-tight animate-count-up">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconBg}`}>
            <Icon className={`h-5 w-5 ${s.text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeptCard({
  dept,
  onClick,
}: {
  dept: DashboardStats["departments"][0];
  onClick: () => void;
}) {
  const total = dept.tasks.todo + dept.tasks.in_progress + dept.tasks.review + dept.tasks.done;
  const donePercent = total > 0 ? Math.round((dept.tasks.done / total) * 100) : 0;

  return (
    <Card
      className="cursor-pointer group hover:-translate-y-0.5 hover:shadow-md dark:hover:border-white/[0.12] transition-all duration-200"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{dept.emoji}</span>
          <h3 className="font-semibold text-sm tracking-tight">{dept.name}</h3>
          <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{donePercent}% complete</span>
            <span>{total} tasks</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${donePercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {dept.agent_count}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {dept.tasks.todo > 0 && (
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-gray-500/10 text-gray-600 dark:text-gray-400 border-0">
              {dept.tasks.todo} todo
            </Badge>
          )}
          {dept.tasks.in_progress > 0 && (
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">
              {dept.tasks.in_progress} active
            </Badge>
          )}
          {dept.tasks.review > 0 && (
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0">
              {dept.tasks.review} review
            </Badge>
          )}
          {dept.tasks.done > 0 && (
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
              {dept.tasks.done} done
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  useAuth();
  const router = useRouter();
  const { subscribe } = useWS();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick create state
  const [createOpen, setCreateOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPriority, setCreatePriority] = useState("medium");
  const [createAgentId, setCreateAgentId] = useState<string>("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [missions, setMissions] = useState<GoalTree[]>([]);
  const [setupIncomplete, setSetupIncomplete] = useState(false);

  useEffect(() => {
    api.getSetupCheck().then(r => setSetupIncomplete(!r.ready)).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        api.dashboardStats(),
        api.dashboardActivity(),
      ]);
      setStats(s);
      setActivities(a.activities);
      // Load active missions for goals section
      api.getGoalTree("active").then(setMissions).catch(() => {});
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const statsInterval = setInterval(async () => {
      try {
        const s = await api.dashboardStats();
        setStats(s);
      } catch {}
    }, 30000);
    const activityInterval = setInterval(async () => {
      try {
        const a = await api.dashboardActivity();
        setActivities(a.activities);
      } catch {}
    }, 15000);
    return () => {
      clearInterval(statsInterval);
      clearInterval(activityInterval);
    };
  }, [loadData]);

  useEffect(() => {
    const unsubs = [
      subscribe("task.created", () => loadData()),
      subscribe("task.updated", () => loadData()),
      subscribe("task.completed", () => loadData()),
      subscribe("task.assigned", () => loadData()),
      subscribe("task.deleted", () => loadData()),
      subscribe("comment.added", () => loadData()),
      subscribe("agent.status_changed", () => loadData()),
    ];
    return () => unsubs.forEach((u) => u());
  }, [subscribe, loadData]);

  useEffect(() => {
    if (createOpen) {
      Promise.all([api.departments(), api.boards(), api.agents()]).then(
        ([d, b, a]) => {
          setDepartments(d);
          setBoards(b);
          setAgents(a);
        }
      );
    }
  }, [createOpen]);

  const selectedBoard = boards.find((b) => b.id === Number(selectedBoardId));
  const filteredAgents = selectedBoard
    ? agents.filter((a) => a.department_id === selectedBoard.department_id)
    : agents;

  // Filter boards to only those user can create tasks on
  const creatableBoards = boards.filter(
    (b) => !b.user_permission || b.user_permission === "create" || b.user_permission === "manage"
  );

  const boardsByDept = departments
    .map((d) => ({
      dept: d,
      boards: creatableBoards.filter((b) => b.department_id === d.id),
    }))
    .filter((g) => g.boards.length > 0);

  const handleCreate = async () => {
    if (!createTitle.trim() || !selectedBoardId) return;
    setCreating(true);
    try {
      await api.createTask({
        title: createTitle.trim(),
        description: createDesc.trim() || undefined,
        board_id: Number(selectedBoardId),
        priority: createPriority,
        assigned_agent_id: createAgentId ? Number(createAgentId) : undefined,
        due_date: createDueDate || undefined,
      });
      toast.success("Task created");
      setCreateOpen(false);
      setCreateTitle("");
      setCreateDesc("");
      setSelectedBoardId("");
      setCreateAgentId("");
      setCreatePriority("medium");
      setCreateDueDate("");
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 animate-in-page">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Mission Control Overview</p>
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-t-2 border-t-muted">
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="h-4 w-24 skeleton-shimmer rounded" />
                  <div className="h-8 w-16 skeleton-shimmer rounded" />
                  <div className="h-3 w-32 skeleton-shimmer rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in-page">
      {/* Setup banner */}
      {setupIncomplete && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center justify-between">
          <span className="text-yellow-300 text-sm">Setup incomplete — some services need configuration.</span>
          <Link href="/setup-check" className="text-yellow-300 text-sm underline hover:text-yellow-200">View Setup Checklist</Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Mission Control Overview</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Task</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Board *</label>
                <Select value={selectedBoardId} onValueChange={(v) => { setSelectedBoardId(v); setCreateAgentId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                  <SelectContent>
                    {boardsByDept.map((group) => (
                      <SelectGroup key={group.dept.id}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {group.dept.name}
                        </div>
                        {group.boards.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Title *</label>
                <Input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="Task title"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Priority</label>
                  <Select value={createPriority} onValueChange={setCreatePriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Due Date</label>
                  <Input
                    type="date"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Assign Agent</label>
                <Select value={createAgentId} onValueChange={setCreateAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {filteredAgents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} — {a.role_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleCreate}
                disabled={creating || !createTitle.trim() || !selectedBoardId}
                className="w-full"
              >
                {creating ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Agents Online"
          value={`${stats?.agents.online ?? 0} / ${stats?.agents.total ?? 0}`}
          subtitle={`${stats?.agents.online ?? 0} connected`}
          icon={Bot}
          accent="emerald"
        />
        <StatCard
          label="In Progress"
          value={stats?.tasks.in_progress ?? 0}
          subtitle="tasks being worked on"
          icon={Clock}
          accent="blue"
        />
        <StatCard
          label="Awaiting Review"
          value={stats?.tasks.awaiting_review ?? 0}
          subtitle="tasks need attention"
          icon={Eye}
          accent="amber"
        />
        <StatCard
          label="Completed Today"
          value={stats?.tasks.completed_today ?? 0}
          subtitle="tasks done today"
          icon={CheckCircle2}
          accent="teal"
        />
      </div>

      {/* Active Goals */}
      {missions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Active Goals
            </h2>
            <Link href="/goals" className="text-sm text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {missions.map((mission) => (
              <Card key={mission.id} className="border-l-4 border-l-purple-500 hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-sm line-clamp-2">{mission.title}</h3>
                    <Badge variant="outline" className="bg-purple-500/15 text-purple-600 dark:text-purple-400 text-xs shrink-0 ml-2">Mission</Badge>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${mission.progress}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{mission.progress}%</span>
                  </div>
                  {mission.children && mission.children.length > 0 && (
                    <div className="space-y-1.5">
                      {mission.children.slice(0, 3).map((obj) => (
                        <div key={obj.id} className="flex items-center gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="text-muted-foreground truncate flex-1">{obj.title}</span>
                          <span className="text-muted-foreground">{obj.progress}%</span>
                        </div>
                      ))}
                      {mission.children.length > 3 && (
                        <p className="text-xs text-muted-foreground">+{mission.children.length - 3} more</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Department Cards */}
      {stats?.departments && stats.departments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-4">Departments</h2>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {stats.departments.map((dept) => (
              <DeptCard
                key={dept.id}
                dept={dept}
                onClick={() => router.push(`/boards?department=${dept.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
          <Link
            href="/activity"
            className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <Card>
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <div className="py-12 text-center">
                <ActivityIcon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a task to get started</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {activities.map((a) => {
                  const href = getActivityHref(a);
                  const deptColor = getDepartmentColor(a.actor_department);
                  const meta = a.metadata || {};
                  const taskTitle = meta.task_title as string | undefined;
                  const boardName = meta.board_name as string | undefined;
                  const verb = getActionVerb(a.action);
                  return (
                  <div
                    key={a.id}
                    onClick={href ? () => router.push(href) : undefined}
                    className={`flex items-start gap-3 p-4 hover:bg-accent/40 transition-colors ${href ? "cursor-pointer" : ""}`}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {a.actor_type === "agent" ? (
                        <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : a.actor_type === "system" ? (
                        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm flex flex-wrap items-center gap-1.5">
                        <span className={deptColor.text}>{a.actor_name}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getActionColor(a.action)}`}>
                          {verb}
                        </span>
                        {taskTitle && (
                          <span className="text-muted-foreground">
                            &quot;{truncate(taskTitle, 60)}&quot;
                          </span>
                        )}
                        {boardName && (
                          <span className="text-muted-foreground text-xs">
                            on <span className={getDepartmentColor(a.board_department).text + ' text-xs'}>{boardName}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
