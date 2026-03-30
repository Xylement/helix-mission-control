"use client";

import { useEffect, useState } from "react";
import { api, type CostDashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Bot,
  Loader2,
  Activity,
} from "lucide-react";

export default function CostsPage() {
  useAuth();
  const [data, setData] = useState<CostDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboardCosts().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Failed to load cost data.</p>
      </div>
    );
  }

  const momChange = data.total_spend_last_month > 0
    ? ((data.total_spend_this_month - data.total_spend_last_month) / data.total_spend_last_month * 100)
    : data.total_spend_this_month > 0 ? 100 : 0;
  const agentsWithBudgets = data.spend_by_agent.filter(a => a.budget_usd !== null).length;
  const maxDailySpend = Math.max(...data.spend_by_day.map(d => d.total_usd), 0.001);

  return (
    <div className="space-y-6 animate-in-page">
      <div>
        <h1 className="text-2xl font-bold">Cost Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Token usage costs across all agents (estimated)
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold mt-1">${data.total_spend_this_month.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Month</p>
                <p className="text-2xl font-bold mt-1">${data.total_spend_last_month.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">MoM Change</p>
                <p className={`text-2xl font-bold mt-1 ${momChange > 0 ? "text-red-400" : momChange < 0 ? "text-green-400" : ""}`}>
                  {momChange > 0 ? "+" : ""}{momChange.toFixed(1)}%
                </p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${momChange > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}>
                {momChange >= 0
                  ? <TrendingUp className={`w-5 h-5 ${momChange > 0 ? "text-red-400" : "text-green-400"}`} />
                  : <TrendingDown className="w-5 h-5 text-green-400" />
                }
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Agents with Budgets</p>
                <p className="text-2xl font-bold mt-1">{agentsWithBudgets}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend by Agent */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold mb-4">Spend by Agent</h2>
            {data.spend_by_agent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent spend data yet.</p>
            ) : (
              <div className="space-y-3">
                {data.spend_by_agent.map((agent) => {
                  const pct = agent.budget_usd
                    ? Math.min(100, agent.spent_usd / agent.budget_usd * 100)
                    : 0;
                  const barColor = agent.budget_paused
                    ? "bg-red-500"
                    : pct > 80 ? "bg-red-500"
                    : pct > 60 ? "bg-amber-500"
                    : "bg-blue-500";

                  return (
                    <div key={agent.agent_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{agent.agent_name}</span>
                          {agent.budget_paused && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Paused
                            </Badge>
                          )}
                        </div>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span>
                            ${agent.spent_usd.toFixed(2)}
                            {agent.budget_usd !== null && (
                              <span> / ${agent.budget_usd.toFixed(2)}</span>
                            )}
                          </span>
                          <Link
                            href={`/agents/${agent.agent_id}`}
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Activity className="w-3 h-3" />
                            traces
                          </Link>
                        </span>
                      </div>
                      {agent.budget_usd !== null && (
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Spend Chart (CSS bars) */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold mb-4">Daily Spend (Last 30 Days)</h2>
            {data.spend_by_day.length === 0 ? (
              <p className="text-sm text-muted-foreground">No spend data yet.</p>
            ) : (
              <div className="flex items-end gap-[2px] h-40">
                {data.spend_by_day.map((day) => {
                  const heightPct = (day.total_usd / maxDailySpend) * 100;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 group relative"
                      title={`${day.date}: $${day.total_usd.toFixed(4)}`}
                    >
                      <div className="w-full bg-muted rounded-t h-40 flex items-end">
                        <div
                          className="w-full bg-blue-500 rounded-t transition-all group-hover:bg-blue-400"
                          style={{ height: `${Math.max(1, heightPct)}%` }}
                        />
                      </div>
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 border">
                        {day.date}: ${day.total_usd.toFixed(4)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Expensive Tasks */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold mb-4">Most Expensive Tasks This Month</h2>
          {data.top_expensive_tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No task cost data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">Task</th>
                    <th className="text-left py-2 font-medium">Agent</th>
                    <th className="text-right py-2 font-medium">Tokens</th>
                    <th className="text-right py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_expensive_tasks.map((task) => (
                    <tr key={task.task_id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-2.5 max-w-[300px] truncate">{task.task_title}</td>
                      <td className="py-2.5 text-muted-foreground">{task.agent_name}</td>
                      <td className="py-2.5 text-right tabular-nums">{task.tokens.toLocaleString()}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium">${task.cost_usd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
