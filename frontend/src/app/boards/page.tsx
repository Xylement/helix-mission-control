"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, type Department, type Board, type Agent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

export default function BoardsPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Permission: admin or any board with manage permission
  const canManage =
    user?.role === "admin" ||
    boards.some((b) => b.user_permission === "manage");
  const isAdmin = user?.role === "admin";

  // Department dialog state
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptEmoji, setDeptEmoji] = useState("📋");
  const [deptSaving, setDeptSaving] = useState(false);

  // Board dialog state
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [boardDeptId, setBoardDeptId] = useState<number | null>(null);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardSaving, setBoardSaving] = useState(false);

  // Delete confirmation state
  const [deleteDialog, setDeleteDialog] = useState<{
    type: "department" | "board";
    id: number;
    name: string;
    boardCount?: number;
    taskCount?: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(() => {
    Promise.all([api.departments(), api.boards(), api.agents()]).then(
      ([d, b, a]) => {
        setDepartments(d);
        setBoards(b);
        setAgents(a);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Department handlers
  const openCreateDept = () => {
    setEditingDept(null);
    setDeptName("");
    setDeptEmoji("📋");
    setDeptDialogOpen(true);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptEmoji(dept.emoji || "📋");
    setDeptDialogOpen(true);
  };

  const saveDept = async () => {
    if (!deptName.trim()) return;
    setDeptSaving(true);
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, {
          name: deptName.trim(),
          emoji: deptEmoji.trim() || "📋",
        });
      } else {
        await api.createDepartment({
          name: deptName.trim(),
          emoji: deptEmoji.trim() || "📋",
        });
      }
      setDeptDialogOpen(false);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save department");
    } finally {
      setDeptSaving(false);
    }
  };

  const confirmDeleteDept = (dept: Department) => {
    const deptBoards = boards.filter((b) => b.department_id === dept.id);
    setDeleteDialog({
      type: "department",
      id: dept.id,
      name: dept.name,
      boardCount: deptBoards.length,
    });
  };

  // Board handlers
  const openCreateBoard = (deptId: number) => {
    setEditingBoard(null);
    setBoardDeptId(deptId);
    setBoardName("");
    setBoardDescription("");
    setBoardDialogOpen(true);
  };

  const openEditBoard = (board: Board) => {
    setEditingBoard(board);
    setBoardDeptId(board.department_id);
    setBoardName(board.name);
    setBoardDescription(board.description || "");
    setBoardDialogOpen(true);
  };

  const saveBoard = async () => {
    if (!boardName.trim() || !boardDeptId) return;
    setBoardSaving(true);
    try {
      if (editingBoard) {
        await api.updateBoard(editingBoard.id, {
          name: boardName.trim(),
          description: boardDescription.trim() || undefined,
        });
      } else {
        await api.createBoard({
          name: boardName.trim(),
          description: boardDescription.trim() || undefined,
          department_id: boardDeptId,
        });
      }
      setBoardDialogOpen(false);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save board");
    } finally {
      setBoardSaving(false);
    }
  };

  const confirmDeleteBoard = (board: Board) => {
    setDeleteDialog({
      type: "board",
      id: board.id,
      name: board.name,
    });
  };

  const executeDelete = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      if (deleteDialog.type === "department") {
        await api.deleteDepartment(deleteDialog.id);
      } else {
        await api.deleteBoard(deleteDialog.id);
      }
      setDeleteDialog(null);
      loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Boards</h1>
          <p className="text-muted-foreground">All department boards</p>
        </div>
        {canManage && (
          <Button onClick={openCreateDept} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Add Department
          </Button>
        )}
      </div>

      {departments.map((dept) => {
        const deptBoards = boards.filter((b) => b.department_id === dept.id);
        return (
          <div key={dept.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {dept.emoji && <span className="mr-1">{dept.emoji}</span>}
                {dept.name}
              </h2>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => openEditDept(dept)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Edit Department
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => confirmDeleteDept(dept)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        Department
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {deptBoards.map((board) => {
                const boardAgents = agents.filter(
                  (a) => a.primary_board_id === board.id
                );
                return (
                  <div key={board.id} className="relative group">
                    <Link href={`/boards/${board.id}`}>
                      <Card className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {board.name}
                          </CardTitle>
                          {board.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {board.description}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-1">
                            {boardAgents.map((a) => (
                              <Badge
                                key={a.id}
                                variant="outline"
                                className="text-xs"
                              >
                                {a.name}
                              </Badge>
                            ))}
                            {boardAgents.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                No agents
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                    {canManage && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm"
                              onClick={(e) => e.preventDefault()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                openEditBoard(board);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                              Board
                            </DropdownMenuItem>
                            {isAdmin && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.preventDefault();
                                  confirmDeleteBoard(board);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                Board
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                );
              })}
              {canManage && (
                <Card
                  className="cursor-pointer border-dashed transition-all duration-200 hover:shadow-md hover:border-primary/50 flex items-center justify-center min-h-[100px]"
                  onClick={() => openCreateBoard(dept.id)}
                >
                  <CardContent className="flex items-center gap-2 text-muted-foreground py-4">
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">Add Board</span>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        );
      })}

      {/* Department Dialog */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDept ? "Edit Department" : "Add Department"}
            </DialogTitle>
            <DialogDescription>
              {editingDept
                ? "Update the department details."
                : "Create a new department to organize your boards."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <span className="text-sm font-medium">Department Name</span>
              <Input
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Marketing"
                onKeyDown={(e) => e.key === "Enter" && saveDept()}
              />
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Emoji</span>
              <Input
                value={deptEmoji}
                onChange={(e) => setDeptEmoji(e.target.value)}
                placeholder="📋"
                className="w-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeptDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveDept} disabled={!deptName.trim() || deptSaving}>
              {deptSaving ? "Saving..." : editingDept ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Board Dialog */}
      <Dialog open={boardDialogOpen} onOpenChange={setBoardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBoard ? "Edit Board" : "Add Board"}
            </DialogTitle>
            <DialogDescription>
              {editingBoard
                ? "Update the board details."
                : "Create a new board in this department."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <span className="text-sm font-medium">Board Name</span>
              <Input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="e.g. Content Pipeline"
                onKeyDown={(e) => e.key === "Enter" && saveBoard()}
              />
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Description (optional)</span>
              <Textarea
                value={boardDescription}
                onChange={(e) => setBoardDescription(e.target.value)}
                placeholder="What is this board for?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBoardDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveBoard}
              disabled={!boardName.trim() || boardSaving}
            >
              {boardSaving
                ? "Saving..."
                : editingBoard
                ? "Save Changes"
                : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteDialog}
        onOpenChange={(open) => !open && setDeleteDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteDialog?.type === "department" ? "Department" : "Board"}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog?.type === "department"
                ? `This will delete the "${deleteDialog.name}" department, all ${deleteDialog.boardCount || 0} board(s), and all tasks within them. This cannot be undone.`
                : `This will delete the "${deleteDialog?.name}" board and all tasks within it. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
