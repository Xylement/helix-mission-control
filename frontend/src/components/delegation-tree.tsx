"use client";

import { useEffect, useState } from "react";
import { api, type DelegationTreeNode, type Task } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { GitBranch, ChevronRight, User, Loader2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  review: "bg-amber-500/10 text-amber-600",
  approved: "bg-green-500/10 text-green-600",
  done: "bg-green-500/10 text-green-600",
  rejected: "bg-red-500/10 text-red-600",
  cancelled: "bg-muted text-muted-foreground",
};

const DELEGATION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  in_progress: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

function TreeNode({
  node,
  depth,
  onTaskClick,
}: {
  node: DelegationTreeNode;
  depth: number;
  onTaskClick?: (taskId: number) => void;
}) {
  const task = node.task;
  return (
    <div className={depth > 0 ? "ml-6 border-l border-border pl-4" : ""}>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer group"
        onClick={() => onTaskClick?.(task.id)}
      >
        {node.sub_tasks.length > 0 && (
          <GitBranch className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        )}
        {node.sub_tasks.length === 0 && depth > 0 && (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm truncate flex-1 group-hover:text-primary">
          {task.title}
        </span>
        {task.assigned_agent && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <User className="h-3 w-3" />
            {task.assigned_agent.name}
          </span>
        )}
        <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[task.status] || ""}`}>
          {task.status}
        </Badge>
        {task.delegation_status && (
          <Badge variant="outline" className={`text-[10px] shrink-0 ${DELEGATION_STATUS_COLORS[task.delegation_status] || ""}`}>
            {task.delegation_status}
          </Badge>
        )}
      </div>
      {node.sub_tasks.map((child) => (
        <TreeNode
          key={child.task.id}
          node={child}
          depth={depth + 1}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  );
}

interface DelegationTreeProps {
  taskId: number;
  onTaskClick?: (taskId: number) => void;
}

export function DelegationTree({ taskId, onTaskClick }: DelegationTreeProps) {
  const [tree, setTree] = useState<DelegationTreeNode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getDelegationTree(taskId).then((data) => {
      if (!cancelled) {
        setTree(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading delegation tree...
      </div>
    );
  }

  if (!tree) return null;

  return (
    <div className="space-y-1">
      <TreeNode node={tree} depth={0} onTaskClick={onTaskClick} />
    </div>
  );
}
