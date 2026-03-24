"use client";

import { useEffect, useState, useCallback } from "react";
import {
  api,
  type DashboardActivity,
  type Department,
  type Agent,
  type UserFull,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWS } from "@/contexts/WebSocketContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  User,
  Cpu,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";

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

function dateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "task.created", label: "Task Created" },
  { value: "task.completed", label: "Task Completed" },
  { value: "task.assigned", label: "Task Assigned" },
  { value: "task.updated", label: "Task Updated" },
  { value: "task.executed", label: "Task Executed" },
  { value: "comment.added", label: "Comment Added" },
  { value: "agent.online", label: "Agent Online" },
  { value: "agent.offline", label: "Agent Offline" },
];

export default function ActivityPage() {
  const { user: authUser } = useAuth();
  const { subscribe } = useWS();
  const router = useRouter();
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filter state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [usersList, setUsersList] = useState<UserFull[]>([]);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  // Load filter options
  useEffect(() => {
    Promise.all([api.departments(), api.agents()]).then(([d, a]) => {
      setDepartments(d);
      setAgentsList(a);
    });
    // Load users if admin
    if (authUser?.role === "admin") {
      api.users().then(setUsersList).catch(() => {});
    }
  }, [authUser?.role]);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 50 };
      if (filterDept !== "all") params.department_id = Number(filterDept);
      if (filterAgent !== "all") params.agent_id = Number(filterAgent);
      if (filterUser !== "all") params.user_id = Number(filterUser);
      if (filterAction !== "all") params.action = filterAction;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const res = await api.activityPaginated(params as Parameters<typeof api.activityPaginated>[0]);
      setActivities(res.activities);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, filterDept, filterAgent, filterUser, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Real-time updates via WebSocket
  useEffect(() => {
    const unsub = subscribe("*", () => {
      loadActivity();
    });
    return unsub;
  }, [subscribe, loadActivity]);

  const clearFilters = () => {
    setFilterDept("all");
    setFilterAgent("all");
    setFilterUser("all");
    setFilterAction("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  const hasFilters =
    filterDept !== "all" ||
    filterAgent !== "all" ||
    filterUser !== "all" ||
    filterAction !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  // Filter agents by department
  const filteredAgents =
    filterDept !== "all"
      ? agentsList.filter((a) => a.department_id === Number(filterDept))
      : agentsList;

  // Group activities by date
  const groupedActivities: { label: string; items: DashboardActivity[] }[] = [];
  for (const a of activities) {
    const label = dateLabel(a.created_at);
    const group = groupedActivities.find((g) => g.label === label);
    if (group) {
      group.items.push(a);
    } else {
      groupedActivities.push({ label, items: [a] });
    }
  }

  return (
    <div className="animate-in-page space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">
          {total} total events
        </p>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          {/* Mobile filter toggle */}
          <div className="lg:hidden mb-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {hasFilters && <Badge variant="secondary" className="text-xs ml-1">Active</Badge>}
              </span>
              <ChevronRight className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-90" : ""}`} />
            </Button>
          </div>
          <div className={`flex-wrap gap-3 items-end ${filtersOpen ? "flex" : "hidden lg:flex"}`}>
            <div className="min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Department
              </label>
              <Select value={filterDept} onValueChange={(v) => { setFilterDept(v); setFilterAgent("all"); setPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Agent
              </label>
              <Select value={filterAgent} onValueChange={(v) => { setFilterAgent(v); setPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {filteredAgents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {authUser?.role === "admin" && usersList.length > 0 && (
              <div className="min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  User
                </label>
                <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setPage(1); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {usersList.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Action
              </label>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                From
              </label>
              <Input
                type="date"
                className="h-9 w-[140px]"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                To
              </label>
              <Input
                type="date"
                className="h-9 w-[140px]"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
              />
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={clearFilters}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity list */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-1/4 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No activity found</p>
              {hasFilters && (
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting your filters
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedActivities.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                {group.label}
              </h3>
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {group.items.map((a) => {
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
                        className={`flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-md transition-colors ${href ? "cursor-pointer" : ""}`}
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                          {a.actor_type === "agent" ? (
                            <Cpu className="h-3.5 w-3.5" />
                          ) : a.actor_type === "system" ? (
                            <Bot className="h-3.5 w-3.5" />
                          ) : (
                            <User className="h-3.5 w-3.5" />
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
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(a.created_at)}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {pages} ({total} events)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
