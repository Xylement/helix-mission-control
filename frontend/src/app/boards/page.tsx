"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Department, type Board, type Agent } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function BoardsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.departments(), api.boards(), api.agents()]).then(([d, b, a]) => {
      setDepartments(d);
      setBoards(b);
      setAgents(a);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="animate-in-page space-y-8">
        <div>
          <div className="h-9 w-32 rounded-lg skeleton-shimmer" />
          <div className="h-5 w-48 rounded-md skeleton-shimmer mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-6 w-40 rounded-md skeleton-shimmer" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((j) => (
                <Card key={j}>
                  <CardHeader className="pb-2">
                    <div className="h-5 w-36 rounded-md skeleton-shimmer" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-1">
                      <div className="h-5 w-16 rounded-full skeleton-shimmer" />
                      <div className="h-5 w-20 rounded-full skeleton-shimmer" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-in-page space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Boards</h1>
        <p className="text-muted-foreground">All department boards</p>
      </div>

      {departments.map((dept) => {
        const deptBoards = boards.filter((b) => b.department_id === dept.id);
        if (deptBoards.length === 0) return null;
        return (
          <div key={dept.id} className="space-y-3">
            <h2 className="text-lg font-semibold">{dept.name}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deptBoards.map((board) => {
                const boardAgents = agents.filter((a) => a.primary_board_id === board.id);
                return (
                  <Link key={board.id} href={`/boards/${board.id}`}>
                    <Card className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{board.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1">
                          {boardAgents.map((a) => (
                            <Badge key={a.id} variant="outline" className="text-xs">
                              {a.name}
                            </Badge>
                          ))}
                          {boardAgents.length === 0 && (
                            <span className="text-xs text-muted-foreground">No agents</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
