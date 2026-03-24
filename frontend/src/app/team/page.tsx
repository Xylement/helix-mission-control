"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type UserFull, type Board, type Department } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, UserPlus, Loader2, Shield, Send } from "lucide-react";
import { toast } from "sonner";
import { isLimitError, type LimitError } from "@/lib/billing";
import { UpgradeModal } from "@/components/billing/UpgradeModal";

export default function TeamPage() {
  const [users, setUsers] = useState<UserFull[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserFull | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<UserFull | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("member");
  const [formTelegramNotifications, setFormTelegramNotifications] = useState(false);
  const [formTelegramUserId, setFormTelegramUserId] = useState("");

  // Upgrade modal state
  const [upgradeModal, setUpgradeModal] = useState<LimitError | null>(null);

  // Board Access state
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<UserFull | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [permMap, setPermMap] = useState<Record<number, { id: number | null; level: string }>>({});
  const [originalPermMap, setOriginalPermMap] = useState<Record<number, { id: number | null; level: string }>>({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await api.users();
      setUsers(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("member");
    setFormTelegramNotifications(false);
    setFormTelegramUserId("");
    setDialogOpen(true);
  };

  const openEdit = (user: UserFull) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword("");
    setFormRole(user.role);
    setFormTelegramNotifications(user.telegram_notifications ?? false);
    setFormTelegramUserId(user.telegram_user_id ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        const updates: Record<string, string | boolean | null> = {};
        if (formName !== editingUser.name) updates.name = formName;
        if (formEmail !== editingUser.email) updates.email = formEmail;
        if (formRole !== editingUser.role) updates.role = formRole;
        if (formPassword) updates.password = formPassword;
        updates.telegram_notifications = formTelegramNotifications;
        updates.telegram_user_id = formTelegramUserId.trim() || null;
        await api.updateUser(editingUser.id, updates as Parameters<typeof api.updateUser>[1]);
        toast.success("User updated");
      } else {
        await api.createUser({
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
        });
        toast.success("User created");
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      if (isLimitError(err)) {
        setDialogOpen(false);
        setUpgradeModal(err);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteUser(deleteConfirm.id);
      toast.success("User deleted");
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // Board Access management
  const openAccessDialog = useCallback(async (user: UserFull) => {
    setAccessUser(user);
    setAccessDialogOpen(true);
    setLoadingPerms(true);
    try {
      const [boardsData, deptsData] = await Promise.all([
        api.boards(),
        api.departments(),
      ]);
      setBoards(boardsData);
      setDepartments(deptsData);

      // Load permissions for all boards
      const allPerms = await Promise.all(
        boardsData.map((b) => api.getBoardPermissions(b.id).then((perms) => ({ boardId: b.id, perms })))
      );

      const map: Record<number, { id: number | null; level: string }> = {};
      for (const b of boardsData) {
        map[b.id] = { id: null, level: "none" };
      }
      for (const { boardId, perms } of allPerms) {
        const userPerm = perms.find((p) => p.user_id === user.id);
        if (userPerm) {
          // Map "no_access" from DB to "none" in UI
          const uiLevel = userPerm.permission_level === "no_access" ? "none" : userPerm.permission_level;
          map[boardId] = { id: userPerm.id, level: uiLevel };
        }
      }
      setPermMap(map);
      setOriginalPermMap(JSON.parse(JSON.stringify(map)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setLoadingPerms(false);
    }
  }, []);

  const handlePermChange = (boardId: number, level: string) => {
    setPermMap((prev) => ({
      ...prev,
      [boardId]: { ...prev[boardId], level },
    }));
  };

  const handleGrantAll = () => {
    setPermMap((prev) => {
      const next = { ...prev };
      for (const boardId of Object.keys(next)) {
        next[Number(boardId)] = { ...next[Number(boardId)], level: "manage" };
      }
      return next;
    });
  };

  const handleRevokeAll = () => {
    setPermMap((prev) => {
      const next = { ...prev };
      for (const boardId of Object.keys(next)) {
        next[Number(boardId)] = { ...next[Number(boardId)], level: "none" };
      }
      return next;
    });
  };

  const handleSavePerms = async () => {
    if (!accessUser) return;
    setSavingPerms(true);
    try {
      for (const boardId of Object.keys(permMap)) {
        const bid = Number(boardId);
        const curr = permMap[bid];
        const orig = originalPermMap[bid];
        if (curr.level === orig.level) continue;

        // Map "none" in the UI to "no_access" in the DB
        const dbLevel = curr.level === "none" ? "no_access" : curr.level;

        if (orig.level === "none" && !orig.id) {
          // No existing record — grant new permission (including no_access)
          await api.grantBoardPermission(bid, {
            user_id: accessUser.id,
            permission_level: dbLevel,
          });
        } else if (orig.id) {
          // Has existing record — update it
          await api.updateBoardPermission(bid, orig.id, {
            permission_level: dbLevel,
          });
        }
      }
      toast.success("Board permissions updated");
      setAccessDialogOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSavingPerms(false);
    }
  };

  // Group boards by department
  const boardsByDept = departments.map((dept) => ({
    dept,
    boards: boards.filter((b) => b.department_id === dept.id),
  })).filter((g) => g.boards.length > 0);

  return (
    <div className="animate-in-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">{users.length} team members</p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openAccessDialog(user)}>
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(user)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Edit Team Member" : "Add Team Member"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@galado.com.my"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {editingUser ? "New Password (leave blank to keep)" : "Password"}
              </label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingUser ? "Leave blank to keep current" : "Password"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Telegram Settings (only in edit mode) */}
            {editingUser && (
              <>
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Send className="h-4 w-4" /> Telegram Settings
                  </h3>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm">Enable Notifications</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formTelegramNotifications}
                      onClick={() => setFormTelegramNotifications(!formTelegramNotifications)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        formTelegramNotifications ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          formTelegramNotifications ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    <label className="text-sm">Telegram User ID</label>
                    <Input
                      value={formTelegramUserId}
                      onChange={(e) => setFormTelegramUserId(e.target.value)}
                      placeholder="Telegram User ID"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Get their Telegram ID by messaging @userinfobot on Telegram
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formName || !formEmail || (!editingUser && !formPassword)}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingUser ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team Member</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Modal */}
      {upgradeModal && (
        <UpgradeModal
          open={!!upgradeModal}
          onClose={() => setUpgradeModal(null)}
          type="member"
          current={upgradeModal.current}
          limit={upgradeModal.limit}
          upgradeTo={upgradeModal.upgrade_to}
        />
      )}

      {/* Board Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Board Access — {accessUser?.name}
            </DialogTitle>
          </DialogHeader>

          {accessUser?.role === "admin" ? (
            <div className="py-8 text-center">
              <Badge className="text-sm px-3 py-1">Full Access (Admin)</Badge>
              <p className="text-sm text-muted-foreground mt-2">
                Admin users have full access to all boards.
              </p>
            </div>
          ) : loadingPerms ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleGrantAll}>
                  Grant All
                </Button>
                <Button variant="outline" size="sm" onClick={handleRevokeAll}>
                  Revoke All
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Set access level for each board. &quot;No Access&quot; hides the board from this user.
              </p>

              {boardsByDept.map(({ dept, boards: deptBoards }) => (
                <div key={dept.id}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {dept.name}
                  </h3>
                  <div className="space-y-2">
                    {deptBoards.map((board) => (
                      <div
                        key={board.id}
                        className="flex items-center justify-between p-2 rounded-md border"
                      >
                        <span className="text-sm font-medium">{board.name}</span>
                        <Select
                          value={permMap[board.id]?.level || "none"}
                          onValueChange={(v) => handlePermChange(board.id, v)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Access</SelectItem>
                            <SelectItem value="view">View</SelectItem>
                            <SelectItem value="create">Create</SelectItem>
                            <SelectItem value="manage">Manage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleSavePerms} disabled={savingPerms}>
                  {savingPerms && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Permissions
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
