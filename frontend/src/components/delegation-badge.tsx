"use client";

import { GitBranch, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
};

interface DelegationBadgeProps {
  type: "parent" | "child";
  subTasksCount?: number;
  delegatedByAgentName?: string | null;
  delegationStatus?: string | null;
}

export function DelegationBadge({
  type,
  subTasksCount,
  delegatedByAgentName,
  delegationStatus,
}: DelegationBadgeProps) {
  if (type === "parent" && subTasksCount && subTasksCount > 0) {
    return (
      <Badge variant="outline" className="text-xs gap-1 border-purple-500/20 bg-purple-500/10 text-purple-600">
        <GitBranch className="h-3 w-3" />
        {subTasksCount} sub-task{subTasksCount > 1 ? "s" : ""}
      </Badge>
    );
  }

  if (type === "child" && delegatedByAgentName) {
    const statusColor = delegationStatus ? STATUS_COLORS[delegationStatus] || "" : "";
    return (
      <Badge variant="outline" className={`text-xs gap-1 ${statusColor || "border-muted-foreground/20"}`}>
        <ArrowUpRight className="h-3 w-3" />
        Delegated by {delegatedByAgentName}
      </Badge>
    );
  }

  return null;
}
