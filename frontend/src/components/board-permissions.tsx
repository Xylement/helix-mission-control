"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type BoardPermission, type UserFull } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

export function BoardPermissionsDialog({
  boardId,
  boardName,
  open,
  onOpenChange,
}: {
  boardId: number;
  boardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [permissions, setPermissions] = useState<BoardPermission[]>([]);
  const [users, setUsers] = useState<UserFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState("");
  const [addLevel, setAddLevel] = useState("create");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [perms, allUsers] = await Promise.all([
        api.getBoardPermissions(boardId),
        api.users(),
      ]);
      setPermissions(perms);
      setUsers(allUsers);
    } catch {
      toast.error("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleAdd = async () => {
    if (!addUserId) return;
    setSaving(true);
    try {
      await api.grantBoardPermission(boardId, {
        user_id: Number(addUserId),
        permission_level: addLevel,
      });
      toast.success("Permission granted");
      setAddUserId("");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to grant permission");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLevel = async (permId: number, level: string) => {
    try {
      await api.updateBoardPermission(boardId, permId, { permission_level: level });
      toast.success("Permission updated");
      load();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleRevoke = async (permId: number) => {
    try {
      await api.revokeBoardPermission(boardId, permId);
      toast.success("Permission revoked");
      load();
    } catch {
      toast.error("Failed to revoke");
    }
  };

  // Users not yet assigned
  const assignedUserIds = new Set(permissions.map((p) => p.user_id));
  const availableUsers = users.filter(
    (u) => !assignedUserIds.has(u.id) && u.role !== "admin"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permissions — {boardName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {permissions.length === 0
                ? "No permissions set — all team members have full access to this board."
                : "Only listed users (plus admins) can access this board."}
            </p>

            {permissions.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map((perm) => (
                    <TableRow key={perm.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{perm.user_name}</div>
                          <div className="text-xs text-muted-foreground">{perm.user_email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={perm.permission_level}
                          onValueChange={(v) => handleUpdateLevel(perm.id, v)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View</SelectItem>
                            <SelectItem value="create">Create</SelectItem>
                            <SelectItem value="manage">Manage</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(perm.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Add user */}
            <div className="flex items-end gap-2 pt-2 border-t">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Add User</label>
                <Select value={addUserId} onValueChange={setAddUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                    {availableUsers.length === 0 && (
                      <SelectItem value="" disabled>
                        No more users to add
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Level</label>
                <Select value={addLevel} onValueChange={setAddLevel}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="manage">Manage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={!addUserId || saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Grant
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
