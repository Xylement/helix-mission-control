"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type AgentScheduleWithAgent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  Loader2,
  Bot,
  Play,
  Power,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  interval: "Interval",
};

export default function SchedulesPage() {
  useAuth();
  const router = useRouter();
  const [schedules, setSchedules] = useState<AgentScheduleWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const loadSchedules = () => {
    api.getAllSchedules()
      .then(setSchedules)
      .catch(() => toast.error("Failed to load schedules"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const handleToggle = async (s: AgentScheduleWithAgent) => {
    setTogglingId(s.id);
    try {
      await api.toggleAgentSchedule(s.agent_id, s.id);
      toast.success(s.is_active ? "Schedule paused" : "Schedule activated");
      loadSchedules();
    } catch {
      toast.error("Failed to toggle schedule");
    } finally {
      setTogglingId(null);
    }
  };

  const handleRunNow = async (s: AgentScheduleWithAgent) => {
    setRunningId(s.id);
    try {
      const result = await api.runScheduleNow(s.agent_id, s.id);
      toast.success(`Task created (#${result.task_id})`);
      loadSchedules();
    } catch {
      toast.error("Failed to run schedule");
    } finally {
      setRunningId(null);
    }
  };

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const activeCount = schedules.filter((s) => s.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in-page">
      <div>
        <h1 className="text-2xl font-bold">Schedules</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Recurring tasks across all agents
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <CalendarClock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{schedules.length}</div>
                <div className="text-xs text-muted-foreground">Total Schedules</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Power className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">{activeCount}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Repeat className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {schedules.reduce((sum, s) => sum + s.run_count, 0)}
                </div>
                <div className="text-xs text-muted-foreground">Total Runs</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {new Set(schedules.map((s) => s.agent_id)).size}
                </div>
                <div className="text-xs text-muted-foreground">Agents with Schedules</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedules Table */}
      <Card>
        <CardContent className="p-0">
          {schedules.length === 0 ? (
            <div className="text-center py-12">
              <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No schedules configured yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Go to an agent&apos;s detail page to create a schedule
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Runs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/agents/${s.agent_id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{s.agent_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{s.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {SCHEDULE_TYPE_LABELS[s.schedule_type] || s.schedule_type}
                          {s.schedule_type === "interval"
                            ? ` (${s.schedule_interval_minutes}m)`
                            : ` ${s.schedule_time}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.is_active ? fmt(s.next_run_at) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmt(s.last_run_at)}
                      </TableCell>
                      <TableCell className="text-sm">{s.run_count}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            s.is_active
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                          }
                        >
                          {s.is_active ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Run now"
                            disabled={runningId === s.id}
                            onClick={() => handleRunNow(s)}
                          >
                            {runningId === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title={s.is_active ? "Pause" : "Activate"}
                            disabled={togglingId === s.id}
                            onClick={() => handleToggle(s)}
                          >
                            {togglingId === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Power
                                className={`h-3.5 w-3.5 ${
                                  s.is_active ? "text-green-500" : "text-muted-foreground"
                                }`}
                              />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
